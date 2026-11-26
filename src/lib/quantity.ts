/**
 * Reads a quantity as a person or a spreadsheet wrote it (docs/DECISIONS.md D4, D11, D13, P3). Used by both
 * the form and import. Values come back as exact decimal strings (N1), never JS numbers.
 */
import { toD } from "@/lib/decimal";

export type ParsedQuantity =
	| { kind: "value"; value: string }
	| { kind: "na" }
	/** Nothing written: "not entered". Never 0. */
	| { kind: "blank" }
	| { kind: "invalid"; message: string };

export const MAX_DECIMAL_PLACES = 3;

/** Written ways of saying "not applicable". Anything else that is not a number is refused, not guessed. */
const NOT_APPLICABLE = new Set(["n/a", "na", "not applicable"]);

// The whole-number part: plain (35000), Western groups (11,000 or 1,000,000), or Indian groups
// (1,01,700 or 1,23,00,000: the last group has three digits, the ones before it two).
const PLAIN = String.raw`\d+`;
const WESTERN = String.raw`\d{1,3}(?:,\d{3})+`;
const INDIAN = String.raw`\d{1,2}(?:,\d{2})+,\d{3}`;
const QUANTITY = new RegExp(String.raw`^(${PLAIN}|${WESTERN}|${INDIAN})(?:\.(\d+))?$`);

const HOW_TO_WRITE = "Enter a number such as 35000, 11,000 or 1,23,00,000, or N/A.";

export function parseQuantity(written: string): ParsedQuantity {
	const text = written.trim();
	if (text === "") {
		return { kind: "blank" };
	}
	if (NOT_APPLICABLE.has(text.toLowerCase())) {
		return { kind: "na" };
	}
	if (/^-\s*\d/.test(text)) {
		return { kind: "invalid", message: "Enter a quantity of 0 or more." };
	}

	const match = QUANTITY.exec(text);
	if (!match) {
		return { kind: "invalid", message: `"${text}" is not a number we can read. ${HOW_TO_WRITE}` };
	}
	const [, whole, fraction] = match;
	if (fraction && fraction.length > MAX_DECIMAL_PLACES) {
		return { kind: "invalid", message: `Enter at most ${MAX_DECIMAL_PLACES} decimal places.` };
	}
	const digits = whole.replaceAll(",", "") + (fraction ? `.${fraction}` : "");
	return { kind: "value", value: toD(digits).toFixed() };
}
