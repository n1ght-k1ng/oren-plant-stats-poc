// Generates the Prisma client only when it is missing or older than prisma/schema.prisma.
//
// Why not `prisma generate` every time: some machines set npm `ignore-scripts=true`, so
// `postinstall` never runs and the client must be made here. But on Windows a running
// `npm run dev` locks the query-engine file, and an unconditional generate then fails with
// EPERM. After a schema change, stop the dev server first, then run any script again.
import { execSync } from "node:child_process";
import { existsSync, statSync } from "node:fs";

const client = "node_modules/.prisma/client/index.d.ts";
const schema = "prisma/schema.prisma";

if (!existsSync(client) || statSync(client).mtimeMs < statSync(schema).mtimeMs) {
	execSync("prisma generate", { stdio: "inherit" });
}
