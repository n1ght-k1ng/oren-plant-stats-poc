import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { ROLES } from "@/lib/roles";
import { importMapping } from "@/lib/schemas/import";
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

// Importing into a month through the API (docs/PLAN.md 4.2; D9, D14, D16, O11).

const P04_FILE = "P04_Nalgonda_2026-10.csv";
const p04 = readFileSync(fileURLToPath(new URL(`../samples/${P04_FILE}`, import.meta.url)), "utf8");

let companyId: string;
let owner: { id: string };
let reviewer: { id: string };
let plantId: string;

/** Opens (or reopens) one month of the test plant. Each test uses its own month, so they don't interfere. */
async function openMonth(period: string) {
	return (await callerFor(owner).month.open({ plantId, period })).reportId;
}

beforeAll(async () => {
	companyId = (await createTestCompany()).id;
	owner = await createTestUser(companyId, [ROLES.DATA_OWNER], "Lakshmi Reddy");
	reviewer = await createTestUser(companyId, [ROLES.REVIEWER], "Vikram Joshi");
	const plant = await createTestPlant(companyId, {
		code: "P04",
		name: "Nimbus Nalgonda Works",
		cementCapacityTpa: 2_500_000,
	});
	await prisma.plant.update({ where: { id: plant.id }, data: { town: "Nalgonda" } });
	plantId = plant.id;
	await addDataOwner(plantId, owner.id);
	await recordCapacity(prisma, {
		companyId,
		plantId,
		effectiveFrom: "2026-04",
		cementCapacityTpa: 2_500_000,
		createdById: null,
	});
});

afterAll(async () => {
	await deleteTestCompany(companyId);
});

describe("month.import", () => {
	it("stores the original text and how it was read, and changes nothing in the month", async () => {
		const reportId = await openMonth("2026-10");
		const result = await callerFor(owner).month.import({ reportId, kind: "FILE", filename: P04_FILE, content: p04 });

		expect(result.mapping.headerLine).toBe(4);
		expect(result.mapping.rows.map((row) => [row.itemKey, row.status])).toEqual([
			["coal", "ASK"],
			["petcoke", "ASK"],
			["diesel", "READY"],
			["grid_power", "READY"],
			["clinker", "ASK"],
		]);

		const upload = await prisma.upload.findUniqueOrThrow({ where: { id: result.uploadId } });
		expect(upload).toMatchObject({
			reportId,
			kind: "FILE",
			filename: P04_FILE,
			content: p04,
			sizeBytes: Buffer.byteLength(p04, "utf8"),
			uploadedById: owner.id,
		});
		expect(importMapping.parse(upload.mapping)).toEqual(result.mapping);

		const month = await callerFor(owner).month.byId({ reportId });
		expect(month).toMatchObject({ status: "DRAFT", version: 1 });
		expect(month.lines?.every((line) => line.state === "NOT_ENTERED" || line.itemKey === "clinker")).toBe(true);
	});

	it("warns about a file for another month, and fills only the month being entered", async () => {
		const reportId = await openMonth("2026-09");
		const result = await callerFor(owner).month.import({ reportId, kind: "FILE", filename: P04_FILE, content: p04 });
		expect(result.mapping.warnings[0]).toContain("This file mentions October 2026, but you are filling");
		const stored = await prisma.monthlyReport.findUniqueOrThrow({ where: { id: reportId } });
		expect(stored.period).not.toBe("2026-10");
	});

	it("takes a paste from Excel", async () => {
		const reportId = await openMonth("2026-08");
		const result = await callerFor(owner).month.import({
			reportId,
			kind: "PASTE",
			filename: null,
			content: "Particulars\tQty\tUOM\nHSD\t95\tKL",
		});
		expect(result.mapping.rows).toMatchObject([
			{ itemKey: "diesel", status: "READY", proposed: { value: "95", unit: "kL" } },
		]);
	});

	it("refuses more than 1 MB, or nothing at all, storing nothing", async () => {
		const reportId = await openMonth("2026-07");
		const big = `Item,Qty,Unit\n${"Coal,1,t\n".repeat(120_000)}`;
		await expect(
			callerFor(owner).month.import({ reportId, kind: "FILE", filename: "big.csv", content: big }),
		).rejects.toMatchObject({
			code: "BAD_REQUEST",
			message: "This file is larger than 1 MB. Import a smaller file, or paste just the table.",
		});
		await expect(
			callerFor(owner).month.import({ reportId, kind: "PASTE", filename: null, content: "  \n" }),
		).rejects.toMatchObject({
			code: "BAD_REQUEST",
		});
		expect(await prisma.upload.count({ where: { reportId } })).toBe(0);
	});

	it("is only for the plant's data owners, and only while the month can be edited", async () => {
		const reportId = await openMonth("2026-07");
		await expect(
			callerFor(reviewer).month.import({ reportId, kind: "FILE", filename: P04_FILE, content: p04 }),
		).rejects.toMatchObject({ code: "FORBIDDEN" });
	});
});

