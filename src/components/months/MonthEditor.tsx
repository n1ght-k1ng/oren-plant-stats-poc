import { FileUp, Save, Send } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";

import { FlagList } from "@/components/months/FlagList";
import { ImportDialog } from "@/components/months/ImportDialog";
import { SubmitDialog } from "@/components/months/SubmitDialog";
import {
	type FormLine,
	type FormState,
	changedItems,
	initialForm,
	previewLine,
	readiness,
	toCheckLines,
	toLineInput,
} from "@/components/months/monthForm";
import { OrenButton } from "@/components/ui/OrenButton";
import { OrenInput } from "@/components/ui/OrenInput";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { OrenSelect } from "@/components/ui/select";
import { ITEMS, type ItemDefinition, type ItemKey, expectationFor } from "@/config/items";
import { useUnsavedChangesWarning } from "@/hooks/useUnsavedChangesWarning";
import { runChecks } from "@/lib/checks";
import { formatDecimal } from "@/lib/format";
import type { MonthDetail } from "@/lib/schemas/month";
import { api } from "@/utils/api";

const EXPECTATION_BADGES = {
	EXPECTED: { tone: "info", label: "Required" },
	OPTIONAL: { tone: "neutral", label: "Optional" },
	FIXED_NA: { tone: "neutral", label: "Not applicable" },
} as const;

type Props = {
	month: MonthDetail;
	/** Called with the server's message when someone else changed the month first. */
	onConflict: (message: string) => void;
};

function LineRow({
	item,
	line,
	plantType,
	onChange,
}: {
	item: ItemDefinition;
	line: FormLine;
	plantType: MonthDetail["plantType"];
	onChange: (line: FormLine) => void;
}) {
	const expectation = expectationFor(item.key, plantType);
	const badge = EXPECTATION_BADGES[expectation];
	const preview = previewLine(item.key, line);
	const fixed = expectation === "FIXED_NA";
	const isNa = line.mode === "na";
	const id = `line-${item.key}`;

	return (
		<li className="flex flex-col gap-3 py-4 first:pt-0 last:pb-0" data-testid={`line-${item.key}`}>
			<div className="flex flex-wrap items-center gap-2">
				<label htmlFor={`${id}-value`} className="text-sm font-semibold text-text-primary">
					{item.label}
				</label>
				<Badge tone={badge.tone}>{badge.label}</Badge>
				{line.naLabel && isNa && <Badge tone="neutral">{line.naLabel}</Badge>}
			</div>

			{fixed ? (
				<p className="text-sm text-text-secondary">Always N/A at a grinding unit.</p>
			) : (
				<div className="grid grid-cols-1 gap-3 md:grid-cols-[minmax(0,12rem)_8rem_auto_minmax(0,1fr)] md:items-start">
					<OrenInput
						id={`${id}-value`}
						aria-label={`${item.label} quantity`}
						inputMode="decimal"
						autoComplete="off"
						placeholder={isNa ? "N/A" : "Quantity"}
						value={isNa ? "" : line.value}
						disabled={isNa}
						errorMessage={preview.kind === "error" ? preview.message : undefined}
						onChange={(event) =>
							onChange({ ...line, mode: "value", value: event.target.value, naLabel: undefined, uploadId: undefined })
						}
						data-testid={`line-${item.key}-value`}
					/>
					{item.formUnits.length > 1 ? (
						<OrenSelect
							options={[...item.formUnits]}
							value={line.unit}
							disabled={isNa}
							onValueChange={(unit) => onChange({ ...line, unit, uploadId: undefined })}
							data-testid={`line-${item.key}-unit`}
						/>
					) : (
						<span className="flex h-9 items-center text-sm text-text-secondary">{item.canonicalUnit}</span>
					)}
					<label className="flex h-9 cursor-pointer items-center gap-2 text-sm text-text-primary">
						<input
							type="checkbox"
							className="size-4 accent-[var(--color-interactive-primary)]"
							checked={isNa}
							onChange={(event) =>
								onChange({
									...line,
									mode: event.target.checked ? "na" : "blank",
									value: "",
									naLabel: undefined,
									uploadId: undefined,
								})
							}
							data-testid={`line-${item.key}-na`}
						/>
						N/A
					</label>
					<OrenInput
						aria-label={`${item.label} note`}
						placeholder="Note (optional)"
						value={line.note}
						maxLength={1000}
						onChange={(event) => onChange({ ...line, note: event.target.value })}
						data-testid={`line-${item.key}-note`}
					/>
				</div>
			)}

			{!fixed && preview.kind === "value" && preview.unit !== line.unit && (
				<p className="text-xs text-text-secondary" data-testid={`line-${item.key}-converted`}>
					Saved as {formatDecimal(preview.canonical)} {preview.unit}
				</p>
			)}
		</li>
	);
}

