import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { currentPeriod } from "@/lib/periods";
import { ROLES } from "@/lib/roles";
import type { SessionUser } from "@/lib/schemas/session";
import { prisma } from "@/server/db";
import { capacityFor, recordCapacity } from "@/server/services/capacity";
import { updatePlant } from "@/server/services/plant";
import { getSessionUser } from "@/server/services/session";

import { callerFor, createTestCompany, createTestPlant, createTestUser, deleteTestCompany } from "./helpers";

// Capacity in effect during a month, not at submission (docs/DECISIONS.md C1, A8).

let companyId: string;
let otherCompanyId: string;
let head: SessionUser;
let outsider: SessionUser;

async function sessionUser(id: string) {
	const user = await getSessionUser(prisma, id);
	if (!user) {
		throw new Error("Test user is missing");
	}
	return user;
}

/** A plant shaped like P06: 2.5 Mt a year from April 2026, expanded to 3.0 Mt from October 2026. */
async function expandedPlant() {
	const plant = await createTestPlant(companyId, { code: `P${Math.random()}`, cementCapacityTpa: 3_000_000 });
	await recordCapacity(prisma, {
		companyId,
		plantId: plant.id,
		effectiveFrom: "2026-04",
		cementCapacityTpa: 2_500_000,
		createdById: null,
	});
	await recordCapacity(prisma, {
		companyId,
		plantId: plant.id,
		effectiveFrom: "2026-10",
		cementCapacityTpa: 3_000_000,
		createdById: null,
	});
	return plant;
}

function update(plant: { id: string; name: string; town: string; state: string }, cementCapacityTpa: number) {
	const { id, name, town, state } = plant;
	return { id, name, town, state, cementCapacityTpa };
}

beforeAll(async () => {
	companyId = (await createTestCompany()).id;
	otherCompanyId = (await createTestCompany()).id;
	head = await sessionUser((await createTestUser(companyId, [ROLES.SUSTAINABILITY_HEAD], "Head")).id);
	outsider = await sessionUser((await createTestUser(otherCompanyId, [ROLES.SUSTAINABILITY_HEAD], "Outsider")).id);
});

afterAll(async () => {
	await deleteTestCompany(companyId);
	await deleteTestCompany(otherCompanyId);
});

describe("capacityFor", () => {
	it("uses the capacity in effect during the month: P06 is 2.5 Mt in September 2026 and 3.0 Mt in October", async () => {
		const plant = await expandedPlant();
		expect(await capacityFor(prisma, head, plant.id, "2026-04")).toBe(2_500_000);
		expect(await capacityFor(prisma, head, plant.id, "2026-09")).toBe(2_500_000);
		expect(await capacityFor(prisma, head, plant.id, "2026-10")).toBe(3_000_000);
		expect(await capacityFor(prisma, head, plant.id, "2027-03")).toBe(3_000_000);
	});

	it("has no capacity for a month before the first row, rather than guessing", async () => {
		const plant = await expandedPlant();
		expect(await capacityFor(prisma, head, plant.id, "2026-03")).toBeNull();
	});

	it("does not read another company's capacity", async () => {
		const plant = await expandedPlant();
		expect(await capacityFor(prisma, outsider, plant.id, "2026-10")).toBeNull();
	});
});

describe("editing a plant's capacity", () => {
	it("records the new capacity from the current month, alongside the plant's change log", async () => {
		const plant = await createTestPlant(companyId, { code: "P-EDIT", cementCapacityTpa: 2_000_000 });
		await callerFor(head).plant.update(update(plant, 2_200_000));

		const history = await prisma.plantCapacity.findMany({ where: { plantId: plant.id } });
		expect(history).toMatchObject([
			{ effectiveFrom: currentPeriod(new Date()), cementCapacityTpa: 2_200_000, createdById: head.id },
		]);
		const log = await prisma.changeLog.findMany({ where: { entityId: plant.id } });
		expect(log).toMatchObject([{ changes: { cementCapacityTpa: { from: 2_000_000, to: 2_200_000 } } }]);
		expect((await prisma.plant.findUniqueOrThrow({ where: { id: plant.id } })).cementCapacityTpa).toBe(2_200_000);
	});

	it("replaces, not duplicates, a second change in the same month", async () => {
		const plant = await createTestPlant(companyId, { code: "P-TWICE", cementCapacityTpa: 2_000_000 });
		await callerFor(head).plant.update(update(plant, 2_200_000));
		await callerFor(head).plant.update(update(plant, 2_300_000));

		const history = await prisma.plantCapacity.findMany({ where: { plantId: plant.id } });
		expect(history.map((row) => row.cementCapacityTpa)).toEqual([2_300_000]);
	});

	it("writes no capacity history when only the name changes", async () => {
		const plant = await createTestPlant(companyId, { code: "P-NAME", cementCapacityTpa: 2_000_000 });
		await callerFor(head).plant.update({ ...update(plant, 2_000_000), name: "Renamed Works" });
		expect(await prisma.plantCapacity.count({ where: { plantId: plant.id } })).toBe(0);
	});

	it("takes a given effective month, as the seed does for P06", async () => {
		const plant = await createTestPlant(companyId, { code: "P-BACK", cementCapacityTpa: 2_500_000 });
		await updatePlant(prisma, head, update(plant, 3_000_000), { capacityEffectiveFrom: "2026-10" });
		expect(await capacityFor(prisma, head, plant.id, "2026-10")).toBe(3_000_000);
		expect(await capacityFor(prisma, head, plant.id, "2026-09")).toBeNull();
	});

	it("defaults to the month in India, not UTC", async () => {
		const plant = await createTestPlant(companyId, { code: "P-IST", cementCapacityTpa: 2_500_000 });
		// 00:30 on 1 November in India; still 31 October in UTC.
		await updatePlant(prisma, head, update(plant, 2_600_000), { now: new Date("2026-10-31T19:00:00Z") });
		const [row] = await prisma.plantCapacity.findMany({ where: { plantId: plant.id } });
		expect(row.effectiveFrom).toBe("2026-11");
	});
});
