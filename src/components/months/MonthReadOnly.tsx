import { EyeOff } from "lucide-react";
import type { ReactNode } from "react";

import { FlagList } from "@/components/months/FlagList";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState, EmptyStateDescription, EmptyStateIcon, EmptyStateTitle } from "@/components/ui/empty-state";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ITEMS, type ItemDefinition } from "@/config/items";
import { formatDecimal } from "@/lib/format";
import { naLabel } from "@/lib/naWording";
import { periodLabel } from "@/lib/periods";
import type { MonthDetail, MonthLine } from "@/lib/schemas/month";

function shownValue(line: MonthLine | undefined): { main: string; converted: string | null } {
	if (!line || line.state === "NOT_ENTERED") {
		return { main: "Not entered", converted: null };
	}
	if (line.state === "NA") {
		return { main: naLabel(line.naReason), converted: null };
	}
	const canonical = `${formatDecimal(line.value ?? "")} ${line.unit}`;
	const typed = line.enteredValue && line.enteredUnit ? `${line.enteredValue} ${line.enteredUnit}` : null;
	return typed && line.enteredUnit !== line.unit
		? { main: typed, converted: canonical }
		: { main: canonical, converted: null };
}

type PreviousLines = NonNullable<MonthDetail["checkContext"]["previous"]>["lines"];

/** Last approved month's value for an item, in its canonical unit (3.5b). */
function previousValue(previous: PreviousLines, item: ItemDefinition): string {
	const line = previous[item.key];
	if (!line || line.state === "NOT_ENTERED") {
		return "Not entered";
	}
	return line.state === "NA" ? naLabel(line.naReason) : `${formatDecimal(line.value)} ${item.canonicalUnit}`;
}

/**
 * A month that can't be edited by this user: submitted, approved, or someone else's draft (R1). Shows the
 * plant's last approved month beside it (3.5b). `aside` holds the review panel when there is one.
 */
export function MonthReadOnly({ month, aside }: { month: MonthDetail; aside?: ReactNode }) {
	if (!month.lines) {
		return (
			<Card>
				<CardContent>
					<EmptyState className="py-8">
						<EmptyStateIcon icon={EyeOff} />
						<EmptyStateTitle>Figures not shown yet</EmptyStateTitle>
						<EmptyStateDescription>{month.hiddenReason}</EmptyStateDescription>
					</EmptyState>
				</CardContent>
			</Card>
		);
	}
	const lines = month.lines;
	const previous = month.checkContext.previous;

	return (
		<div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
			<Card>
				<CardHeader>
					<CardTitle>Figures for the month</CardTitle>
				</CardHeader>
				<Table>
					<TableHeader>
						<TableRow>
							<TableHead>Item</TableHead>
							<TableHead align="right">Quantity</TableHead>
							{previous && (
								<TableHead align="right" data-testid="readonly-previous-heading">
									{periodLabel(previous.period)} (last approved)
								</TableHead>
							)}
							<TableHead>Note</TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						{ITEMS.map((item) => {
							const line = lines.find((candidate) => candidate.itemKey === item.key);
							const value = shownValue(line);
							return (
								<TableRow key={item.key} data-testid={`readonly-${item.key}`}>
									<TableCell className="font-medium">{item.label}</TableCell>
									<TableCell align="right" className="tabular-nums">
										<span className="block">{value.main}</span>
										{value.converted && <span className="block text-xs text-text-secondary">= {value.converted}</span>}
									</TableCell>
									{previous && (
										<TableCell
											align="right"
											className="tabular-nums text-text-secondary"
											data-testid={`readonly-previous-${item.key}`}
										>
											{previousValue(previous.lines, item)}
										</TableCell>
									)}
									<TableCell className="text-text-secondary">{line?.note ?? ""}</TableCell>
								</TableRow>
							);
						})}
					</TableBody>
				</Table>
			</Card>
			<div className="flex flex-col gap-6">
				<Card>
					<CardHeader>
						<CardTitle>Checks at submission</CardTitle>
					</CardHeader>
					<CardContent>
						<FlagList flags={month.flags} live={false} />
					</CardContent>
				</Card>
				{aside}
			</div>
		</div>
	);
}
