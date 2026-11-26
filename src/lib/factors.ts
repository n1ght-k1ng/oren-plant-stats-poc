import type { Unit } from "@/lib/units";

export type EmissionFactor = {
	key: string;
	label: string;
	/** The unit the factor applies to. */
	unit: Unit;
	scope: 1 | 2;
	kgCo2PerUnit: number;
	source: string;
};

const IPCC_2006 = "IPCC 2006 Guidelines, Vol. 2, Ch. 1, default net calorific value x default CO2 factor";

export const EMISSION_FACTORS = [
	{
		key: "coal",
		label: "Coal",
		unit: "t",
		scope: 1,
		kgCo2PerUnit: 2441,
		source: `${IPCC_2006}: other bituminous coal, 25.8 GJ/t x 94.6 kg/GJ`,
	},
	{
		key: "petcoke",
		label: "Petroleum coke",
		unit: "t",
		scope: 1,
		kgCo2PerUnit: 3169,
		source: `${IPCC_2006}: petroleum coke, 32.5 GJ/t x 97.5 kg/GJ`,
	},
	{
		key: "diesel",
		label: "Diesel (HSD)",
		unit: "L",
		scope: 1,
		kgCo2PerUnit: 2.68,
		source: `${IPCC_2006}: gas/diesel oil, 43.0 GJ/t x 74.1 kg/GJ, at an assumed 0.84 kg per litre`,
	},
	{
		key: "furnace_oil",
		label: "Furnace oil",
		unit: "t",
		scope: 1,
		kgCo2PerUnit: 3127,
		source: `${IPCC_2006}: residual fuel oil, 40.4 GJ/t x 77.4 kg/GJ`,
	},
	{
		key: "grid_power",
		label: "Grid electricity",
		unit: "MWh",
		scope: 2,
		kgCo2PerUnit: 675,
		source: "CEA CO2 Baseline Database, version 22.0 (August 2026): weighted average, FY 2025-26",
	},
	{
		key: "clinker",
		label: "Clinker produced",
		unit: "t",
		scope: 1,
		kgCo2PerUnit: 525,
		source: "GCCA (formerly CSI) Cement CO2 and Energy Protocol: default factor for calcination",
	},
] as const satisfies readonly EmissionFactor[];

export type EmissionFactorKey = (typeof EMISSION_FACTORS)[number]["key"];
