import { AlertTriangle, FileUp, Upload } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";

import {
	type Answers,
	type Choices,
	type Comparison,
	applyImport,
	compareWithForm,
	pending,
} from "@/components/months/importMerge";
import type { FormLine, FormState } from "@/components/months/monthForm";
import { OrenButton } from "@/components/ui/OrenButton";
import { OrenTextarea } from "@/components/ui/OrenTextarea";
import { Badge } from "@/components/ui/badge";
import {
	Dialog,
	DialogBody,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { OrenSelect } from "@/components/ui/select";
import { type ItemKey, itemByKey } from "@/config/items";
import { MAX_UPLOAD_BYTES } from "@/lib/schemas/import";
import type { ImportResult } from "@/lib/schemas/import";
import type { MonthDetail } from "@/lib/schemas/month";
import { cn } from "@/lib/utils";
import { api } from "@/utils/api";

type Row = ImportResult["mapping"]["rows"][number];

type Props = {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	month: MonthDetail;
	form: FormState;
	onApply: (form: FormState) => void;
};

function describe(line: FormLine): string {
	if (line.mode === "na") {
		return "N/A";
	}
	return line.mode === "blank" || line.value.trim() === "" ? "blank" : `${line.value} ${line.unit}`;
}

function Choice({
	selected,
	onClick,
	children,
	testId,
}: {
	selected: boolean;
	onClick: () => void;
	children: string;
	testId: string;
}) {
	return (
		<OrenButton
			size="sm"
			variant={selected ? "solid" : "outline"}
			aria-pressed={selected}
			onClick={onClick}
			data-testid={testId}
		>
			{children}
		</OrenButton>
	);
}

const STATUS_BADGES = {
	READY: { tone: "success", label: "Ready" },
	ASK: { tone: "info", label: "Your answer" },
	UNMATCHED: { tone: "warning", label: "Not matched" },
	INVALID: { tone: "error", label: "Can't use" },
	NO_QUANTITY: { tone: "neutral", label: "No quantity" },
	FIXED_NA: { tone: "neutral", label: "Always N/A" },
} as const;

function RowAction({
	row,
	answer,
	onAnswer,
}: { row: Row; answer: string | undefined; onAnswer: (answer: string) => void }) {
	const badge = STATUS_BADGES[row.status];
	return (
		<div className="flex flex-col gap-2">
			<Badge tone={badge.tone} className="self-start">
				{badge.label}
			</Badge>
			{row.message && <p className="text-xs text-text-secondary">{row.message}</p>}
			{row.status === "ASK" && row.questions.includes("BLANK_UNIT") && row.itemKey && (
				<div className="flex items-center gap-2">
					<OrenSelect
						size="sm"
						placeholder="Choose unit"
						options={[...itemByKey(row.itemKey as ItemKey).formUnits, { label: "Skip this row", value: "skip" }]}
						value={answer}
						onValueChange={onAnswer}
						data-testid={`import-unit-${row.line}`}
					/>
				</div>
			)}
			{row.status === "ASK" && !row.questions.includes("BLANK_UNIT") && (
				<div className="flex flex-wrap gap-2">
					<Choice selected={answer === "yes"} onClick={() => onAnswer("yes")} testId={`import-answer-${row.line}-yes`}>
						{row.questions.includes("MT_UNIT") ? "Yes, tonnes" : "Mark N/A"}
					</Choice>
					<Choice
						selected={answer === "skip"}
						onClick={() => onAnswer("skip")}
						testId={`import-answer-${row.line}-skip`}
					>
						Skip
					</Choice>
				</div>
			)}
		</div>
	);
}

function Conflicts({
	comparisons,
	choices,
	onChoose,
}: {
	comparisons: Comparison[];
	choices: Choices;
	onChoose: (key: ItemKey, choice: "keep" | "imported") => void;
}) {
	const conflicts = comparisons.filter((comparison) => comparison.conflict);
	if (conflicts.length === 0) {
		return null;
	}
	return (
		<section className="flex flex-col gap-3" data-testid="import-conflicts">
			<h3 className="text-sm font-semibold text-text-primary">
				The form already has different values. Choose for each:
			</h3>
			{conflicts.map((comparison) => (
				<div
					key={comparison.itemKey}
					className="grid grid-cols-1 gap-2 rounded-lg border-[1.5px] border-border-default p-3 sm:grid-cols-[10rem_1fr_1fr] sm:items-center"
				>
					<span className="text-sm font-medium">{itemByKey(comparison.itemKey).label}</span>
					<Choice
						selected={choices[comparison.itemKey] === "keep"}
						onClick={() => onChoose(comparison.itemKey, "keep")}
						testId={`import-choice-${comparison.itemKey}-keep`}
					>
						{`Keep ${describe(comparison.current)}`}
					</Choice>
					<Choice
						selected={choices[comparison.itemKey] === "imported"}
						onClick={() => onChoose(comparison.itemKey, "imported")}
						testId={`import-choice-${comparison.itemKey}-imported`}
					>
						{`Use file's ${describe(comparison.imported)}`}
					</Choice>
				</div>
			))}
		</section>
	);
}

/**
 * Import a file or a paste into the month (Phase 4). It reads and stores the file, asks about anything it won't
 * guess, and fills the form only with what the owner confirms. It never saves or submits (D9).
 */
export function ImportDialog({ open, onOpenChange, month, form, onApply }: Props) {
	const [paste, setPaste] = useState("");
	const [result, setResult] = useState<(ImportResult & { label: string }) | null>(null);
	const [answers, setAnswers] = useState<Answers>({});
	const [choices, setChoices] = useState<Choices>({});

	useEffect(() => {
		if (open) {
			setPaste("");
			setResult(null);
			setAnswers({});
			setChoices({});
		}
	}, [open]);

	const read = api.month.import.useMutation({
		onError: (error) => toast.error(error.message || "We could not read this file. Please try again."),
	});

	async function readFile(file: File) {
		if (/\.xlsx?$/i.test(file.name)) {
			toast.error(
				"Excel files can't be read directly yet. Open it in Excel, select the table, copy it, and paste it here.",
			);
			return;
		}
		if (file.size > MAX_UPLOAD_BYTES) {
			toast.error("This file is larger than 1 MB. Import a smaller file, or paste just the table.");
			return;
		}
		const content = await file.text();
		const outcome = await read
			.mutateAsync({ reportId: month.id, kind: "FILE", filename: file.name, content })
			.catch(() => null);
		if (outcome) {
			setResult({ ...outcome, label: file.name });
		}
	}

	async function readPaste() {
		const outcome = await read
			.mutateAsync({ reportId: month.id, kind: "PASTE", filename: null, content: paste })
			.catch(() => null);
		if (outcome) {
			setResult({ ...outcome, label: "the pasted table" });
		}
	}

	const rows = result?.mapping.rows ?? [];
	const comparisons = useMemo(
		() => (result ? compareWithForm(rows, answers, result.uploadId, form) : []),
		[result, rows, answers, form],
	);
	const waiting = pending(rows, answers, comparisons, choices);
	const willFill = comparisons.filter(
		(comparison) => !comparison.conflict || choices[comparison.itemKey] === "imported",
	);

	function apply() {
		const { form: next, filled } = applyImport(form, comparisons, choices);
		onApply(next);
		onOpenChange(false);
		toast.success(
			filled.length > 0
				? `Filled ${filled.length} ${filled.length === 1 ? "line" : "lines"} from ${result?.label}. Check them, then Save Draft.`
				: "Nothing was filled.",
		);
	}

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent size="2xl" closeButtonDataTestId="import-close">
				<DialogHeader>
					<DialogTitle>Import from a file or paste</DialogTitle>
					<DialogDescription>
						This fills the form for {month.plant.code} only. Nothing is saved until you choose Save Draft, and nothing
						is submitted.
					</DialogDescription>
				</DialogHeader>
				<DialogBody className="flex max-h-[65vh] flex-col gap-5 overflow-y-auto">
					{!result ? (
						<div className="flex flex-col gap-5">
							<label className="flex cursor-pointer flex-col items-center gap-2 rounded-lg border-[1.5px] border-dashed border-border-strong px-4 py-6 text-sm hover:bg-surface-hover">
								<FileUp className="size-6 text-text-secondary" aria-hidden />
								<span className="font-medium text-text-primary">Choose a CSV file</span>
								<span className="text-xs text-text-secondary">
									Up to 1 MB. For an Excel file, copy the table and paste it below.
								</span>
								<input
									type="file"
									accept=".csv,.tsv,.txt,text/csv"
									className="sr-only"
									disabled={read.isLoading}
									onChange={(event) => {
										const file = event.target.files?.[0];
										event.target.value = "";
										if (file) {
											void readFile(file);
										}
									}}
									data-testid="import-file"
								/>
							</label>
							<OrenTextarea
								label="Or paste cells copied from Excel"
								rows={5}
								placeholder={"Item\tQuantity\tUnit\nCoal\t35000\tt"}
								value={paste}
								onChange={(event) => setPaste(event.target.value)}
								data-testid="import-paste"
							/>
						</div>
					) : (
						<div className="flex flex-col gap-5" data-testid="import-preview">
							{result.mapping.warnings.length > 0 && (
								<div
									className="flex flex-col gap-1 rounded-lg bg-surface-warning-subtle px-3 py-2 text-sm"
									data-testid="import-warnings"
								>
									{result.mapping.warnings.map((warning) => (
										<p key={warning} className="flex items-start gap-2">
											<AlertTriangle className="mt-0.5 size-4 shrink-0 text-feedback-warning-fg" aria-hidden />
											{warning}
										</p>
									))}
								</div>
							)}
							{result.mapping.error ? (
								<p className="text-sm text-feedback-error-text" data-testid="import-error">
									{result.mapping.error}
								</p>
							) : (
								<>
									<p className="text-sm text-text-secondary">
										Read {result.label}: header on line {result.mapping.headerLine}, {rows.length} rows below it.
									</p>
									<div className="overflow-x-auto">
										<table className="w-full text-sm">
											<thead>
												<tr className="border-b border-border-default text-left text-xs text-text-secondary">
													<th className="py-2 pr-3 font-medium">Line</th>
													<th className="py-2 pr-3 font-medium">In the file</th>
													<th className="py-2 pr-3 font-medium">Reads as</th>
													<th className="py-2 font-medium">What happens</th>
												</tr>
											</thead>
											<tbody>
												{rows.map((row) => (
													<tr
														key={row.line}
														className="border-b border-border-default align-top"
														data-testid={`import-row-${row.line}`}
													>
														<td className="py-3 pr-3 tabular-nums text-text-secondary">{row.line}</td>
														<td className="py-3 pr-3">
															<span className="block font-medium">{row.itemText || "(no item)"}</span>
															<span className="block tabular-nums">
																{[row.quantityText, row.unitText].filter(Boolean).join(" ") || "(no quantity)"}
															</span>
															{row.remarks && <span className="block text-xs text-text-secondary">{row.remarks}</span>}
														</td>
														<td className="py-3 pr-3">
															{row.itemKey ? (
																<>
																	<span className="block font-medium">{itemByKey(row.itemKey as ItemKey).label}</span>
																	{row.proposed?.mode === "value" && (
																		<span className="block tabular-nums">
																			{row.proposed.value} {row.proposed.unit ?? ""}
																		</span>
																	)}
																	{row.proposed?.mode === "na" && <span className="block">N/A</span>}
																	{row.note && (
																		<span className="block text-xs text-text-secondary">Note: {row.note}</span>
																	)}
																</>
															) : (
																<span className="text-text-secondary">No item</span>
															)}
														</td>
														<td className="py-3">
															<RowAction
																row={row}
																answer={answers[row.line]}
																onAnswer={(answer) => setAnswers((current) => ({ ...current, [row.line]: answer }))}
															/>
														</td>
													</tr>
												))}
											</tbody>
										</table>
									</div>
									<Conflicts
										comparisons={comparisons}
										choices={choices}
										onChoose={(key, choice) => setChoices((current) => ({ ...current, [key]: choice }))}
									/>
									<p className="text-sm text-text-primary" data-testid="import-summary">
										{waiting.questions + waiting.conflicts > 0
											? `Answer ${waiting.questions} question${waiting.questions === 1 ? "" : "s"} and ${waiting.conflicts} choice${waiting.conflicts === 1 ? "" : "s"} above to continue.`
											: willFill.length > 0
												? `Will fill: ${willFill.map((comparison) => itemByKey(comparison.itemKey).label).join(", ")}.`
												: "Nothing will be filled."}
									</p>
								</>
							)}
						</div>
					)}
				</DialogBody>
				<DialogFooter>
					<OrenButton variant="secondary" onClick={() => onOpenChange(false)} data-testid="import-cancel">
						Cancel
					</OrenButton>
					{!result ? (
						<OrenButton
							leftIcon={<Upload />}
							disabled={paste.trim() === "" || read.isLoading}
							isLoading={read.isLoading}
							loadingText="Reading"
							onClick={() => void readPaste()}
							data-testid="import-read-paste"
						>
							Read Pasted Table
						</OrenButton>
					) : (
						!result.mapping.error && (
							<OrenButton
								disabled={waiting.questions + waiting.conflicts > 0}
								onClick={apply}
								className={cn(waiting.questions + waiting.conflicts > 0 && "opacity-90")}
								data-testid="import-apply"
							>
								Fill the Form
							</OrenButton>
						)
					)}
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
