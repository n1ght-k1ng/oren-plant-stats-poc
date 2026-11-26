# Brief: Plant data, from entry to approval
 
> Source: Oren software engineer assessment (verbatim content, reformatted).
> Do not edit. Interpretations and assumptions go in `docs/DECISIONS.md`.
 
## Why this exercise
At Oren, a developer takes a loosely defined customer need, decides what the product must do, and ships it in our codebase, mostly with AI tools. This exercise is a small version of that job.
 
## The customer
Meera Iyer is Head of Sustainability at Nimbus Cement Ltd, a listed Indian cement maker with nine plants. Every quarter she reports the company's CO2 to her board, and every year her auditor checks it. Today each plant emails her team a spreadsheet every month. The numbers arrive late, nobody can say who checked them, and her team spends days chasing and correcting them.
 
## Task
Build v1 of a feature where plants send their monthly data, Meera's team approves it, and Meera sees the result. Build it inside this starter repo (same stack as Oren's product). It already has a plant register, a table of emission factors, and examples of what plants send today. The README explains how to run it.
 
The flows below don't cover every case. Deciding what else v1 must handle, and what it leaves out, is part of the exercise. If something is unclear, make an assumption, write it down, and keep going.
 
## Users
Each user is a sample login in the starter's user switcher.
 
- **Plant data owner**: one person per plant (e.g. Ravi Meena at Chittorgarh, P01). Sends the plant's monthly data.
- **Reviewers**: members of Meera's team. They check plant data before it counts.
- **Meera Iyer, Head of Sustainability**: needs the company picture, plant by plant.
## What a plant reports each month
- Quantity of each fuel burned
- Grid power bought
- Tonnes of clinker produced by the kiln
The factor table converts each item into CO2. Report **Scope 1** (direct) and **Scope 2** (bought power) separately.
 
## Flows
 
### Flow 1: Send a month
- **Who and when:** Plant data owner, after a month ends.
- **Steps:** Open the month for their plant → enter each item → can save and return later → submit when done.
- **End:** The month waits for review, and the data owner can see that it does.
### Flow 2: Review a month
- **Who and when:** Reviewer, when a plant submits a month.
- **Steps:** See what's waiting → open one plant's month → check it → approve, or send back with a comment.
- **End:** An approved month counts in Meera's figures. A month sent back returns to the data owner.
### Flow 3: Fix and resubmit
- **Who and when:** Plant data owner, when a month comes back.
- **Steps:** Read the reviewer's comment → correct the month → submit again.
- **End:** The month waits for review again.
### Flow 4: See where things stand
- **Who and when:** Meera, any time (e.g. the week before a board meeting).
- **Steps:** See where the data stands for every plant and month → see approved CO2 by plant and for the company, Scope 1 and Scope 2 apart.
- **End:** She knows which figures she can use and which aren't ready.
## What matters to the business
1. Meera must never show her board a figure that nobody approved.
2. Her auditor will ask how any figure came to be. She must be able to answer.
3. Plant teams have day jobs. Sending a month should take minutes, not an afternoon.
4. Meera's team is small. Reviewers should spend their time on the figures that need a look.
## Deliverables (due within 3 days)
- Public GitHub repo with full, unsquashed commit history
- Live Vercel link, no login, Neon DB; keep the starter's user switcher
- ~1-page write-up in the repo: what was built, decisions and why, what was left out, what's next, and how AI was used (tools, purposes, one place the AI was wrong and how it was caught)
- AI session logs attached to the email (secrets removed, not in the repo)
## Evaluation criteria
- **Product sense:** handles the cases a real plant team, reviewer and auditor will meet
- **Working software:** every flow works on the live link
- **Code quality:** a teammate can pick it up and live with it
- **Confidence:** you know it works and can show how
- **AI fluency:** AI made you faster; the judgment stayed yours
