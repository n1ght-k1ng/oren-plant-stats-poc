import { randomUUID } from "node:crypto";

import type { Role } from "@/lib/roles";
import type { PlantTypeValue } from "@/lib/schemas/plant";
import { appRouter } from "@/server/api/root";
import { createInnerContext } from "@/server/api/trpc";
import { prisma } from "@/server/db";

/** A company with a unique name. Delete it with `deleteTestCompany`; its plants, users and history go with it. */
export function createTestCompany() {
	return prisma.company.create({ data: { name: `Test company ${randomUUID()}` } });
}

export function deleteTestCompany(companyId: string) {
	return prisma.company.delete({ where: { id: companyId } });
}

export function createTestUser(companyId: string, roles: Role[], name = "Test user") {
	return prisma.user.create({
		data: { name, email: `${randomUUID()}@example.test`, roles, companyId },
	});
}

export function createTestPlant(
	companyId: string,
	fields: Partial<{ code: string; name: string; type: PlantTypeValue; cementCapacityTpa: number }> = {},
) {
	return prisma.plant.create({
		data: {
			code: fields.code ?? "P01",
			name: fields.name ?? "Test Works",
			town: "Test Town",
			state: "Test State",
			type: fields.type ?? "INTEGRATED",
			cementCapacityTpa: fields.cementCapacityTpa ?? 1_000_000,
			companyId,
		},
	});
}

/** Calls the API as this user, without HTTP. */
export function callerFor(user: { id: string }) {
	return appRouter.createCaller(createInnerContext({ userId: user.id }));
}

/** Makes the user one of the plant's data owners (Plant.dataOwners). */
export function addDataOwner(plantId: string, userId: string) {
	return prisma.plant.update({ where: { id: plantId }, data: { dataOwners: { connect: { id: userId } } } });
}
