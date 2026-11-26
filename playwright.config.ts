import { defineConfig } from "@playwright/test";

/**
 * End-to-end tests (docs/DECISIONS.md E1): the main loop and an import, through the real screens.
 *
 *   npm run test:e2e                                        against http://localhost:3000 (starts `npm run dev` if needed)
 *   E2E_BASE_URL=https://your-app.vercel.app npm run test:e2e   against a deployed app
 *
 * Each run creates its own "E2E Cement" company in the database DATABASE_URL points at, and deletes it at the
 * end (e2e/global-setup.ts, e2e/global-teardown.ts). It never touches other companies' data. For a deployed app,
 * DATABASE_URL must be that app's database.
 *
 * Uses the installed Chrome. Set E2E_BROWSER_CHANNEL to change it, or run `npx playwright install chromium` and
 * set it to "chromium".
 */
const baseURL = process.env.E2E_BASE_URL ?? "http://localhost:3000";

export default defineConfig({
	testDir: "e2e",
	fullyParallel: false,
	workers: 1,
	retries: 0,
	timeout: 90_000,
	expect: { timeout: 15_000 },
	reporter: [["list"]],
	globalSetup: "./e2e/global-setup.ts",
	globalTeardown: "./e2e/global-teardown.ts",
	use: {
		baseURL,
		channel: process.env.E2E_BROWSER_CHANNEL ?? "chrome",
		headless: true,
		viewport: { width: 1440, height: 1000 },
		trace: "retain-on-failure",
	},
	webServer: process.env.E2E_BASE_URL
		? undefined
		: { command: "npm run dev", url: `${baseURL}/sign-in`, reuseExistingServer: true, timeout: 120_000 },
});
