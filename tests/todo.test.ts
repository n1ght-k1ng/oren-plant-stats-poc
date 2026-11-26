import { describe, expect, it } from "vitest";

import { todoItems } from "@/components/months/todo";
import type { MyMonths } from "@/lib/schemas/month";

// What a data owner needs to do now (docs/UX-REVIEW.md U2).

const plant = (code: string) => ({ id: code, code, name: `${code} Works`, type: "INTEGRATED" as const });
const month = (period: string, status: MyMonths[number]["months"][number]["status"], reopened = false) => ({
	period,
	status,
	reopened,
	reportId: status ? `${period}-id` : null,
});

describe("todoItems", () => {
	it("puts reopened and sent-back months first, then drafts, then months not started, newest first", () => {
		const mine: MyMonths = [
			{
				plant: plant("P01"),
				months: [
					month("2026-10", null),
					month("2026-09", "DRAFT"),
					month("2026-08", "RETURNED"),
					month("2026-07", "APPROVED"),
					month("2026-06", "SUBMITTED"),
				],
			},
			{ plant: plant("P05"), months: [month("2026-10", "RETURNED", true), month("2026-09", null)] },
		];
		expect(todoItems(mine).map((item) => [item.plant.code, item.period, item.kind])).toEqual([
			["P05", "2026-10", "reopened"],
			["P01", "2026-08", "sentBack"],
			["P01", "2026-09", "draft"],
			["P01", "2026-10", "notStarted"],
			["P05", "2026-09", "notStarted"],
		]);
	});

	it("is empty when everything is submitted or approved", () => {
		expect(
			todoItems([{ plant: plant("P01"), months: [month("2026-10", "APPROVED"), month("2026-09", "SUBMITTED")] }]),
		).toEqual([]);
	});
});
