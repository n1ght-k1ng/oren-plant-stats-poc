import type { MyMonths } from "@/lib/schemas/month";

/**
 * What a data owner needs to do now (docs/UX-REVIEW.md U2), most urgent first: months sent back or reopened,
 * then drafts, then ended months not started. Newest month first within each.
 */
export type TodoKind = "reopened" | "sentBack" | "draft" | "notStarted";

export type TodoItem = {
	kind: TodoKind;
	plant: MyMonths[number]["plant"];
	period: string;
	reportId: string | null;
};

const ORDER: TodoKind[] = ["reopened", "sentBack", "draft", "notStarted"];

export function todoItems(mine: MyMonths): TodoItem[] {
	const items = mine.flatMap(({ plant, months }) =>
		months.flatMap((month): TodoItem[] => {
			const kind: TodoKind | null =
				month.status === "RETURNED"
					? month.reopened
						? "reopened"
						: "sentBack"
					: month.status === "DRAFT"
						? "draft"
						: month.status === null
							? "notStarted"
							: null;
			return kind ? [{ kind, plant, period: month.period, reportId: month.reportId }] : [];
		}),
	);
	return items.sort(
		(a, b) =>
			ORDER.indexOf(a.kind) - ORDER.indexOf(b.kind) ||
			b.period.localeCompare(a.period) ||
			a.plant.code.localeCompare(b.plant.code),
	);
}
