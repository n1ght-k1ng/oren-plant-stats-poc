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

test.describe("U5: unsaved figures are never lost silently", () => {
	test("leaving the form with unsaved changes asks first; staying keeps them, saving clears the warning", async ({
		page,
	}) => {
		await signIn(page, run.owner.email);
		await page.waitForURL("**/months");
		const start = page.getByTestId(`month-start-${run.plants.loop}-2026-09`);
		const open = page.getByTestId(`month-open-${run.plants.loop}-2026-09`);
		await expect(start.or(open)).toBeVisible();
		await ((await start.isVisible()) ? start : open).click();
		await page.waitForURL(/\/months\/[a-z0-9]+$/);
		const monthUrl = page.url();

		await page.getByTestId("line-coal-value").fill("12345");

		// Stay: the page and the typed figure remain.
		let asked = "";
		page.once("dialog", (dialog) => {
			asked = dialog.message();
			void dialog.dismiss();
		});
		await page.getByTestId("month-back").click();
		await expect.poll(() => asked).toContain("Leave without saving them?");
		expect(page.url()).toBe(monthUrl);
		await expect(page.getByTestId("line-coal-value")).toHaveValue("12345");

		// Save, and leaving no longer asks.
		await page.getByTestId("month-save").click();
		await expect(page.getByText("Saved. You can come back")).toBeVisible();
		let askedAgain = false;
		page.once("dialog", (dialog) => {
			askedAgain = true;
			void dialog.dismiss();
		});
		await page.getByTestId("month-back").click();
		await page.waitForURL("**/months");
		expect(askedAgain).toBe(false);
	});

	test("leaving with changes and choosing to leave goes, and closing the tab triggers the browser's warning", async ({
		page,
	}) => {
		await signIn(page, run.owner.email);
		await page.getByTestId(`month-open-${run.plants.loop}-2026-09`).click();
		await page.waitForURL(/\/months\/[a-z0-9]+$/);
		await page.getByTestId("line-petcoke-value").fill("999");

		page.once("dialog", (dialog) => void dialog.accept());
		await page.getByTestId("month-back").click();
		await page.waitForURL("**/months");

		await page.getByTestId(`month-open-${run.plants.loop}-2026-09`).click();
		await expect(page.getByTestId("line-petcoke-value")).toHaveValue("");
		await page.getByTestId("line-petcoke-value").fill("999");
		const warning = new Promise<string>((resolve) =>
			page.once("dialog", (dialog) => {
				resolve(dialog.type());
				void dialog.accept();
			}),
		);
		await page.close({ runBeforeUnload: true });
		expect(await warning).toBe("beforeunload");
	});
});
