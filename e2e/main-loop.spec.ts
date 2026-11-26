import { join } from "node:path";

import { type Page, expect, test } from "@playwright/test";

import { readRun } from "./run";

// The main loop through the real screens (docs/DECISIONS.md E1): the owner submits, the reviewer sends it back,
// the owner fixes and resubmits, the reviewer approves, and the Head sees it on the dashboard and traces it.
// Then one import. Runs in this run's own E2E company (global-setup.ts).

test.describe.configure({ mode: "serial" });

const run = readRun();
const PERIOD = "2026-10";
const P04_FILE = join(__dirname, "..", "samples", "P04_Nalgonda_2026-10.csv");

async function signIn(page: Page, email: string) {
	await page.goto("/sign-in");
	await page.getByTestId(`sign-in-${email}`).click();
	// Each role lands on its own page (U1), so wait to leave sign-in rather than for one address.
	await page.waitForURL((url) => !url.pathname.startsWith("/sign-in"));
	await page.waitForLoadState("networkidle");
}

async function openMonth(page: Page, plant: string) {
	await page.getByTestId("nav-months").click();
	const start = page.getByTestId(`month-start-${plant}-${PERIOD}`);
	const open = page.getByTestId(`month-open-${plant}-${PERIOD}`);
	await expect(start.or(open)).toBeVisible();
	await ((await start.isVisible()) ? start : open).click();
	await page.waitForURL(/\/months\/[a-z0-9]+$/);
	await expect(page.getByTestId("line-diesel")).toBeVisible();
}

let monthUrl = "";

test("the data owner enters P01-like figures and submits, seeing both flags first", async ({ page }) => {
	await signIn(page, run.owner.email);
	await openMonth(page, run.plants.loop);
	monthUrl = page.url();

	await page.getByTestId("line-coal-value").fill("35000");
	await page.getByTestId("line-petcoke-value").fill("7,600");
	await page.getByTestId("line-diesel-value").fill("160");
	await page.getByTestId("line-diesel-unit").click();
	await page.getByRole("option", { name: "kL", exact: true }).click();
	await expect(page.getByTestId("line-diesel-converted")).toHaveText("Saved as 1,60,000 L");
	await page.getByTestId("line-grid_power-value").fill("4,000");
	await page.getByTestId("line-clinker-value").fill("2,85,800");
	await expect(page.locator('[data-testid^="flag-"]')).toHaveCount(2);

	await page.getByTestId("month-submit-open").click();
	await expect(page.getByTestId("submit-confirm")).toBeDisabled();
	await page.getByTestId("submit-not-used-furnace_oil").check();
	await page.getByTestId("submit-confirm").click();
	await expect(page.getByTestId("status-submitted")).toBeVisible();
});

test("the reviewer sends it back with a comment", async ({ page }) => {
	await signIn(page, run.reviewer.email);
	await page.getByTestId("nav-review").click();
	await expect(page.getByTestId(`review-row-${run.plants.loop}-${PERIOD}`)).toContainText("2 flags");
	await page.getByTestId(`review-open-${run.plants.loop}-${PERIOD}`).click();

	await expect(page.getByTestId("review-approve")).toBeDisabled();
	await expect(page.getByTestId("review-send-back")).toBeDisabled();
	await page.getByTestId("review-comment").fill("Grid power looks low. Please check the bill.");
	await page.getByTestId("review-send-back").click();
	await page.waitForURL("**/review");
	await expect(page.getByTestId(`review-row-${run.plants.loop}-${PERIOD}`)).toHaveCount(0);
});

test("the data owner sees the comment, fixes grid power and resubmits", async ({ page }) => {
	await signIn(page, run.owner.email);
	await page.goto(monthUrl);
	await expect(page.getByTestId("month-return-comment")).toContainText("Grid power looks low. Please check the bill.");
	await page.getByTestId("line-grid_power-value").fill("4,500");
	await page.getByTestId("line-grid_power-note").fill("As per bill");
	await page.getByTestId("month-submit-open").click();
	await page.getByTestId("submit-confirm").click();
	await expect(page.getByTestId("status-submitted")).toBeVisible();
	await expect(page.getByTestId("month-history")).toContainText("Changed grid electricity from 4,000 MWh to 4,500 MWh");
});

