/**
 * Demo months for Nimbus Cement (docs/PLAN.md 6.1): all nine plants, April to October 2026.
 *
 * - Every month goes through the app's own services as the right user (open, save, import, submit, send back,
 *   approve, reopen), so the history, frozen submissions and approval snapshots are real.
 * - After each step, the rows it created get that step's time, so the audit trail reads like real use: data
 *   entered a few days after each month ends, reviewed a day or two later.
 * - Deterministic: figures come from fixed plant profiles with small, fixed variations. Safe to rerun: a month
 *   that already exists is left exactly as it is.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import type { PrismaClient } from "@prisma/client";

import { hasWarnings } from "@/lib/checks";
import type { LineInput } from "@/lib/schemas/month";
import { checkFlags, submittedLines } from "@/lib/schemas/report";
import type { SessionUser } from "@/lib/schemas/session";
import { importIntoMonth } from "@/server/services/import";
import { openMonth, saveLines, submitMonth } from "@/server/services/month";
import { approveMonth, reopenMonth, sendBackMonth } from "@/server/services/review";
import { getSessionUser } from "@/server/services/session";

const PERIODS = ["2026-04", "2026-05", "2026-06", "2026-07", "2026-08", "2026-09", "2026-10"] as const;
type Period = (typeof PERIODS)[number];

/** How a plant writes its figures: Indian digit grouping, and diesel and power in kL and kWh, or not. */
type Habit = { indian: boolean; dieselKl: boolean; powerKwh: boolean };

type IntegratedProfile = {
	kind: "INTEGRATED";
	/** Clinker in a typical month, tonnes. */
	clinker: number;
	/** Per tonne of clinker: coal t, petroleum coke t, diesel L, grid MWh. */
	coal: number;
	petcoke: number;
	diesel: number;
	grid: number;
};
type GrindingProfile = { kind: "GRINDING_UNIT"; furnaceOil: number; diesel: number; grid: number };
type Profile = IntegratedProfile | GrindingProfile;

type PlantPlan = { code: string; owner: string; habit: Habit; profile: Profile };

const PLAIN: Habit = { indian: false, dieselKl: false, powerKwh: false };
const INDIAN_KL_KWH: Habit = { indian: true, dieselKl: true, powerKwh: true };

/**
 * P01 and P04 follow their sample files' ratios (P01's give two flags every month), and P08 its sample's
 * amounts. The other plants sit comfortably inside the plausibility ranges.
 */
const PLANTS: PlantPlan[] = [
	{
		code: "P01",
		owner: "ravi.meena@nimbuscement.in",
		habit: PLAIN,
		profile: { kind: "INTEGRATED", clinker: 285800, coal: 0.12246, petcoke: 0.02659, diesel: 0.5598, grid: 0.015745 },
	},
	{
		code: "P02",
		owner: "anita.tiwari@nimbuscement.in",
		habit: PLAIN,
		profile: { kind: "INTEGRATED", clinker: 236000, coal: 0.105, petcoke: 0.02, diesel: 0.8, grid: 0.1 },
	},
	{
		code: "P03",
		owner: "suresh.wankhede@nimbuscement.in",
		habit: PLAIN,
		profile: { kind: "INTEGRATED", clinker: 204000, coal: 0.11, petcoke: 0.016, diesel: 0.75, grid: 0.095 },
	},
	{
		code: "P04",
		owner: "lakshmi.reddy@nimbuscement.in",
		habit: INDIAN_KL_KWH,
		profile: { kind: "INTEGRATED", clinker: 101700, coal: 0.10816, petcoke: 0.01475, diesel: 0.9341, grid: 0.12094 },
	},
	{
		code: "P05",
		owner: "karthik.raja@nimbuscement.in",
		habit: PLAIN,
		profile: { kind: "INTEGRATED", clinker: 136000, coal: 0.1, petcoke: 0.022, diesel: 0.85, grid: 0.105 },
	},
	{
		code: "P06",
		owner: "deepak.sahu@nimbuscement.in",
		habit: PLAIN,
		profile: { kind: "INTEGRATED", clinker: 170000, coal: 0.104, petcoke: 0.021, diesel: 0.7, grid: 0.098 },
	},
	{
		code: "P07",
		owner: "hetal.patel@nimbuscement.in",
		habit: PLAIN,
		profile: { kind: "GRINDING_UNIT", furnaceOil: 640, diesel: 78000, grid: 4100 },
	},
	{
		code: "P08",
		owner: "sasmita.mohanty@nimbuscement.in",
		habit: INDIAN_KL_KWH,
		profile: { kind: "GRINDING_UNIT", furnaceOil: 500, diesel: 60000, grid: 3060 },
	},
	{
		code: "P09",
		owner: "arijit.ghosh@nimbuscement.in",
		habit: PLAIN,
		profile: { kind: "GRINDING_UNIT", furnaceOil: 480, diesel: 57000, grid: 2950 },
	},
];

