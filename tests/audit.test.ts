import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { sumDecimals } from "@/lib/decimal";
import { ROLES } from "@/lib/roles";
import type { LineInput } from "@/lib/schemas/month";
import { prisma } from "@/server/db";
import { recordCapacity } from "@/server/services/capacity";

import {
	addDataOwner,
	callerFor,
	createTestCompany,
	createTestPlant,
	createTestUser,
	deleteTestCompany,
} from "./helpers";

// The audit trail (docs/PLAN.md 3.8, H1): an approved figure traced back to what was typed and who typed it.

let companyId: string;
let otherCompanyId: string;
let owner: { id: string };
let reviewer: { id: string };
let head: { id: string };
let outsider: { id: string };
let reportId: string;

const line = (itemKey: string, value: string, unit: string, note: string | null = null): LineInput => ({
	itemKey,
	mode: "value",
	value,
	unit,
	note,
});

beforeAll(async () => {
	companyId = (await createTestCompany()).id;
	otherCompanyId = (await createTestCompany()).id;
	owner = await createTestUser(companyId, [ROLES.DATA_OWNER], "Ravi Meena");
	reviewer = await createTestUser(companyId, [ROLES.REVIEWER], "Vikram Joshi");
	head = await createTestUser(companyId, [ROLES.SUSTAINABILITY_HEAD], "Meera Iyer");
	outsider = await createTestUser(otherCompanyId, [ROLES.SUSTAINABILITY_HEAD], "Outsider");
	const plant = await createTestPlant(companyId, { code: "P01", cementCapacityTpa: 4_000_000 });
	await addDataOwner(plant.id, owner.id);
	await recordCapacity(prisma, {
		companyId,
		plantId: plant.id,
		effectiveFrom: "2026-04",
		cementCapacityTpa: 4_000_000,
		createdById: null,
	});

	// P01's October, typed the way a plant might: diesel in kL, power in kWh with Indian grouping.
	({ reportId } = await callerFor(owner).month.open({ plantId: plant.id, period: "2026-10" }));
	await callerFor(owner).month.save({
		reportId,
		expectedVersion: 1,
		lines: [
			line("coal", "35000", "t"),
			line("petcoke", "7,600", "t"),
			line("diesel", "160", "kL", "DG sets + mining fleet"),
			line("grid_power", "45,00,000", "kWh"),
			line("clinker", "2,85,800", "t"),
		],
	});
	await callerFor(owner).month.submit({ reportId, expectedVersion: 2, confirmNotUsed: ["furnace_oil"] });
	await callerFor(reviewer).review.sendBack({
		reportId,
		expectedVersion: 3,
		comment: "Please attach the power bill figure.",
	});
	await callerFor(owner).month.save({
		reportId,
		expectedVersion: 4,
		lines: [line("grid_power", "4,500", "MWh", "As per bill")],
	});
	await callerFor(owner).month.submit({ reportId, expectedVersion: 5, confirmNotUsed: [] });
	await callerFor(reviewer).review.approve({
		reportId,
		expectedVersion: 6,
		comment: "Figures match the plant's records.",
	});
}, 60_000);

afterAll(async () => {
	await deleteTestCompany(companyId);
	await deleteTestCompany(otherCompanyId);
});

