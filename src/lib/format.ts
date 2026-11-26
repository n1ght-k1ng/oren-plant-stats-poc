/** Indian digit grouping: 12,34,567.8 */
export function formatNumber(value: number, maximumFractionDigits = 0): string {
	return new Intl.NumberFormat("en-IN", { maximumFractionDigits }).format(value);
}

/** 12 Nov 2026 */
export function formatDate(value: Date): string {
	return new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric" }).format(value);
}

/** 12 Nov 2026, 14:05 */
export function formatDateTime(value: Date): string {
	return new Intl.DateTimeFormat("en-IN", {
		day: "numeric",
		month: "short",
		year: "numeric",
		hour: "2-digit",
		minute: "2-digit",
		hourCycle: "h23",
	}).format(value);
}

/** en-IN digit grouping on a whole-number string, without going through a JS number: 1234567 → 12,34,567. */
export function groupIndianDigits(digits: string): string {
	if (digits.length <= 3) {
		return digits;
	}
	const lastThree = digits.slice(-3);
	const rest = digits.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ",");
	return `${rest},${lastThree}`;
}

/** A decimal string with en-IN grouping, keeping every decimal place: "12300.5" → "12,300.5" (N1). */
export function formatDecimal(value: string): string {
	const negative = value.startsWith("-");
	const [whole, fraction] = (negative ? value.slice(1) : value).split(".");
	const grouped = groupIndianDigits(whole);
	return `${negative ? "-" : ""}${grouped}${fraction ? `.${fraction}` : ""}`;
}