const VIKRAM = "vikram.joshi@nimbuscement.in";
const PRIYA = "priya.nair@nimbuscement.in";
const MEERA = "meera.iyer@nimbuscement.in";

/** What happens to each month. Anything not listed is entered, submitted and approved. */
type Story =
	| { kind: "approved" }
	| { kind: "approvedByHead" }
	| { kind: "sentBackThenApproved"; comment: string; fix: (lines: LineInput[]) => LineInput[] }
	| { kind: "reopened"; reason: string }
	| { kind: "waiting"; submittedOn: number }
	| { kind: "sentBack"; comment: string }
	| { kind: "draft" }
	| { kind: "notStarted" }
	| { kind: "imported"; file: string; submittedOn: number };

const STORIES: Record<string, Story> = {
	// Q2
	"P03 2026-08": {
		kind: "sentBackThenApproved",
		comment: "Petroleum coke looks high against July. Please check the weighbridge slips.",
		// Typed about 45% too high; the fix restores the figure from the weighbridge slips.
		fix: (lines) =>
			lines.map((line) =>
				line.itemKey === "petcoke"
					? {
							...line,
							value: String(Math.round(Number(line.value) / P03_AUGUST_SLIP)),
							note: "Corrected from the weighbridge slips",
						}
					: line,
			),
	},
	"P02 2026-09": { kind: "approvedByHead" },
	"P05 2026-09": {
		kind: "reopened",
		reason: "Auditor's query: the September diesel bill covers two months. Please enter September's share only.",
	},
	// October: a realistic mix.
	"P03 2026-10": { kind: "approvedByHead" },
	"P04 2026-10": { kind: "imported", file: "P04_Nalgonda_2026-10.csv", submittedOn: 18 },
	"P05 2026-10": { kind: "waiting", submittedOn: 21 },
	"P08 2026-10": { kind: "waiting", submittedOn: 24 },
	"P06 2026-10": {
		kind: "sentBack",
		comment: "Diesel is well above September. Please check whether the mining contractor's fuel is included.",
	},
	"P07 2026-10": { kind: "draft" },
	"P09 2026-10": { kind: "notStarted" },
};

/** P03's August petroleum coke was typed this much too high, then corrected after being sent back. */
const P03_AUGUST_SLIP = 1.45;

/** P01, P04 and P08's October are exactly their sample files. */
const SAMPLE_OCTOBERS: Record<string, Record<string, number>> = {
	P01: { coal: 35000, petcoke: 7600, diesel: 160000, grid_power: 4500, clinker: 285800 },
	P04: { coal: 11000, petcoke: 1500, diesel: 95000, grid_power: 12300, clinker: 101700 },
	P08: { furnace_oil: 500, diesel: 60000, grid_power: 3060 },
};

/** A fixed variation in [-max, max], the same on every run. */
function variation(key: string, max: number): number {
	let hash = 7;
	for (const char of key) {
		hash = (hash * 31 + char.charCodeAt(0)) % 100_003;
	}
	return (((hash % 201) - 100) / 100) * max;
}

function grouped(value: number, indian: boolean): string {
	const digits = String(value);
	if (!indian) {
		return digits;
	}
	const [whole, fraction] = digits.split(".");
	const lastThree = whole.slice(-3);
	const rest = whole.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ",");
	return `${rest ? `${rest},` : ""}${lastThree}${fraction ? `.${fraction}` : ""}`;
}

/** Canonical amounts (t, L, MWh) for a plant's month. */
function amounts(plan: PlantPlan, period: Period): Record<string, number> {
	const sample = period === "2026-10" ? SAMPLE_OCTOBERS[plan.code] : undefined;
	if (sample) {
		return sample;
	}
	const vary = (item: string, max: number) => 1 + variation(`${plan.code}-${period}-${item}`, max);
	const profile = plan.profile;
	if (profile.kind === "GRINDING_UNIT") {
		return {
			furnace_oil: Math.round(profile.furnaceOil * vary("fo", 0.06)),
			diesel: Math.round((profile.diesel * vary("diesel", 0.06)) / 100) * 100,
			grid_power: Math.round(profile.grid * vary("grid", 0.06)),
		};
	}
	const clinker = Math.round((profile.clinker * vary("clinker", 0.06)) / 100) * 100;
	const diesel = profile.diesel * vary("diesel", 0.04) * (plan.code === "P06" && period === "2026-10" ? 1.6 : 1);
	const slip = plan.code === "P03" && period === "2026-08" ? P03_AUGUST_SLIP : 1;
	return {
		coal: Math.round(clinker * profile.coal * vary("coal", 0.04)),
		petcoke: Math.round(clinker * profile.petcoke * vary("petcoke", 0.04) * slip),
		diesel: Math.round((clinker * diesel) / 100) * 100,
		grid_power: Math.round(clinker * profile.grid * vary("grid", 0.04)),
		clinker,
	};
}

