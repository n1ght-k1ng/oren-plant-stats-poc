import "@fontsource-variable/inter";
import "@/styles/globals.css";

import type { AppProps } from "next/app";
import Head from "next/head";
import { Toaster } from "react-hot-toast";

import { api } from "@/utils/api";

function App({ Component, pageProps }: AppProps) {
	return (
		<>
			<Head>
				<title>Plant data</title>
				<meta name="viewport" content="width=device-width, initial-scale=1" />
			</Head>
			<Component {...pageProps} />
			<Toaster position="bottom-right" toastOptions={{ duration: 4500 }} containerStyle={{ zIndex: 60 }} />
		</>
	);
}

export default api.withTRPC(App);
