import type { TRPCError } from "@trpc/server";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { ROLES } from "@/lib/roles";
import type { LineInput } from "@/lib/schemas/month";
import { submittedLines } from "@/lib/schemas/report";
import { prisma } from "@/server/db";
import { recordCapacity } from "@/server/services/capacity";

import {
	addDataOwner,
	callerFor,
	createTestCompany,
	createTestPlant,
	createTestUser,
	deleteTestCompany,
} from "./helpers";

// Flow 1 through the API: open, save and return, submit (docs/PLAN.md 3.1, 3.2).

let companyId: string;
let otherCompanyId: string;
let owner: { id: string };
let secondOwner: { id: string };
let reviewer: { id: string };
let outsider: { id: string };
let plantNumber = 0;

/** A fresh integrated plant owned by `owner` and `secondOwner`, at 4.0 Mt a year like P01. */
async function newPlant(type: "INTEGRATED" | "GRINDING_UNIT" = "INTEGRATED") {
	plantNumber += 1;
	const plant = await createTestPlant(companyId, { code: `T${plantNumber}`, type, cementCapacityTpa: 4_000_000 });
	await addDataOwner(plant.id, owner.id);
	await addDataOwner(plant.id, secondOwner.id);
	await recordCapacity(prisma, {
		companyId,
		plantId: plant.id,
		effectiveFrom: "2026-04",
		cementCapacityTpa: 4_000_000,
		createdById: null,
	});
	return plant;
}

async function openNew(period = "2026-10", type: "INTEGRATED" | "GRINDING_UNIT" = "INTEGRATED") {
	const plant = await newPlant(type);
	const { reportId } = await callerFor(owner).month.open({ plantId: plant.id, period });
	return { plant, reportId };
}

const line = (itemKey: string, value: string, unit: string, note: string | null = null): LineInput => ({
	itemKey,
	mode: "value",
	value,
	unit,
	note,
});

/** P01 Chittorgarh's October 2026 as typed into the form. Furnace oil left blank. */
const P01_LINES: LineInput[] = [
	line("coal", "35000", "t"),
	line("petcoke", "7600", "t"),
	line("diesel", "160000", "L"),
	line("grid_power", "4500", "MWh"),
	line("clinker", "285800", "t"),
];

async function rejection(promise: Promise<unknown>): Promise<TRPCError> {
	const outcome = await promise.then(
		() => new Error("Expected the call to be rejected"),
		(error: unknown) => error,
	);
	if (outcome instanceof Error && "code" in outcome) {
		return outcome as TRPCError;
	}
	throw outcome;
}

beforeAll(async () => {
	companyId = (await createTestCompany()).id;
	otherCompanyId = (await createTestCompany()).id;
	owner = await createTestUser(companyId, [ROLES.DATA_OWNER], "Owner");
	secondOwner = await createTestUser(companyId, [ROLES.DATA_OWNER], "Second owner");
	reviewer = await createTestUser(companyId, [ROLES.REVIEWER], "Reviewer");
	outsider = await createTestUser(otherCompanyId, [ROLES.DATA_OWNER], "Outsider");
});

afterAll(async () => {
	await deleteTestCompany(companyId);
	await deleteTestCompany(otherCompanyId);
});

