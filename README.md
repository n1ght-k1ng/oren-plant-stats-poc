# Plant data

A small app for a cement company's sustainability team: a register of plants, sample logins for
each kind of user, and the emission factors the team uses.

## Stack

Next.js 14 (Pages Router), React 18, tRPC 10 with TanStack Query 4, Prisma 6 on Postgres, zod,
react-hook-form, Tailwind CSS 4 with Radix primitives, Biome and Vitest. Node 22.

## Run it locally

1. `npm install`
2. Copy `.env.example` to `.env` and set `DATABASE_URL` and `DIRECT_URL`. A free [Neon](https://neon.tech)
   database works. With a local Postgres, both can be the same address.
3. `npm run db:push` creates the tables. `npm run db:seed` adds the sample companies, plants and users.
4. `npm run dev`, then open http://localhost:3000 and choose a sample user. Switch user from the top bar.

## Scripts

| Script | What it does |
|---|---|
| `npm run dev` | Development server |
| `npm run build`, `npm start` | Production build, and serve it |
| `npm run typecheck` | TypeScript, no output |
| `npm run lint` | Biome: lint and format check |
| `npm run format` | Biome: fix what it can |
| `npm test` | Vitest |
| `npm run db:push` | Apply `prisma/schema.prisma` to the database |
| `npm run db:seed` | Add the sample data (safe to run again) |
| `npm run db:studio` | Browse the database |

## Tests

`npm test` runs against `DATABASE_URL`. The tests create and delete their own rows, so point them at a
database (or Neon branch) that your live site does not use. Run `npm run db:push` on it first.

## Where things are

| Folder | What is in it |
|---|---|
| `src/pages` | Screens |
| `src/components` | UI components; shared ones are in `src/components/ui` |
| `src/server/api` | tRPC setup and routers |
| `src/server/services` | Business logic and database access |
| `src/server/helpers` | Shared server helpers |
| `src/lib` | Code shared by the browser and the server: roles, units, emission factors, schemas |
| `prisma` | Database schema and seed |
| `tests` | Tests |
| `samples` | Examples of the monthly data plants send today |

## Deploy

1. Push the repo to GitHub and import it in [Vercel](https://vercel.com).
2. In the Vercel project, set `DATABASE_URL` (Neon's pooled connection string) and `DIRECT_URL` (the
   direct one).
3. From your machine, run `npm run db:push` and `npm run db:seed` against that database.

## Before you change anything

Commit the starter as it is, as your first commit.