/** The month as the plant's data owner would type it into the form. */
function typedLines(plan: PlantPlan, period: Period): LineInput[] {
	const { habit } = plan;
	return Object.entries(amounts(plan, period)).map(([itemKey, amount]): LineInput => {
		if (itemKey === "diesel" && habit.dieselKl) {
			return { itemKey, mode: "value", value: grouped(amount / 1000, habit.indian), unit: "kL", note: null };
		}
		if (itemKey === "grid_power" && habit.powerKwh) {
			return { itemKey, mode: "value", value: grouped(amount * 1000, habit.indian), unit: "kWh", note: "As per bill" };
		}
		const unit = itemKey === "diesel" ? "L" : itemKey === "grid_power" ? "MWh" : "t";
		return { itemKey, mode: "value", value: grouped(amount, habit.indian), unit, note: null };
	});
}

/** A time in India: the month after `period`, on `day`, at `hour`:`minute` IST. */
function afterMonth(period: string, day: number, hour: number, minute = 0): Date {
	const [year, month] = period.split("-").map(Number);
	return new Date(Date.UTC(year, month, day, hour - 5, minute - 30));
}

type Context = { db: PrismaClient; users: Map<string, SessionUser> };

/** Gives the rows a step just created the step's time, so the history reads in real order. */
async function backdate(ctx: Context, reportId: string, at: Date, seen: { logs: Set<string>; events: number }) {
	const { db } = ctx;
	const logs = await db.changeLog.findMany({ where: { entityId: reportId }, select: { id: true } });
	const fresh = logs.filter((log) => !seen.logs.has(log.id)).map((log) => log.id);
	await db.changeLog.updateMany({ where: { id: { in: fresh } }, data: { createdAt: at } });
	for (const id of fresh) {
		seen.logs.add(id);
	}

	const events = await db.reviewEvent.findMany({
		where: { reportId, sequence: { gt: seen.events } },
		select: { id: true, sequence: true, action: true, lines: true },
	});
	for (const event of events) {
		const lines =
			event.action === "SUBMIT" && event.lines
				? submittedLines
						.parse(event.lines)
						.map((line) =>
							line.enteredAt && line.enteredAt > at.toISOString() ? { ...line, enteredAt: at.toISOString() } : line,
						)
				: undefined;
		await db.reviewEvent.update({ where: { id: event.id }, data: { createdAt: at, ...(lines ? { lines } : {}) } });
		await db.approvalSnapshot.updateMany({ where: { eventId: event.id }, data: { createdAt: at } });
		seen.events = Math.max(seen.events, event.sequence);
	}
	await db.upload.updateMany({ where: { reportId, createdAt: { gt: at } }, data: { createdAt: at } });
	await db.reportLine.updateMany({ where: { reportId, updatedAt: { gt: at } }, data: { updatedAt: at } });
	await db.monthlyReport.update({ where: { id: reportId }, data: { updatedAt: at } });
}

function user(ctx: Context, email: string): SessionUser {
	const found = ctx.users.get(email);
	if (!found) {
		throw new Error(`Demo user ${email} is missing; run the seed's users first.`);
	}
	return found;
}

async function lastSubmissionFlagged(ctx: Context, reportId: string): Promise<boolean> {
	const submission = await ctx.db.reviewEvent.findFirst({
		where: { reportId, action: "SUBMIT" },
		orderBy: { sequence: "desc" },
		select: { flags: true },
	});
	return hasWarnings(submission?.flags ? checkFlags.parse(submission.flags) : []);
}