describe("tracing the approved Scope 1 figure", () => {
	it("shows the approved totals, who approved them, in which role, and why", async () => {
		const audit = await callerFor(head).month.audit({ reportId });
		expect(audit.approval).toMatchObject({
			approvedBy: { name: "Vikram Joshi", role: "REVIEWER" },
			comment: "Figures match the plant's records.",
			scope1KgCo2: "259993200",
			scope2KgCo2: "3037500",
			totalKgCo2: "263030700",
			submittedBy: "Ravi Meena",
		});
	});

	it("traces each line from kg CO2 back to the factor, the converted value, what was typed and who typed it", async () => {
		const audit = await callerFor(head).month.audit({ reportId });
		const diesel = audit.approval?.lines.find((entry) => entry.itemKey === "diesel");
		expect(diesel).toMatchObject({
			label: "Diesel (HSD)",
			typedValue: "160",
			typedUnit: "kL",
			value: "160000",
			unit: "L",
			kgCo2PerUnit: "2.68",
			factorYear: "2006",
			scope: 1,
			kgCo2: "428800",
			note: "DG sets + mining fleet",
			source: "FORM",
			enteredBy: "Ravi Meena",
		});
		expect(diesel?.factorSource).toContain("IPCC 2006");
		expect(diesel?.enteredAt).toBeInstanceOf(Date);

		const clinker = audit.approval?.lines.find((entry) => entry.itemKey === "clinker");
		expect(clinker).toMatchObject({
			typedValue: "2,85,800",
			value: "285800",
			factorYear: "version not stated in starter",
			kgCo2: "150045000",
		});
	});

	it("shows the line that was corrected after the send-back as finally typed", async () => {
		const audit = await callerFor(head).month.audit({ reportId });
		expect(audit.approval?.lines.find((entry) => entry.itemKey === "grid_power")).toMatchObject({
			typedValue: "4,500",
			typedUnit: "MWh",
			value: "4500",
			scope: 2,
			kgCo2: "3037500",
			note: "As per bill",
		});
	});

	it("lists N/A lines as not counted, with who confirmed them", async () => {
		const audit = await callerFor(head).month.audit({ reportId });
		expect(audit.approval?.lines.find((entry) => entry.itemKey === "furnace_oil")).toMatchObject({
			state: "NA",
			naReason: "NOT_USED_THIS_MONTH",
			kgCo2: null,
			enteredBy: "Ravi Meena",
		});
	});

	it("has Scope 1 lines that add up exactly to the approved Scope 1 total", async () => {
		const audit = await callerFor(head).month.audit({ reportId });
		const scope1 = (audit.approval?.lines ?? []).flatMap((entry) =>
			entry.scope === 1 && entry.kgCo2 ? [entry.kgCo2] : [],
		);
		expect(sumDecimals(scope1).toFixed()).toBe(audit.approval?.scope1KgCo2);
	});
});

describe("the timeline", () => {
	it("lists every edit, submission, review and approval in order, with comments, flags and totals", async () => {
		const audit = await callerFor(owner).month.audit({ reportId });
		expect(audit.timeline.map((entry) => [entry.kind, entry.actor.name])).toEqual([
			["EDIT", "Ravi Meena"],
			["CONFIRM_NOT_USED", "Ravi Meena"],
			["SUBMIT", "Ravi Meena"],
			["SEND_BACK", "Vikram Joshi"],
			["EDIT", "Ravi Meena"],
			["SUBMIT", "Ravi Meena"],
			["APPROVE", "Vikram Joshi"],
		]);
		const [firstEdit, , firstSubmit, sendBack, , resubmit, approve] = audit.timeline;
		expect(firstEdit.changes).toContainEqual({ label: "Diesel (HSD)", from: "not entered", to: "160 kL" });
		expect(firstSubmit.flags?.map((flag) => flag.code)).toEqual(["KILN_ENERGY", "GRID_PER_CLINKER"]);
		expect(sendBack).toMatchObject({ comment: "Please attach the power bill figure.", actor: { role: "REVIEWER" } });
		expect(resubmit.changes).toContainEqual({ label: "Grid electricity note", from: "none", to: "As per bill" });
		expect(approve.totals).toEqual({ scope1KgCo2: "259993200", scope2KgCo2: "3037500" });
	});
});

describe("who sees what", () => {
	it("hides another company's month", async () => {
		await expect(callerFor(outsider).month.audit({ reportId })).rejects.toMatchObject({ code: "NOT_FOUND" });
	});

	it("keeps a reopened month's earlier approval, no longer counted, and hides edits being made from reviewers (R1)", async () => {
		await callerFor(head).review.reopen({ reportId, expectedVersion: 7, comment: "Auditor query on diesel." });
		await callerFor(owner).month.save({ reportId, expectedVersion: 8, lines: [line("diesel", "150", "kL")] });

		const reviewerView = await callerFor(reviewer).month.audit({ reportId });
		expect(reviewerView).toMatchObject({ status: "RETURNED", approval: null, draftEditsHidden: true });
		expect(reviewerView.earlierApprovals).toMatchObject([
			{ scope1KgCo2: "259993200", approvedBy: { name: "Vikram Joshi" } },
		]);
		expect(reviewerView.timeline.some((entry) => entry.kind === "EDIT")).toBe(false);
		expect(reviewerView.timeline.at(-1)).toMatchObject({ kind: "REOPEN", comment: "Auditor query on diesel." });

		const ownerView = await callerFor(owner).month.audit({ reportId });
		expect(ownerView.timeline.at(-1)).toMatchObject({ kind: "EDIT" });
	});
});
