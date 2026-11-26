# UX review: monthly plant data v1

A hard look at the app as each role would use it, before submission. Nothing here has been fixed yet.

## How it was done

- **Data:** a fresh seed (9 Nimbus plants, April to October 2026) in a separate database, `plant_data_ux`, served by a second copy of the app on port 3100, at commit `ffb3188`. The local app and its data were not touched.
- **Tool:** Playwright driving headless Chrome through the real screens, counting clicks, fields typed and screens per task, and checking each page for unlabelled controls, pointer-cursor elements that can't take keyboard focus, sideways overflow and missing headings. Raw notes: [`ux/walkthrough-log.json`](ux/walkthrough-log.json).
- **Screens:** desktop 1440×900, laptop 1366×768, phone 390×844.
- **Contrast:** computed from the colour tokens in `src/styles/globals.css` against WCAG AA (4.5:1 for normal text).
- **Not covered:**
  - **Laptop screenshots for 4 screens and the month form's keyboard walk.** Docker Desktop was killed by the system for lack of memory part-way through ([what happened](#what-stopped-the-run)).
  - **Error and offline states, screen readers, zoom to 200%.**

**Ravi has nothing to do in the demo.** All seven of his months are approved, so he can't start, type or fix anything. His tasks were run as the owners whose October is in each state:
- **Arijit (P09, not started):** typing.
- **Hetal (P07, a draft):** coming back to a draft, and importing.
- **Deepak (P06, sent back):** a sent-back month.

Ravi himself was checked for what he actually sees.

### Severity

| Severity | Meaning |
|---|---|
| **Blocker** | Stops a flow in the brief, or could put a wrong or unapproved figure in front of the board or an auditor. |
| **Major** | A core task is noticeably harder, slower or more confusing than it should be; a reviewer of the submission is likely to hit it. |
| **Minor** | Friction, unclear wording or missing feedback that a user works around. |
| **Polish** | Cosmetic or consistency. |

**There are no blockers.** Every flow in the brief works end to end. Rules such as approved-only totals and no self-review are enforced on the server and held throughout. The problems are about finding work, feedback, wording, phone layout and accessibility.

## Effort per task

| Task | Who | Clicks | Fields | Screens | Verdict |
|---|---|---|---|---|---|
| Sign in and find October | Ravi | 2 | 0 | 3 | Lands on Plants, not on his months (U1) |
| Check October's status later | Ravi | 1 | 0 | 2 | Fine |
| Start October and type it (grinding unit) | Arijit | 5 | 3 | 3 | Fine, with the live conversion shown ([06](ux/06-owner-form-typed.jpg)); long on a phone (U9) |
| Leave and come back to the draft | Arijit | 2 | 0 | 3 | Values return. **Unsaved edits are lost silently** (U5) |
| Submit, confirming unused items | Arijit | 4 | 0 | 2 | Clear dialog |
| Continue a draft, paste from Excel, settle 3 conflicts, save | Hetal | 11 | 1 | 3 | Works; what's blocking is hidden below the fold (U14) |
| Deal with a sent-back month | Deepak | 4 | 1 | 3 | Nothing points him to it (U1, U2) |
| Fix a month Meera reopened (two-owner plant) | Karthik | 4 | 2 | 3 | Says "Sent back", not "Reopened" (U23) |
| Check where October stands (grinding unit) | Sasmita | 2 | 0 | 3 | No "submitted on, waiting since" (U25) |
| See her own months, then her queue | Priya | 3 | 0 | 4 | Own-plant rows mixed into her queue (U36) |
| Approve a clean, imported month | Priya | 3 | 0 | 3 | Can't see that it was imported (U33) |
| Open the queue | Vikram | 1 | 0 | 2 | Lands on Plants first (U1) |
| Review a flagged month, approve with a comment | Vikram | 2 | 1 | 2 | No change column (U32) |
| Send one back | Vikram | 2 | 1 | 2 | Fine |
| Approve the rest (3 months) | Vikram | 2 per month | 1 if flagged | 2 | Briefly shows already-approved months (U29) |
| What can go to the board? | Meera | 1 (+2 for another quarter) | 0 | 2 | Answered in seconds |
| "Where did this number come from?" | Meera | 1 from the dashboard | 0 | 2 | Excellent trace. Getting back loses her quarter (U38) |
| Reopen a month | Meera | 3 minimum (6 as walked) | 1 | 3 | Not offered where the question arises (U39) |

