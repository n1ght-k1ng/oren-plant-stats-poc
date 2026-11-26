import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parseEnv } from "node:util";
import { defineConfig } from "vitest/config";

// Values already in the environment win over `.env`, so CI and other tools can set their own.
const envFile = fileURLToPath(new URL(".env", import.meta.url));
const fileEnv = existsSync(envFile) ? parseEnv(readFileSync(envFile, "utf8")) : {};
const env = Object.fromEntries(
	Object.entries(fileEnv).filter(([key, value]) => process.env[key] === undefined && value !== undefined),
) as Record<string, string>;

export default defineConfig({
	resolve: {
		alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
	},
	test: {
		environment: "node",
		include: ["tests/**/*.test.ts"],
		setupFiles: ["tests/setup.ts"],
		env,
		// Test files share one database, so they run one after another.
		fileParallelism: false,
		testTimeout: 30_000,
		hookTimeout: 60_000,
	},
});
