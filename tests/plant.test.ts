import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { ROLES } from "@/lib/roles";

import { callerFor, createTestCompany, createTestPlant, createTestUser, deleteTestCompany } from "./helpers";

type Fixture = Awaited<ReturnType<typeof setUp>>;

async function setUp() {
	const company = await createTestCompany();
	const otherCompany = await createTestCompany();
	const [head, dataOwner, reviewer, outsider] = await Promise.all([
		createTestUser(company.id, [ROLES.SUSTAINABILITY_HEAD], "Head"),
		createTestUser(company.id, [ROLES.DATA_OWNER], "Owner"),
		createTestUser(company.id, [ROLES.REVIEWER], "Reviewer"),
		createTestUser(otherCompany.id, [ROLES.SUSTAINABILITY_HEAD], "Outsider"),
	]);
	const plant = await createTestPlant(company.id, { cementCapacityTpa: 2_000_000 });
	const otherPlant = await createTestPlant(otherCompany.id);
	return { company, otherCompany, head, dataOwner, reviewer, outsider, plant, otherPlant };
}

let fx: Fixture;

beforeAll(async () => {
	fx = await setUp();
});

afterAll(async () => {
	await deleteTestCompany(fx.company.id);
	await deleteTestCompany(fx.otherCompany.id);
});

describe("plant.update", () => {
	it("saves the change and records who made it", async () => {
		await callerFor(fx.head).plant.update({
			id: fx.plant.id,
			name: fx.plant.name,
			town: fx.plant.town,
			state: fx.plant.state,
			cementCapacityTpa: 2_500_000,
		});

		const detail = await callerFor(fx.head).plant.byId({ id: fx.plant.id });
		expect(detail.cementCapacityTpa).toBe(2_500_000);
		expect(detail.recentChanges[0]).toMatchObject({
			action: "update",
			changedByName: "Head",
			changes: { cementCapacityTpa: { from: 2_000_000, to: 2_500_000 } },
		});
	});

	it("is only for the Head of Sustainability", async () => {
		const { id, name, town, state } = fx.plant;
		const update = { id, name, town, state, cementCapacityTpa: 9_000_000 };
		await expect(callerFor(fx.dataOwner).plant.update(update)).rejects.toMatchObject({ code: "FORBIDDEN" });
		await expect(callerFor(fx.reviewer).plant.update(update)).rejects.toMatchObject({ code: "FORBIDDEN" });
	});
});

describe("plant.byId", () => {
	it("shows a plant of the user's own company", async () => {
		const detail = await callerFor(fx.dataOwner).plant.byId({ id: fx.plant.id });
		expect(detail.code).toBe("P01");
	});

	it("does not show another company's plant", async () => {
		await expect(callerFor(fx.outsider).plant.byId({ id: fx.plant.id })).rejects.toMatchObject({ code: "NOT_FOUND" });
	});
});
