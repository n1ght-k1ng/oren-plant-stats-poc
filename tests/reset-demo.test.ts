import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { ROLES } from "@/lib/roles";
import { prisma } from "@/server/db";

import { createTestCompany, createTestPlant, createTestUser, deleteTestCompany } from "./helpers";

// db:reset-demo deletes nothing unless told exactly which months to delete (docs/INCIDENTS.md, 2026-11-26).
// These tests run the real script, as a person would, against the test database.

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const TSX = fileURLToPath(new URL("../node_modules/.bin/tsx", import.meta.url));

/** Runs `npm run db:reset-demo -- <args>` against the test database, with piped stdin. */
function run(args: string[], options: { databaseUrl?: string; input?: string } = {}) {
	const result = spawnSync(TSX, ["scripts/reset-demo.ts", ...args], {
		cwd: ROOT,
		env: { ...process.env, DATABASE_URL: options.databaseUrl ?? process.env.DATABASE_URL },
		input: options.input ?? "",
		encoding: "utf8",
		timeout: 60_000,
	});
	return { code: result.status, out: `${result.stdout}${result.stderr}` };
}

let companyId: string;
let monthIds: string[] = [];

const remaining = () => prisma.monthlyReport.count({ where: { id: { in: monthIds } } });

beforeAll(async () => {
	companyId = (await createTestCompany()).id;
	const owner = await createTestUser(companyId, [ROLES.DATA_OWNER]);
	const plant = await createTestPlant(companyId);
	monthIds = [];
	for (const period of ["2026-04", "2026-05", "2026-06"]) {
		const month = await prisma.monthlyReport.create({
			data: { companyId, plantId: plant.id, period, plantType: "INTEGRATED", openedById: owner.id },
		});
		await prisma.changeLog.create({
			data: {
				companyId,
				entityType: "monthlyReport",
				entityId: month.id,
				action: "save",
				changes: {},
				changedById: owner.id,
			},
		});
		monthIds.push(month.id);
	}
}, 60_000);

afterAll(async () => {
	await deleteTestCompany(companyId);
});

describe("npm run db:reset-demo", () => {
	it("without --confirm, lists the months with their IDs and deletes nothing", () => {
		const total = run([]);
		expect(total.code).toBe(0);
		expect(total.out).toContain(monthIds[0]);
		expect(total.out).toContain("Nothing deleted.");
		return expect(remaining()).resolves.toBe(3);
	});

	it("with --dry-run, or with IDs but no --confirm, deletes nothing", async () => {
		expect(run(["--dry-run"]).code).toBe(0);
		const named = run([monthIds[0], monthIds[1]]);
		expect(named.code).toBe(0);
		expect(named.out).toContain("Nothing deleted.");
		expect(await remaining()).toBe(3);
	});

	it("with --confirm but no IDs, or an unknown ID, deletes nothing", async () => {
		const noIds = run(["--confirm"]);
		expect(noIds.code).toBe(1);
		expect(noIds.out).toContain("--confirm needs the IDs");
		const unknown = run(["--confirm", monthIds[0], "no-such-month"]);
		expect(unknown.code).toBe(1);
		expect(unknown.out).toContain("Some IDs were not found, so nothing was deleted.");
		expect(await remaining()).toBe(3);
	});

	it("with --confirm <id>, deletes only that month and its change-log entries", async () => {
		const result = run(["--confirm", monthIds[0]]);
		expect(result.code).toBe(0);
		expect(result.out).toContain("Deleted 1 months and 1 change-log entries.");
		expect(await prisma.monthlyReport.findMany({ where: { id: { in: monthIds } }, select: { id: true } })).toEqual(
			expect.arrayContaining([{ id: monthIds[1] }, { id: monthIds[2] }]),
		);
		expect(await remaining()).toBe(2);
		expect(await prisma.changeLog.count({ where: { entityId: monthIds[0] } })).toBe(0);
		expect(await prisma.changeLog.count({ where: { entityId: monthIds[1] } })).toBe(1);
	});

	it('refuses a piped "yes" to --all, before touching the database', async () => {
		const result = run(["--all"], { input: "yes\n" });
		expect(result.code).toBe(1);
		expect(result.out).toContain('--all needs "yes" typed at a terminal');
		expect(await remaining()).toBe(2);
	});

	it("refuses a database that is not on this machine", async () => {
		const result = run(["--confirm", monthIds[1]], { databaseUrl: "postgresql://x:y@db.example.neon.tech/app" });
		expect(result.code).toBe(1);
		expect(result.out).toContain('Refusing to touch report data on "db.example.neon.tech"');
		expect(await remaining()).toBe(2);
	});

	it("rejects unknown options rather than guessing", async () => {
		const result = run(["--yes", monthIds[1]]);
		expect(result.code).toBe(1);
		expect(result.out).toContain("Unknown option --yes. Nothing deleted.");
		expect(await remaining()).toBe(2);
	});
});
