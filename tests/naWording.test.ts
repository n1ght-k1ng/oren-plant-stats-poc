import { describe, expect, it } from "vitest";

import { naLabel, naPhrase } from "@/lib/naWording";

// One wording for an item with no figure (docs/UX-REVIEW.md U8, U35).

describe("naWording", () => {
	it("says 'Not used this month' only when the owner confirmed it, and N/A otherwise", () => {
		expect(naLabel("NOT_USED_THIS_MONTH")).toBe("Not used this month");
		expect(naLabel("NOT_APPLICABLE")).toBe("N/A");
		expect(naLabel(null)).toBe("N/A");
		expect(naLabel(undefined)).toBe("N/A");
	});

	it("has a form for use inside a sentence", () => {
		expect(naPhrase("NOT_USED_THIS_MONTH")).toBe("not used this month");
		expect(naPhrase("NOT_APPLICABLE")).toBe("N/A");
	});
});
