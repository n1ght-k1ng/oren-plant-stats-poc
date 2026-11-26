# Decisions: monthly plant data v1

How v1 turns the brief (`docs/BRIEF.md`) into a product. Each entry has a status:

- **DECIDED**: agreed. Build to it.
- **PROPOSED**: a recommendation not yet approved. Do not build until it is.
- **ASSUMPTION**: something we cannot confirm from the brief or the samples. Stated in the write-up.

Entries keep their numbers so that commits, tests and the write-up can refer to them (for example "O5"). When something changes, update the entry in place; do not delete it.

---

## 1. What the starter already gives us (checked)

| Question | Answer | Where |
|---|---|---|
| Does a plant have a type? | Yes. `Plant.type` is required, with values `INTEGRATED` or `GRINDING_UNIT`. Nimbus has 6 integrated plants and 3 grinding units. | `prisma/schema.prisma:34-36`, `:46`; `src/lib/schemas/plant.ts:3` |
| Is capacity annual or monthly? | **Annual**, in tonnes of **cement** a year. It can be edited, and edits are recorded in the plant's history. | `prisma/schema.prisma:47` (`cementCapacityTpa`); `src/components/plants/capacity.ts:4`; `prisma/seed.ts:153` |
| Does capacity have effective dates? | **No.** Only the current value is stored. P06's expansion is one `ChangeLog` row, `{cementCapacityTpa: {from: 2500000, to: 3000000}}`, dated when the seed ran, not when the expansion took effect. See C1. | `prisma/schema.prisma:47`; `prisma/seed.ts:173-191`; `prisma/schema.prisma:69` |
| What units exist? | `kg`, `t` (tonnes), `Mt` (million tonnes), `L`, `kL`, `kWh`, `MWh`. Three dimensions: mass, volume, energy. | `src/lib/units.ts:10-18` |
| Does `Mt` mean million tonnes? | **Yes**: `toBase: 1_000_000_000` (base unit is kg). | `src/lib/units.ts:13` |
| How are units matched today? | They are not matched against outside input anywhere. `isUnit` is an exact, case-sensitive key lookup, used only in a test. Lower-casing would turn `MT` (tonnes) into `Mt` (million tonnes). | `src/lib/units.ts:22-24` |
| What unit does each factor apply to? | Coal, petroleum coke, furnace oil and clinker: `t`. Diesel: `L`. Grid electricity: `MWh`. | `src/lib/factors.ts:19,27,35,43,51,59` |
| Is there anywhere to store monthly data? | No. | `prisma/schema.prisma` |
| Is there an audit trail to build on? | Yes. `ChangeLog` records who changed which fields from what to what, scoped by company. | `src/server/helpers/changeLog.ts` |

---

## 2. Decided

### Entry and data

**D1. One data model, two ways in.** A plant's month is one record with one line per item. Both the form and the import write to it. **DECIDED**

**D2. The form is the source of truth.** Import only fills in the form. **DECIDED**

**D3. Expected items come from config, by plant type.** The lists are in P4. **DECIDED**

**D4. Every line has an explicit state.**
- Each item is a **value**, **N/A** or **not entered**.
- "Not entered" is never stored or shown as 0. Zero is a real value someone typed.

**DECIDED**

**D5. One canonical unit per item.**
- Each item is stored in the unit its emission factor uses: coal, petroleum coke, furnace oil and clinker in `t`, diesel in `L`, grid electricity in `MWh`.
- Every value is converted to that unit on entry.

**DECIDED**

**D6. Optional note on every line.** **DECIDED**

**D7. Plausibility checks warn and never block.** They compare a month against ranges in config and produce flags that reviewers see. A flag never stops a save, a submission or an approval. **DECIDED**

### Import

**D8. Import accepts a CSV upload, or cells pasted from Excel (tab-separated).** **DECIDED**

**D9. Import fills in the form but never submits it.** **DECIDED**

**D10. Import finds the header row and never assumes positions.** **DECIDED**

