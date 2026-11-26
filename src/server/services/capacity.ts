import type { SessionUser } from "@/lib/schemas/session";
import type { Db } from "@/server/db";
import { companyScope } from "@/server/helpers/scope";

/**
 * Cement capacity over time (docs/DECISIONS.md C1). Plant.cementCapacityTpa is the current capacity shown in
 * the register; checks for a month use the capacity in effect during that month, from this history.
 */

/** Tonnes of cement a year in effect during the month, or null when none is on record that early. */
export async function capacityFor(
	db: Db,
	user: Pick<SessionUser, "companyId">,
	plantId: string,
	period: string,
): Promise<number | null> {
	// "YYYY-MM" strings sort in date order.
	const row = await db.plantCapacity.findFirst({
		where: companyScope(user, { plantId, effectiveFrom: { lte: period } }),
		orderBy: { effectiveFrom: "desc" },
		select: { cementCapacityTpa: true },
	});
	return row?.cementCapacityTpa ?? null;
}

/** Records a capacity from a month onwards. A second change for the same month replaces the first. */
export async function recordCapacity(
	db: Db,
	entry: {
		companyId: string;
		plantId: string;
		effectiveFrom: string;
		cementCapacityTpa: number;
		/** Null for rows written by the seed. */
		createdById: string | null;
	},
): Promise<void> {
	const { companyId, plantId, effectiveFrom, cementCapacityTpa, createdById } = entry;
	await db.plantCapacity.upsert({
		where: { plantId_effectiveFrom: { plantId, effectiveFrom } },
		create: { companyId, plantId, effectiveFrom, cementCapacityTpa, createdById },
		update: { cementCapacityTpa, createdById },
	});
}
