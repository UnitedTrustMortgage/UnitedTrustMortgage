# Quote Builder — UTM SITE

Vanilla JS port of the cadence-crm quote builder, embedded in the UTM
Netlify site. Operators sign in with a pass code at
`https://www.myunitedtrust.com/quotes/` and build comparison quotes;
borrowers see the comparison at `https://quotes.myunitedtrust.com/<token>`
and pick an option.

## File map

```
quotes/
├── index.html        # Operator login + app shell (SPA-style, all rendered by JS)
├── builder.js        # Dashboard + editor logic (~900 lines)
├── builder.css       # Operator UI styles (dark editorial palette)
├── q.html            # Borrower public view shell
├── q.js              # Borrower view logic (~400 lines)
├── q.css             # Borrower view styles
└── README.md         # This file

netlify/functions/
├── _lib.mjs          # Supabase client + session helpers (shared)
├── auth-login.mjs    # POST /api/auth/login — verify pass code, issue session
├── auth-me.mjs       # GET  /api/auth/me — return current operator
├── auth-logout.mjs   # POST /api/auth/logout — delete session
├── quotes.mjs        # /api/quotes/* — operator CRUD (list/create/get/revise/send)
└── public-quotes.mjs # /api/public/quotes/* — borrower fetch + select
```

## How it works

1. **Operator opens** `https://www.myunitedtrust.com/quotes/` →
   `builder.js` calls `/api/auth/me`. If 401, show login. If 200, show
   the dashboard listing their quotes.

2. **Operator creates a quote** → `POST /api/quotes` writes
   `loan_quotes` + first `loan_quote_revisions` row in Supabase. The
   response includes a `public_token` (unguessable random 12 bytes).

3. **Operator copies the share link** →
   `https://quotes.myunitedtrust.com/<public_token>`. The `quotes.`
   subdomain redirects (via `netlify.toml`) to `/quotes/q.html?t=<token>`,
   so it's still the same Netlify deploy.

4. **Borrower opens the link** → `q.js` fetches
   `/api/public/quotes/<token>` (no auth, token gated), renders the
   comparison cards.

5. **Borrower clicks "Select this option"** → `POST /api/public/quotes/<token>/select`
   records the choice in `loan_quote_selections`, flips quote status to
   `selected`, then POSTs to the cadence-crm internal webhook
   (`CRM_WEBHOOK_URL`) which fans out Outlook email + Twilio SMS to the
   operator.

## Required Netlify env vars

Set these in **Site settings → Environment variables**:

| Var | Value | Notes |
|---|---|---|
| `SUPABASE_URL` | Cadence CRM project URL (Supabase dashboard → Project Settings → API) | value not written here — Netlify secret scanning fails the build if an env-var value appears in repo files |
| `SUPABASE_SERVICE_ROLE_KEY` | (from Supabase dashboard → Project Settings → API) | **Server-only — never exposed to the browser**, bypasses RLS |
| `CRM_WEBHOOK_URL` | e.g. `https://crm.myunitedtrust.com/api/internal/notify-quote-selected` | Wherever cadence-crm is deployed |
| `CRM_WEBHOOK_KEY` | A long random string | Must match `UTM_WEBHOOK_KEY` set in cadence-crm |

Generate `CRM_WEBHOOK_KEY` with `node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"`
and paste the same value into both the cadence-crm env and Netlify env.

## Required cadence-crm env vars

The cadence-crm side just needs one new env var:

| Var | Value |
|---|---|
| `UTM_WEBHOOK_KEY` | Same value as `CRM_WEBHOOK_KEY` above |

Without it, the `/api/internal/*` routes return 503 — UTM-side selections
will still record in Supabase, but the operator notification won't fire.

## DNS — quotes.myunitedtrust.com subdomain

In your DNS registrar:

1. Add a **CNAME** record: `quotes` → your-utm-netlify-app.netlify.app
   (use whatever the Netlify deploy URL is).
2. In Netlify → **Domain management → Add custom domain** → enter
   `quotes.myunitedtrust.com`. Netlify will provision the SSL cert.

The `netlify.toml` rewrites handle the rest — any path under
`quotes.myunitedtrust.com` lands on the right asset.

## Managing operators (pass codes)

Operators live in the `quote_operators` Supabase table. To add a new one:

```sql
-- Run in Supabase SQL Editor. Replace name + pass code.
insert into public.quote_operators (name, email, pass_code_hash, active, is_admin)
values (
  'Jane Doe',
  'jane@myunitedtrust.com',
  crypt('SOME-LONG-RANDOM-CODE', gen_salt('bf')),
  true,
  false  -- set true to let them see everyone's quotes
);
```

Then text/email the pass code to them. They enter it at
`https://www.myunitedtrust.com/quotes/`.

### Revoke access

```sql
update public.quote_operators set active = false where name = 'Jane Doe';
```

The next request from any of their active sessions returns 403; they're
locked out instantly (we check `active` on every API call).

### Audit usage

```sql
-- Who logged in lately?
select o.name, s.created_at, s.ip, s.user_agent
from quote_sessions s
join quote_operators o on o.id = s.operator_id
order by s.created_at desc
limit 50;
```

```sql
-- Who built which quote?
select q.title, q.borrower_name, q.created_at, o.name as built_by
from loan_quotes q
left join quote_operators o on o.id = q.operator_id
where q.source = 'utm'
order by q.created_at desc;
```

## Local development

```bash
# In UTM SITE/
npm install
npm run dev    # uses netlify dev — needs Netlify CLI installed globally
```

`netlify dev` proxies the static site + runs the Functions locally with
your linked Netlify env. Without env vars set, the Functions will return
clear "X env var required" errors.

## Initial operator

The first operator (Arin) was seeded by the migration. The pass code was
shared once via chat — store it in 1Password (or wherever) and don't
commit it. To rotate:

```sql
update public.quote_operators
   set pass_code_hash = crypt('NEW-PASS-CODE', gen_salt('bf'))
 where name = 'Arin';
```