**D11. Import uses a real CSV parser.**
- It handles quoted fields and commas inside quotes.
- Numbers may be plain (`35000`), Western-grouped (`11,000`) or Indian-grouped (`1,23,00,000`).

**DECIDED**

**D12. Item and unit aliases live in config.**
- Items: `HSD` → diesel, `Pet Coke` → petroleum coke, known misspellings such as `Grid electicity` → grid electricity.
- Units: `MT` → `t`, `KL` → `kL`.
- Values are then converted to the canonical unit.

**DECIDED**

**D13. Import handles awkward values explicitly.**
- `MT` means metric tonnes.
- `N/A` becomes the N/A state.
- A blank quantity becomes not entered.
- A row or unit it cannot match is shown as unmatched and never guessed.

**DECIDED**

**D14. Plant and month come from the signed-in user, never from the file.** **DECIDED**

**D15. Audit trail.** Every line edit, status change and comment is recorded with who did it, when, and the old and new values. **DECIDED**

**D16. Keep the original upload, exactly as received,** linked to the month and the user who uploaded it. **DECIDED**

### Approved from the proposals

**P1. Tables.** **DECIDED**
- **MonthlyReport**: one per plant and month. Holds company, plant, the month (`YYYY-MM`), status, and a version number that stops two people saving over each other.
- **ReportLine**: holds the item, its state, the canonical value and unit, and the value and unit **as entered** (for example `95` `KL`). Also holds the note and where the value came from (form, or import with the upload id).
- **Upload**: the raw text, the filename, who uploaded it, when, and how each row was matched.
- **ReviewEvent**: every status change, with who, when, the role they acted in (O5), and a comment.
- **PlantCapacity**: capacity history with effective months (C1).
- **Approval snapshot**: for each line, the factor used (key, kg CO2 per unit, source) and the CO2, split into Scope 1 and Scope 2. See O3.
- Line edits also go to the existing `ChangeLog`.
- Every table has `companyId`, and every query is scoped with `companyScope`.

**P3. Number input.** **DECIDED**
- The form accepts the same number styles as import and shows values back in Indian grouping.
- Up to 3 decimal places. Negative values are rejected.
- **Validation** (not a number, negative, or the wrong kind of unit) blocks saving that line.
- Validation is separate from plausibility checks (D7), which never block.

**P4. Items per plant type.** **DECIDED**

| Item | Integrated | Grinding unit |
|---|---|---|
| Coal | Expected | Optional |
| Petroleum coke | Expected | Optional |
| Furnace oil | **Optional** | Expected |
| Diesel | Expected | Expected |
| Grid electricity | Expected | Expected |
| Clinker produced | Expected | Fixed N/A (a grinding unit makes no clinker) |

- **Expected** items must be a value or N/A before submission.
- **Optional** items that are blank are **never treated as 0**.
- On submission, the data owner confirms each blank optional item as "Not used this month" with one click. That stores it as N/A with the reason "not used this month", recorded in the audit trail.
- Submission waits until every blank optional item is confirmed, so nothing is left blank silently.

### Approved open decisions

**O1. Month status.** **DECIDED**
```
(none) --open--> DRAFT --submit--> SUBMITTED --approve--> APPROVED
                   ^                   |                      |
                   |              send back                reopen
                   |          (comment required)   (Head only, reason required)
                   |                   v                      |
                   +---- edit ---- RETURNED <-----------------+
                                       |
                                       +--submit--> SUBMITTED
```
- A month has no record until its data owner first opens it. Meera's view shows that as "Not started".
- Only months that have ended can be opened, from April 2026 onwards.
- RETURNED can be edited like DRAFT, and shows the latest comment at the top.
- While SUBMITTED, nobody changes values. The reviewer only approves or sends back.
- A data owner cannot take back a submission in v1.
- The server enforces every transition; the screens only reflect what the server allows.

**O2. Reopening an approved month.** **DECIDED**
- Only the Head of Sustainability can reopen an approved month, and must give a reason.
- It goes back to the data owner as **RETURNED**, not DRAFT, so the reason is shown.
- It **drops out of Meera's figures** until it is approved again.
- The earlier approved versions, with their figures and factors, stay in the history.

