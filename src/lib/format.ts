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
