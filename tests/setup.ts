import { afterAll } from "vitest";

import { prisma } from "@/server/db";

if (!process.env.DATABASE_URL) {
	throw new Error(
		"Set DATABASE_URL (in .env or the environment) to run the tests. Tests write and delete their own rows, so use a database your live site does not use.",
	);
}

afterAll(async () => {
	await prisma.$disconnect();
});
