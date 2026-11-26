/**
 * Plausibility checks (docs/DECISIONS.md D7, P5, P7, U2, U6, C1). Pure: the caller supplies the month's lines,
 * the capacity in effect that month, and the last approved month. Flags only warn; they never block.
 *
 * Flag messages describe only what is unusual (the figure and the expected range). They never suggest a cause.
 *
 * A check whose inputs are not all entered yet is skipped rather than worked out from a blank, so flags can
 * update live while the data owner types (U2).
 */
import {
	INTEGRATED_RANGES,
	KILN_FUEL_ENERGY_GJ_PER_TONNE,
	MONTH_ON_MONTH_CHANGE_LIMIT,
	type Range,
} from "@/config/checks";
import { ITEMS, type ItemKey, expectationFor, itemByKey } from "@/config/items";
import { D, toD } from "@/lib/decimal";
import { daysInMonth, periodLabel } from "@/lib/periods";
import type { CheckFlag } from "@/lib/schemas/report";

export type CheckLine = { state: "VALUE"; value: string } | { state: "NA" } | { state: "NOT_ENTERED" };
/** A month's lines by item, in canonical units. A missing item counts as not entered. */
export type CheckLines = Partial<Record<ItemKey, CheckLine>>;

export type CheckInput = {
	plantType: "INTEGRATED" | "GRINDING_UNIT";
	period: string;
	/** Cement capacity in effect during the month, tonnes a year (C1). Null when none is on record. */
	capacityTpa: number | null;
	lines: CheckLines;
	/** The plant's last approved month, if any, for the month-on-month check (P7). */
	previous?: { period: string; lines: CheckLines } | null;
};

const KILN_FUELS = ["coal", "petcoke", "furnace_oil"] as const satisfies readonly ItemKey[];

function stateOf(lines: CheckLines, key: ItemKey): CheckLine {
	return lines[key] ?? { state: "NOT_ENTERED" };
}

/** The value, or null when the line is N/A or not entered. */
function quantityOf(lines: CheckLines, key: ItemKey): D | null {
	const line = stateOf(lines, key);
	return line.state === "VALUE" ? toD(line.value) : null;
}

/** For totals: N/A counts as nothing; null when the line is not entered yet, so the total is not ready. */
function amountOf(lines: CheckLines, key: ItemKey): D | null {
	const line = stateOf(lines, key);
	if (line.state === "VALUE") {
		return toD(line.value);
	}
	return line.state === "NA" ? new D(0) : null;
}

/** Rounded for people, never for the comparison. */
function display(value: D, places = 2): string {
	return value.toDecimalPlaces(places, D.ROUND_HALF_UP).toFixed();
}

function outside(value: D, range: Range): boolean {
	return value.lessThan(range.low) || value.greaterThan(range.high);
}

function rangeFlag(
	code: CheckFlag["code"],
	itemKeys: ItemKey[],
	measured: D,
	range: Range,
	unit: string,
	describe: (shown: string) => string,
): CheckFlag {
	const shown = display(measured);
	return {
		code,
		severity: "warning",
		itemKeys,
		message: `${describe(shown)}, outside the expected ${range.low} to ${range.high}.`,
		measured: shown,
		low: range.low,
		high: range.high,
		unit,
	};
}