**O3. Recording the factors used at approval.** **DECIDED**
- On approval, store each line's factor value, unit, source, and resulting CO2 (P1).
- Approved figures are calculated from those stored values only. A later factor change does not move them.
- Recalculating approved months with new factors is out of scope for v1.
- While a month is not approved, the data owner and reviewer see an estimate with current factors on that month's screen, labelled "Not approved". Meera's dashboard never shows it (O6).

**O4. Who can review which plant.** **DECIDED**
- Any reviewer can review any plant **in their own company**.
- There are no assignments.

**O5. Reviewing your own data.** **DECIDED**
- Nobody can approve a month for a plant they are a data owner of, whatever roles they hold. So Priya Nair cannot approve P05.
- The Head of Sustainability **may approve**. The approval is recorded with the role it was done in (`SUSTAINABILITY_HEAD`), so it is clear Meera approved as Head and not as a reviewer.
- **Enforced on the server**, with tests. The screens only reflect it.
- Months someone is not allowed to approve still appear in their queue, marked "Another reviewer must approve this", so nothing waits unseen.

**O6. Meera's view of months that are not approved.** **DECIDED**
- A grid of plants by month, with each cell showing its status.
- CO2 figures, by plant and for the company, with Scope 1 and Scope 2 apart, **include approved months only**.
- Months that are not approved show their status and never a number.
- A total with missing months says so, for example "Q3 FY 2026-27: 7 of 9 plants fully approved". It never estimates the missing months.

**O7. Periods.** **DECIDED**
- Months are stored as `YYYY-MM`.
- Reports use Indian financial-year quarters, April to March. October 2026 is in Q3 FY 2026-27.
- Months can be entered from April 2026. That month is set as `FIRST_REPORTING_PERIOD` in `src/config/reporting.ts`, so older months can be opened or seeded later by changing one setting.

**O8. More than one data owner per plant.** **DECIDED**
- Any owner of the plant may edit and submit.
- The version check stops silent overwrites.
- **ASSUMPTION:** the seed data (P05 has two owners) overrides the brief's "one person per plant".

**O10. Import into a form that already has values.** **DECIDED**
- For each field, show the existing value next to the imported value, and the data owner picks one.
- **Never overwrite silently.**
- The upload is stored either way.

**O11. Uploads are stored in Postgres, capped at 1 MB.** **DECIDED**

**O12. Comments.** **DECIDED**
- Required when sending back and when reopening.
- Optional when approving a month with no flags.
- **Required when approving a month that has flags.** The comment explains why the flagged values were accepted. It is stored with the approval and shown in the month history (3.8 in the plan). Enforced on the server.

### Plausibility checks: config values, warn only

**P5. Integrated plants.** Every value below is an **ASSUMPTION**. They are starting points, not Nimbus's history, and live in config by plant type with optional per-plant overrides. **DECIDED** (accepted as config).

| Check | Warn outside | Reasoning | Samples |
|---|---|---|---|
| Kiln fuel energy per tonne of clinker: (coal × 25.8 + petroleum coke × 32.5 + furnace oil × 40.4) GJ ÷ clinker t | 2.8 to 3.9 GJ/t | A modern dry-process kiln uses about 3.0 to 3.6 GJ/t. The energy values are the IPCC values cited in `src/lib/factors.ts`. Comparing energy means switching fuels does not cause false flags. Diesel is left out because it goes to vehicles and generators. | P01 **4.0, flagged**. P04 3.3. |
| Grid electricity per tonne of clinker | 60 to 130 kWh/t | A whole plant uses about 80 to 110 kWh per tonne of clinker. A plant with its own power station buys far less and should get a per-plant override, not a wider range. | P01 **15.7, flagged**. P04 121. |
| Diesel per tonne of clinker | 0.1 to 2.0 L/t | Mining vehicles and standby generators. Low confidence, so a wide range. | P01 0.56. P04 0.93. |
| Clinker compared with monthly cement capacity | Above 110% or below 30% | See the note below this table. | P01 84%. P04 48%. |
| Clinker is 0 or N/A while kiln fuel is above 0 | Always flag | Fuel was burned but no clinker was made. | None. |

