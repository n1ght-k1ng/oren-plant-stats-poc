import { TRPCError } from "@trpc/server";

import { ROLES } from "@/lib/roles";
import { plantByIdInput, plantDetail, plantListInput, plantSummary, plantUpdateInput } from "@/lib/schemas/plant";
import { protectedProcedure, router } from "@/server/api/trpc";
import { requireRole } from "@/server/helpers/roles";
import { getPlantDetail, listPlants, updatePlant } from "@/server/services/plant";

const notFound = () => new TRPCError({ code: "NOT_FOUND", message: "We could not find this plant." });

export const plantRouter = router({
	list: protectedProcedure
		.input(plantListInput)
		.output(plantSummary.array())
		.query(({ ctx, input }) => listPlants(ctx.db, { search: input.search })),

	byId: protectedProcedure
		.input(plantByIdInput)
		.output(plantDetail)
		.query(async ({ ctx, input }) => {
			const plant = await getPlantDetail(ctx.db, ctx.user, input.id);
			if (!plant) {
				throw notFound();
			}
			return plant;
		}),

	update: protectedProcedure
		.input(plantUpdateInput)
		.output(plantSummary)
		.mutation(async ({ ctx, input }) => {
			requireRole(ctx.user, ROLES.SUSTAINABILITY_HEAD);
			const plant = await updatePlant(ctx.db, ctx.user, input);
			if (!plant) {
				throw notFound();
			}
			return plant;
		}),
});
