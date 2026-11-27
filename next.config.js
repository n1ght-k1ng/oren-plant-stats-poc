/** @type {import('next').NextConfig} */
const nextConfig = {
	reactStrictMode: true,
	eslint: { ignoreDuringBuilds: true },
	// The app shows no optimised images, so the image optimizer is switched off. It removes the endpoint that
	// Next.js 14's critical advisories GHSA-2xp9-vwfh-vxw4 and GHSA-2464-fhr4-w9xw target.
	images: { unoptimized: true },
};

module.exports = nextConfig;
