import { describe, expect, it } from "vitest";

import { homeFor } from "@/lib/home";
import { ROLES } from "@/lib/roles";

// Where each role starts (docs/UX-REVIEW.md U1).

describe("homeFor", () => {
	it.each([
		[[ROLES.SUSTAINABILITY_HEAD], "/dashboard"],
		[[ROLES.REVIEWER], "/review"],
		[[ROLES.REVIEWER, ROLES.DATA_OWNER], "/review"],
		[[ROLES.DATA_OWNER], "/months"],
		[[], "/plants"],
	])("sends %j to %s", (roles, home) => {
		expect(homeFor({ roles })).toBe(home);
	});
});