describe("opening a month", () => {
	it("creates a draft with one not-entered line per item", async () => {
		const { reportId } = await openNew();
		const month = await callerFor(owner).month.byId({ reportId });
		expect(month).toMatchObject({ status: "DRAFT", version: 1, canEdit: true, period: "2026-10" });
		expect(month.lines?.map((entry) => [entry.itemKey, entry.state])).toEqual([
			["coal", "NOT_ENTERED"],
			["petcoke", "NOT_ENTERED"],
			["furnace_oil", "NOT_ENTERED"],
			["diesel", "NOT_ENTERED"],
			["grid_power", "NOT_ENTERED"],
			["clinker", "NOT_ENTERED"],
		]);
	});

	it("sets a grinding unit's clinker to N/A from the start", async () => {
		const { reportId } = await openNew("2026-10", "GRINDING_UNIT");
		const month = await callerFor(owner).month.byId({ reportId });
		expect(month.lines?.find((entry) => entry.itemKey === "clinker")).toMatchObject({
			state: "NA",
			naReason: "NOT_APPLICABLE",
		});
	});

	it("returns the same month when opened again, even by both owners at once", async () => {
		const plant = await newPlant();
		const [first, second] = await Promise.all([
			callerFor(owner).month.open({ plantId: plant.id, period: "2026-09" }),
			callerFor(secondOwner).month.open({ plantId: plant.id, period: "2026-09" }),
		]);
		expect(first.reportId).toBe(second.reportId);
		expect((await callerFor(owner).month.open({ plantId: plant.id, period: "2026-09" })).reportId).toBe(first.reportId);
		expect(await prisma.reportLine.count({ where: { reportId: first.reportId } })).toBe(6);
	});

	it("only opens months that have ended, from April 2026", async () => {
		const plant = await newPlant();
		const now = new Date();
		const thisMonth = `${now.getUTCFullYear() + 1}-01`;
		expect(await rejection(callerFor(owner).month.open({ plantId: plant.id, period: thisMonth }))).toMatchObject({
			code: "BAD_REQUEST",
			message: expect.stringContaining("has not ended yet"),
		});
		expect(await rejection(callerFor(owner).month.open({ plantId: plant.id, period: "2026-03" }))).toMatchObject({
			code: "BAD_REQUEST",
			message: "Months before April 2026 are not collected here.",
		});
	});

	it("is only for the plant's data owners", async () => {
		const plant = await newPlant();
		expect(await rejection(callerFor(reviewer).month.open({ plantId: plant.id, period: "2026-10" }))).toMatchObject({
			code: "FORBIDDEN",
		});
		expect(await rejection(callerFor(outsider).month.open({ plantId: plant.id, period: "2026-10" }))).toMatchObject({
			code: "NOT_FOUND",
		});
	});
});

