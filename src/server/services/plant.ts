import type { PrismaClient } from "@prisma/client";

import { currentPeriod, parsePeriod } from "@/lib/periods";
import type { PlantDetail, PlantSummary, PlantUpdateInput } from "@/lib/schemas/plant";
import type { SessionUser } from "@/lib/schemas/session";
import type { Db } from "@/server/db";
import { diffFields, listChanges, recordChange } from "@/server/helpers/changeLog";
import { companyScope } from "@/server/helpers/scope";
import { recordCapacity } from "@/server/services/capacity";

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

export type UpdatePlantOptions = {
	/**
	 * First month a capacity change applies to, "YYYY-MM" (C1). Defaults to the current month in India.
	 * The edit dialog does not ask for it yet (PLAN step 1.6); the seed sets it.
	 */
	capacityEffectiveFrom?: string;
	now?: Date;
};

/**
 * Updates a plant and records the change, in one transaction. A capacity change also adds to the capacity
 * history (C1). Returns null when the plant is not found.
 */
export async function updatePlant(
	db: PrismaClient,
	user: SessionUser,
	input: PlantUpdateInput,
	options: UpdatePlantOptions = {},
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
		if (changes.cementCapacityTpa) {
			const effectiveFrom = options.capacityEffectiveFrom ?? currentPeriod(options.now ?? new Date());
			parsePeriod(effectiveFrom);
			await recordCapacity(tx, {
				companyId: user.companyId,
				plantId: plant.id,
				effectiveFrom,
				cementCapacityTpa: updated.cementCapacityTpa,
				createdById: user.id,
			});
		}
		return updated;
	});
}
