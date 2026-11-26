/**
 * How plants name items in their reports (docs/DECISIONS.md D12). Names are compared after lower-casing,
 * dropping anything in brackets (which is kept as the line's note), and reducing punctuation to spaces, so
 * "Coal (Imported + Indian)" is compared as "coal" and "Pet-Coke" as "pet coke".
 *
 * Add misspellings seen in real files explicitly. Matching is never fuzzy, so nothing is guessed.
 */
import type { ItemKey } from "@/config/items";

export const ITEM_ALIASES: Record<ItemKey, readonly string[]> = {
	coal: ["coal", "imported coal", "indian coal", "coal consumed", "coal consumption"],
	petcoke: ["petroleum coke", "pet coke", "petcoke", "pet cock"],
	furnace_oil: ["furnace oil", "fo", "f o"],
	diesel: ["diesel", "hsd", "high speed diesel", "diesel hsd"],
	// "Power purchased" is treated as grid electricity (docs/DECISIONS.md A1).
	grid_power: [
		"grid electricity",
		"grid electicity",
		"grid electrcity",
		"grid power",
		"power purchased",
		"purchased power",
		"electricity purchased",
		"purchased electricity",
	],
	clinker: ["clinker produced", "clinker production", "clinker"],
};

/** Header names that mark the item, quantity, unit and remarks columns. */
export const HEADER_PATTERNS = {
	item: /^(item|items|particulars?|fuel\b.*|description|material|parameter)$/i,
	quantity: /^(qty|quantity|amount|value|consumption)$/i,
	unit: /^(unit|units|uom|unit of measure)$/i,
	remarks: /^(remarks?|notes?|comments?)$/i,
} as const;