## Data owners

### Finding work

**U1. Everyone lands on Plants.** **Major.** Affects every role, every day.
- Signing in always opens the plant register, the least-used page.
- Deepak's October has been sent back, but his first screen says nothing about it ([02](ux/02-ravi-landing-plants.jpg)).
- Vikram has to find Review, and Meera has to find Dashboard.
- *Fix:* send each role to its own home after sign-in and from `/`: data owners to Monthly data, reviewers to Review, the Head to Dashboard.

**U2. Nothing says "this needs you".** **Major.** Affects data owners and reviewers.
- Monthly data is a flat list of seven months per plant ([03](ux/03-ravi-monthly-data.jpg)).
- A sent-back month is one row among them, marked only by an amber badge.
- There are no counts anywhere: no "Review (5)" and no "1 month to fix".
- *Fix:*
  - Put a "To do" block at the top of Monthly data, listing sent-back months first, then drafts, then ended months not started.
  - Show counts next to Monthly data and Review in the sidebar.

**U3. When there's nothing to do, the page doesn't say so.** **Minor.** Affects data owners.
- Ravi sees seven "Approved / View" rows and must read them all to know he's done. Opening one shows the approved month clearly ([04](ux/04-ravi-october-approved.jpg)).
- *Fix:* a line at the top: "All your months are approved. November opens on 1 December."

**U4. Owners can't see when the next month opens.** **Polish.** Affects data owners.
- Months that haven't ended simply don't appear.
- *Fix:* show the coming month greyed out: "November 2026, opens 1 Dec".

### Entering a month

**U5. Unsaved changes are lost without a word.** **Major.** Affects data owners.
- Typing a figure and then leaving by the back link, the sidebar or the user switcher discards it silently.
- In the walkthrough, 480 became 470 again on return.
- *Fix:* warn before leaving with unsaved changes, both for in-app navigation and on closing the tab. Or save the draft automatically a moment after typing stops.

**U6. Two identical grey buttons, and "All Changes Saved" on an empty month.** **Major.** Affects data owners ([05](ux/05-owner-form-empty-grinding-unit.jpg)).
- A month nobody has touched shows a disabled "All Changes Saved" over a disabled "Submit for Review". The two are the same grey.
- The reason Submit is blocked is small grey text underneath.
- *Fix:*
  - Show save state as text beside the title: "Not saved yet", "Unsaved changes" or "Saved 2 minutes ago", with one Save button.
  - Keep Submit enabled. When pressed, it lists what's missing, with links to those lines.

**U7. The audit trail link appears on a draft.** **Minor.** Affects data owners ([05](ux/05-owner-form-empty-grinding-unit.jpg)).
- A month never submitted has no approval to trace, and "Audit trail" is a compliance word that means nothing to a plant team.
- *Fix:* show it only once the month has been submitted. Call it "History" for data owners.

**U8. Three ways to say "nothing".** **Minor.** Affects data owners.
- An optional item can be left blank, ticked N/A, or confirmed as "not used this month" at submission. All three mean much the same.
- The read-only view then shows "Not used this month" this month and "N/A" for last month ([19](ux/19-reviewer-flagged-month.jpg)).
- *Fix:*
  - Drop the N/A checkbox on optional items; leaving them blank, then confirming at submission, is the one way.
  - Keep N/A for expected items only.
  - Use the same words in both columns.

**U9. On a phone, the form is very long.** **Major.** Affects data owners on phones ([28](ux/28-phone-month-form.jpg)).
- Each line stacks into four rows: quantity, the unit "t" alone on its own line, N/A, and note. Six items need about ten screens of scrolling.
- *Fix:*
  - Keep quantity and unit on one row, and put N/A and note on the next.
  - Collapse the note behind "Add note".

**U10. Typed values and shown values use different formats.** **Polish.** Affects data owners and reviewers.
- The form keeps "35000" as typed. The read-only view shows "35,000 t", and the audit trail shows both, with "35000 t" under "Typed as".
- That's intended, since what was typed is kept for the auditor, but it looks inconsistent.
- *Fix:* label it, for example "Typed as 35000 t", and group the digits everywhere else.