describe("saving a draft", () => {
	it("converts to canonical units and keeps what was typed", async () => {
		const { reportId } = await openNew();
		const saved = await callerFor(owner).month.save({
			reportId,
			expectedVersion: 1,
			lines: [
				line("diesel", "95", "kL", "DG sets + mining fleet"),
				line("grid_power", "1,23,00,000", "kWh", "As per bill"),
			],
		});
		expect(saved).toEqual({ status: "DRAFT", version: 2 });

		const month = await callerFor(owner).month.byId({ reportId });
		expect(month.lines?.find((entry) => entry.itemKey === "diesel")).toMatchObject({
			state: "VALUE",
			value: "95000",
			unit: "L",
			enteredValue: "95",
			enteredUnit: "kL",
			note: "DG sets + mining fleet",
		});
		expect(month.lines?.find((entry) => entry.itemKey === "grid_power")).toMatchObject({
			value: "12300",
			unit: "MWh",
			enteredValue: "1,23,00,000",
			enteredUnit: "kWh",
		});
	});

	it("keeps blank as not entered, never 0, and N/A as N/A", async () => {
		const { reportId } = await openNew();
		await callerFor(owner).month.save({
			reportId,
			expectedVersion: 1,
			lines: [
				{ itemKey: "coal", mode: "blank", value: "", unit: "t", note: null },
				{ itemKey: "petcoke", mode: "value", value: "  ", unit: "t", note: null },
				{ itemKey: "furnace_oil", mode: "na", value: "", unit: "t", note: "No HAG at this plant" },
			],
		});
		const month = await callerFor(owner).month.byId({ reportId });
		const byKey = Object.fromEntries((month.lines ?? []).map((entry) => [entry.itemKey, entry]));
		expect(byKey.coal).toMatchObject({ state: "NOT_ENTERED", value: null });
		expect(byKey.petcoke).toMatchObject({ state: "NOT_ENTERED", value: null });
		expect(byKey.furnace_oil).toMatchObject({ state: "NA", naReason: "NOT_APPLICABLE", note: "No HAG at this plant" });
	});

	it("refuses unreadable numbers, units the form does not offer, and fixed N/A items, saving nothing", async () => {
		const { reportId } = await openNew();
		const error = await rejection(
			callerFor(owner).month.save({
				reportId,
				expectedVersion: 1,
				lines: [line("coal", "1,2,3,4", "t"), line("petcoke", "1500", "MT"), line("diesel", "1.2345", "L")],
			}),
		);
		expect(error).toMatchObject({ code: "BAD_REQUEST" });
		expect(error.message).toContain('Coal: "1,2,3,4" is not a number we can read.');
		expect(error.message).toContain("Petroleum coke: choose t.");
		expect(error.message).toContain("Diesel (HSD): Enter at most 3 decimal places.");
		expect((await callerFor(owner).month.byId({ reportId })).version).toBe(1);

		const { reportId: unitMonth } = await openNew("2026-10", "GRINDING_UNIT");
		expect(
			await rejection(
				callerFor(owner).month.save({ reportId: unitMonth, expectedVersion: 1, lines: [line("clinker", "10", "t")] }),
			),
		).toMatchObject({ message: "Clinker produced is always N/A at this plant." });
	});

	it("records each change in words, and leaves the version alone when nothing changed", async () => {
		const { reportId } = await openNew();
		await callerFor(owner).month.save({ reportId, expectedVersion: 1, lines: [line("coal", "35000", "t")] });
		await callerFor(owner).month.save({ reportId, expectedVersion: 2, lines: [line("coal", "36,000", "t")] });
		const unchanged = await callerFor(owner).month.save({
			reportId,
			expectedVersion: 3,
			lines: [line("coal", "36,000", "t")],
		});
		expect(unchanged.version).toBe(3);

		const log = await prisma.changeLog.findMany({ where: { entityId: reportId }, orderBy: { createdAt: "asc" } });
		expect(log.map((entry) => entry.changes)).toEqual([
			{ Coal: { from: "not entered", to: "35000 t" } },
			{ Coal: { from: "35000 t", to: "36,000 t" } },
		]);
	});

	it("tells the second of two editors to reload", async () => {
		const { reportId } = await openNew();
		await callerFor(owner).month.save({ reportId, expectedVersion: 1, lines: [line("coal", "1", "t")] });
		expect(
			await rejection(
				callerFor(secondOwner).month.save({ reportId, expectedVersion: 1, lines: [line("coal", "2", "t")] }),
			),
		).toMatchObject({
			code: "CONFLICT",
			message: "Someone else just updated this month. Please reload to see their changes.",
		});
	});

	it("is only for the plant's data owners", async () => {
		const { reportId } = await openNew();
		expect(
			await rejection(
				callerFor(reviewer).month.save({ reportId, expectedVersion: 1, lines: [line("coal", "1", "t")] }),
			),
		).toMatchObject({ code: "FORBIDDEN" });
	});
});

describe("viewing a draft (R1)", () => {
	it("shows the owner the values and live flags, and hides the values from a reviewer", async () => {
		const { reportId } = await openNew();
		await callerFor(owner).month.save({ reportId, expectedVersion: 1, lines: P01_LINES });

		const ownerView = await callerFor(owner).month.byId({ reportId });
		// Furnace oil is blank and optional, so it counts as not used: the same two flags the submission freezes.
		expect(ownerView.flags.map((flag) => flag.code)).toEqual(["KILN_ENERGY", "GRID_PER_CLINKER"]);
		expect(ownerView.checkContext.capacityTpa).toBe(4_000_000);

		const reviewerView = await callerFor(reviewer).month.byId({ reportId });
		expect(reviewerView).toMatchObject({ status: "DRAFT", canEdit: false, lines: null, flags: [] });
		expect(reviewerView.hiddenReason).toContain("still entering this month's figures");
	});
});

