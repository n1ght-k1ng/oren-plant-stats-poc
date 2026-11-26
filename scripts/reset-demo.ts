// Deletes monthly report data, one named month at a time. Plants, users, companies, capacity history and plant
// edits are always kept. A month goes with its lines, uploads, review history, approvals and the change-log
// entries about it.
//
//   npm run db:reset-demo                          lists every month with its ID; deletes nothing
//   npm run db:reset-demo -- <id> <id>             lists just those months; deletes nothing
//   npm run db:reset-demo -- --confirm <id> <id>   deletes exactly those months
//   npm run db:reset-demo -- --all                 lists every month, then deletes them all only if you type
//                                                  "yes" at a terminal (piped input is refused)
//
// Deleting needs --confirm and the IDs. If any ID is not found, nothing is deleted. --dry-run is accepted and
// changes nothing, since listing is already the default. docs/INCIDENTS.md says why it works this way.
//
// Runs only against a database on this machine (localhost or 127.0.0.1). For anything else, ask first, then
// pass --not-local. See CLAUDE.md: never drop or reset data without asking.
import { createInterface } from "node:readline/promises";

import { PrismaClient } from "@prisma/client";

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);
const FLAGS = new Set(["--confirm", "--all", "--not-local", "--dry-run"]);
const PIPED_ALL = '--all needs "yes" typed at a terminal, and input here is piped. Nothing deleted.';

type Mode = { kind: "list"; ids: string[] } | { kind: "delete"; ids: string[] } | { kind: "all" };

/** A refusal or mistake in how the script was called: printed without a stack trace. */
class UsageError extends Error {}

function parseArgs(argv: string[]): { mode: Mode; notLocal: boolean } {
	const flags = argv.filter((arg) => arg.startsWith("-"));
	const ids = [...new Set(argv.filter((arg) => !arg.startsWith("-")))];
	const unknown = flags.filter((flag) => !FLAGS.has(flag));
	if (unknown.length) {
		throw new UsageError(`Unknown option ${unknown.join(", ")}. Nothing deleted.`);
	}
	const confirm = flags.includes("--confirm");
	const all = flags.includes("--all");
	const notLocal = flags.includes("--not-local");

	if (all && (confirm || ids.length)) {
		throw new UsageError("--all can't be combined with --confirm or IDs. Nothing deleted.");
	}
	if (all) {
		return { mode: { kind: "all" }, notLocal };
	}
	if (confirm && !ids.length) {
		throw new UsageError(
			"--confirm needs the IDs of the months to delete; run without options to list them. Nothing deleted.",
		);
	}
	return { mode: confirm ? { kind: "delete", ids } : { kind: "list", ids }, notLocal };
}

function databaseHost(): string {
	const url = process.env.DATABASE_URL;
	if (!url) {
		throw new UsageError("Set DATABASE_URL (in .env or the environment) first.");
	}
	return new URL(url).hostname;
}

function findMonths(prisma: PrismaClient, ids?: string[]) {
	return prisma.monthlyReport.findMany({
		where: ids ? { id: { in: ids } } : {},
		orderBy: [{ company: { name: "asc" } }, { plant: { code: "asc" } }, { period: "asc" }],
		select: {
			id: true,
			period: true,
			status: true,
			createdAt: true,
			company: { select: { name: true } },
			plant: { select: { code: true } },
			openedBy: { select: { name: true } },
			_count: { select: { events: true, approvals: true, uploads: true } },
		},
	});
}

type MonthRow = Awaited<ReturnType<typeof findMonths>>[number];

function describe(month: MonthRow): string {
	const opened = month.createdAt.toISOString().slice(0, 10);
	const { events, approvals, uploads } = month._count;
	return `  ${month.id}  ${month.company.name} ${month.plant.code} ${month.period} ${month.status}, opened by ${month.openedBy.name} on ${opened} (${events} review events, ${approvals} approvals, ${uploads} uploads)`;
}

function printMonths(heading: string, months: MonthRow[], missing: string[] = []) {
	console.log(heading);
	for (const month of months) {
		console.log(describe(month));
	}
	for (const id of missing) {
		console.log(`  ${id}  not found`);
	}
}

async function deleteMonths(prisma: PrismaClient, ids: string[]) {
	// Lines, uploads, review events and approvals are deleted with their month (onDelete: Cascade).
	const [changeLog, months] = await prisma.$transaction([
		prisma.changeLog.deleteMany({ where: { entityType: "monthlyReport", entityId: { in: ids } } }),
		prisma.monthlyReport.deleteMany({ where: { id: { in: ids } } }),
	]);
	return { months: months.count, changeLog: changeLog.count };
}

async function askTyped(question: string): Promise<string> {
	const rl = createInterface({ input: process.stdin, output: process.stdout });
	try {
		return (await rl.question(question)).trim();
	} finally {
		rl.close();
	}
}

async function main() {
	const { mode, notLocal } = parseArgs(process.argv.slice(2));
	const host = databaseHost();
	if (!LOCAL_HOSTS.has(host) && !notLocal) {
		throw new UsageError(
			`Refusing to touch report data on "${host}", which is not this machine. Ask first; then rerun with --not-local.`,
		);
	}
	// Checked before connecting, so piped input can never answer "yes".
	if (mode.kind === "all" && !process.stdin.isTTY) {
		throw new UsageError(PIPED_ALL);
	}

	const prisma = new PrismaClient();
	try {
		if (mode.kind === "list") {
			const months = await findMonths(prisma, mode.ids.length ? mode.ids : undefined);
			const missing = mode.ids.filter((id) => !months.some((month) => month.id === id));
			printMonths(`${months.length} month${months.length === 1 ? "" : "s"} on ${host}:`, months, missing);
			console.log("\nNothing deleted. To delete, name each month: npm run db:reset-demo -- --confirm <id> <id>");
			return;
		}

		if (mode.kind === "delete") {
			const months = await findMonths(prisma, mode.ids);
			const missing = mode.ids.filter((id) => !months.some((month) => month.id === id));
			if (missing.length) {
				printMonths(`Found ${months.length} of the ${mode.ids.length} months on ${host}:`, months, missing);
				throw new UsageError("Some IDs were not found, so nothing was deleted.");
			}
			printMonths(`Deleting ${months.length} month${months.length === 1 ? "" : "s"} on ${host}:`, months);
			const deleted = await deleteMonths(prisma, mode.ids);
			console.log(
				`Deleted ${deleted.months} months and ${deleted.changeLog} change-log entries. Nothing else was touched.`,
			);
			return;
		}

		const months = await findMonths(prisma);
		if (!months.length) {
			console.log(`No months on ${host}. Nothing deleted.`);
			return;
		}
		printMonths(`--all would delete every one of these ${months.length} months on ${host}:`, months);
		const answer = await askTyped(`\nType "yes" to delete all ${months.length} months: `);
		if (answer !== "yes") {
			console.log("Nothing deleted.");
			return;
		}
		// Exactly the months listed above, not whatever exists by now.
		const deleted = await deleteMonths(
			prisma,
			months.map((month) => month.id),
		);
		console.log(`Deleted ${deleted.months} months and ${deleted.changeLog} change-log entries. Kept plants and users.`);
	} finally {
		await prisma.$disconnect();
	}
}

main().catch((error) => {
	console.error(error instanceof UsageError ? error.message : error);
	process.exit(1);
});
