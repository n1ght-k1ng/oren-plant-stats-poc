/** @type {import('next').NextConfig} */
const nextConfig = {
	reactStrictMode: true,
	eslint: { ignoreDuringBuilds: true },
	async redirects() {
		return [{ source: "/", destination: "/plants", permanent: false }];
	},
};

module.exports = nextConfig;
