# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

An app for a cement company's sustainability team: a multi-company register of plants, sample logins for each kind of user, and a table of emission factors. `samples/` holds examples of the monthly data plants send today. Nothing in the app reads them yet, and each uses a different layout, item names, units, and number format (including Indian digit grouping such as `"1,23,00,000"`).

Stack: Next.js 14 (Pages Router), React 18, tRPC 10, TanStack Query 4, Prisma 6 on Postgres, zod 3, react-hook-form, Tailwind CSS 4 with Radix, Biome, Vitest. Requires Node 22.

## Commands

```bash
npm install
cp .env.example .env       # set DATABASE_URL and DIRECT_URL (same value for a local Postgres)
npm run db:push            # apply prisma/schema.prisma (there are no migration files)
npm run db:seed            # sample data; safe to rerun, existing rows are left as they are
npm run db:reset-demo      # clear monthly report data, keep plants and users; local only (ask before --not-local)
npm run dev                # http://localhost:3000, then pick a sample user

npm run typecheck
npm run lint               # Biome lint and format check
npm run format             # Biome autofix
npm test
npx vitest run tests/plant.test.ts                  # one file
npx vitest run tests/plant.test.ts -t "plant.byId"  # tests matching a name
```

- Every test file needs `DATABASE_URL`, even pure ones like `units.test.ts`, because `tests/setup.ts` checks for it. Tests write to and delete from that database, so do not point them at the live site's. Run `db:push` on it first.
- Environment variables already set win over `.env` in tests. Use that to point tests at a separate test database:
  ```bash
  export DATABASE_URL="postgresql://plant:plant@127.0.0.1:5442/plant_data_test"
  export DIRECT_URL="$DATABASE_URL"   # a separate line: on one line it would copy the old value
  npx prisma db push --skip-generate   # once, and after each schema change
  npm test
  ```
  Locally that database is in the `oren-plant-db` Docker container (Postgres 16, port 5442, which also holds the app's `plant_data`). For the deployed app, use a separate Neon branch for tests, never the production branch.
- Work follows `docs/PLAN.md` step by step. Decisions, with their numbers (for example O5), are in `docs/DECISIONS.md`. `docs/BRIEF.md` is the original brief: do not edit it.
- **Never run anything that can drop or reset data without asking the user first**, even when the tables look empty: `prisma db push --accept-data-loss`, `--force-reset`, `prisma migrate reset`, `DROP`/`TRUNCATE`, or deleting rows outside a test's own company. If `db push` warns about data loss, stop, show the warning and the row counts, and ask.
- Before deleting anything the user approved, list exactly what will go (for reports: `npm run db:reset-demo -- --dry-run`). If the list holds anything beyond what they approved, stop and ask. "Remove your test months" does not cover months someone else entered.
- After a schema change, stop the dev server, run `db:push`, and restart. `scripts/ensure-prisma-client.mjs` regenerates the client when it is older than the schema.
- Deploys to Vercel with Neon: `DATABASE_URL` is the pooled connection string, `DIRECT_URL` the direct one. `db:push` and `db:seed` are run by hand against that database.

## Architecture

A request goes page → `api.*` hook (`src/utils/api.ts`) → router → service → Prisma. Rendering is client-side only (`ssr: false`).

- **Routers** (`src/server/api/routers`) stay thin: zod input and `.output()` schemas, role checks, and turning a `null` from a service into `NOT_FOUND`. Register new ones in `src/server/api/root.ts`.
- **Services** (`src/server/services`) hold the logic. They take `db` and usually `user` as arguments instead of importing `prisma`. Type `db` as `Db` (`src/server/db.ts`) so it accepts a transaction client, or as `PrismaClient` if the service opens the transaction itself.
- **Schemas** (`src/lib/schemas`) are the contract between server and browser, and the source of types such as `SessionUser`. `.output()` strips fields that are not in the schema, so a new column must be added to both the service's `select` and the output schema.
- **`src/lib`** is shared by the browser and server and must not import from `src/server`.
- **`src/config`** holds settings a developer changes without touching logic: the first reporting month, and later the item catalogue, unit aliases and check ranges. No settings screen in v1 (DECISIONS U7).

### Auth and tenancy

- There is no real sign-in. The `plant_data_user` cookie holds a plain user id, and `session.switchUser` lets anyone act as any seeded user. `protectedProcedure` loads that user as `ctx.user`.
- Every company-owned query must be scoped with `companyScope(user, where)`. Plant codes are unique only within a company (both seeded companies have a P01). Another company's record must give `NOT_FOUND`, not `FORBIDDEN`.
- Prisma treats `undefined` in a `where` as no filter, so never take the company as an optional filter. Services take the `user` and scope with `companyScope`; `plant.list` once leaked every company's plants this way.
- A user can hold several roles (`src/lib/roles.ts`). Enforce them on the server with `requireRole`. The browser uses `hasRole` only to hide controls.
- Being a plant's data owner is the `Plant.dataOwners` relation and is separate from the `DATA_OWNER` role. A plant can have several owners (seeded P05 has two, one of whom is also a reviewer).

### Change history

Writes record who changed what: read the row, `diffFields`, update, and `recordChange`, all in one transaction (see `updatePlant`). Skip the write when nothing changed. `diffFields` compares with `!==`, so it is only right for primitives; dates, arrays, and Prisma `Decimal` values would always look changed.

### Units and factors

- Quantities and CO2 are `Decimal`, never `number` (DECISIONS N1). Do arithmetic with `D` from `src/lib/decimal.ts`, not Prisma's 20-digit default. Send values across tRPC as decimal strings (`decimalString`, `toDecimalString`), and store numbers inside JSON columns as decimal strings.

- `src/lib/units.ts` is the unit catalogue. Use `convert`, which throws across dimensions (tonnes to litres), and do not hardcode multipliers.
- Capacity is stored as integer tonnes a year (`cementCapacityTpa`) but entered and shown in million tonnes (`cementCapacityMt`), which is why the form schema and API schema differ.
- Emission factors are constants in `src/lib/factors.ts`, not database rows. Each applies only to its own `unit`, so convert the quantity first.
- Format numbers and dates with `src/lib/format.ts` (en-IN).

### UI

- Build from `src/components/ui` (`OrenButton`, `OrenInput`, `OrenTextarea`, `EmptyState`, and so on) and the Oren colour tokens in `src/styles/globals.css` (`text-text-secondary`, `bg-surface-muted`), not raw Tailwind colours.
- Signed-in pages wrap their content in `AppLayout`, which redirects to `/sign-in` without a session. Nav items are listed there.
- Pages handle loading, error with a retry, and empty states explicitly. Interactive elements carry a `data-testid`.
- Libraries are on older majors: use `api.useContext()` (not `useUtils`) as the code does, and `isLoading` on mutations (not `isPending`).

## Conventions

- Biome: tabs, 120 columns, double quotes, organized imports. Default exports are a lint error outside `src/pages` and config files.
- `@/` maps to `src/`.
- API tests use `callerFor(user)` from `tests/helpers.ts`, which calls the router without HTTP. Create a company per test file and delete it in `afterAll`; its plants, users, and history cascade.

# Project context
Read docs/BRIEF.md and docs/DECISIONS.md before any change.
DECISIONS.md is the source of truth; if code and it disagree, ask me.

# Rules
- Small changes, one flow at a time. Stop after each and summarise.
- Role checks server-side always. Never trust the client.
- Write or update tests before saying something is done; run them.
- Decimals for quantities/CO2, never floats.
- Don't add dependencies without asking.
- Conventional commits; I commit, you propose messages.