describe("saving imported values", () => {
	const imported = (
		itemKey: string,
		value: string,
		unit: string,
		uploadId: string,
		note: string | null = null,
	): LineInput => ({
		itemKey,
		mode: "value",
		value,
		unit,
		note,
		uploadId,
	});

	it("marks lines as imported, keeps what the file said, and shows the file in the audit trail", async () => {
		const reportId = await openMonth("2026-06");
		const { uploadId } = await callerFor(owner).month.import({
			reportId,
			kind: "FILE",
			filename: P04_FILE,
			content: p04,
		});
		await callerFor(owner).month.save({
			reportId,
			expectedVersion: 1,
			lines: [
				imported("coal", "11,000", "t", uploadId, "Imported + Indian"),
				imported("petcoke", "1,500", "t", uploadId),
				imported("diesel", "95", "kL", uploadId, "DG sets + mining fleet"),
				imported("grid_power", "1,23,00,000", "kWh", uploadId, "TSSPDCL; As per bill"),
				imported("clinker", "1,01,700", "t", uploadId),
			],
		});
		const month = await callerFor(owner).month.byId({ reportId });
		expect(month.lines?.find((line) => line.itemKey === "grid_power")).toMatchObject({
			source: "IMPORT",
			enteredValue: "1,23,00,000",
			enteredUnit: "kWh",
			value: "12300",
			note: "TSSPDCL; As per bill",
		});

		await callerFor(owner).month.submit({ reportId, expectedVersion: 2, confirmNotUsed: ["furnace_oil"] });
		await callerFor(reviewer).review.approve({ reportId, expectedVersion: 3, comment: null });

		const audit = await callerFor(reviewer).month.audit({ reportId });
		expect(audit.approval?.scope1KgCo2).toBe("85251600");
		expect(audit.approval?.lines.find((line) => line.itemKey === "grid_power")).toMatchObject({
			source: "IMPORT",
			importedFrom: P04_FILE,
			typedValue: "1,23,00,000",
		});
		expect(audit.uploads).toMatchObject([
			{ label: P04_FILE, uploadedBy: "Lakshmi Reddy", content: p04, headerLine: 4 },
		]);
		expect(audit.uploads[0].rows.map((row) => row.status)).toEqual(["ASK", "ASK", "READY", "READY", "ASK"]);
	});

	it("refuses an upload from another month", async () => {
		const first = await openMonth("2026-05");
		const { uploadId } = await callerFor(owner).month.import({
			reportId: first,
			kind: "FILE",
			filename: P04_FILE,
			content: p04,
		});
		const second = await openMonth("2026-04");
		await expect(
			callerFor(owner).month.save({
				reportId: second,
				expectedVersion: 1,
				lines: [imported("diesel", "95", "kL", uploadId)],
			}),
		).rejects.toMatchObject({
			code: "BAD_REQUEST",
			message: "That import belongs to a different month. Import the file again here.",
		});
	});
});
