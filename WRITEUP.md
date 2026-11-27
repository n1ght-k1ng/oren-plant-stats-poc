# Write-up: monthly plant data v1

## What I built

Plants enter each month's fuel, power and clinker, typed into a form or imported from their own CSV or pasted
Excel cells. A reviewer approves or sends it back. The Head of Sustainability sees approved Scope 1 and 2 CO2 by
plant and quarter, and each figure opens an audit trail back to what the plant typed. The import reads the three
sample files as they are, asks when it isn't sure, and never submits. It's Next.js, tRPC and Prisma on Neon
Postgres, set up for Vercel.

## Key decisions, and why

All are numbered in [DECISIONS.md](docs/DECISIONS.md). The main ones:

- **Exact decimals for quantities and CO2 (N1),** because these figures go to a board and an auditor.
- **The form is the source of truth; import only fills it (D1, D2, D9).** One set of checks, however data arrives.
- **Checks warn, never block (D7).** Approving a flagged month needs a comment saying why.
- **Submissions and approvals are frozen with the factor used (F1 to F3),** so a factor change never rewrites
  history.
- **The dashboard counts approved months only (O6, V1).** Other months show their status, never a zero.
- **No one reviews their own plant (O5, U3).**

## What I left out, and what's next

Left out ([DECISIONS §4](docs/DECISIONS.md#4-left-out-of-v1)): reading `.xlsx` directly, alerts, a settings
screen for check ranges, recalculating approved months when factors change, and line comments. Next: alerts,
per-plant ranges the Head can tune, "cement produced" for grinding-unit checks, and the form on phones.

**Open product question:** optional items can be ticked N/A, or left blank and confirmed as "not used this month"
([UX review U8](docs/UX-REVIEW.md)). The wording is now consistent, but I kept the tick box, because removing it
changes how plants enter data. I'd like the sustainability team's view.

**Known issue:** `npm audit` flags critical advisories in Next.js 14.2.35, the last 14.x release.

- As a mitigation, I switched off the image optimizer, which the app never used and which two of them target.
- The major upgrade to Next.js 15.5 or later is next on the list.

## How I know it works

- **Hand-checked CO2.** Claude Code produced a hand calculation for P01 and P04 before writing the CO2 code; I
  checked each figure independently, and they became fixed test cases.
- **394 unit and API tests** against a real Postgres: workflow, roles, company scoping, units, checks, and each
  sample file's import.
- **22 end-to-end tests** through the real screens: the submit, send back, approve and trace loop, an import, and
  each UX fix. They pass locally and against the production build on Neon.
- **A harsh [UX review](docs/UX-REVIEW.md)** on laptop and phone. I made twelve fixes, each with a test, and for
  six I confirmed the test fails when the fix is undone.

## How I used AI

Claude Code wrote most of the code and docs. I made the decisions, reviewed each step, and corrected it. Three of
these corrections are written up in [INCIDENTS.md](docs/INCIDENTS.md).

- **Float vs Decimal.** Its first schema used `Float`. I insisted on exact decimals (N1).
- **Deleted drafts.** Asked to clear its test months, it deleted every month, including two drafts that weren't
  its own. The reset script now only lists, and deletes only IDs I approve. It had also once run
  `--accept-data-loss` without asking.
- **The lint slip.** A cropped `tail -1` made a lint error look like a pass. Each check now runs alone and must
  say it passed.
- **Orphaned servers.** Servers reported as stopped kept running and helped exhaust memory. It now confirms each
  process is gone by PID.
- **Partial test runs.** Running only new checks let two commits break existing tests. The full suite now runs
  before every commit.

What worked: numbered decisions before code, a hard review of its own work, and every broken rule recorded in
`CLAUDE.md` for the next session.
