import { AlertTriangle, Factory, Search } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/router";
import { useState } from "react";

import { AppLayout } from "@/components/layout/AppLayout";
import { PlantTypeBadge } from "@/components/plants/PlantTypeBadge";
import { formatCapacity } from "@/components/plants/capacity";
import { OrenButton } from "@/components/ui/OrenButton";
import { OrenInput } from "@/components/ui/OrenInput";
import {
	EmptyState,
	EmptyStateActions,
	EmptyStateDescription,
	EmptyStateIcon,
	EmptyStateTitle,
} from "@/components/ui/empty-state";
import { PageHeader, PageHeaderDescription, PageHeaderHeading } from "@/components/ui/page-header";
import {
	Table,
	TableBody,
	TableCell,
	TableFullRow,
	TableHead,
	TableHeader,
	TableLoadingRows,
	TableRow,
} from "@/components/ui/table";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { api } from "@/utils/api";

const COLUMNS = 6;

export default function PlantsPage() {
	const router = useRouter();
	const [search, setSearch] = useState("");
	const debouncedSearch = useDebouncedValue(search.trim());
	const plants = api.plant.list.useQuery({ search: debouncedSearch || undefined }, { keepPreviousData: true });
	const rows = plants.data ?? [];

	return (
		<AppLayout title="Plants">
			<PageHeader bordered>
				<PageHeaderHeading>Plants</PageHeaderHeading>
				<PageHeaderDescription>Each plant with its type and cement capacity.</PageHeaderDescription>
			</PageHeader>

			<div className="mb-4 max-w-sm">
				<OrenInput
					aria-label="Search plants"
					placeholder="Search by name, code, town or state"
					value={search}
					onChange={(event) => setSearch(event.target.value)}
					data-testid="plants-search"
				/>
			</div>

			<Table>
				<TableHeader>
					<TableRow>
						<TableHead>Code</TableHead>
						<TableHead>Plant</TableHead>
						<TableHead>Town</TableHead>
						<TableHead>State</TableHead>
						<TableHead>Type</TableHead>
						<TableHead align="right">Cement capacity</TableHead>
					</TableRow>
				</TableHeader>
				<TableBody>
					{plants.isLoading && <TableLoadingRows columns={COLUMNS} />}

					{plants.isError && (
						<TableFullRow columns={COLUMNS}>
							<EmptyState>
								<EmptyStateIcon icon={AlertTriangle} />
								<EmptyStateTitle>We could not load the plants</EmptyStateTitle>
								<EmptyStateDescription>Check your connection, then try again.</EmptyStateDescription>
								<EmptyStateActions>
									<OrenButton data-testid="plants-retry" onClick={() => void plants.refetch()}>
										Try Again
									</OrenButton>
								</EmptyStateActions>
							</EmptyState>
						</TableFullRow>
					)}

					{plants.isSuccess && rows.length === 0 && (
						<TableFullRow columns={COLUMNS}>
							<EmptyState>
								<EmptyStateIcon icon={debouncedSearch ? Search : Factory} />
								<EmptyStateTitle>{debouncedSearch ? "No plants match your search" : "No plants yet"}</EmptyStateTitle>
								<EmptyStateDescription>
									{debouncedSearch
										? `Nothing matches "${debouncedSearch}". Try a plant name, code, town or state.`
										: "Plants appear here once they are added."}
								</EmptyStateDescription>
								{debouncedSearch && (
									<EmptyStateActions>
										<OrenButton variant="secondary" data-testid="plants-clear-search" onClick={() => setSearch("")}>
											Clear Search
										</OrenButton>
									</EmptyStateActions>
								)}
							</EmptyState>
						</TableFullRow>
					)}

					{rows.map((plant) => (
						<TableRow
							key={plant.id}
							interactive
							onClick={() => void router.push(`/plants/${plant.id}`)}
							data-testid={`plants-row-${plant.code}`}
						>
							<TableCell className="font-medium">{plant.code}</TableCell>
							<TableCell>
								<Link
									href={`/plants/${plant.id}`}
									className="font-medium hover:underline"
									onClick={(event) => event.stopPropagation()}
								>
									{plant.name}
								</Link>
							</TableCell>
							<TableCell>{plant.town}</TableCell>
							<TableCell>{plant.state}</TableCell>
							<TableCell>
								<PlantTypeBadge type={plant.type} />
							</TableCell>
							<TableCell align="right">{formatCapacity(plant.cementCapacityTpa)}</TableCell>
						</TableRow>
					))}
				</TableBody>
			</Table>
		</AppLayout>
	);
}