test("the reviewer approves, explaining the flagged values", async ({ page }) => {
	await signIn(page, run.reviewer.email);
	await page.goto(monthUrl);
	await page.getByTestId("review-comment").fill("Checked against the bills; the flagged figures are correct.");
	await page.getByTestId("review-approve").click();
	await page.waitForURL("**/review");
	await page.goto(monthUrl);
	await expect(page.getByTestId("status-approved")).toBeVisible();
});

test("the Head sees it on the dashboard and traces Scope 1 back to the typed values", async ({ page }) => {
	await signIn(page, run.head.email);
	await page.getByTestId("nav-dashboard").click();
	await expect(page.getByTestId("dashboard-quarter")).toContainText("Q3 FY 2026-27");
	await expect(page.getByTestId("dashboard-readiness")).toContainText("1 of 2 plant-months approved");
	await expect(page.getByTestId("dashboard-scope1")).toHaveText("2,59,993.2 t CO2");
	await expect(page.getByTestId(`dashboard-cell-${run.plants.import}-${PERIOD}`)).toHaveText("Not started");

	await page.getByTestId(`dashboard-cell-${run.plants.loop}-${PERIOD}`).click();
	// The audit trail carries the dashboard quarter, so its back link returns there (U38b).
	await page.waitForURL(/\/audit\?from=dashboard&quarter=2026-Q3$/);
	await expect(page.getByTestId("audit-back")).toHaveText("Back to the dashboard");
	await expect(page.getByTestId("audit-scope1")).toHaveText("2,59,993.2 t CO2");
	await expect(page.getByTestId("audit-approved-by")).toContainText(`Approved by ${run.reviewer.name} (Reviewer)`);
	await expect(page.getByTestId("audit-typed-diesel")).toHaveText("160 kL");
	await expect(page.getByTestId("audit-kg-diesel")).toHaveText("4,28,800");
	await expect(page.getByTestId("audit-line-diesel")).toContainText(run.owner.name);
	await expect(page.getByTestId("audit-scope-1-total")).toHaveText("25,99,93,200");
	await expect(page.getByTestId("audit-timeline")).toContainText("Sent back");
});

test("the data owner imports P04's file, answers the MT questions, and the form fills and saves", async ({ page }) => {
	await signIn(page, run.owner.email);
	await openMonth(page, run.plants.import);
	await page.getByTestId("month-import-open").click();
	await page.getByTestId("import-file").setInputFiles(P04_FILE);
	await expect(page.getByTestId("import-preview")).toBeVisible();
	// The file is for October, the month being filled, and names no other plant of this company: no warning.
	await expect(page.getByTestId("import-warnings")).toHaveCount(0);
	await expect(page.getByTestId("import-row-5")).toContainText("Confirm it means tonnes (t), not million tonnes.");

	await expect(page.getByTestId("import-pending")).toHaveText("3 questions left");
	for (const line of [5, 6, 9]) {
		await page.getByTestId(`import-answer-${line}-yes`).click();
	}
	await page.getByTestId("import-apply").click();

	await expect(page.getByTestId("line-coal-value")).toHaveValue("11,000");
	await expect(page.getByTestId("line-coal-note")).toHaveValue("Imported + Indian");
	await expect(page.getByTestId("line-grid_power-value")).toHaveValue("1,23,00,000");
	await page.getByTestId("month-save").click();
	await expect(page.getByText("Saved. You can come back")).toBeVisible();

	await page.reload();
	await expect(page.getByTestId("line-grid_power-value")).toHaveValue("1,23,00,000");
	await expect(page.getByTestId("line-diesel-value")).toHaveValue("95");
	await expect(page.getByTestId("status-draft")).toBeVisible();
});
