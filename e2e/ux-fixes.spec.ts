import { type Page, expect, test } from "@playwright/test";

import { readRun } from "./run";

// Checks that keep the UX review's fixes fixed (docs/UX-REVIEW.md). Runs in this run's own E2E company.

const run = readRun();

async function signIn(page: Page, email: string) {
	await page.goto("/sign-in");
	await page.getByTestId(`sign-in-${email}`).click();
}

test.describe("U1: each role starts on its own page", () => {
	for (const [who, home] of [
		["owner", "/months"],
		["reviewer", "/review"],
		["head", "/dashboard"],
	] as const) {
		test(`the ${who} lands on ${home} after signing in, and from /`, async ({ page }) => {
			await signIn(page, run[who].email);
			await page.waitForURL(`**${home}`);
			await page.goto("/");
			await page.waitForURL(`**${home}`);
		});
	}
});
