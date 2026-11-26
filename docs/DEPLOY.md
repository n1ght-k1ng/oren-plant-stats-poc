# Deploying to Vercel with Neon

You do these steps yourself. Connection strings are secrets: put them only in Neon, Vercel's settings, and your own terminal. Never in the repo, a commit, or a chat.

## The two variables

| Variable | Where it comes from | Used for |
|---|---|---|
| `DATABASE_URL` | Neon: the **pooled** connection string (its host contains `-pooler`) | The app at runtime, on Vercel |
| `DIRECT_URL` | Neon: the **direct** connection string (no `-pooler`) | `prisma db push` |

In Neon, both are under the branch's **Connect** button. Switch "Connection pooling" on for the pooled one and off for the direct one.

## 1. Push the code to GitHub

```bash
git remote add origin https://github.com/<you>/<repo>.git
git push -u origin main
```

The brief asks for a public repo with the full, unsquashed history, so push `main` as it is.

## 2. Create the database on Neon

1. Create a Neon project in the region nearest your users. Its default branch, `main`, is production.
2. Create a second branch called `test` from `main`. The test suites write and delete their own rows, so they never run against production.

## 3. Create the tables and load the sample data

From the repo, in your terminal, with production's **direct** string for both variables (one-off admin jobs go straight to the database, not through the pooler):

```bash
export DATABASE_URL='<production direct string>'
export DIRECT_URL="$DATABASE_URL"
npx prisma db push
npm run db:seed
unset DATABASE_URL DIRECT_URL
```

The seed adds the two companies, plants and sample users, and the demo months for Nimbus from April to October 2026. It is safe to run again: existing months are left as they are.

## 4. Deploy on Vercel

1. In Vercel, choose **Add New → Project** and import the GitHub repo. Vercel detects Next.js; keep the default build and install commands.
2. Under **Settings → General**, set **Node.js Version** to **22.x** (the repo's `package.json` asks for 22).
3. Under **Settings → Environment Variables**, add for **Production**:
   - `DATABASE_URL` = production's **pooled** string
   - `DIRECT_URL` = production's **direct** string
4. Deploy. The install step runs `prisma generate`; the build runs `next build`.

Then open the deployment's URL. The sign-in page lists the sample users; there is no real login, as the brief asks.

If the app reports errors about prepared statements, add `?pgbouncer=true` to the end of `DATABASE_URL` in Vercel (or `&pgbouncer=true` if the string already has a `?`), and redeploy.

## 5. Check it

Run the end-to-end tests against the live URL from your machine. They create their own "E2E Cement" company in the database `DATABASE_URL` points at, and delete it at the end; while they run, its three users appear in the user switcher.

```bash
export DATABASE_URL='<production direct string>'
E2E_BASE_URL='https://<your-app>.vercel.app' npm run test:e2e
unset DATABASE_URL
```

Then go through the flows by hand on the live link: Ravi Meena submits, Vikram Joshi reviews, Meera Iyer reads the dashboard.

To run the unit and API tests against Neon, use the **test** branch, never production:

```bash
export DATABASE_URL='<test branch direct string>'
export DIRECT_URL="$DATABASE_URL"
npx prisma db push
npm test
unset DATABASE_URL DIRECT_URL
```

## After a schema change

Run `npx prisma db push` against production (step 3, without the seed), then redeploy. If `db push` warns about data loss, stop and look at what it would drop before going on.
