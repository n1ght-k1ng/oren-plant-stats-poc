import { zodResolver } from "@hookform/resolvers/zod";
import { Pencil } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import toast from "react-hot-toast";

import { OrenButton } from "@/components/ui/OrenButton";
import { OrenInput } from "@/components/ui/OrenInput";
import {
	Dialog,
	DialogBody,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/components/ui/dialog";
import { type PlantFormValues, type PlantSummary, plantFormSchema } from "@/lib/schemas/plant";
import { convert } from "@/lib/units";
import { api } from "@/utils/api";

function toFormValues(plant: PlantSummary): PlantFormValues {
	return {
		name: plant.name,
		town: plant.town,
		state: plant.state,
		cementCapacityMt: convert(plant.cementCapacityTpa, "t", "Mt"),
	};
}

export function EditPlantDialog({ plant }: { plant: PlantSummary }) {
	const [open, setOpen] = useState(false);
	const utils = api.useContext();
	const form = useForm<PlantFormValues>({
		resolver: zodResolver(plantFormSchema),
		defaultValues: toFormValues(plant),
	});

	const update = api.plant.update.useMutation({
		onSuccess: async (saved) => {
			await Promise.all([utils.plant.byId.invalidate({ id: saved.id }), utils.plant.list.invalidate()]);
			toast.success(`${saved.name} saved.`);
			setOpen(false);
		},
		onError: (error) => toast.error(error.message || "We could not save this plant. Please try again."),
	});

	function onSubmit(values: PlantFormValues) {
		update.mutate({
			id: plant.id,
			name: values.name,
			town: values.town,
			state: values.state,
			cementCapacityTpa: Math.round(convert(values.cementCapacityMt, "Mt", "t")),
		});
	}

	return (
		<Dialog
			open={open}
			onOpenChange={(next) => {
				setOpen(next);
				if (next) {
					form.reset(toFormValues(plant));
				}
			}}
		>
			<DialogTrigger asChild>
				<OrenButton variant="secondary" leftIcon={<Pencil />} data-testid="plant-edit-open">
					Edit Plant
				</OrenButton>
			</DialogTrigger>
			<DialogContent closeButtonDataTestId="plant-edit-close">
				<form onSubmit={form.handleSubmit(onSubmit)} noValidate>
					<DialogHeader>
						<DialogTitle>Edit {plant.code}</DialogTitle>
						<DialogDescription>Changes are saved to this plant's history.</DialogDescription>
					</DialogHeader>
					<DialogBody className="flex flex-col gap-4">
						<OrenInput
							label="Plant name"
							isRequired
							register={form.register("name")}
							error={form.formState.errors.name}
							data-testid="plant-edit-name"
						/>
						<div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
							<OrenInput
								label="Town"
								isRequired
								register={form.register("town")}
								error={form.formState.errors.town}
								data-testid="plant-edit-town"
							/>
							<OrenInput
								label="State"
								isRequired
								register={form.register("state")}
								error={form.formState.errors.state}
								data-testid="plant-edit-state"
							/>
						</div>
						<OrenInput
							label="Cement capacity"
							helperText="Million tonnes a year, for example 3.5"
							type="number"
							step="0.01"
							inputMode="decimal"
							isRequired
							register={form.register("cementCapacityMt", { valueAsNumber: true })}
							error={form.formState.errors.cementCapacityMt}
							data-testid="plant-edit-capacity"
						/>
					</DialogBody>
					<DialogFooter>
						<OrenButton variant="secondary" onClick={() => setOpen(false)} data-testid="plant-edit-cancel">
							Cancel
						</OrenButton>
						<OrenButton type="submit" isLoading={update.isLoading} loadingText="Saving" data-testid="plant-edit-save">
							Save Changes
						</OrenButton>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}