**Clinker compared with capacity (revised).**
- Capacity is annual cement capacity (section 1), so monthly capacity = `cementCapacityTpa × days in month ÷ 365`. October 2026 for P01 is 4,000,000 × 31 ÷ 365 = 339,726 t, so 285,800 t of clinker is 84%.
- The check compares **clinker** against **cement** capacity because the register has no clinker capacity.
- A tonne of cement contains roughly 0.65 to 0.95 t of clinker, and an integrated plant may also send clinker to grinding units. That is why the upper limit is loose.
- **Use the capacity in effect during the reported month**, not at submission. A late month is then never checked against capacity added after it (C1).
- If no capacity is on record for the month, the check is skipped, with a note on the month. It never guesses.

**Grinding units.**
- Coal or petroleum coke reported at a grinding unit is flagged, because it may have been entered against the wrong plant. **DECIDED** (accepted as config).
- The power-per-capacity check is **dropped** from v1 (see section 4).

**P7. All plants.** **DECIDED** (accepted as config)
- An item that changed by more than 30% from the last approved month is flagged. A plant's first month has nothing to compare against.
- An expected item marked N/A is flagged.

### Already decided as out of scope

**D17.** Not in v1:
- Parsing `.xlsx` files directly.
- Working out the plant or month from the file.
- Submitting automatically.
- Separate factors for each type of coal.

**DECIDED**

---

## 3. Decided after the first review

**U1. Units in the form.** Each item offers only units that make sense for it: diesel in L or kL, grid electricity in kWh or MWh, everything else in t. `Mt` is never offered for monthly data. **DECIDED**

**U2. When flags are calculated.**
- Flags show live while the month is a draft, so the data owner can explain them in a note before submitting.
- On submission, flags are frozen and stored with the month, so the reviewer sees exactly what the data owner saw.

**DECIDED**

**U3. Reviewing your own plant.** Nobody can **approve or send back** a month for a plant they are a data owner of, whatever their roles. This replaces the narrower rule in O5 and is enforced on the server. **DECIDED**

**U4. Meera can send back** a month, with a required comment like anyone else. **DECIDED**

**U5. No comments on single lines in v1.** One comment per action, plus each line's note, covers it. **DECIDED** (see section 4)

**U6. P01 has no override and stays flagged.**
- No per-plant override is invented from one month of data.
- Approving a flagged month requires a comment (O12).

**DECIDED**

**U7. Ranges are changed by a developer through config.** No editing screen in v1. **DECIDED** (see section 4)

**U8. No email or in-app alerts in v1.** Queues and status badges cover the flows. **DECIDED** (see section 4)

**U9. Plant type changes.** A month keeps the expected items it was opened with. Nothing special is built for type changes. **DECIDED** (see section 4)

**C1. Capacity in effect for a month.** **DECIDED** (the smallest fix for the gap in section 1)
- Add a **PlantCapacity** history table: plant, company, `effectiveFrom` (`YYYY-MM`), capacity in tonnes a year, who entered it, and when.
- The capacity for a month is the row with the latest `effectiveFrom` on or before that month.
- `Plant.cementCapacityTpa` stays as the current capacity shown in the register. It always equals the latest row, so the existing register screens do not change.
- **Edit dialog:** when the capacity changes, it asks "Effective from (month)", defaulting to the current month. The edit writes a history row and the existing `ChangeLog` entry in the same transaction.
- **Seed:** every plant gets a row effective `2026-04` at its seeded capacity. P06 gets 2.5 Mt from `2026-04` and 3.0 Mt from **`2026-10`**. **ASSUMPTION:** the seed does not say when P06 expanded, so this is a placeholder. The README, the brief and the seed were checked, and none gives a date; the only mention is the comment at `prisma/seed.ts:173`.
- *Rejected alternative:* take the effective date from the `ChangeLog` timestamp. That is when someone typed the change, so any late or backdated edit would be wrong.
- *Rejected alternative:* add an `effectiveFrom` column to `Plant`. That keeps only one change, so a second expansion would lose the first.

