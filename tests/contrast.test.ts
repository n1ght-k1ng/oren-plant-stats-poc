import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

// Text colours pass WCAG AA (docs/UX-REVIEW.md A1). Read from the real tokens, so a colour change can't quietly
// undo it.

const css = readFileSync(fileURLToPath(new URL("../src/styles/globals.css", import.meta.url)), "utf8");
const token = (name: string) => {
	const match = new RegExp(`--color-${name}:\\s*(#[0-9a-fA-F]{6})`).exec(css);
	if (!match) {
		throw new Error(`No colour token --color-${name}`);
	}
	return match[1];
};

function luminance(hex: string): number {
	const channels = [1, 3, 5].map((start) => Number.parseInt(hex.slice(start, start + 2), 16) / 255);
	const [r, g, b] = channels.map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
	return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(foreground: string, background: string): number {
	const [light, dark] = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
	return (light + 0.05) / (dark + 0.05);
}

const AA = 4.5;

describe("text contrast (WCAG AA, 4.5:1)", () => {
	it.each([
		["text-primary", "surface-card", "body text"],
		["text-secondary", "surface-card", "secondary text on cards"],
		["text-secondary", "surface-page", "secondary text on the page"],
		["text-secondary", "surface-muted", "secondary text on grey rows and table headers"],
		["text-link", "surface-card", "links"],
		["feedback-warning-text", "feedback-warning-bg", "warning text"],
		["feedback-error-text", "surface-card", "error text"],
		["text-primary", "surface-warning-subtle", "text on amber banners"],
	])("%s on %s (%s) passes", (foreground, background) => {
		expect(contrast(token(foreground), token(background))).toBeGreaterThanOrEqual(AA);
	});
});
