import { AppLayout } from "@/components/layout/AppLayout";
import { Badge } from "@/components/ui/badge";
import { PageHeader, PageHeaderDescription, PageHeaderHeading } from "@/components/ui/page-header";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EMISSION_FACTORS } from "@/lib/factors";
import { formatNumber } from "@/lib/format";
import { UNITS } from "@/lib/units";

export default function FactorsPage() {
	return (
		<AppLayout title="Emission factors">
			<PageHeader bordered>
				<PageHeaderHeading>Emission factors</PageHeaderHeading>
				<PageHeaderDescription>The factors that turn fuel, power and clinker into CO2.</PageHeaderDescription>
			</PageHeader>

			<Table>
				<TableHeader>
					<TableRow>
						<TableHead>Item</TableHead>
						<TableHead>Scope</TableHead>
						<TableHead align="right">kg CO2 per unit</TableHead>
						<TableHead>Unit</TableHead>
						<TableHead>Source</TableHead>
					</TableRow>
				</TableHeader>
				<TableBody>
					{EMISSION_FACTORS.map((factor) => (
						<TableRow key={factor.key} data-testid={`factor-row-${factor.key}`}>
							<TableCell className="font-medium">{factor.label}</TableCell>
							<TableCell>
								<Badge tone={factor.scope === 1 ? "info" : "neutral"}>Scope {factor.scope}</Badge>
							</TableCell>
							<TableCell align="right">{formatNumber(factor.kgCo2PerUnit, 2)}</TableCell>
							<TableCell>{UNITS[factor.unit].label}</TableCell>
							<TableCell className="max-w-md text-xs whitespace-normal text-text-secondary">{factor.source}</TableCell>
						</TableRow>
					))}
				</TableBody>
			</Table>
		</AppLayout>
	);
}
