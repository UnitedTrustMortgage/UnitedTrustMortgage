# Handoff — Quote Builder

_Last updated 2026-06-08. Pick this up on your laptop tomorrow. Nothing secret is in
this file — safe to delete once you're set up._

## TL;DR

The operator **quote builder** + borrower **quote view** are built, verified, and
pushed to `main` (commit `08d9568`) — Netlify auto-deploys it. It's **inert until you
do two setup steps** (Netlify env vars + DNS, below). The rest of the marketing site is
unaffected in the meantime.

- Operator app: **myunitedtrust.com/quotes/** (pass-code login → dashboard → editor → copy link)
- Borrower view: **quotes.myunitedtrust.com/&lt;token&gt;**
- Backend: Netlify Functions → **Cadence CRM** Supabase project (`jvdhhvwljocmimqgbtgn`)

---

## ▶ START HERE tomorrow (required to actually go live)

### 1. Get the repo on your laptop
```bash
git clone https://github.com/UnitedTrustMortgage/UnitedTrustMortgage.git
cd UnitedTrustMortgage
npm install
```
(If already cloned: `git pull` — make sure you're on `main` at `08d9568` or later.)

### 2. Set Netlify environment variables
Netlify → **UnitedTrustMortgage** site → Site settings → Environment variables:

| Variable | Value |
|---|---|
| `SUPABASE_URL` | `https://jvdhhvwljocmimqgbtgn.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → **Cadence CRM** project → Project Settings → API → **service_role** secret |
| `CRM_WEBHOOK_URL` _(optional)_ | cadence-crm internal notify URL — fires email/SMS when a borrower picks an option |
| `CRM_WEBHOOK_KEY` _(optional)_ | long random string; must match cadence-crm's `UTM_WEBHOOK_KEY` |

> The service-role key is a secret, so I couldn't set it — grab it from the Supabase
> dashboard. Without the two optional vars, borrower selections still record in Supabase;
> only the operator notification is skipped.

### 3. DNS for the borrower subdomain
1. Registrar: add a **CNAME** `quotes` → your Netlify app host (`<site>.netlify.app`).
2. Netlify → Domain management → **Add custom domain** → `quotes.myunitedtrust.com` (it provisions SSL).

Until DNS is live, operators can still build/save quotes once the env vars are set — only
the borrower share link needs the subdomain.

### 4. Smoke-test
- Go to `myunitedtrust.com/quotes/`, sign in with your pass code (the one shared earlier —
  it's in the `quote_operators` table, operator "Arin").
- **+ New quote** → fill borrower/property/loan/options + the **LO ONLY** wholesale lender → **Save & generate link**.
- **Copy link** → open `quotes.myunitedtrust.com/<token>` in a private window → it should show the
  comparison cards. Pick an option → it flips to `selected` on your dashboard.
- Confirm the wholesale lender shows on the dashboard but **not** on the borrower page (or its
  network payload).

---

## What's done (commit `08d9568`)

- Ported the quote system from the `Documents\UTM SITE` prototype into this live repo.
- Dashboard columns: **first name, last name, phone, email, transaction type, loan amount,
  state, wholesale lender** (+ status, last activity, Edit, Copy link).
- New **"LO ONLY" editor section** (wholesale lender, price-to-me, private notes) — matches the
  screenshot, stored in dedicated `loan_quotes` columns so it never reaches the borrower payload.
- Supabase migration `add_lo_only_quote_fields` already applied (added `wholesale_lender`,
  `price_to_me`, `internal_notes` columns to `loan_quotes`).
- Fixed a latent bug: the login screen was overlaying the app after sign-in.
- Added `package.json` + `/api/*` and `quotes.` subdomain rewrites in `netlify.toml`.

---

## Local dev / testing

**Full stack (functions + Supabase):** needs the Netlify CLI.
```bash
npm i -g netlify-cli
netlify link            # link to the UnitedTrustMortgage site
netlify dev             # serves the site + runs functions with the site's env vars
```
Then open `http://localhost:8888/quotes/`. (Functions need `SUPABASE_URL` +
`SUPABASE_SERVICE_ROLE_KEY` — either set them in Netlify and `netlify link`, or put them in a
local `.env`, which is git-ignored.)

**Static-only (UI only, no backend):** there's a launch config `utm-static`
(`npx http-server . -p 5173`). Good for eyeballing CSS, but `/api/*` won't work without functions.

**Inspect the data** (Supabase MCP or SQL editor on project `jvdhhvwljocmimqgbtgn`):
```sql
select borrower_name, wholesale_lender, status, created_at
from loan_quotes where source = 'utm' order by created_at desc;
```

---

## Architecture / file map

```
quotes/
  index.html      operator login + app shell        (assets referenced absolute: /quotes/…)
  builder.js      dashboard + editor (vanilla JS)    ← LO-only section + new dashboard cols
  builder.css     operator styles (dark theme)       ← .qb-lo callout + .qb-dash-scroll
  q.html / q.js   borrower comparison view           ← q.js reads token from URL path
  q.css           borrower styles
  README.md       env vars, DNS, operator-management SQL  ← read this for ops detail
netlify/functions/
  _lib.mjs        Supabase client + session helpers
  auth-login/me/logout.mjs   pass-code auth (bcrypt verify via Postgres RPC)
  quotes.mjs      operator CRUD  ← persists LO columns + enriches dashboard list
  public-quotes.mjs  borrower fetch/select  ← returns only a SAFE subset (no LO fields)
  (submit-lead.js, fred-proxy.js = pre-existing, CommonJS, untouched)
netlify.toml      /api/* rewrites (forced) + quotes.* subdomain rewrites + no-cache headers
package.json      @supabase/supabase-js  (intentionally NOT type:module — keeps legacy .js CJS)
```

**Supabase tables** (shared with cadence-crm): `quote_operators`, `quote_sessions`,
`loan_quotes`, `loan_quote_revisions`, `loan_quote_selections`, `loan_quote_sends`.
Borrower contact + LO-only fields are **columns** on `loan_quotes`; loan/property/options
detail is **JSON** on `loan_quote_revisions`.

---

## Gotchas / why things are the way they are

- **LO-only fields are columns, not JSON.** `public-quotes.mjs` ships `loan_json` to the
  borrower's browser, so wholesale lender / price / notes are kept in dedicated columns the
  public endpoint never returns. Don't move them into the revision JSON.
- **Borrower link is the subdomain.** `quotes.myunitedtrust.com/<token>` is a Netlify 200-rewrite,
  so the URL keeps the token in the **path** (no `?t=`). `q.js` parses it from `location.pathname`.
  The builder/borrower HTML use **absolute** asset paths (`/quotes/…`, `/styles.css`) so assets
  aren't mistaken for tokens. The `/api/*` rules are `force = true` so they win on the subdomain too.
- **First/last name** is split on render from the single `borrower_name` (first token / rest),
  matching how the borrower view derives the first name. No separate name fields in the DB.
- **The source folder was "UTM SITE", not "CRM".** `Projects\CRM` is an unrelated Kanban app.

---

## Open follow-ups (next session)

1. **Email/text the link** (you said "later"). The `markSent` route + `loan_quote_sends` table
   already exist; wire a provider — reuse the existing Twilio path from `netlify/functions/submit-lead.js`
   for SMS, and decide on email (the cadence-crm webhook already does Outlook on select).
2. **Discreet link to the builder** from the site (e.g., footer) — or leave it URL-only (it's noindex + pass-code gated).
3. Optional polish from the screenshot: a **"Duplicate last"** button and an explicit **"Save now"** in the editor footer.
4. Consider an operator-management screen (today it's SQL in `quotes/README.md`).

## References
- Plan file (full rationale): `C:\Users\Arin\.claude\plans\cached-sparking-kettle.md` (this machine)
- Commit: `08d9568` on `main`
- Supabase project: Cadence CRM = `jvdhhvwljocmimqgbtgn`
- Netlify site id: `85b922c3-53b8-49e4-940d-b4ffb6f056ab`
