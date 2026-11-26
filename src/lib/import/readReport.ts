/**
 * Turns a plant's file into proposed lines for the month form (docs/DECISIONS.md D9 to D14, O10). It proposes;
 * the owner decides. Nothing here guesses:
 *
 * - The header row is found wherever it sits, by its item and quantity columns.
 * - Item names match only through the alias list. Bracketed details and remarks become the note.
 * - "MT", a blank unit and "N/A" become questions for the owner.
 * - Rows that can't be used are kept with the reason, never dropped.
 * - A different plant or month mentioned in the file is a warning only. The month being filled never changes.
 */
import { HEADER_PATTERNS, ITEM_ALIASES } from "@/config/importAliases";
import { ITEMS, type ItemKey, expectationFor, itemByKey } from "@/config/items";
import { resolveUnit, toCanonical } from "@/lib/conversion";
import { isBlankRow, readTable } from "@/lib/import/table";
import { periodLabel } from "@/lib/periods";
import { parseQuantity } from "@/lib/quantity";
import type { PlantTypeValue } from "@/lib/schemas/plant";

/** Questions the owner must answer before a row can fill the form. */
export type ImportQuestion =
	/** "MT": confirm it means metric tonnes. */
	| "MT_UNIT"
	/** No unit given: choose one. */
	| "BLANK_UNIT"
	/** "N/A" in the file: mark N/A, or leave the line as it is. */
	| "NA_VALUE";

export type ImportRowStatus =
	/** Ready to fill the form. */
	| "READY"
	/** Needs the owner's answer first. */
	| "ASK"
	/** The item name isn't in the alias list. */
	| "UNMATCHED"
	/** The quantity or unit can't be used, or the item appears twice. */
	| "INVALID"
	/** No quantity given: the line is left as it is. */
	| "NO_QUANTITY"
	/** An item that is always N/A at this plant (clinker at a grinding unit). */
	| "FIXED_NA";

export type ProposedLine = { mode: "value"; value: string; unit: string | null } | { mode: "na" };

export type ImportRow = {
	line: number;
	itemText: string;
	quantityText: string;
	unitText: string;
	remarks: string;
	itemKey: ItemKey | null;
	note: string | null;
	status: ImportRowStatus;
	questions: ImportQuestion[];
	message: string | null;
	proposed: ProposedLine | null;
};

export type ImportMapping = {
	headerLine: number | null;
	rows: ImportRow[];
	warnings: string[];
	/** Why nothing could be read, when the table wasn't found. */
	error: string | null;
};

export type ImportContext = {
	filename: string | null;
	plantType: PlantTypeValue;
	period: string;
	plant: { code: string; town: string };
	/** The company's plants, to spot a file that names a different one. */
	companyPlants: { code: string; town: string }[];
};

/** "MT" and its plural are metric tonnes in Indian reports, but the owner confirms it (U1, D13). */
const MT_SPELLINGS = new Set(["MT", "MTs", "MTS"]);

function normalise(name: string): string {
	return name
		.replace(/\([^)]*\)/g, " ")
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, " ")
		.trim();
}

const ALIAS_TO_ITEM = new Map<string, ItemKey>(
	Object.entries(ITEM_ALIASES).flatMap(([key, aliases]) => aliases.map((alias) => [normalise(alias), key as ItemKey])),
);

function matchItem(name: string): ItemKey | null {
	return ALIAS_TO_ITEM.get(normalise(name)) ?? null;
}

function bracketed(name: string): string[] {
	return [...name.matchAll(/\(([^)]*)\)/g)].map((match) => match[1].trim()).filter(Boolean);
}

