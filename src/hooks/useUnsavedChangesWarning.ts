import { useRouter } from "next/router";
import { useEffect } from "react";

export const UNSAVED_CHANGES_MESSAGE = "You have changes that aren't saved. Leave without saving them?";

/**
 * Warns before unsaved changes are lost (docs/UX-REVIEW.md U5): on any in-app navigation, and on closing,
 * reloading or leaving the tab (the browser shows its own wording for those).
 */
export function useUnsavedChangesWarning(unsaved: boolean) {
	const router = useRouter();

	useEffect(() => {
		if (!unsaved) {
			return;
		}
		const beforeUnload = (event: BeforeUnloadEvent) => {
			event.preventDefault();
			event.returnValue = "";
		};
		const routeChangeStart = (url: string) => {
			if (url === router.asPath || window.confirm(UNSAVED_CHANGES_MESSAGE)) {
				return;
			}
			router.events.emit("routeChangeError");
			// Next.js stops a page navigation only when this handler throws.
			throw "Navigation cancelled to keep unsaved changes";
		};
		window.addEventListener("beforeunload", beforeUnload);
		router.events.on("routeChangeStart", routeChangeStart);
		return () => {
			window.removeEventListener("beforeunload", beforeUnload);
			router.events.off("routeChangeStart", routeChangeStart);
		};
	}, [unsaved, router]);
}
