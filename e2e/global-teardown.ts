/** Deletes this run's own company, and with it everything the tests created. Nothing else. */
import { existsSync, rmSync } from "node:fs";

import { PrismaClient } from "@prisma/client";

import { RUN_FILE, loadEnv, readRun } from "./run";

export default async function globalTeardown() {
	if (!existsSync(RUN_FILE)) {
		return;
	}
	loadEnv();
	const run = readRun();
	const prisma = new PrismaClient();
	try {
		// Only ever the company this run created, by its id and E2E name.
		await prisma.company.deleteMany({ where: { id: run.companyId, name: { startsWith: "E2E Cement " } } });
	} finally {
		await prisma.$disconnect();
		rmSync(RUN_FILE);
	}
}