/** Flow 1: the data owner enters the month, saves and returns, and submits. */
export function MonthEditor({ month, onConflict }: Props) {
	const utils = api.useContext();
	const loaded = useMemo(() => initialForm(month.lines ?? []), [month.lines]);
	const [form, setForm] = useState<FormState>(loaded);
	const [submitOpen, setSubmitOpen] = useState(false);
	const [importOpen, setImportOpen] = useState(false);

	// A fresh load (after saving, or a reload) replaces the form.
	useEffect(() => setForm(loaded), [loaded]);

	const changed = changedItems(form, loaded);
	useUnsavedChangesWarning(changed.length > 0);
	const ready = readiness(form, month.plantType);
	const flags = useMemo(
		() =>
			runChecks({
				plantType: month.plantType,
				period: month.period,
				capacityTpa: month.checkContext.capacityTpa,
				lines: toCheckLines(form),
				previous: month.checkContext.previous,
			}),
		[form, month],
	);

	const handleError = (error: { message: string; data?: { code?: string } | null }) => {
		if (error.data?.code === "CONFLICT") {
			onConflict(error.message);
			return;
		}
		toast.error(error.message || "We could not save this month. Please try again.");
	};

	const save = api.month.save.useMutation({ onError: handleError });
	const submit = api.month.submit.useMutation({ onError: handleError });

	async function saveChanges(): Promise<number | null> {
		if (changed.length === 0) {
			return month.version;
		}
		try {
			const result = await save.mutateAsync({
				reportId: month.id,
				expectedVersion: month.version,
				lines: changed.map((key) => toLineInput(key, form[key])),
			});
			return result.version;
		} catch {
			return null;
		}
	}

	async function onSave() {
		const version = await saveChanges();
		if (version !== null) {
			await utils.month.byId.invalidate({ reportId: month.id });
			toast.success("Saved. You can come back to this month at any time.");
		}
	}

	async function onSubmit(confirmNotUsed: ItemKey[]) {
		const version = await saveChanges();
		if (version === null) {
			return;
		}
		try {
			await submit.mutateAsync({ reportId: month.id, expectedVersion: version, confirmNotUsed });
		} catch {
			return;
		}
		setSubmitOpen(false);
		await Promise.all([utils.month.byId.invalidate({ reportId: month.id }), utils.month.mine.invalidate()]);
		toast.success("Submitted. It's now waiting for review.");
	}

	const blocked = ready.missing.length > 0 || ready.unreadable.length > 0;

	return (
		<div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
			<Card>
				<CardHeader>
					<CardTitle>Figures for the month</CardTitle>
				</CardHeader>
				<CardContent>
					<ul className="flex flex-col divide-y divide-border-default">
						{ITEMS.map((item) => (
							<LineRow
								key={item.key}
								item={item}
								line={form[item.key]}
								plantType={month.plantType}
								onChange={(line) => setForm((current) => ({ ...current, [item.key]: line }))}
							/>
						))}
					</ul>
				</CardContent>
			</Card>

			<div className="flex flex-col gap-6">
				<Card>
					<CardHeader>
						<CardTitle>Checks</CardTitle>
					</CardHeader>
					<CardContent className="flex flex-col gap-3">
						<p className="text-xs text-text-secondary">
							These update as you type. They never stop you saving or submitting; add a note if a figure is right.
						</p>
						<FlagList flags={flags} live />
					</CardContent>
				</Card>

				<Card>
					<CardContent className="flex flex-col gap-3 pt-5">
						<OrenButton
							variant="outline"
							leftIcon={<FileUp />}
							onClick={() => setImportOpen(true)}
							data-testid="month-import-open"
						>
							Import from File or Paste
						</OrenButton>
						<OrenButton
							variant="secondary"
							leftIcon={<Save />}
							disabled={changed.length === 0 || save.isLoading || ready.unreadable.length > 0}
							isLoading={save.isLoading && !submitOpen}
							loadingText="Saving"
							onClick={() => void onSave()}
							data-testid="month-save"
						>
							{changed.length === 0 ? "All Changes Saved" : "Save Draft"}
						</OrenButton>
						<OrenButton
							leftIcon={<Send />}
							disabled={blocked}
							onClick={() => setSubmitOpen(true)}
							data-testid="month-submit-open"
						>
							Submit for Review
						</OrenButton>
						{blocked && (
							<p className="text-xs text-text-secondary" data-testid="month-submit-blocked">
								{ready.missing.length > 0 && `Enter a value or N/A for: ${ready.missing.join(", ")}. `}
								{ready.unreadable.length > 0 && `Fix the figures we can't read: ${ready.unreadable.join(", ")}.`}
							</p>
						)}
					</CardContent>
				</Card>
			</div>

			<ImportDialog open={importOpen} onOpenChange={setImportOpen} month={month} form={form} onApply={setForm} />

			<SubmitDialog
				open={submitOpen}
				onOpenChange={setSubmitOpen}
				readiness={ready}
				flags={flags}
				isSubmitting={save.isLoading || submit.isLoading}
				onSubmit={(confirmNotUsed) => void onSubmit(confirmNotUsed)}
			/>
		</div>
	);
}
