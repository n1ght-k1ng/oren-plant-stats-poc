# Plan: monthly plant data v1

Build order for the decisions in `docs/DECISIONS.md`. References such as (O5) point to decisions.

**Every step is marked as one of:**
- **MUST**: v1 cannot ship without it.
- **STRETCH**: built only after every MUST step is done.

**Sizes are rough estimates of focused work:**
- **S**: up to 1 hour.
- **M**: 1 to 2 hours.
- **L**: 2 to 3 hours.

**How the work runs:**
- Steps are done in the order of this file.
- If a step turns out bigger than its size, stop and re-plan before going on.
- **If import turns out heavy:** cut it to paste-only, with no file upload, and say so. Nothing else is cut for it.
- After each step's tests pass, show the diff summary, then commit with a conventional commit message.
- Never commit secrets or `.env` files.

**Every step is done only when all of these are true:**
- `npm run typecheck` and `npm run lint` pass.
- `npm test` passes against the test database (never the app's).
- The step's own tests exist, and at least one of them fails without the change.
- `docs/DECISIONS.md` is updated if the step changed a decision.
- The step is committed on its own, with the decision numbers in the commit message.

Server tests call the API with `callerFor(user)` (from `tests/helpers.ts`). Each test file creates its own company and deletes it at the end.

---

## Phase 0: Housekeeping

| Step | | Size |
|---|---|---|
| 0.1 First commit: the starter exactly as given (README instruction), apart from the move from `starter/` to the root, which is already done. Not the fix, not the docs. | MUST | S |
| 0.2 Commit the plant-list company fix and its two tests on their own. | MUST | S |
| 0.3 Commit `CLAUDE.md`, `docs/DECISIONS.md` and this plan. | MUST | S |
| 0.4 Test database: document `plant_data_test` locally, and a separate Neon branch for the deployed tests. Included in the 0.3 commit. | MUST | S |

## Phase 1: Schema and state machine, tests first

**1.1 Schema** (P1, C1). **MUST, M**
- Add `MonthlyReport`, `ReportLine`, `Upload`, `ReviewEvent` and `PlantCapacity`, plus the approval snapshot fields and the frozen flags on submission (U2).
- Every table has `companyId`.
- `MonthlyReport` is unique per plant and month.
- Line state is an enum: `VALUE`, `NA`, `NOT_ENTERED`.
- Status is an enum: `DRAFT`, `SUBMITTED`, `RETURNED`, `APPROVED`.
- `ReviewEvent` stores the role the person acted in.
- `PlantCapacity` is unique per plant and `effectiveFrom`.
- *Tests:*
  - A second report for the same plant and month fails.
  - Deleting a company removes its reports, lines, uploads, events and capacity rows.

**1.2 Periods** (O7). **MUST, S**
- A pure module covering the `YYYY-MM` format, whether a month has ended, the earliest month (`2026-04`), the Indian financial-year quarter, and the number of days in a month.
- *Tests:*
  - October 2026 is Q3 FY 2026-27, and March 2027 is Q4 FY 2026-27.
  - The current month and March 2026 cannot be opened.
  - February 2028 has 29 days.

**1.3 State machine as a pure function** (O1, O2, O12, U6). **MUST, M**
- It takes the status, action, actor and comment, plus whether the month has flags. It returns the new status or a named error.
- *Tests (a table of cases):*
  - Every allowed transition succeeds, and every other transition fails.
  - `reopen` goes to RETURNED.
  - `sendBack` and `reopen` without a comment fail.
  - `approve` without a comment succeeds when there are no flags and **fails when there are flags**.

**1.4 Permissions as a pure function** (O4, O5, U3, U4). **MUST, M**
- It takes the user, the plant's data owners and company, and the action, and returns allowed or a reason.
- *Tests:*
  - A reviewer cannot act on another company's plant.
  - Priya can neither approve nor send back P05. Vikram can do both.
  - Meera can approve and send back, and the role recorded is `SUSTAINABILITY_HEAD`.
  - Only Meera can reopen.
  - A data owner cannot submit a plant they don't own, and a plant with two owners (P05) accepts either.

**1.5 Capacity history** (C1). **MUST, S**
- Add a `capacityFor(plant, month)` lookup.
- `updatePlant` writes a history row whenever the capacity changes, in the same transaction. It is effective from the current month until step 1.6 adds the month field.
- The seed adds rows for every plant, and P06 changes in `2026-10` (A8).
- *Tests:*
  - P06 has 2.5 Mt in September 2026 and 3.0 Mt in October.
  - A month before the first row returns no capacity.
  - Editing capacity writes both the history row and the `ChangeLog` entry.

**1.6 "Effective from" month in the plant edit dialog** (C1). **STRETCH, S**

## Phase 2: Items, units, checks and CO2, pure functions

| Step | | Size |
|---|---|---|
| 2.1 **Item catalogue in config** (D3, P4, U1): each item's canonical unit, the units the form offers, its factor, and whether it is expected or optional for each plant type. *Tests:* each canonical unit equals its factor's unit. `Mt` is offered for no item. A grinding unit's clinker is fixed N/A. | MUST | S |
| 2.2 **Number parsing** (D11, P3). *Tests:* `35000`, `11,000`, `1,23,00,000` and `1,500.25` parse. `N/A` and `n/a` become N/A, and a blank becomes not entered. `-5`, `abc`, `1,2,3,4` and more than 3 decimal places are rejected. | MUST | S |
| 2.3 **Unit aliases and conversion** (D5, D12, D13). *Tests:* `MT` becomes `t` and never `Mt`. 95 `KL` is 95,000 L. `1,23,00,000` kWh is 12,300 MWh. A mass unit on diesel is rejected. An unknown unit is reported as unmatched. | MUST | S |
| 2.4 **Plausibility checks** (P5, P7, C1), with ranges in config. *Tests:* P01's October data gives two flags and P04's gives none. Clinker is checked against the capacity in effect that month, with days ÷ 365, and with no capacity on record the check is skipped. A change of more than 30% is flagged, and a first month is not. Coal at a grinding unit is flagged, and so is an expected item marked N/A. N/A and not entered never cause errors. | MUST | M |
| 2.5 **CO2 calculation** (O3). *Tests:* P04's October power is 8,302.5 t in Scope 2. Diesel and clinker count as Scope 1. N/A and not entered count as nothing. | MUST | S |

## Phase 3: Flows 1 to 4

**3.1 Open and save a month** (Flow 1, P1). **MUST, M**
- Saving uses the version check. Each line keeps its entered value and unit and its canonical value, and writes to `ChangeLog`.
- *Tests:*
  - Opening twice gives the same report.
  - A stale version is rejected.
  - A user from another company gets NOT_FOUND.
  - Not entered never becomes 0.

**3.2 Submit** (Flow 1, P4, U2). **MUST, S**
- Expected items must be a value or N/A, and each blank optional item must be confirmed as not used.
- Flags are frozen on submission.
- *Tests:*
  - A blank expected item blocks submission and is named.
  - An unconfirmed optional item blocks submission.
  - Confirmed items are stored as N/A with the reason "not used this month".
  - The frozen flags equal the live flags at that moment.

**3.3 Data owner screens.** **MUST, L**
- My months with their status, and the month form with per-item units, notes, live flags, and save and return later.
- The submit dialog with one-click confirmations, and a read-only view once submitted.
- *Check:* go through Flow 1 by hand as Ravi Meena.

**3.3b A friendly message when someone else saved first.** **STRETCH, S**
- The server already rejects the stale save (3.1). This only improves the message and adds a reload.

**3.4 Review on the server** (Flow 2, O3, O4, U3, U4, U6). **MUST, M**
- `queue`, `approve` and `sendBack`.
- Approving stores the factor snapshot, the CO2 and the flagged-approval comment.
- *Tests:*
  - The 1.3 and 1.4 cases, run again through the real API.
  - The queue shows only the reviewer's own company.
  - Changing a factor after approval does not change approved CO2.

**3.5 Reviewer screens.** **MUST, M**
- A queue with flagged months first, and months the reviewer can't act on marked "Another reviewer must review this".
- A month view with values, notes, frozen flags, an estimate labelled "Not approved", and Approve and Send back. The comment box becomes required when the month has flags.
- *Check:* go through Flow 2 as Vikram Joshi, and check that Priya sees P05 marked for another reviewer.

**3.5b The previous month's values beside each line** in the reviewer view. **MUST, S**
- The 30% check (2.4) already loads the last approved month, so this only shows it.

**3.6 Fix and resubmit** (Flow 3). **MUST, S**
- *Test:* the full cycle (submit, send back, edit, resubmit, approve), with the history showing every step in order.

**3.7 Reopen** (O2). **MUST, S**
- *Tests:*
  - Only Meera can reopen, and only with a reason.
  - The month goes back to RETURNED and drops out of the approved totals.
  - The earlier snapshot can still be read.

**3.8 Month history screen** (H1, core). **MUST, M**
- Every value as entered and as converted, and every line change with who and when.
- Every status change with its comment and role, flagged-approval explanations, the factors used, and links to uploads.
- *Test:* the server query returns all of these for a month that has been approved, reopened and approved again.

## Phase 4: Import, which only fills in the form

| Step | | Size |
|---|---|---|
| 4.1 **Header detection and row mapping** (D10, D12, D13). *Tests:* all three files in `samples/` and a tab-separated paste. P04's header is found on line 4 and P08's on line 3. `Grid electicity` is matched. `N/A` becomes N/A. P08's blank clinker unit is reported. A file with no header row gives a clear error. | MUST | M |
| 4.2 **Upload and store** (D14, D16, O11). *Tests:* the stored text matches the input exactly. Anything over 1 MB is rejected. The plant and month in the file are ignored. | MUST | S |
| 4.3 **Preview and merge** (D9, O10). *Tests:* importing into a month with values changes nothing until the owner picks for each field. Import never changes the status. Imported lines record the upload id. | MUST | M |
| 4.4 **Import screens:** upload or paste, then the preview with unmatched rows, then the filled-in form. *Check:* import each sample as its plant's owner. | MUST | M |

## Phase 5: Meera's dashboard, Flow 4

| Step | | Size |
|---|---|---|
| 5.1 **Server figures** (O6, O7): statuses by plant and month, and approved CO2 by plant and for the company, Scope 1 and Scope 2 apart, by financial-year quarter. Each total gives its coverage, for example "7 of 9 plants fully approved". *Tests:* a submitted month adds nothing, a reopened month drops out, another company never appears, and the coverage counts are right. | MUST | M |
| 5.2 **Dashboard screen:** a status grid, quarter totals, and links to each month's history. *Check:* no number comes from a month that isn't approved. | MUST | M |
| 5.3 **CO2 broken down by month** within a quarter. | STRETCH | S |

## Phase 6: Demo data

| Step | | Size |
|---|---|---|
| 6.1 **Seed months covering every status:** approved (one approved with flags and a comment), submitted, returned with a comment, and reopened. Built with the app's own services, so the history is real. | MUST | M |

## Phase 7: Deploy, end-to-end tests and write-up

| Step | | Size |
|---|---|---|
| 7.1 **Playwright** (E1): Flows 1 to 4 through the user switcher, using the existing `data-testid`s, plus one import. Runs locally against `npm run dev` and, with a base-URL setting, against the deployed URL. The tests create their own month on a plant the seed leaves empty, so they don't disturb the demo data. | MUST | M |
| 7.2 **Deploy:** a Neon production database, a separate Neon branch for tests, Vercel with `DATABASE_URL` and `DIRECT_URL`, then `db:push` and `db:seed` against production. | MUST | S |
| 7.3 **Run Playwright against the live URL**, and go through each flow by hand as each sample user. | MUST | S |
| 7.4 **Write-up:** what was built, the decisions (pointing to `DECISIONS.md`), what was left out and what's next (section 4 there), how we know it works, and how AI was used, including one place it was wrong and how that was caught. | MUST | M |

---

## MUST steps at a glance

0.1 to 0.4 · 1.1 to 1.5 · 2.1 to 2.5 · 3.1 to 3.8, including 3.5b · 4.1 to 4.4 (paste-only if import is heavy) · 5.1 and 5.2 · 6.1 · 7.1 to 7.4

STRETCH, in the order to pick them up: 3.3b, 1.6, 5.3.