### Submitting

**U11. Two names for one action.** **Polish.** Affects data owners ([07](ux/07-owner-submit-dialog-grinding-unit.jpg)).
- The page says "Submit for Review", and the dialog's button says "Submit Month".
- When nothing was flagged, the dialog still shows a "Flags" heading over "Nothing unusual was flagged".
- *Fix:*
  - Use "Submit for Review" in both places.
  - Hide the flags section when there are none.

**U12. After submitting, the page says "This month can't be changed now."** **Minor.** Affects data owners ([08](ux/08-owner-submitted.jpg)).
- That's true, but it doesn't say what happens next.
- *Fix:* "Submitted on 26 Nov. A reviewer will check it; if they send it back, it will appear at the top of Monthly data."

### Importing

**U13. Import works well.** Credit where due ([09](ux/09-owner-import-choose.jpg), [10](ux/10-owner-import-preview-paste.jpg)):
- Every row shows what the file said, what it reads as and what happens.
- "MT" and "N/A" are asked about, never guessed.
- Clashes with typed values are shown side by side.

**U14. What blocks "Fill the Form" is hidden below the fold.** **Major.** Affects data owners.
- In Hetal's import, the "choose for each" section and the "Answer 2 questions and 2 choices" line sit below the dialog's visible area. The button is simply disabled.
- *Fix:*
  - Show a sticky line beside the button: "2 questions and 3 choices left".
  - Scroll to the first unanswered one when the disabled button is pressed.

**U15. "Your answer" sounds like an answer already given.** **Minor.** Affects data owners ([10](ux/10-owner-import-preview-paste.jpg)).
- *Fix:* "Needs your answer". Once answered: "Answered: tonnes".

**U16. Choices compare numbers in different formats.** **Minor.** Affects data owners.
- "Keep 74900 L" sits against "Use file's 79 kL", and "Keep 4075 MWh" against "Use file's 41,80,000 kWh". The user has to convert in their head to see they're close.
- *Fix:* show both in the item's unit with grouping, for example "Keep 74,900 L" against "Use file's 79,000 L (79 kL)".

**U17. A zero still asks whether "MT" means tonnes.** **Polish.** Affects data owners.
- "Coal 0 MT" asked for confirmation, but zero is zero in any unit.
- *Fix:* skip the MT question when the quantity is 0.

**U18. "Header on line 1, 4 rows below it" is technical.** **Polish.** Affects data owners.
- *Fix:* "Found 4 rows in the pasted table."

**U19. After filling, nothing shows which lines came from the file.** **Minor.** Affects data owners ([11](ux/11-owner-form-after-import.jpg)).
- *Fix:* a small "From the file" tag on imported lines until saved.

### A sent-back or reopened month

**U20. The comment is clear, but the line isn't marked.** **Minor.** Affects data owners ([12](ux/12-owner-sent-back.jpg)).
- Vikram's comment is in a banner at the top. The diesel line it's about looks like every other line.
- *Fix:* highlight lines with flags, so a +54.87% diesel line stands out where you fix it.

**U21. Two owners, no sign of each other.** **Minor.** Affects P05's owners ([13](ux/13-owner-reopened-fixing.jpg)).
- Karthik's page doesn't say Priya can edit it too, or who saved last. The conflict check catches simultaneous edits, but only after the fact.
- *Fix:* "Also entered by Priya Nair · Last saved by Karthik Raja, 26 Nov 17:05".

**U22. Fix and resubmit takes four clicks.** No action needed. Credit: "Fix and Resubmit" in the list, the comment shown first, and the change listed in the history afterwards.

**U23. A reopened month says "Sent back".** **Major.** Affects data owners, Meera and auditors.
- When Meera reopens an approved month, it shows "Sent back" in the owner's list, on the month, on the dashboard ("Sent back to the plant") and in the queue history.
- The banner says "Reopened by Meera Iyer", but everything else implies a reviewer rejected it.
- To a board or auditor, a reopened approved figure is a different event.
- *Fix:* show "Reopened" whenever the last event was a reopen, with its own colour. The status underneath can stay RETURNED.

