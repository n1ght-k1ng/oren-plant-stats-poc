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