**N1. Quantities and CO2 are exact decimals.** **DECIDED** (a correction)
- **Correction:** the first schema stored quantities and CO2 as `Float`, claiming they were exact at our scale. That was wrong. Binary floating point cannot hold values such as 0.1, and sums across lines drift: in JS, 0.1 + 0.2 is 0.30000000000000004, and a sample month's Scope 1 total came out as 85,252,851.82000001 instead of 85,252,851.82. Board and audit figures cannot carry that.
- **Storage:** every quantity and CO2 column is Prisma `Decimal`. Line values use `Decimal(24, 6)`: entry allows 3 decimal places, and conversion to the canonical unit divides by up to 1,000. CO2 in kg uses `Decimal(30, 8)`: 6 decimal places times a factor with up to 2. Capacity stays a whole number of tonnes (`Int`).
- **Arithmetic:** all of it uses `D` from `src/lib/decimal.ts`, a copy of Prisma's Decimal set to 50 significant digits. The default, 20, rounds even an addition once a total passes about 12 digits before the point. Values are never converted to JS `number` along the way.
- **The API boundary:** quantities cross tRPC as plain decimal strings (`decimalString` in output schemas, `toDecimalString` in services). That was less code than a superjson serializer, which would need registering on both client and server, and the browser receives strings it can show directly.
- **JSON columns** (frozen flags, approval lines) hold numbers as decimal strings too, never JSON numbers.
- **Factors:** today's factors (`src/lib/factors.ts`) are JS numbers with at most 2 decimal places. Turning them into `D` from their written form is exact. Step 2.5 does that, and a test checks it.
- Tested in `tests/decimal.test.ts`, including a database round trip and an exact CO2 sum.

**F1. Each submission's lines are frozen.** **DECIDED**
- Every SUBMIT event stores every line exactly as submitted: state, canonical value and unit, the value and unit as typed, the N/A reason, the note, and the source and upload.
- Flags are frozen the same way (U2).
- The month history can then show exactly what each reviewer saw and what changed between submissions. Later edits never change an earlier submission.
- The shape is `submittedLines` in `src/lib/schemas/report.ts`.

**F2. What each approval line records.** **DECIDED**
- Every approval line stores the item, the canonical value and unit, the factor applied (its key, kg CO2 per unit, source, **year**, and scope), and the resulting kg CO2.
- N/A lines are kept so the approval lists every item, but count nothing.
- The shape is `approvalLines` in `src/lib/schemas/report.ts`. A test checks that the lines add up exactly to the stored Scope 1 and Scope 2 totals.

**F3. Factor years.** **DECIDED**
- `src/lib/factors.ts` has no year field, so step 2.5 adds one to each factor:
  - IPCC fuel factors (coal, petroleum coke, diesel, furnace oil): `2006`.
  - CEA grid factor: `FY 2025-26` (version 22.0, August 2026).
  - GCCA clinker factor: **`version not stated in starter`**. That is all the source says. Nobody should look up or guess a year. It is an open question for the write-up.

**F4. History order.** **DECIDED**
- Each review event has a `sequence` number (1, 2, 3, ...) within its month, unique per month.
- The history is ordered by it, not by timestamp, which can tie within a millisecond.
- It also means two people acting on the same month at the same moment cannot both succeed.
- **Every action carries the month's version as the user loaded it.** If the month changed since, or two events ever claim the same sequence number, the user gets a `CONFLICT` (HTTP 409): "Someone else just updated this month. Please reload to see their changes." Never a server error. Implemented in `src/server/services/transition.ts`.

### Permission rules (step 1.4)

Enforced on the server by `requirePermission` (`src/server/helpers/permissions.ts`), using the pure rules in `src/lib/permissions.ts`. The table uses the seed users, for plant P05, whose data owners are Karthik and Priya. Priya is also a reviewer.