### Waiting

**U24. Status checks take two clicks and are easy.** No action needed.

**U25. The waiting view doesn't say since when.** **Minor.** Affects data owners ([14](ux/14-owner-waiting-view.jpg)).
- Sasmita sees "Waiting for review" but not that she submitted it two days ago.
- *Fix:* "Submitted 24 Nov, 17:10 · waiting 2 days".

## Reviewers

**U26. On a phone, the Review button is cut off.** **Major.** Affects reviewers on phones ([30](ux/30-phone-review-queue.jpg)).
- The queue table is wider than the screen. Only "Re" of the button shows, and the table doesn't scroll.
- *Fix:* on narrow screens, show the queue as cards (plant, month, flags, Review), or let the table scroll sideways.

**U27. Queue rows look clickable but can't be reached by keyboard.** **Minor.** Affects keyboard users.
- Each row has a pointer cursor and a click handler, but only the small Review button can take focus.
- *Fix:* make the plant name the link and drop the row click, or make the row a proper link.

**U28. The queue says "1 flag" but not what it is.** **Minor.** Affects reviewers ([18](ux/18-vikram-queue.jpg)).
- With 20 minutes, Vikram wants to know which months need real attention without opening each one.
- *Fix:* show the flag in the row, for example "Diesel +54.87% vs September".

**U29. After approving, the queue briefly lists the month just approved.** **Major.** Affects reviewers on slower connections.
- Returning to the queue shows the cached list first, then refetches.
- The walkthrough clicked a row that vanished under it. Locally that's milliseconds; on Vercel with Neon it may be visible.
- The server never approves twice; the database confirmed one approval each.
- *Fix:* drop the approved month from the cached queue before navigating back, or wait for the refetch.

**U30. No "next month" after approving.** **Polish.** Affects reviewers. (When the queue is empty, it says so plainly: [21](ux/21-vikram-queue-empty.jpg).)
- Every approval returns to the queue, so it's two clicks per month.
- *Fix:* "Approve and open next".

**U31. The reviewer is told "This month can't be changed now."** **Minor.** Affects reviewers ([19](ux/19-reviewer-flagged-month.jpg)).
- That's the owner's message. A reviewer never changes figures.
- *Fix:* "Submitted by Deepak Sahu on 26 Nov. Approve it, or send it back with a comment."

**U32. No change column.** **Minor.** Affects reviewers ([19](ux/19-reviewer-flagged-month.jpg)).
- The last approved month sits beside this one, but the reviewer has to work out 2,00,400 against 1,29,400 L. The percentage appears only when it's flagged.
- *Fix:* add a "Change" column, for example "+54.9%", and highlight anything over the flag limit.

**U33. Imported values look the same as typed ones to the reviewer.** **Minor.** Affects reviewers ([17](ux/17-reviewer-clean-imported-month.jpg)).
- P04's figures came from a file. The review page doesn't say so or link to the original; only the audit trail does.
- *Fix:* an "Imported from P04_Nalgonda_2026-10.csv" note with a link to view the original.

**U34. Approving a flagged month works well.** Approve stays disabled until there's a comment, the help text explains why, and the owner's note sits beside the figure. No action needed.

**U35. "Not used this month" this month, "N/A" last month.** **Polish.** See U8 ([19](ux/19-reviewer-flagged-month.jpg)).

## Priya, owner and reviewer

**U36. Her own plant's months sit among the ones she can act on.** **Minor.** Affects people with both roles ([15](ux/15-priya-queue.jpg)).
- Two of her six queue rows say "Another reviewer must review this". Because they're flagged, one is sorted to second place.
- The rule itself, and its wording on the month page ([16](ux/16-priya-own-plant-blocked.jpg)), are right.
- *Fix:* list them in a separate "Waiting for another reviewer" section below her own work.

**U37. Priya lands on Plants.** See U1. Her sidebar has five items, the most of anyone. "To do" counts (U2) matter most for her.

## Meera, the week before the board

