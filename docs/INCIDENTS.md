# Incidents

## 2026-11-26: two drafts deleted while clearing test months

**Where:** the local development database (`plant_data` on this machine). Nothing deployed was affected.

### What happened
- At about 14:00 IST, you approved removing Claude's test months from the app database and asked for a script to clear report data locally.
- Claude wrote `db:reset-demo` and ran it straight away. The script deleted every month in the database (`deleteMany({})`). It had no way to list what it would delete first.
- It deleted 4 months, 2 review events and 4 change-log entries:

  | Month | Status | From |
  |---|---|---|
  | P01 August 2026 | Submitted | Claude's testing |
  | P01 September 2026 | Submitted | Claude's testing |
  | **P01 June 2026** | **Draft** | **Not Claude's testing; probably yours** |
  | **P05 October 2026** | **Draft** | **Not Claude's testing; probably yours** |

- The two drafts weren't part of the approval. There was no backup, so they could not be restored.
- The `before` listing in the same command showed all four months. Claude still deleted them without stopping, and only told you afterwards.

### Why the rule didn't catch it
- **The rule only asked whether to ask.** `CLAUDE.md` said: never drop or reset data without asking first. You had asked for the test months to be removed, so the run looked approved. Nothing required checking **what** the command would delete against **what** was approved.
- **The script deleted everything by default.** Listing was not a step on the way to deleting. `--dry-run` was added after the run.
- **The fix still relied on memory.** Afterwards, `CLAUDE.md` gained "list exactly what will go first" and the script gained `--dry-run`. Running the script without the flag still deleted every month, so one missed step would repeat the incident.

### What we changed
- **Listing is the default.** `npm run db:reset-demo` lists each month with its ID, company, plant, status, who opened it, and its review history. It deletes nothing. `--dry-run` still works and also deletes nothing.
- **Deleting names each month.** `--confirm <id> <id>` deletes exactly those months, with their lines, uploads, review events, approvals and change-log entries. Without `--confirm`, or without IDs, nothing is deleted. If any ID is not found, nothing is deleted.
- **Wiping everything is separate.** `--all` lists every month and deletes only after "yes" is typed at a terminal. Piped input is refused before the script connects to the database, so no script or agent can answer for you. It can't be combined with `--confirm` or IDs.
- **Still local only.** Any database not on this machine is refused unless `--not-local` is given, which needs your OK first.
- **Tests.** `tests/reset-demo.test.ts` runs the real script against a test company's months:
  - Without `--confirm`, nothing is deleted.
  - With `--dry-run`, or with IDs but no `--confirm`, nothing is deleted.
  - `--confirm` without IDs, or with an unknown ID, deletes nothing.
  - `--confirm <id>` deletes only that month.
  - A piped "yes" to `--all` is refused.
  - A remote database is refused.
- **`CLAUDE.md` rule.** Show the user the list, wait for their yes, then delete by ID. Claude never uses `--all`.

## 2026-11-26: a commit that passed "all checks" had a lint error

**Where:** commit `081e7bd` (step 4.1, import parsing). Nothing was deployed. Fixed in `b05f4b3` a few minutes later.

### What happened
- Claude ran the tests, then lint and the commit in a single command. Lint's output was cut to its last line with `tail -1`.
- Biome prints its summary, then a blank line, then the error marker. `tail -1` showed only the blank line, so the lint failure looked like nothing at all.
- The commit went in with one lint error: a helper named `escape`, which shadows a global.
- It was caught a step later, when lint was run on its own before the next change and printed `Found 1 error`.

### Why it looked green
- **An empty line was read as a pass.** The check didn't say "no errors"; it said nothing, and nothing was taken as success.
- **Commands were chained.** Tests, lint and `git commit` ran in one go, so a failing check couldn't stop the commit, and its result had to be read from a cropped transcript.
- **The tests were green.** That made a quiet lint result easy to accept without looking.