describe("submitting", () => {
	it("names the expected items still blank", async () => {
		const { reportId } = await openNew();
		await callerFor(owner).month.save({ reportId, expectedVersion: 1, lines: [line("coal", "35000", "t")] });
		expect(
			await rejection(callerFor(owner).month.submit({ reportId, expectedVersion: 2, confirmNotUsed: [] })),
		).toMatchObject({
			code: "BAD_REQUEST",
			message: "Enter a value or N/A for: Petroleum coke, Diesel (HSD), Grid electricity, Clinker produced.",
		});
	});

	it("asks for each blank optional item to be confirmed as not used", async () => {
		const { reportId } = await openNew();
		await callerFor(owner).month.save({ reportId, expectedVersion: 1, lines: P01_LINES });
		expect(
			await rejection(callerFor(owner).month.submit({ reportId, expectedVersion: 2, confirmNotUsed: [] })),
		).toMatchObject({ message: "Confirm that these were not used this month: Furnace oil." });
	});

	it("submits P01's October, freezing its lines and its two flags, and opens the values to reviewers", async () => {
		const { reportId } = await openNew();
		await callerFor(owner).month.save({ reportId, expectedVersion: 1, lines: P01_LINES });
		const seenWhileEditing = (await callerFor(owner).month.byId({ reportId })).flags;
		const submitted = await callerFor(owner).month.submit({
			reportId,
			expectedVersion: 2,
			confirmNotUsed: ["furnace_oil"],
		});
		expect(submitted).toEqual({ status: "SUBMITTED", version: 3 });

		const [event] = await prisma.reviewEvent.findMany({ where: { reportId } });
		expect(event).toMatchObject({ sequence: 1, action: "SUBMIT", actorRole: "DATA_OWNER", actorId: owner.id });
		const frozen = submittedLines.parse(event.lines);
		expect(frozen.find((entry) => entry.itemKey === "furnace_oil")).toMatchObject({
			state: "NA",
			naReason: "NOT_USED_THIS_MONTH",
		});
		expect(frozen.find((entry) => entry.itemKey === "grid_power")).toMatchObject({ state: "VALUE", value: "4500" });

		const reviewerView = await callerFor(reviewer).month.byId({ reportId });
		expect(reviewerView.lines).not.toBeNull();
		expect(reviewerView.flags.map((flag) => flag.code)).toEqual(["KILN_ENERGY", "GRID_PER_CLINKER"]);
		// U2: the reviewer sees exactly the flags the data owner saw.
		expect(reviewerView.flags).toEqual(seenWhileEditing);
		expect(reviewerView.history).toMatchObject([{ action: "SUBMIT", actorName: "Owner", toStatus: "SUBMITTED" }]);
	});

	it("locks the month once submitted", async () => {
		const { reportId } = await openNew();
		await callerFor(owner).month.save({ reportId, expectedVersion: 1, lines: P01_LINES });
		await callerFor(owner).month.submit({ reportId, expectedVersion: 2, confirmNotUsed: ["furnace_oil"] });

		expect((await callerFor(owner).month.byId({ reportId })).canEdit).toBe(false);
		expect(
			await rejection(callerFor(owner).month.save({ reportId, expectedVersion: 3, lines: [line("coal", "1", "t")] })),
		).toMatchObject({ code: "BAD_REQUEST", message: expect.stringContaining("has been submitted") });
		expect(
			await rejection(callerFor(owner).month.submit({ reportId, expectedVersion: 3, confirmNotUsed: [] })),
		).toMatchObject({ code: "BAD_REQUEST" });
	});

	it("can be done by either owner of the plant (O8), but not by a reviewer", async () => {
		const { reportId } = await openNew();
		await callerFor(owner).month.save({ reportId, expectedVersion: 1, lines: P01_LINES });
		expect(
			await rejection(
				callerFor(reviewer).month.submit({ reportId, expectedVersion: 2, confirmNotUsed: ["furnace_oil"] }),
			),
		).toMatchObject({ code: "FORBIDDEN" });
		expect(
			await callerFor(secondOwner).month.submit({ reportId, expectedVersion: 2, confirmNotUsed: ["furnace_oil"] }),
		).toEqual({ status: "SUBMITTED", version: 3 });
	});
});

describe("the data owner's list of months", () => {
	it("shows every ended month from April 2026 for each plant they own, with its status", async () => {
		const { plant, reportId } = await openNew("2026-08");
		const mine = await callerFor(owner).month.mine();
		const entry = mine.find((candidate) => candidate.plant.id === plant.id);
		expect(entry?.months.at(-1)?.period).toBe("2026-04");
		expect(entry?.months.find((month) => month.period === "2026-08")).toEqual({
			period: "2026-08",
			status: "DRAFT",
			reopened: false,
			reportId,
		});
		expect(entry?.months.find((month) => month.period === "2026-07")).toEqual({
			period: "2026-07",
			status: null,
			reopened: false,
			reportId: null,
		});
		expect(await callerFor(reviewer).month.mine()).toEqual([]);
	});
});
