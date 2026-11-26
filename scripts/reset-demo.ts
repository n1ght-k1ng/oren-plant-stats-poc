// Clears all monthly report data: months, their lines, uploads, review history, approvals, and the change-log
// entries about them. Plants, users, companies, capacity history and plant edits are kept.
//
//   npm run db:reset-demo -- --dry-run   lists the months it would clear, and clears nothing
//   npm run db:reset-demo                 clears them
//
// Run --dry-run first, and clear only if every month listed is one you mean to lose.
//
// Runs only against a database on this machine (localhost or 127.0.0.1). For anything else, ask first, then
// pass --not-local. See CLAUDE.md: never drop or reset data without asking.
import { PrismaClient } from "@prisma/client";

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);

function databaseHost(): string {
	const url = process.env.DATABASE_URL;
	if (!url) {
		throw new Error("Set DATABASE_URL (in .env or the environment) first.");
	}
	return new URL(url).hostname;
}

async function main() {
	const host = databaseHost();
	const notLocalAllowed = process.argv.includes("--not-local");
	if (!LOCAL_HOSTS.has(host) && !notLocalAllowed) {
		console.error(
			`Refusing to clear report data on "${host}", which is not this machine. Ask first; then rerun with --not-local.`,
		);
		process.exit(1);
	}

	const prisma = new PrismaClient();
	try {
		const before = {
			months: await prisma.monthlyReport.count(),
			events: await prisma.reviewEvent.count(),
			approvals: await prisma.approvalSnapshot.count(),
			uploads: await prisma.upload.count(),
			changeLog: await prisma.changeLog.count({ where: { entityType: "monthlyReport" } }),
		};
		const kept = { plants: await prisma.plant.count(), users: await prisma.user.count() };

		if (process.argv.includes("--dry-run")) {
			const months = await prisma.monthlyReport.findMany({
				orderBy: [{ plant: { code: "asc" } }, { period: "asc" }],
				select: { period: true, status: true, plant: { select: { code: true } }, openedBy: { select: { name: true } } },
			});
			console.log(`Would clear ${months.length} months on ${host}:`);
			for (const month of months) {
				console.log(`  ${month.plant.code} ${month.period} ${month.status}, opened by ${month.openedBy.name}`);
			}
			return;
		}

		await prisma.$transaction([
			// Lines, uploads, review events and approvals are deleted with their month (onDelete: Cascade).
			prisma.monthlyReport.deleteMany({}),
			prisma.changeLog.deleteMany({ where: { entityType: "monthlyReport" } }),
		]);

		console.log(
			`Cleared on ${host}: ${before.months} months, ${before.events} review events, ${before.approvals} approvals, ` +
				`${before.uploads} uploads, ${before.changeLog} change-log entries. Kept ${kept.plants} plants and ${kept.users} users.`,
		);
	} finally {
		await prisma.$disconnect();
	}
}

main().catch((error) => {
	console.error(error);
	process.exit(1);
});
