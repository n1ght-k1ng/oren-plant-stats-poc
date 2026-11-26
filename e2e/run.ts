/** The E2E company a run creates, shared between global setup, the tests and global teardown. */
// Playwright compiles these files as CommonJS, so paths use __dirname rather than import.meta.url.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export const RUN_FILE = join(__dirname, ".run.json");

export type E2eRun = {
	companyId: string;
	stamp: string;
	owner: { email: string; name: string };
	reviewer: { email: string; name: string };
	head: { email: string; name: string };
	/** E01: the main loop. E02: the import. */
	plants: { loop: string; import: string };
};

export function readRun(): E2eRun {
	return JSON.parse(readFileSync(RUN_FILE, "utf8")) as E2eRun;
}

/** Loads .env into process.env, keeping anything already set, like the app and vitest do. */
export function loadEnv() {
	const envFile = join(__dirname, "..", ".env");
	if (existsSync(envFile) && !process.env.DATABASE_URL) {
		process.loadEnvFile(envFile);
	}
}