function integratedChecks(input: CheckInput): CheckFlag[] {
	const { lines } = input;
	const flags: CheckFlag[] = [];
	const clinker = quantityOf(lines, "clinker");
	const clinkerProduced = clinker?.greaterThan(0) ? clinker : null;

	const fuelAmounts = KILN_FUELS.map((key) => amountOf(lines, key));
	const kilnEnergy = fuelAmounts.every((amount) => amount !== null)
		? KILN_FUELS.reduce(
				(total, key, index) => total.plus((fuelAmounts[index] as D).times(KILN_FUEL_ENERGY_GJ_PER_TONNE[key])),
				new D(0),
			)
		: null;

	if (clinkerProduced && kilnEnergy) {
		const perTonne = kilnEnergy.dividedBy(clinkerProduced);
		const range = INTEGRATED_RANGES.kilnEnergyGjPerTonneClinker;
		if (outside(perTonne, range)) {
			flags.push(
				rangeFlag(
					"KILN_ENERGY",
					["coal", "petcoke", "furnace_oil", "clinker"],
					perTonne,
					range,
					"GJ/t",
					(shown) => `Kiln fuel energy is ${shown} GJ per tonne of clinker`,
				),
			);
		}
	}

	const grid = quantityOf(lines, "grid_power");
	if (clinkerProduced && grid) {
		const perTonne = grid.times(1000).dividedBy(clinkerProduced);
		const range = INTEGRATED_RANGES.gridKwhPerTonneClinker;
		if (outside(perTonne, range)) {
			flags.push(
				rangeFlag(
					"GRID_PER_CLINKER",
					["grid_power", "clinker"],
					perTonne,
					range,
					"kWh/t",
					(shown) => `Grid electricity is ${shown} kWh per tonne of clinker`,
				),
			);
		}
	}

	const diesel = quantityOf(lines, "diesel");
	if (clinkerProduced && diesel) {
		const perTonne = diesel.dividedBy(clinkerProduced);
		const range = INTEGRATED_RANGES.dieselLitresPerTonneClinker;
		if (outside(perTonne, range)) {
			flags.push(
				rangeFlag(
					"DIESEL_PER_CLINKER",
					["diesel", "clinker"],
					perTonne,
					range,
					"L/t",
					(shown) => `Diesel is ${shown} litres per tonne of clinker`,
				),
			);
		}
	}

	if (clinker) {
		if (input.capacityTpa === null) {
			flags.push({
				code: "CAPACITY_UNKNOWN",
				severity: "info",
				itemKeys: ["clinker"],
				message: `No cement capacity is on record for ${periodLabel(input.period)}, so clinker was not compared with it.`,
			});
		} else {
			const monthCapacity = new D(input.capacityTpa).times(daysInMonth(input.period)).dividedBy(365);
			const share = clinker.dividedBy(monthCapacity);
			const range = INTEGRATED_RANGES.clinkerShareOfCapacity;
			if (outside(share, range)) {
				const percent = {
					low: display(new D(range.low).times(100), 0),
					high: display(new D(range.high).times(100), 0),
				};
				flags.push(
					rangeFlag(
						"CLINKER_VS_CAPACITY",
						["clinker"],
						share.times(100),
						percent,
						"%",
						(shown) => `Clinker is ${shown}% of this month's cement capacity`,
					),
				);
			}
		}
	}

	const clinkerLine = stateOf(lines, "clinker");
	const noClinker = clinkerLine.state === "NA" || (clinker?.isZero() ?? false);
	const fuelBurned = KILN_FUELS.some((key) => quantityOf(lines, key)?.greaterThan(0));
	if (noClinker && fuelBurned) {
		flags.push({
			code: "CLINKER_MISSING_WITH_FUEL",
			severity: "warning",
			itemKeys: ["clinker"],
			message: "Kiln fuel was burned, but no clinker was produced.",
		});
	}

	return flags;
}

function grindingUnitChecks(input: CheckInput): CheckFlag[] {
	return (["coal", "petcoke"] as const).flatMap((key): CheckFlag[] =>
		quantityOf(input.lines, key)?.greaterThan(0)
			? [
					{
						code: "UNEXPECTED_AT_GRINDING_UNIT",
						severity: "warning",
						itemKeys: [key],
						message: `${itemByKey(key).label} is reported at a grinding unit, where it is not expected.`,
					},
				]
			: [],
	);
}

function commonChecks(input: CheckInput): CheckFlag[] {
	const flags: CheckFlag[] = [];
	const typeLabel = input.plantType === "INTEGRATED" ? "an integrated plant" : "a grinding unit";

	for (const item of ITEMS) {
		if (expectationFor(item.key, input.plantType) === "EXPECTED" && stateOf(input.lines, item.key).state === "NA") {
			flags.push({
				code: "EXPECTED_ITEM_NA",
				severity: "warning",
				itemKeys: [item.key],
				message: `${item.label} is expected at ${typeLabel} but is marked N/A. Add a note saying why.`,
			});
		}
	}

	const previous = input.previous;
	if (previous) {
		const limit = new D(MONTH_ON_MONTH_CHANGE_LIMIT);
		for (const item of ITEMS) {
			const now = quantityOf(input.lines, item.key);
			const before = quantityOf(previous.lines, item.key);
			// A change from zero has no percentage; it is left to the ratio checks.
			if (!now || !before || before.isZero()) {
				continue;
			}
			const change = now.minus(before).dividedBy(before);
			if (change.abs().greaterThan(limit)) {
				const shown = display(change.times(100));
				const signed = change.isPositive() ? `+${shown}` : shown;
				flags.push({
					code: "LARGE_CHANGE",
					severity: "warning",
					itemKeys: [item.key],
					message: `${item.label} changed by ${signed}% from ${periodLabel(previous.period)}, the last approved month.`,
					measured: shown,
					low: display(limit.negated().times(100), 0),
					high: display(limit.times(100), 0),
					unit: "%",
				});
			}
		}
	}

	return flags;
}

/** Every flag for a month, in a stable order. */
export function runChecks(input: CheckInput): CheckFlag[] {
	const typeChecks = input.plantType === "INTEGRATED" ? integratedChecks(input) : grindingUnitChecks(input);
	return [...typeChecks, ...commonChecks(input)];
}

/** Whether approving needs a comment (U6). Info flags only explain a skipped check. */
export function hasWarnings(flags: readonly CheckFlag[]): boolean {
	return flags.some((flag) => flag.severity === "warning");
}
