/**
 * Importing a file or paste into a month (docs/PLAN.md 4.2; D8 to D16, O10, O11). Reads it, stores the original
 * and how it was read, and returns the proposal. It never changes the month: the owner applies what they choose
 * in the form, then saves (D9).
 */
import type { PrismaClient } from "@prisma/client";
import { TRPCError } from "@trpc/server";

import { readImport } from "@/lib/import/readReport";
import { type ImportResult, MAX_UPLOAD_BYTES } from "@/lib/schemas/import";
import type { SessionUser } from "@/lib/schemas/session";
import { canEditLines } from "@/lib/workflow";
import { requirePermission } from "@/server/helpers/permissions";
import { companyScope } from "@/server/helpers/scope";
import { permissionPlant, plantSelect } from "@/server/services/month";

export async function importIntoMonth(
	db: PrismaClient,
	user: SessionUser,
	input: { reportId: string; kind: "FILE" | "PASTE"; filename: string | null; content: string },
): Promise<ImportResult> {
	const report = await db.monthlyReport.findFirst({
		where: companyScope(user, { id: input.reportId }),
		select: {
			id: true,
			companyId: true,
			period: true,
			status: true,
			plantType: true,
			plant: { select: { ...plantSelect, town: true } },
		},
	});
	if (!report) {
		throw new TRPCError({ code: "NOT_FOUND", message: "We could not find this month." });
	}
	requirePermission(user, permissionPlant(report.plant), "edit");
	if (!canEditLines(report.status)) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: "This month has been submitted, so nothing can be imported into it.",
		});
	}

	const sizeBytes = Buffer.byteLength(input.content, "utf8");
	if (sizeBytes > MAX_UPLOAD_BYTES) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: "This file is larger than 1 MB. Import a smaller file, or paste just the table.",
		});
	}
	if (input.content.trim() === "") {
		throw new TRPCError({ code: "BAD_REQUEST", message: "There is nothing to import: the file or paste is empty." });
	}

	const companyPlants = await db.plant.findMany({
		where: companyScope(user),
		select: { code: true, town: true },
	});
	const mapping = readImport(input.content, {
		filename: input.filename,
		plantType: report.plantType,
		period: report.period,
		plant: { code: report.plant.code, town: report.plant.town },
		companyPlants,
	});

	const upload = await db.upload.create({
		data: {
			companyId: report.companyId,
			reportId: report.id,
			kind: input.kind,
			filename: input.filename,
			content: input.content,
			sizeBytes,
			mapping,
			uploadedById: user.id,
		},
		select: { id: true },
	});
	return { uploadId: upload.id, mapping };
}
