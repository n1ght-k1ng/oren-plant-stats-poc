import { z } from "zod";

export const PLANT_TYPES = ["INTEGRATED", "GRINDING_UNIT"] as const;
export type PlantTypeValue = (typeof PLANT_TYPES)[number];

export const PLANT_TYPE_LABELS: Record<PlantTypeValue, string> = {
	INTEGRATED: "Integrated plant",
	GRINDING_UNIT: "Grinding unit",
};

// Inputs

export const plantListInput = z.object({
	search: z.string().trim().max(100).optional(),
});

export const plantByIdInput = z.object({
	id: z.string().min(1),
});

const plantFields = {
	name: z.string().trim().min(2, "Enter a plant name of at least 2 characters.").max(120),
	town: z.string().trim().min(2, "Enter the town.").max(80),
	state: z.string().trim().min(2, "Enter the state.").max(80),
};

export const plantUpdateInput = z.object({
	id: z.string().min(1),
	...plantFields,
	cementCapacityTpa: z
		.number()
		.int()
		.positive("Enter a capacity above zero.")
		.max(50_000_000, "Enter a capacity of at most 50 million tonnes a year."),
});
export type PlantUpdateInput = z.infer<typeof plantUpdateInput>;

/** The edit form. Capacity is entered in million tonnes a year and saved in tonnes. */
export const plantFormSchema = z.object({
	...plantFields,
	cementCapacityMt: z
		.number({ invalid_type_error: "Enter the capacity as a number." })
		.positive("Enter a capacity above zero.")
		.max(50, "Enter a capacity of at most 50 million tonnes a year."),
});
export type PlantFormValues = z.infer<typeof plantFormSchema>;

// Outputs

export const plantSummary = z.object({
	id: z.string(),
	code: z.string(),
	name: z.string(),
	town: z.string(),
	state: z.string(),
	type: z.enum(PLANT_TYPES),
	cementCapacityTpa: z.number().int(),
});
export type PlantSummary = z.infer<typeof plantSummary>;

export const changeEntry = z.object({
	id: z.string(),
	action: z.string(),
	changes: z.record(z.object({ from: z.unknown(), to: z.unknown() })),
	changedByName: z.string(),
	createdAt: z.date(),
});
export type ChangeEntry = z.infer<typeof changeEntry>;

export const plantDetail = plantSummary.extend({
	dataOwners: z.array(z.object({ id: z.string(), name: z.string(), email: z.string() })),
	recentChanges: z.array(changeEntry),
});
export type PlantDetail = z.infer<typeof plantDetail>;
