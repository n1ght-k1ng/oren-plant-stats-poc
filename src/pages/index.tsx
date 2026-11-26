import { useRouter } from "next/router";
import { useEffect } from "react";

import { Skeleton } from "@/components/ui/skeleton";
import { homeFor } from "@/lib/home";
import { api } from "@/utils/api";

/** `/` sends each person to their own starting page, or to sign-in (U1). */
export default function HomePage() {
	const router = useRouter();
	const me = api.session.me.useQuery();

	useEffect(() => {
		if (me.isSuccess) {
			void router.replace(me.data ? homeFor(me.data) : "/sign-in");
		} else if (me.isError) {
			void router.replace("/sign-in");
		}
	}, [me.isSuccess, me.isError, me.data, router]);

	return (
		<main className="min-h-screen bg-surface-page p-8" aria-busy>
			<Skeleton className="h-8 w-64" />
		</main>
	);
}
