/**
 * What a plant reports each month (docs/DECISIONS.md D3, D5, P4, U1). A developer changes this; there is no
 * settings screen in v1 (U7).
 */
import { EMISSION_FACTORS, type EmissionFactorKey } from "@/lib/factors";
import type { PlantTypeValue } from "@/lib/schemas/plant";
import type { Unit } from "@/lib/units";

/**
 * - EXPECTED: must be a value or N/A before the month can be submitted.
 * - OPTIONAL: may be left blank; on submission the data owner confirms each blank one as "Not used this month".
 * - FIXED_NA: always N/A for this plant type, for example clinker at a grinding unit.
 */
export type ItemExpectation = "EXPECTED" | "OPTIONAL" | "FIXED_NA";

type ItemConfig = {
	key: string;
	label: string;
	/** The emission factor that turns this item into CO2. The item is stored in that factor's unit (D5). */
	factorKey: EmissionFactorKey;
	/** Units the form offers, in the order shown. Never "Mt" (U1). */
	formUnits: readonly Unit[];
	expectation: Record<PlantTypeValue, ItemExpectation>;
};

const ITEM_CONFIG = [
	{
		key: "coal",
		label: "Coal",
		factorKey: "coal",
		formUnits: ["t"],
		expectation: { INTEGRATED: "EXPECTED", GRINDING_UNIT: "OPTIONAL" },
	},
	{
		key: "petcoke",
		label: "Petroleum coke",
		factorKey: "petcoke",
		formUnits: ["t"],
		expectation: { INTEGRATED: "EXPECTED", GRINDING_UNIT: "OPTIONAL" },
	},
	{
		key: "furnace_oil",
		label: "Furnace oil",
		factorKey: "furnace_oil",
		formUnits: ["t"],
		expectation: { INTEGRATED: "OPTIONAL", GRINDING_UNIT: "EXPECTED" },
	},
	{
		key: "diesel",
		label: "Diesel (HSD)",
		factorKey: "diesel",
		formUnits: ["L", "kL"],
		expectation: { INTEGRATED: "EXPECTED", GRINDING_UNIT: "EXPECTED" },
	},
	{
		key: "grid_power",
		label: "Grid electricity",
		factorKey: "grid_power",
		formUnits: ["kWh", "MWh"],
		expectation: { INTEGRATED: "EXPECTED", GRINDING_UNIT: "EXPECTED" },
	},
	{
		key: "clinker",
		label: "Clinker produced",
		factorKey: "clinker",
		formUnits: ["t"],
		expectation: { INTEGRATED: "EXPECTED", GRINDING_UNIT: "FIXED_NA" },
	},
] as const satisfies readonly ItemConfig[];

export type ItemKey = (typeof ITEM_CONFIG)[number]["key"];

export type ItemDefinition = ItemConfig & {
	key: ItemKey;
	/** The factor's unit: what the item is stored and calculated in. */
	canonicalUnit: Unit;
};

function factorUnit(factorKey: EmissionFactorKey): Unit {
	const factor = EMISSION_FACTORS.find((candidate) => candidate.key === factorKey);
	if (!factor) {
		throw new Error(`No emission factor "${factorKey}"`);
	}
	return factor.unit;
}

/** Every item, in the order the form shows them. */
export const ITEMS: readonly ItemDefinition[] = ITEM_CONFIG.map((item) => ({
	...item,
	canonicalUnit: factorUnit(item.factorKey),
}));

export function isItemKey(value: string): value is ItemKey {
	return ITEMS.some((item) => item.key === value);
}

export function itemByKey(key: ItemKey): ItemDefinition {
	const item = ITEMS.find((candidate) => candidate.key === key);
	if (!item) {
		throw new Error(`No item "${key}"`);
	}
	return item;
}

export function expectationFor(key: ItemKey, plantType: PlantTypeValue): ItemExpectation {
	return itemByKey(key).expectation[plantType];
}
