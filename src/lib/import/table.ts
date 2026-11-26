/**
 * Reads CSV, or cells pasted from Excel (tab-separated), into rows of cells (docs/DECISIONS.md D8, D11).
 * Handles quoted fields, commas and line breaks inside quotes, doubled quotes, CRLF, and a leading byte-order mark.
 */

export type TableRow = {
	/** 1-based line in the original text where the row starts. */
	line: number;
	cells: string[];
};

/** Tab-separated when any line has a tab outside quotes, which is what Excel puts on the clipboard. */
function delimiterOf(text: string): "," | "\t" {
	return /\t/.test(text.replace(/"[^"]*"/g, "")) ? "\t" : ",";
}

export function readTable(original: string): TableRow[] {
	const text = original.replace(/^﻿/, "");
	const delimiter = delimiterOf(text);
	const rows: TableRow[] = [];
	let cells: string[] = [];
	let cell = "";
	let quoted = false;
	let line = 1;
	let rowStart = 1;

	const endCell = () => {
		cells.push(cell.trim());
		cell = "";
	};
	const endRow = () => {
		endCell();
		rows.push({ line: rowStart, cells });
		cells = [];
	};

	for (let index = 0; index < text.length; index += 1) {
		const char = text[index];
		if (quoted) {
			if (char === '"' && text[index + 1] === '"') {
				cell += '"';
				index += 1;
			} else if (char === '"') {
				quoted = false;
			} else {
				if (char === "\n") {
					line += 1;
				}
				cell += char;
			}
			continue;
		}
		if (char === '"' && cell.trim() === "") {
			quoted = true;
			cell = "";
		} else if (char === delimiter) {
			endCell();
		} else if (char === "\r" && text[index + 1] === "\n") {
			// Handled with the \n.
		} else if (char === "\n" || char === "\r") {
			endRow();
			line += 1;
			rowStart = line;
		} else {
			cell += char;
		}
	}
	if (cell !== "" || cells.length > 0) {
		endRow();
	}
	return rows;
}

export function isBlankRow(row: TableRow): boolean {
	return row.cells.every((cell) => cell === "");
}