**U38. "Can I take this to the board?" is answered in seconds.** ([22](ux/22-meera-dashboard-q3.jpg), [23](ux/23-meera-dashboard-q2.jpg))
- The banner says "Not ready for the board. Q3 FY 2026-27: 7 of 9 plant-months approved", and the totals are marked Partial.
- What's missing is listed by status. Q2 says "Ready for the board: all 27 plant-months … approved".
- This is the strongest screen in the app.

Gaps:
- **U38a. Abbreviations.** **Minor.** "S1" and "S2" in the grid mean nothing to a board reader. *Fix:* "Scope 1" and "Scope 2" in full, with a one-line definition under the totals: "Scope 1: fuel burned and clinker made. Scope 2: grid power bought."
- **U38b. Leaving the dashboard loses the quarter.** **Minor.** After tracing a Q2 figure, the audit trail's back link goes to the month, not the dashboard, and the dashboard then reopens on Q3. *Fix:* keep the quarter in the address (`/dashboard?quarter=2026-Q2`), and send the audit trail back to where she came from.
- **U38c. No sign of months approved over a flag.** **Minor.** An auditor would ask which figures were approved despite a warning. The dashboard shows no difference. *Fix:* a small marker on those cells, linking to the approval comment.
- **U38d. No export.** **Minor.** A board pack needs these figures in a document. There's no CSV or print view. This can wait.

**U39. "Where did this number come from?" Excellent, with two gaps.** ([24](ux/24-meera-audit-trail.jpg), [33](ux/33-phone-audit-trail.jpg))
- One click from a dashboard figure leads to the approved totals, then each line, from its kg back through the factor (value, source, year) and the converted value to what Ravi typed, with who and when.
- Then come every edit, submission with its flags, send-back and approval.
- The gaps:
  - **Reopening isn't offered here.** **Minor.** This is exactly where an auditor's question comes up. Meera must go "Back to the month" ([25](ux/25-meera-reopen-panel.jpg)). *Fix:* a Reopen button on the audit trail for the Head.
  - **"Audit trail" is shown to data owners on drafts.** See U7.

**U40. Reopening works.** It needs a reason, the plant sees it, and the dashboard drops the month immediately ("6 of 9"). The label problem is U23.

## Across the app

### Accessibility

**A1. Secondary text, links and warning text fail contrast.** **Major.** Affects everyone, most of all people with low vision or using laptops outdoors.

