/** Card: a bordered panel with an optional header. */
import type * as React from "react";

import { cn } from "@/lib/utils";

function Card({ className, ...props }: React.ComponentProps<"section">) {
	return <section className={cn("rounded-lg border border-border-default bg-surface-card", className)} {...props} />;
}

function CardHeader({ className, ...props }: React.ComponentProps<"div">) {
	return (
		<div
			className={cn("flex items-center justify-between gap-3 border-b border-border-default px-5 py-3", className)}
			{...props}
		/>
	);
}

function CardTitle({ className, ...props }: React.ComponentProps<"h2">) {
	return <h2 className={cn("text-base font-semibold text-text-primary", className)} {...props} />;
}

function CardContent({ className, ...props }: React.ComponentProps<"div">) {
	return <div className={cn("px-5 py-4", className)} {...props} />;
}

export { Card, CardContent, CardHeader, CardTitle };
