export type Dimension = "mass" | "volume" | "energy";

type UnitDefinition = {
	label: string;
	dimension: Dimension;
	/** How many of the dimension's base unit (kg, litre, kWh) one of this unit is. */
	toBase: number;
};

export const UNITS = {
	kg: { label: "kg", dimension: "mass", toBase: 1 },
	t: { label: "tonnes", dimension: "mass", toBase: 1_000 },
	Mt: { label: "million tonnes", dimension: "mass", toBase: 1_000_000_000 },
	L: { label: "litres", dimension: "volume", toBase: 1 },
	kL: { label: "kilolitres", dimension: "volume", toBase: 1_000 },
	kWh: { label: "kWh", dimension: "energy", toBase: 1 },
	MWh: { label: "MWh", dimension: "energy", toBase: 1_000 },
} as const satisfies Record<string, UnitDefinition>;

export type Unit = keyof typeof UNITS;

export function isUnit(value: string): value is Unit {
	return Object.hasOwn(UNITS, value);
}

/** Converts between units of the same dimension. Throws for different dimensions (tonnes to litres). */
export function convert(value: number, from: Unit, to: Unit): number {
	const source = UNITS[from];
	const target = UNITS[to];
	if (source.dimension !== target.dimension) {
		throw new Error(`Cannot convert ${source.label} to ${target.label}.`);
	}
	return (value * source.toBase) / target.toBase;
}
