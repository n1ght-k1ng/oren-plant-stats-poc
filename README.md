# Plant data

Cement plants send their monthly fuel, power and clinker figures. A reviewer checks and approves each month, and
the Head of Sustainability sees approved Scope 1 and Scope 2 CO2 for the company, with every figure traceable to
what the plant typed. The brief is in `docs/BRIEF.md`; the decisions behind the app are in `docs/DECISIONS.md`.

Next.js 14 (Pages Router), React 18, tRPC 10, Prisma 6 on Postgres, zod, Tailwind CSS 4, Biome, Vitest and
Playwright. Node 22.

## Run it locally

You need Node 22 and a Postgres database. With Docker, this starts one:

```bash
docker run -d --name plant-db -e POSTGRES_USER=plant -e POSTGRES_PASSWORD=plant -e POSTGRES_DB=plant_data \
  -p 5442:5432 postgres:16
```

Then:

```bash
npm install
cp .env.example .env
# In .env, set both DATABASE_URL and DIRECT_URL to postgresql://plant:plant@127.0.0.1:5442/plant_data
npm run db:push      # creates the tables
npm run db:seed      # two companies, their plants and users, and Nimbus's months from April to October 2026
npm run dev          # http://localhost:3000
```

A free [Neon](https://neon.tech) database works too: put its pooled string in `DATABASE_URL` and its direct
string in `DIRECT_URL`.

There is no real sign-in, as the brief asks. The first page lists the sample users; pick one, and switch user
from the menu at the top right.

## Which sample user to pick

All are at Nimbus Cement unless noted. Each role opens on its own page.

| To see | Sign in as | What's there |
|---|---|---|
| Entering a month | **Hetal Patel**, data owner, P07 (grinding unit) | October is a draft, ready to finish and submit |
| A month sent back | **Deepak Sahu**, data owner, P06 | October was sent back with a reviewer's comment |
| A month the Head reopened | **Karthik Raja**, data owner, P05 | September was reopened after an auditor's query |
| Starting a month from nothing | **Arijit Ghosh**, data owner, P09 | October is not started |
| Importing a plant's file | any data owner, with a file from `samples/` | Import from File or Paste, on the month form |
| Reviewing | **Vikram Joshi**, reviewer | P04, P05 and P08's October are waiting. P04's was imported from its plant's file |
| Owner and reviewer at once | **Priya Nair**, reviewer and co-owner of P05 | She can review other plants' months but not P05's |
| The dashboard and audit trail | **Meera Iyer**, Head of Sustainability | Approved CO2 by plant and quarter. Click a figure to trace it to the typed values |
| Another company | **Rohan Kapoor**, Head at Kestrel Cement | Sees only Kestrel's plants, none of Nimbus's |

Other data owners (Ravi Meena P01, Anita Tiwari P02, Suresh Wankhede P03, Lakshmi Reddy P04, Sasmita Mohanty P08)
have their months approved or waiting.

The seed is safe to run again: months that already exist are left as they are. To put a month back to its seeded
state, list the months with `npm run db:reset-demo` (it only lists), delete the ones you want with
`npm run db:reset-demo -- --confirm <id> <id>`, and run `npm run db:seed` again. It works on local databases only.

## Tests

The tests create and delete their own rows. Give them a separate database, never the one a live site uses:

```bash
docker exec plant-db createdb -U plant plant_data_test
export DATABASE_URL="postgresql://plant:plant@127.0.0.1:5442/plant_data_test"
export DIRECT_URL="$DATABASE_URL"
npx prisma db push --skip-generate
npm test                # unit and API tests (Vitest): 394 tests
npm run typecheck
npm run lint
unset DATABASE_URL DIRECT_URL
```

Set the two variables on separate lines as above. On one line, `DIRECT_URL` would take the old value.

`npm test` needs `DATABASE_URL` even for the pure tests. Run one file with `npx vitest run tests/month.test.ts`.

### End-to-end

```bash
npm run test:e2e        # Playwright: 22 tests
```

It uses the database in `.env`, so leave `DATABASE_URL` unset in your shell. It starts `npm run dev` if nothing
is on port 3000, and drives the installed Google Chrome. Without Chrome, run `npx playwright install chromium`
and set `E2E_BROWSER_CHANNEL=chromium`.

Each run creates its own "E2E Cement" company, runs the main loop and the UX checks through the real screens,
and deletes the company at the end. It doesn't touch Nimbus or Kestrel.

- `e2e/main-loop.spec.ts`: an owner enters and submits, a reviewer sends back, the owner fixes and resubmits,
  the reviewer approves, the Head traces the figure, and an owner imports a plant's file.
- `e2e/ux-fixes.spec.ts`: one check per fix from the UX review (`docs/UX-REVIEW.md`).

Against a deployed app: `E2E_BASE_URL=https://<your-app>.vercel.app npm run test:e2e`, with `DATABASE_URL` set to
that app's database. See `docs/DEPLOY.md`.

## Scripts

| Script | What it does |
|---|---|
| `npm run dev` | Development server |
| `npm run build`, `npm start` | Production build, and serve it |
| `npm run typecheck` | TypeScript |
| `npm run lint` / `npm run format` | Biome: check / fix |
| `npm test` | Vitest |
| `npm run test:e2e` | Playwright |
| `npm run db:push` | Apply `prisma/schema.prisma` (there are no migration files) |
| `npm run db:seed` | Sample data; safe to run again |
| `npm run db:studio` | Browse the database |
| `npm run db:reset-demo` | List months with their IDs; `-- --confirm <id> <id>` deletes exactly those. Local only |

## Where things are

| Path | What's in it |
|---|---|
| `src/pages` | Screens |
| `src/components` | UI; shared pieces in `src/components/ui` |
| `src/server/api/routers` | tRPC routers: input and output schemas, role checks |
| `src/server/services` | The logic and database access |
| `src/lib` | Shared by browser and server: units, emission factors, CO2, checks, permissions, the status workflow, import parsing |
| `src/config` | Settings: items, check ranges, import aliases, the first reporting month |
| `prisma` | Schema, seed and demo months |
| `tests`, `e2e` | Vitest and Playwright |
| `samples` | The monthly files plants send today |
| `docs` | Brief, plan, decisions, UX review, incidents, deploy steps |
| `WRITEUP.md` | What was built, the decisions, what's next, and how AI was used |

## Deploy

Vercel with Neon. `docs/DEPLOY.md` has the exact steps and the two environment variables.