async function seedMonth(ctx: Context, plan: PlantPlan, plantId: string, period: Period, index: number) {
	const story: Story = STORIES[`${plan.code} ${period}`] ?? { kind: "approved" };
	if (story.kind === "notStarted") {
		return;
	}
	const { db } = ctx;
	const owner = user(ctx, plan.owner);
	const reviewer = user(ctx, plan.code === "P05" || index % 3 !== 1 ? VIKRAM : PRIYA);
	const head = user(ctx, MEERA);

	// Data comes in a few days after the month ends; plants report in a slightly different order each month.
	const openDay = 3 + ((index + PERIODS.indexOf(period)) % 4);
	const openedAt = afterMonth(period, openDay, 10, 5 * index);
	const { reportId } = await openMonth(db, owner, { plantId, period }, new Date());
	await db.monthlyReport.update({ where: { id: reportId }, data: { createdAt: openedAt } });
	const seen = { logs: new Set<string>(), events: 0 };
	let version = 1;

	let lines = typedLines(plan, period);
	if (story.kind === "imported") {
		const content = readFileSync(fileURLToPath(new URL(`../samples/${story.file}`, import.meta.url)), "utf8");
		const { uploadId, mapping } = await importIntoMonth(db, owner, {
			reportId,
			kind: "FILE",
			filename: story.file,
			content,
		});
		await backdate(ctx, reportId, new Date(openedAt.getTime() + 20 * 60_000), seen);
		// The owner confirmed each MT row as tonnes and filled the form from the file.
		lines = mapping.rows.flatMap((row): LineInput[] =>
			row.itemKey && row.proposed?.mode === "value"
				? [
						{
							itemKey: row.itemKey,
							mode: "value",
							value: row.proposed.value,
							unit: row.proposed.unit ?? "t",
							note: row.note,
							uploadId,
						},
					]
				: [],
		);
	}

	({ version } = await saveLines(db, owner, { reportId, expectedVersion: version, lines }));
	await backdate(ctx, reportId, new Date(openedAt.getTime() + 40 * 60_000), seen);
	if (story.kind === "draft") {
		return;
	}

	const submitAt =
		story.kind === "waiting" || story.kind === "imported"
			? afterMonth(period, story.submittedOn, 16, 10 * index)
			: afterMonth(period, openDay + 1, 15, 10 * index);
	const confirmNotUsed = plan.profile.kind === "INTEGRATED" ? ["furnace_oil"] : ["coal", "petcoke"];
	({ version } = await submitMonth(db, owner, { reportId, expectedVersion: version, confirmNotUsed }));
	await backdate(ctx, reportId, submitAt, seen);
	if (story.kind === "waiting" || story.kind === "imported") {
		return;
	}

	let reviewAt = new Date(submitAt.getTime() + (1 + (index % 3)) * 86_400_000 - 3 * 3_600_000);
	if (story.kind === "sentBack" || story.kind === "sentBackThenApproved") {
		({ version } = await sendBackMonth(db, reviewer, { reportId, expectedVersion: version, comment: story.comment }));
		await backdate(ctx, reportId, reviewAt, seen);
		if (story.kind === "sentBack") {
			return;
		}
		const fixAt = new Date(reviewAt.getTime() + 26 * 3_600_000);
		({ version } = await saveLines(db, owner, { reportId, expectedVersion: version, lines: story.fix(lines) }));
		await backdate(ctx, reportId, fixAt, seen);
		({ version } = await submitMonth(db, owner, { reportId, expectedVersion: version, confirmNotUsed: [] }));
		await backdate(ctx, reportId, new Date(fixAt.getTime() + 20 * 60_000), seen);
		reviewAt = new Date(fixAt.getTime() + 22 * 3_600_000);
	}

	const approver = story.kind === "approvedByHead" ? head : reviewer;
	const flagged = await lastSubmissionFlagged(ctx, reportId);
	const comment = flagged
		? "Checked against the fuel and power bills; the flagged figures are correct as entered."
		: story.kind === "approvedByHead"
			? "Approved for the board pack."
			: null;
	({ version } = await approveMonth(db, approver, { reportId, expectedVersion: version, comment }));
	await backdate(ctx, reportId, reviewAt, seen);

	if (story.kind === "reopened") {
		({ version } = await reopenMonth(db, head, { reportId, expectedVersion: version, comment: story.reason }));
		await backdate(ctx, reportId, afterMonth("2026-10", 10, 15), seen);
	}
}

/** Loads the demo months for Nimbus. Months that already exist are left exactly as they are. */
export async function seedDemoMonths(
	db: PrismaClient,
	companyId: string,
): Promise<{ created: number; skipped: number }> {
	const people = await db.user.findMany({ where: { companyId }, select: { id: true, email: true } });
	const users = new Map<string, SessionUser>();
	for (const person of people) {
		const sessionUser = await getSessionUser(db, person.id);
		if (sessionUser) {
			users.set(person.email, sessionUser);
		}
	}
	const ctx: Context = { db, users };

	let created = 0;
	let skipped = 0;
	// Month by month, so each plant's previous month is approved before the next is checked against it.
	for (const period of PERIODS) {
		for (const [index, plan] of PLANTS.entries()) {
			const plant = await db.plant.findUniqueOrThrow({
				where: { companyId_code: { companyId, code: plan.code } },
				select: { id: true },
			});
			const exists = await db.monthlyReport.findUnique({
				where: { plantId_period: { plantId: plant.id, period } },
				select: { id: true },
			});
			if (exists) {
				skipped += 1;
				continue;
			}
			const story = STORIES[`${plan.code} ${period}`];
			if (story?.kind === "notStarted") {
				continue;
			}
			await seedMonth(ctx, plan, plant.id, period, index);
			created += 1;
		}
	}
	return { created, skipped };
}
