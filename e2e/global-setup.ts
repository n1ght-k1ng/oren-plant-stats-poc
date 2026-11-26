/** Creates this run's own company, users and plants, so the tests never touch anyone else's data. */
import { writeFileSync } from "node:fs";

import { PrismaClient } from "@prisma/client";

import { type E2eRun, RUN_FILE, loadEnv } from "./run";

export default async function globalSetup() {
	loadEnv();
	const prisma = new PrismaClient();
	try {
		const stamp = new Date().toISOString().replace(/\D/g, "").slice(0, 14);
		const company = await prisma.company.create({ data: { name: `E2E Cement ${stamp}` } });
		const person = (role: string, name: string, roles: string[]) =>
			prisma.user.create({
				data: { name, email: `e2e-${stamp}-${role}@example.test`, roles, companyId: company.id },
			});
		const owner = await person("owner", "Esha Owner", ["DATA_OWNER"]);
		const reviewer = await person("reviewer", "Rahul Reviewer", ["REVIEWER"]);
		const head = await person("head", "Hema Head", ["SUSTAINABILITY_HEAD"]);

		const plant = async (code: string, name: string) => {
			const created = await prisma.plant.create({
				data: {
					code,
					name,
					town: `${name} Town`,
					state: "Test State",
					type: "INTEGRATED",
					cementCapacityTpa: 4_000_000,
					companyId: company.id,
					dataOwners: { connect: { id: owner.id } },
				},
			});
			await prisma.plantCapacity.create({
				data: { companyId: company.id, plantId: created.id, effectiveFrom: "2026-04", cementCapacityTpa: 4_000_000 },
			});
			return created;
		};
		const loop = await plant("E01", "E2E Loop Works");
		const imported = await plant("E02", "E2E Import Works");

		const run: E2eRun = {
			companyId: company.id,
			stamp,
			owner: { email: owner.email, name: owner.name },
			reviewer: { email: reviewer.email, name: reviewer.name },
			head: { email: head.email, name: head.name },
			plants: { loop: loop.code, import: imported.code },
		};
		writeFileSync(RUN_FILE, JSON.stringify(run, null, 2));
	} finally {
		await prisma.$disconnect();
	}
}
