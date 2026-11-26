import { EyeOff } from "lucide-react";

import { FlagList } from "@/components/months/FlagList";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState, EmptyStateDescription, EmptyStateIcon, EmptyStateTitle } from "@/components/ui/empty-state";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ITEMS } from "@/config/items";
import { formatDecimal } from "@/lib/format";
import type { MonthDetail, MonthLine } from "@/lib/schemas/month";

function shownValue(line: MonthLine | undefined): { main: string; converted: string | null } {
	if (!line || line.state === "NOT_ENTERED") {
		return { main: "Not entered", converted: null };
	}
	if (line.state === "NA") {
		return { main: line.naReason === "NOT_USED_THIS_MONTH" ? "Not used this month" : "N/A", converted: null };
	}
	const canonical = `${formatDecimal(line.value ?? "")} ${line.unit}`;
	const typed = line.enteredValue && line.enteredUnit ? `${line.enteredValue} ${line.enteredUnit}` : null;
	return typed && line.enteredUnit !== line.unit
		? { main: typed, converted: canonical }
		: { main: canonical, converted: null };
}

/** A month that can't be edited by this user: submitted, approved, or someone else's draft (R1). */
export function MonthReadOnly({ month }: { month: MonthDetail }) {
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
									<TableCell className="text-text-secondary">{line?.note ?? ""}</TableCell>
								</TableRow>
							);
						})}
					</TableBody>
				</Table>
			</Card>
			<Card>
				<CardHeader>
					<CardTitle>Checks at submission</CardTitle>
				</CardHeader>
				<CardContent>
					<FlagList flags={month.flags} live={false} />
				</CardContent>
			</Card>
		</div>
	);
}