| Text | Today | Ratio | Needed | Suggested | New ratio |
|---|---|---|---|---|---|
| Secondary text on white (dates, helper text, notes, "Waiting 2 days") | `#718096` | 4.02:1 | 4.5:1 | `#4a5568` (the app's own gray600) | 7.53:1 |
| Secondary text on grey table headers | `#718096` on `#edf2f7` | 3.56:1 | 4.5:1 | `#4a5568` | 6.68:1 |
| Links | `#4682b4` | 4.11:1 | 4.5:1 | `#2b6cb0` | 5.42:1 |
| Warning text on the warning background | `#c6883d` on `#fefcbf` | 2.85:1 | 4.5:1 | `#975a16` | 5.25:1 |
| Placeholder text | `#a0aec0` | 2.26:1 | (exempt, but hard to read) | `#718096` | 4.02:1 |

The badge colours and the error and body text all pass. These colours come from the starter's design tokens, but they are on every screen of v1.

**A2. Keyboard focus is nearly invisible on the sign-in list.** **Major.** Affects keyboard users.
- Tabbing through the sample users changes only the background, from white to `#f7fafc`. That's almost no difference, so you can't see where you are ([01](ux/01-sign-in.jpg)).
- Buttons and inputs elsewhere do have a visible focus ring.
- *Fix:* the same `focus-visible` ring the buttons use.

**A3. No skip link.** **Minor.** Affects keyboard users. Every page starts with the sidebar, the toggle and the user menu before reaching content (five stops, then content). *Fix:* a "Skip to content" link.

**A4. Labels are complete.** No unlabelled controls were found on any page checked. Every page has one H1, and dialogs hold focus correctly. *Not verified:* whether Escape closes the submit dialog. It was still open 0 ms after Escape, which may only be its closing animation, and the follow-up check was lost when Docker stopped.

### Phone and laptop

| Screen | Phone (390 px) | Laptop (1366×768) |
|---|---|---|
| Sign-in | Fine ([26](ux/26-phone-sign-in.jpg)) | Fine ([34](ux/34-laptop-sign-in.jpg)) |
| Monthly data | Fine ([27](ux/27-phone-monthly-data.jpg)) | Fine ([35](ux/35-laptop-monthly-data.jpg)) |
| Month form | Very long (U9) ([28](ux/28-phone-month-form.jpg)) | *Not captured* |
| Navigation | Drawer works ([29](ux/29-phone-nav-open.jpg)) | n/a |
| Review queue | Review button cut off (U26) ([30](ux/30-phone-review-queue.jpg)) | *Not captured* |
| Review month | Usable ([31](ux/31-phone-review-month.jpg)) | *Not captured* |
| Dashboard | Good: banner and totals first ([32](ux/32-phone-dashboard.jpg)) | *Not captured* |
| Audit trail | Readable; the calculation table scrolls ([33](ux/33-phone-audit-trail.jpg)) | *Not captured* |

**L1. The page-title breadcrumb is cut to one letter on phones.** **Polish.** It reads "D…" for Dashboard and "A…" for Audit ([32](ux/32-phone-dashboard.jpg), [33](ux/33-phone-audit-trail.jpg)). *Fix:* hide it on narrow screens; the page has its own heading.

**L2. The status badge stretches across the width.** **Polish.** On the phone audit page, "Approved" spans the whole screen ([33](ux/33-phone-audit-trail.jpg)). *Fix:* stop it stretching (`self-start`).

No page scrolled sideways at either size.

### Wording and formats

**W1. Mostly plain and consistent.** Flags state facts only. Dates are "26 Nov 2026, 17:10", and numbers use Indian grouping ("2,59,993.2 t"). The exceptions are above: U10, U11, U15, U16, U18, U23, U31 and U38a.

**W2. The browser tab icon is missing.** **Polish.** `/favicon.ico` returns 404 (it's absent from the starter). *Fix:* add one.

## Prioritised

### Fix before submission

These are the ones a reviewer clicking through the live link for ten minutes is most likely to hit, or that weaken the brief's own points.

1. **U1 Role-based landing.** Small change, big effect on every first impression.
2. **U5 Warn before losing unsaved changes.** Losing typed figures is the worst feeling the app can give a plant team.
3. **U23 Show "Reopened", not "Sent back".** Meera and auditors read these labels.
4. **U26 Phone review queue.** The main reviewer action is cut off.
5. **U2 "To do" at the top of Monthly data, and counts in the sidebar.** Reviewers' time on what needs a look is brief point 4.
6. **A1 and A2 Contrast and the sign-in focus ring.** Changes to three colour values and one class, checked against WCAG.
7. **U6 Save state and the disabled buttons.**
8. **U14 Import blocker hidden below the fold.**
9. **U38a "Scope 1" and "Scope 2" in full on the dashboard.**
10. **U29 Stale queue after approving.** Worth doing before the deployed demo, where latency makes it visible.

### Can wait

- **The form on a phone** (U9). Plants mostly enter on desktops, but it should be fixed soon after.
- **Reviewer speed-ups:** the flag shown in the queue (U28), a change column (U32), "Approve and open next" (U30), and an imported-values note (U33).
- **Owner context:** who else owns the plant (U21), "waiting since" (U25), next month's opening date (U4), and a line saying everything's done (U3).
- **Meera's extras:** the quarter kept in the address (U38b), a marker for months approved over a flag (U38c), export (U38d), and Reopen on the audit trail (U39).
- **Wording and polish:** U7, U8, U10, U11, U12, U15 to U20, U27, U31, U35, U36, A3, L1, L2 and W2.

## What stopped the run

Part-way through the laptop checks, **Docker Desktop was killed by the system for lack of memory** (`oom-kill`, 17:13). That took the local database down.

**Contributing:**
- Docker and its containers.
- A second dev server for this review.
- Repeated headless Chrome launches.
- **An orphaned dev server of mine, holding about 550 MB.** An earlier restart had failed to stop it.

The orphan is now stopped. Docker Desktop has not been restarted, since restarting it also brings back the other containers on this machine. The four laptop screenshots and the keyboard walk on the month form can be finished once it's running again.
