import type { Prisma } from "@prisma/client";

import type { ChangeEntry } from "@/lib/schemas/plant";
import type { SessionUser } from "@/lib/schemas/session";
import type { Db } from "@/server/db";
import { companyScope } from "@/server/helpers/scope";

export type FieldChanges = Record<string, { from: unknown; to: unknown }>;

/** The fields in `after` whose value differs from `before`. */
export function diffFields<T extends Record<string, unknown>>(before: T, after: Partial<T>): FieldChanges {
	const changes: FieldChanges = {};
	for (const [field, to] of Object.entries(after)) {
		const from = before[field];
		if (to !== undefined && from !== to) {
			changes[field] = { from, to };
		}
	}
	return changes;
}

type ChangeTarget = { entityType: string; entityId: string };

/** Records who changed what. Pass the transaction client when the change runs in a transaction. */
export async function recordChange(
	db: Db,
	user: SessionUser,
	entry: ChangeTarget & { action: string; changes: FieldChanges },
): Promise<void> {
	await db.changeLog.create({
		data: {
			companyId: user.companyId,
			changedById: user.id,
			entityType: entry.entityType,
			entityId: entry.entityId,
			action: entry.action,
			changes: entry.changes as Prisma.InputJsonValue,
		},
	});
}

/** The latest changes to one record, newest first. */
export async function listChanges(db: Db, user: SessionUser, target: ChangeTarget, take = 20): Promise<ChangeEntry[]> {
	const rows = await db.changeLog.findMany({
		where: companyScope(user, target),
		orderBy: { createdAt: "desc" },
		take,
		select: { id: true, action: true, changes: true, createdAt: true, changedBy: { select: { name: true } } },
	});
	return rows.map((row) => ({
		id: row.id,
		action: row.action,
		changes: row.changes as FieldChanges,
		changedByName: row.changedBy.name,
		createdAt: row.createdAt,
	}));
}
