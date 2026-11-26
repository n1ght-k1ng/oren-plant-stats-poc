import { History } from "lucide-react";

import { formatCapacity } from "@/components/plants/capacity";
import { EmptyState, EmptyStateDescription, EmptyStateIcon, EmptyStateTitle } from "@/components/ui/empty-state";
import { formatDateTime } from "@/lib/format";
import type { ChangeEntry } from "@/lib/schemas/plant";

const FIELD_LABELS: Record<string, string> = {
	name: "name",
	town: "town",
	state: "state",
	cementCapacityTpa: "cement capacity",
};

function formatValue(field: string, value: unknown): string {
	if (field === "cementCapacityTpa" && typeof value === "number") {
		return formatCapacity(value);
	}
	return value === null || value === undefined || value === "" ? "blank" : String(value);
}

export function RecentChanges({ changes }: { changes: ChangeEntry[] }) {
	if (changes.length === 0) {
		return (
			<EmptyState className="py-6">
				<EmptyStateIcon icon={History} />
				<EmptyStateTitle>No changes yet</EmptyStateTitle>
				<EmptyStateDescription>When someone edits this plant, the change shows here.</EmptyStateDescription>
			</EmptyState>
		);
	}
	return (
		<ul className="flex flex-col divide-y divide-border-default" data-testid="plant-recent-changes">
			{changes.map((entry) => (
				<li key={entry.id} className="flex flex-col gap-1 py-3 first:pt-0 last:pb-0">
					{Object.entries(entry.changes).map(([field, change]) => (
						<p key={field} className="text-sm text-text-primary">
							<span className="font-medium">{entry.changedByName}</span> changed {FIELD_LABELS[field] ?? field} from{" "}
							<span className="font-medium">{formatValue(field, change.from)}</span> to{" "}
							<span className="font-medium">{formatValue(field, change.to)}</span>.
						</p>
					))}
					<p className="text-xs text-text-secondary">{formatDateTime(entry.createdAt)}</p>
				</li>
			))}
		</ul>
	);
}