| Action | Ravi (P01 owner) | Karthik (P05 owner) | Priya (P05 owner and reviewer) | Vikram (reviewer) | Meera (Head) | Rohan (Kestrel Head) |
|---|---|---|---|---|---|---|
| View the month | Yes | Yes | Yes | Yes | Yes | Not found |
| Open, edit or submit | No | Yes, as data owner | Yes, as data owner | No | No | Not found |
| Approve or send back | No | No | **No, owns P05** | Yes, as reviewer | Yes, as Head | Not found |
| Reopen | No | No | No | No | Yes, as Head | Not found |

- **Another company's month** comes back as NOT_FOUND, so its existence is never revealed. Every other refusal is FORBIDDEN, with the reason in words.
- For P01, Priya **can** approve, because she owns P05's data, not P01's.

**R1. Viewing.** Anyone in the company can read any of its months, read-only, like the plant register today. **PROPOSED**
- *Alternative:* data owners see only their own plants' months.

**R2. Reopening your own plant.** A Head who is also a data owner of a plant cannot reopen that plant's month, matching U3 for approving. **PROPOSED**
- No seed user is affected: Meera owns no plants.

**R3. Holding both reviewer and Head roles.** That person is recorded as reviewer when approving or sending back, and as Head when reopening. **PROPOSED**
- No seed user holds both.

**R4. What makes someone a data owner of a plant.** Being linked to the plant (`Plant.dataOwners`) lets someone enter and submit, recorded as data owner. Holding the `DATA_OWNER` role without the link does not. **PROPOSED**
- This keeps it to one source of truth: the plant's owner list.

**E1. End-to-end tests.** Playwright runs Flows 1 to 4 through the user switcher, both locally and against the deployed URL. **DECIDED**

**H1. The month history screen is core v1**, not optional. It shows every value as entered and converted, every change, every status change with its comment and role, flagged-approval explanations, and the factors used. **DECIDED**

---

## 4. Left out of v1

- The power-per-capacity check for grinding units. Plants do not report how much cement they made, so the check would rely on capacity and be too weak.
- Adding "cement produced" as an item. It would make grinding-unit checks possible later (was O9).
- Parsing `.xlsx` files directly, working out the plant or month from the file, and submitting automatically (D17).
- Separate factors for each type of coal (D17).
- Recalculating approved months when factors change (O3).
- A data owner taking back a submission (O1).
- Comments on single lines (U5).
- A screen for editing plausibility ranges or per-plant overrides. Developers change them in config (U7).
- Email and in-app alerts (U8).
- Special handling when a plant changes type (U9).

### Next, after v1
- Alerts when a month is submitted, sent back or reopened (U8).
- A screen for the Head of Sustainability to adjust ranges and set per-plant overrides, starting with P01 once Nimbus confirms whether it has its own power plant (U6, U7).
- Adding "cement produced" as an item, so grinding units can have meaningful checks.
- Recalculating approved months when factors change, with the before and after kept for the auditor (O3).

---

## 5. Assumptions for the write-up

- **A1.** All "power purchased" is grid electricity at the grid factor. P04's `Power purchased (TSSPDCL)` may include renewable contracts.
- **A2.** One coal factor and one coal energy value apply to all coal. Indian coal holds less energy than imported coal, so the fuel energy check is approximate.
- **A3.** Diesel covers vehicles and generators, and is all Scope 1.
- **A4.** Clinker CO2 is from calcination only (the GCCA default). Kiln fuel is counted through the fuel lines.
- **A5.** All plausibility ranges (P5, P7) are starting values, not based on Nimbus's history.
- **A6.** The three sample files are all we know about how plants report. Import fails safe: anything it cannot match stays unmatched.
- **A7.** The seed data's two owners for P05 overrides the brief's "one data owner per plant" (O8).
- **A8.** P06's expansion to 3.0 Mt takes effect from October 2026 in the seed data. The starter records when it was typed in, not when it took effect (C1).
- **A9.** A month ends at midnight India Standard Time (UTC+5:30), not UTC. The servers run in UTC, so using UTC would keep October closed for the first 5½ hours of 1 November in India. Implemented in `src/lib/periods.ts`.
