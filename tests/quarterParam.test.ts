import { describe, expect, it } from "vitest";

import { parseQuarterParam, quarterParam } from "@/lib/quarterParam";

// The dashboard's quarter in the address (docs/UX-REVIEW.md U38b).

describe("quarterParam", () => {
	it("writes and reads a quarter", () => {
		expect(quarterParam({ fyStartYear: 2026, quarter: 2 })).toBe("2026-Q2");
		expect(parseQuarterParam("2026-Q2")).toEqual({ fyStartYear: 2026, quarter: 2 });
	});

	it("ignores anything else, so a bad link opens the default quarter", () => {
		for (const bad of ["2026-Q5", "2026-2", "Q2", "", undefined, ["2026-Q2"]]) {
			expect(parseQuarterParam(bad)).toBeNull();
		}
	});
});
