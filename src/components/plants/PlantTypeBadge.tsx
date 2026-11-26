import { Badge } from "@/components/ui/badge";
import { PLANT_TYPE_LABELS, type PlantTypeValue } from "@/lib/schemas/plant";

export function PlantTypeBadge({ type }: { type: PlantTypeValue }) {
	return <Badge tone={type === "INTEGRATED" ? "info" : "neutral"}>{PLANT_TYPE_LABELS[type]}</Badge>;
}