function findHeader(cells: string[]) {
	const indexOf = (pattern: RegExp) => cells.findIndex((cell) => pattern.test(cell.trim()));
	const item = indexOf(HEADER_PATTERNS.item);
	const quantity = indexOf(HEADER_PATTERNS.quantity);
	if (item === -1 || quantity === -1) {
		return null;
	}
	return { item, quantity, unit: indexOf(HEADER_PATTERNS.unit), remarks: indexOf(HEADER_PATTERNS.remarks) };
}

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const MONTH_NAME =
	/\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\b[\s\-,'.]*(\d{4}|\d{2})(?!\d)/gi;
const YEAR_MONTH = /(?<!\d)(20\d{2})[-_/.](0[1-9]|1[0-2])(?!\d)/g;

/** Months the text names: "October 2026", "Oct-26", "2026-10". */
export function mentionedPeriods(text: string): string[] {
	const found = new Set<string>();
	for (const match of text.matchAll(MONTH_NAME)) {
		const month = MONTHS.indexOf(match[1].slice(0, 3).toLowerCase()) + 1;
		const year = match[2].length === 2 ? 2000 + Number(match[2]) : Number(match[2]);
		found.add(`${year}-${String(month).padStart(2, "0")}`);
	}
	for (const match of text.matchAll(YEAR_MONTH)) {
		found.add(`${match[1]}-${match[2]}`);
	}
	return [...found].sort();
}

function escape(text: string): string {
	return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** The company's plants a text names, by code ("P04") or town ("Nalgonda"). */
export function mentionedPlants<P extends { code: string; town: string }>(text: string, plants: P[]): P[] {
	return plants.filter(
		(plant) =>
			new RegExp(`(?<![A-Za-z0-9])${escape(plant.code)}(?![0-9])`, "i").test(text) ||
			new RegExp(`(?<![A-Za-z])${escape(plant.town)}(?![A-Za-z])`, "i").test(text),
	);
}

function warningsFor(text: string, context: ImportContext): string[] {
	const warnings: string[] = [];
	const filling = `${context.plant.code} ${context.plant.town}`;
	for (const other of mentionedPlants(text, context.companyPlants)) {
		if (other.code !== context.plant.code) {
			warnings.push(
				`This file mentions ${other.code} ${other.town}, but you are filling ${filling}. It will only fill ${filling}; check you chose the right file.`,
			);
		}
	}
	for (const period of mentionedPeriods(text)) {
		if (period !== context.period) {
			warnings.push(
				`This file mentions ${periodLabel(period)}, but you are filling ${periodLabel(context.period)}. It will only fill ${periodLabel(context.period)}; check you chose the right file.`,
			);
		}
	}
	return warnings;
}

function resolveRow(
	row: Omit<ImportRow, "status" | "questions" | "message" | "proposed" | "itemKey" | "note">,
	context: ImportContext,
	seen: Map<ItemKey, number>,
): ImportRow {
	const itemKey = matchItem(row.itemText);
	const note = [...bracketed(row.itemText), row.remarks].filter(Boolean).join("; ") || null;
	const base = { ...row, itemKey, note, questions: [] as ImportQuestion[], message: null, proposed: null };

	if (!itemKey) {
		return {
			...base,
			status: "UNMATCHED",
			message: row.itemText
				? `We don't recognise "${row.itemText}". If it belongs in the form, enter it by hand.`
				: "This row has no item name.",
		};
	}
	const item = itemByKey(itemKey);
	const earlier = seen.get(itemKey);
	if (earlier !== undefined) {
		return {
			...base,
			status: "INVALID",
			message: `${item.label} is already on line ${earlier}. If both rows belong, add them up and enter the total by hand.`,
		};
	}
	seen.set(itemKey, row.line);

	const quantity = parseQuantity(row.quantityText);
	if (expectationFor(itemKey, context.plantType) === "FIXED_NA") {
		return quantity.kind === "na" || quantity.kind === "blank"
			? { ...base, status: "FIXED_NA", message: `${item.label} is always N/A at this plant; nothing to fill.` }
			: {
					...base,
					status: "INVALID",
					message: `${item.label} is always N/A at this plant, but the file gives "${row.quantityText}".`,
				};
	}
	if (quantity.kind === "blank") {
		return { ...base, status: "NO_QUANTITY", message: "No quantity given, so this line is left as it is." };
	}
	if (quantity.kind === "invalid") {
		return { ...base, status: "INVALID", message: quantity.message };
	}
	if (quantity.kind === "na") {
		return {
			...base,
			status: "ASK",
			questions: ["NA_VALUE"],
			message: `The file says "${row.quantityText}". Mark ${item.label} as N/A, or leave it as it is?`,
			proposed: { mode: "na" },
		};
	}

	const unit = row.unitText.trim();
	if (unit === "") {
		return {
			...base,
			status: "ASK",
			questions: ["BLANK_UNIT"],
			message: `No unit given. Choose the unit for ${row.quantityText}.`,
			proposed: { mode: "value", value: row.quantityText, unit: null },
		};
	}
	if (MT_SPELLINGS.has(unit)) {
		return {
			...base,
			status: "ASK",
			questions: ["MT_UNIT"],
			message: `"${unit}" usually means metric tonnes. Confirm it means tonnes (t), not million tonnes.`,
			proposed: { mode: "value", value: row.quantityText, unit: "t" },
		};
	}
	const resolved = resolveUnit(unit);
	if (!resolved.ok) {
		return { ...base, status: "INVALID", message: resolved.message };
	}
	const canonical = toCanonical(itemKey, quantity.value, unit);
	if (!canonical.ok) {
		return { ...base, status: "INVALID", message: canonical.message };
	}
	// The form keeps what was typed when it offers the unit; otherwise it takes the converted value.
	const offered = (item.formUnits as readonly string[]).includes(resolved.unit);
	return {
		...base,
		status: "READY",
		proposed: offered
			? { mode: "value", value: row.quantityText, unit: resolved.unit }
			: { mode: "value", value: canonical.value, unit: canonical.unit },
	};
}

export function readImport(text: string, context: ImportContext): ImportMapping {
	const table = readTable(text);
	const headerIndex = table.findIndex((row) => findHeader(row.cells) !== null);
	if (headerIndex === -1) {
		return {
			headerLine: null,
			rows: [],
			warnings: warningsFor([context.filename ?? "", text].join("\n"), context),
			error:
				"We couldn't find the table in this file. It needs a header row with an item column (such as Item or Particulars) and a quantity column (such as Qty or Amount).",
		};
	}
	const header = table[headerIndex];
	const columns = findHeader(header.cells);
	if (!columns) {
		throw new Error("Header row lost its columns");
	}
	const cell = (cells: string[], index: number) => (index >= 0 ? (cells[index] ?? "") : "");
	const above = table
		.slice(0, headerIndex)
		.flatMap((row) => row.cells)
		.join(" ");

	const seen = new Map<ItemKey, number>();
	const rows = table
		.slice(headerIndex + 1)
		.filter((row) => !isBlankRow(row))
		.map((row) =>
			resolveRow(
				{
					line: row.line,
					itemText: cell(row.cells, columns.item),
					quantityText: cell(row.cells, columns.quantity),
					unitText: cell(row.cells, columns.unit),
					remarks: cell(row.cells, columns.remarks),
				},
				context,
				seen,
			),
		);

	return {
		headerLine: header.line,
		rows,
		warnings: warningsFor([context.filename ?? "", above].join("\n"), context),
		error: null,
	};
}

/** Every item, for listing which ones the file did not mention. */
export function itemsNotInFile(mapping: ImportMapping): ItemKey[] {
	const mentioned = new Set(mapping.rows.flatMap((row) => (row.itemKey ? [row.itemKey] : [])));
	return ITEMS.map((item) => item.key).filter((key) => !mentioned.has(key));
}