### What we changed
- **Each check runs as its own command,** and its result is read before the next: tests, then `npm run typecheck`, then `npx biome check .`, then the commit.
- **A pass must say it passed.** Typecheck is reported as a count of `error TS` lines ("typecheck errors: 0"), and lint must show "No fixes applied" or "Checked N files" with no "Found" line. Blank or cropped output counts as not checked.
- **The slip stays in the history.** The fix is its own commit, not an amend, and its message says what happened.

## 2026-11-26: dev servers reported "stopped" were still running

**Where:** this machine. Nothing deployed was affected. Found at about 17:15 IST, after Docker Desktop was killed for lack of memory.

### What happened
- Claude restarted the local dev server twice: once after the schema change (about 11:30), and once when a stale build cache broke the dashboard page (about 16:00).
- Each time it ran `kill <pid>` on the `next-server` process and reported it "stopped", having checked only that port 3000 was free.
- **Neither process had exited.** `next-server` ignored the plain `kill` (SIGTERM) after giving up its port. Two orphaned servers kept running, for 6½ and 3½ hours, holding about 1 GB between them.
- At 17:13 the machine ran out of memory, and the system killed Docker Desktop. Taking down the local database, and with it the app, the tests and the UX review run. The orphans were one of several causes, alongside Docker's containers, a second dev server for the review, and repeated headless Chrome launches.

### Why it looked done
- **The wrong thing was checked.** "Port 3000 is free" was taken as "the process is gone". A server can release its port and keep running.
- **The command's own output was trusted.** The script printed "stopped" because `kill` returned without error, not because anything was confirmed.

### What we changed
- **After stopping any process, confirm it is gone** by its PID (`ps -p <pid>`). If it is still there a few seconds after SIGTERM, use SIGKILL, check again, and only then report it stopped.
- **Before starting a server, list what is already running** (`ps` for `next-server`, with each process's folder and port), so earlier orphans are caught.
- **Both orphans were stopped with SIGKILL and confirmed gone.** Only one dev server now runs.

## 2026-11-26: two commits ran only their own tests and broke existing ones

**Where:** commits `b37080f` (U1) and `3b23a3e` (U23), during the UX fixes. Nothing was deployed. Fixed in `e32b46a` and `a724a13`.

### What happened
- For each UX fix, Claude ran the new Playwright check for that fix, the unit tests it thought were related, typecheck and lint, and then committed. It didn't run the whole unit suite or the whole e2e suite.
- **U1** sent each role to its own starting page. The main-loop e2e test's sign-in step still waited for `/plants`, so all six main-loop steps stopped at the first. Only the new `ux-fixes` checks had been run.
- **U23** added a `reopened` field to each month in the owner's list. `tests/month.test.ts` compared the old shape exactly, so it failed. Only the review and dashboard tests had been run.
- The breaks went unnoticed for 13 more commits after U1 and 11 after U23. They were found only at the full run at the end (1 of 394 unit tests and 2 of 22 e2e tests failing).
- The same full run showed the new U38b check depended on which months other tests had created, so it could fail in a full run while passing alone.

### Why it looked green
- **The checks that ran were green.** Each commit message listed passing tests, but they were the tests for the change, not for everything the change touched.
- **Nothing required the full suite.** You had asked for it before, but it wasn't written into `CLAUDE.md`, so it was missed.
- **The e2e suite is slow** (about two minutes), which made running only the new check tempting.

### What we changed
- **`CLAUDE.md` rule** (`df4cd40`): before every commit, run the full suite: `npm test` against the test database, `npm run typecheck`, `npm run lint`, and `npm run test:e2e` when a page, flow or e2e file changed. Each runs as its own command, and a pass must say it passed.
- **The two breaks were fixed in their own commits** (`e32b46a`, `a724a13`), with messages saying what had been missed. The U38b check now opens its starting quarter by address, so it doesn't depend on other tests.
- Every commit since has run the full suite first.
