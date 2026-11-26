import type { PrismaClient } from "@prisma/client";

import type { PlantDetail, PlantSummary, PlantUpdateInput } from "@/lib/schemas/plant";
import type { SessionUser } from "@/lib/schemas/session";
import type { Db } from "@/server/db";
import { diffFields, listChanges, recordChange } from "@/server/helpers/changeLog";
import { companyScope } from "@/server/helpers/scope";

const plantSummarySelect = {
	id: true,
	code: true,
	name: true,
	town: true,
	state: true,
	type: true,
	cementCapacityTpa: true,
} as const;

export type PlantFilters = {
	search?: string;
};

/** The user's own company's plants, optionally filtered by a search term. */
export async function listPlants(db: Db, user: SessionUser, filters: PlantFilters): Promise<PlantSummary[]> {
	const search = filters.search?.trim();
	return db.plant.findMany({
		where: companyScope(
			user,
			search
				? {
						OR: [
							{ name: { contains: search, mode: "insensitive" as const } },
							{ code: { contains: search, mode: "insensitive" as const } },
							{ town: { contains: search, mode: "insensitive" as const } },
							{ state: { contains: search, mode: "insensitive" as const } },
						],
					}
				: {},
		),
		orderBy: [{ code: "asc" }, { createdAt: "asc" }],
		select: plantSummarySelect,
	});
}

export async function getPlantDetail(db: Db, user: SessionUser, id: string): Promise<PlantDetail | null> {
	const plant = await db.plant.findFirst({
		where: companyScope(user, { id }),
		select: {
			...plantSummarySelect,
			dataOwners: { select: { id: true, name: true, email: true }, orderBy: { name: "asc" } },
		},
	});
	if (!plant) {
		return null;
	}
	const recentChanges = await listChanges(db, user, { entityType: "plant", entityId: plant.id });
	return { ...plant, recentChanges };
}

/** Updates a plant and records the change, in one transaction. Returns null when the plant is not found. */
export async function updatePlant(
	db: PrismaClient,
	user: SessionUser,
	input: PlantUpdateInput,
): Promise<PlantSummary | null> {
	const { id, ...fields } = input;
	return db.$transaction(async (tx) => {
		const plant = await tx.plant.findFirst({ where: companyScope(user, { id }), select: plantSummarySelect });
		if (!plant) {
			return null;
		}
		const changes = diffFields(plant, fields);
		if (Object.keys(changes).length === 0) {
			return plant;
		}
		const updated = await tx.plant.update({ where: { id: plant.id }, data: fields, select: plantSummarySelect });
		await recordChange(tx, user, { entityType: "plant", entityId: plant.id, action: "update", changes });
		return updated;
	});
}
