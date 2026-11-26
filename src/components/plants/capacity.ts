import { formatNumber } from "@/lib/format";
import { convert } from "@/lib/units";

/** Cement capacity, stored in tonnes a year, shown in million tonnes: "3.5 Mt a year". */
export function formatCapacity(tonnesPerYear: number): string {
	return `${formatNumber(convert(tonnesPerYear, "t", "Mt"), 2)} Mt a year`;
}
