import { join } from "node:path";

import { type Page, expect, test } from "@playwright/test";

import { readRun } from "./run";

const P04_FILE = join(__dirname, "..", "samples", "P04_Nalgonda_2026-10.csv");

// Checks that keep the UX review's fixes fixed (docs/UX-REVIEW.md). Runs in this run's own E2E company.

const run = readRun();

/** Signs in and waits until the app has taken the user to their starting page, so the session is in place. */
async function signIn(page: Page, email: string) {
	await page.goto("/sign-in");
	await page.getByTestId(`sign-in-${email}`).click();
	await page.waitForURL((url) => !url.pathname.startsWith("/sign-in"));
	await page.waitForLoadState("networkidle");
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

test.describe("U23: a month the Head reopens says Reopened, not Sent back", () => {
	test("on the owner's list, the month page and the dashboard", async ({ page }) => {
		const plant = run.plants.import;
		const period = "2026-08";

		// The owner enters and submits a clean month.
		await signIn(page, run.owner.email);
		await page.getByTestId(`month-start-${plant}-${period}`).click();
		await page.waitForURL(/\/months\/[a-z0-9]+$/);
		const monthUrl = page.url();
		for (const [key, value] of [
			["coal", "11000"],
			["petcoke", "1500"],
			["diesel", "95000"],
			["grid_power", "12300"],
			["clinker", "101700"],
		]) {
			await page.getByTestId(`line-${key}-value`).fill(value);
		}
		await page.getByTestId("month-submit-open").click();
		await page.getByTestId("submit-not-used-furnace_oil").check();
		await page.getByTestId("submit-confirm").click();
		await expect(page.getByTestId("status-submitted")).toBeVisible();

		// The reviewer approves it (clinker sits just under 30% of this test plant's capacity, so it is flagged).
		await signIn(page, run.reviewer.email);
		await page.goto(monthUrl);
		await page.getByTestId("review-comment").fill("Checked; accepted.");
		await page.getByTestId("review-approve").click();
		await page.waitForURL("**/review");

		// The Head reopens it.
		await signIn(page, run.head.email);
		await page.goto(monthUrl);
		await page.getByTestId("reopen-reason").fill("Auditor's query on the diesel bill.");
		await page.getByTestId("reopen-submit").click();
		await expect(page.getByTestId("status-reopened")).toHaveText("Reopened");
		await expect(page.getByTestId("status-returned")).toHaveCount(0);

		await page.goto("/dashboard");
		await page.getByTestId("dashboard-quarter").click();
		await page.getByRole("option", { name: "Q2 FY 2026-27" }).click();
		await expect(page.getByTestId(`dashboard-cell-${plant}-${period}`)).toContainText("Reopened");
		await expect(page.getByTestId("dashboard-missing")).toContainText("Reopened by the Head");
		await expect(page.getByTestId("dashboard-missing")).not.toContainText("Sent back to the plant");

		await signIn(page, run.owner.email);
		await expect(page.getByTestId(`month-row-${plant}-${period}`)).toContainText("Reopened");
	});
});

test.describe("U26: the review queue works on a 390 px phone", () => {
	test("each waiting month is a card whose Review button is fully on screen and opens the month", async ({
		browser,
	}) => {
		// A month waiting for review.
		const desktop = await browser.newPage();
		await signIn(desktop, run.owner.email);
		await desktop.getByTestId(`month-start-${run.plants.loop}-2026-07`).click();
		await desktop.waitForURL(/\/months\/[a-z0-9]+$/);
		for (const [key, value] of [
			["coal", "35000"],
			["petcoke", "7600"],
			["diesel", "160000"],
			["grid_power", "4500"],
			["clinker", "285800"],
		]) {
			await desktop.getByTestId(`line-${key}-value`).fill(value);
		}
		await desktop.getByTestId("month-submit-open").click();
		await desktop.getByTestId("submit-not-used-furnace_oil").check();
		await desktop.getByTestId("submit-confirm").click();
		await expect(desktop.getByTestId("status-submitted")).toBeVisible();
		await desktop.close();

		const phone = await browser.newPage({ viewport: { width: 390, height: 844 } });
		await signIn(phone, run.reviewer.email);
		await phone.waitForURL("**/review");
		const button = phone.getByTestId(`review-card-open-${run.plants.loop}-2026-07`);
		await expect(button).toBeVisible();
		const box = await button.boundingBox();
		expect(box).not.toBeNull();
		expect((box?.x ?? 0) >= 0 && (box?.x ?? 0) + (box?.width ?? 0) <= 390).toBe(true);
		expect(await phone.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
		await expect(phone.getByTestId(`review-card-${run.plants.loop}-2026-07`)).toContainText("2 flags");
		await button.click();
		await phone.waitForURL(/\/months\/[a-z0-9]+$/);
		await expect(phone.getByTestId("review-panel")).toBeVisible();
		await phone.close();
	});
});

test.describe("U2: what needs doing is on the first screen, with counts in the sidebar", () => {
	test("the owner's To do list matches the sidebar count, urgent months first", async ({ page }) => {
		await signIn(page, run.owner.email);
		const todo = page.getByTestId("months-todo");
		await expect(todo).toBeVisible();
		const rows = todo.locator('[data-testid^="todo-"]:not([data-testid^="todo-action-"])');
		const count = await rows.count();
		expect(count).toBeGreaterThan(0);
		await expect(todo.getByRole("heading")).toHaveText(`To do (${count})`);
		await expect(page.getByTestId("nav-months")).toContainText(String(count));

		const labels = await rows.allInnerTexts();
		const urgent = labels.map((label) => /Reopened by the Head|Sent back by a reviewer/.test(label));
		// Every urgent row comes before every other row.
		expect(urgent.indexOf(false) === -1 || urgent.lastIndexOf(true) < urgent.indexOf(false)).toBe(true);
	});

	test("the reviewer's sidebar counts the months he can act on", async ({ page }) => {
		await signIn(page, run.reviewer.email);
		await page.waitForURL("**/review");
		await page.waitForLoadState("networkidle");
		const actionable = await page.locator('[data-testid^="review-open-"]').count();
		const nav = page.getByTestId("nav-review");
		if (actionable === 0) {
			await expect(nav).toHaveText("Review");
		} else {
			await expect(nav).toContainText(String(actionable));
		}
	});
});

test.describe("A2: keyboard focus is visible on the sign-in list", () => {
	test("tabbing to a sample user draws a focus ring", async ({ page }) => {
		await page.goto("/sign-in");
		const first = page.locator('[data-testid^="sign-in-"]').first();
		await expect(first).toBeVisible();
		await first.focus();
		await page.keyboard.press("Tab");
		await page.keyboard.press("Shift+Tab");
		const ring = await first.evaluate((el) => getComputedStyle(el).boxShadow);
		expect(ring).not.toBe("none");
		expect(ring).toMatch(/inset/);
	});
});

test.describe("U6: the month says whether it's saved, and Submit says what's missing", () => {
	test("save state reads as words; Submit lists missing items, each taking you to its line", async ({ page }) => {
		await signIn(page, run.owner.email);
		await page.getByTestId(`todo-action-${run.plants.loop}-2026-06`).click();
		await page.waitForURL(/\/months\/[a-z0-9]+$/);

		await expect(page.getByTestId("month-save-status")).toHaveText("Nothing entered yet");
		await expect(page.getByTestId("month-save")).toHaveText("Save Draft");
		await expect(page.getByTestId("month-save")).toBeDisabled();
		await expect(page.getByTestId("month-submit-open")).toBeEnabled();

		await page.getByTestId("month-submit-open").click();
		await expect(page.getByRole("dialog")).toHaveCount(0);
		const missing = page.getByTestId("month-submit-missing");
		await expect(missing).toContainText("Before you can submit:");
		await expect(missing).toContainText("Coal: enter a value or tick N/A");
		await expect(missing).toContainText("Clinker produced: enter a value or tick N/A");
		await page.getByTestId("month-missing-coal").click();
		await expect(page.getByTestId("line-coal-value")).toBeFocused();

		await page.keyboard.type("35000");
		await expect(page.getByTestId("month-save-status")).toHaveText("Unsaved changes");
		await page.getByTestId("month-save").click();
		await expect(page.getByTestId("month-save-status")).toContainText("Last saved");
		await expect(missing).not.toContainText("Coal:");
	});
});

test.describe("U14: the import says what's left and takes you to it", () => {
	test.use({ viewport: { width: 1366, height: 620 } });

	test("Fill the Form, with questions unanswered, shows the count and scrolls to the first one", async ({ page }) => {
		await signIn(page, run.owner.email);
		await page.getByTestId(`todo-action-${run.plants.import}-2026-05`).click();
		await page.waitForURL(/\/months\/[a-z0-9]+$/);
		await page.getByTestId("month-import-open").click();
		await page.getByTestId("import-file").setInputFiles(P04_FILE);
		await expect(page.getByTestId("import-preview")).toBeVisible();

		await expect(page.getByTestId("import-pending")).toHaveText("3 questions left");
		// Scroll the preview to its end, so the first question (line 5) is out of view, as on a laptop.
		await page.getByTestId("import-summary").scrollIntoViewIfNeeded();
		await expect(page.getByTestId("import-row-5")).not.toBeInViewport();
		await page.getByTestId("import-apply").click();
		// Nothing was filled, and the first unanswered question is brought into view.
		await expect(page.getByRole("dialog")).toBeVisible();
		await expect(page.getByTestId("import-row-5")).toBeInViewport();

		for (const line of [5, 6, 9]) {
			await page.getByTestId(`import-answer-${line}-yes`).click();
		}
		await expect(page.getByTestId("import-pending")).toHaveCount(0);
		await page.getByTestId("import-apply").click();
		await expect(page.getByRole("dialog")).toHaveCount(0);
		await expect(page.getByTestId("line-coal-value")).toHaveValue("11,000");
	});
});

test.describe("U38a: the dashboard spells out Scope 1 and Scope 2", () => {
	test("no S1 or S2 abbreviations, and a one-line definition under the totals", async ({ page }) => {
		await signIn(page, run.head.email);
		await page.waitForURL("**/dashboard");
		await expect(page.getByTestId("dashboard-scope-definitions")).toHaveText(
			"Scope 1: fuel burned and clinker made at the plants. Scope 2: grid electricity bought.",
		);
		const body = await page.locator("main").innerText();
		expect(body).not.toMatch(/\bS[12]\b/);
	});
});

test.describe("U29: an approved month never reappears in the queue", () => {
	test("even while the queue's refresh is slow", async ({ page }) => {
		const plant = run.plants.import;
		const period = "2026-06";
		await signIn(page, run.owner.email);
		await page.getByTestId(`todo-action-${plant}-${period}`).click();
		await page.waitForURL(/\/months\/[a-z0-9]+$/);
		for (const [key, value] of [
			["coal", "11000"],
			["petcoke", "1500"],
			["diesel", "95000"],
			["grid_power", "12300"],
			["clinker", "101700"],
		]) {
			await page.getByTestId(`line-${key}-value`).fill(value);
		}
		await page.getByTestId("month-submit-open").click();
		await page.getByTestId("submit-not-used-furnace_oil").check();
		await page.getByTestId("submit-confirm").click();
		await expect(page.getByTestId("status-submitted")).toBeVisible();

		await signIn(page, run.reviewer.email);
		const row = page.getByTestId(`review-row-${plant}-${period}`);
		await expect(row).toBeVisible();
		await page.getByTestId(`review-open-${plant}-${period}`).click();
		await page.getByTestId("review-comment").fill("Checked; accepted.");

		// Make every queue refresh from now on take 3 seconds, as on a slow connection.
		await page.route(/\/api\/trpc\/[^?]*review\.queue/, async (route) => {
			await new Promise((resolve) => setTimeout(resolve, 3000));
			await route.continue();
		});
		const clicked = Date.now();
		await page.getByTestId("review-approve").click();
		// Back on the queue promptly, without waiting for the slow refresh...
		await page.waitForURL("**/review", { timeout: 1500 });
		expect(Date.now() - clicked).toBeLessThan(1500);
		// ...and the approved month is already gone from it.
		await expect(
			page.locator('[data-testid^="review-row-"]').first().or(page.getByText("Nothing waiting for review")),
		).toBeVisible({ timeout: 1500 });
		// Checked at once, not waited for: the slow refresh would otherwise hide a stale row.
		expect(await row.count()).toBe(0);
	});
});
