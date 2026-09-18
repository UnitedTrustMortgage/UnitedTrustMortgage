# UTM Intranet — employee resource hub

Password-protected internal hub at `https://www.myunitedtrust.com/intranet/`.
Rides on the **same email + password login as the quote builder** — one
internal account works for both (`quote_operators` table in Supabase,
sessions via the existing `/api/auth/*` Netlify Functions). No new backend
was added.

## File map

```
intranet/
├── index.html    # Login + app shell (SPA — everything rendered by JS)
├── intranet.js   # Auth check, hash routing, view rendering
├── intranet.css  # Styles (same BONE editorial palette as the site)
├── data.js       # ★ ALL CONTENT LIVES HERE — edit this file to update
└── README.md     # This file
```

## Sections

| Route | What it shows |
|---|---|
| `#/home` | Welcome + cards linking to every section |
| `#/ae` | AE directory — searchable table (name, lender, phone, email, products, notes) |
| `#/biz-states` | Business-purpose loan states — color-coded 50-state + DC grid |
| `#/ppp-states` | Prepayment penalty states — same grid format |
| `#/links` | Frequently used links, grouped (UTM tools, lender portals, ops) |

## Updating content

Everything is in [data.js](data.js) — plain JavaScript objects, commented.
Edit, commit, push to `main`; Netlify redeploys in ~1 minute.

State statuses: `allowed` (green) · `restricted` (amber, add a `note`) ·
`not-allowed` (red) · `verify` (gray placeholder). Both state lists ship
as all-`verify` until compliance data is filled in.

## Logins

Same accounts as the quote builder — see "Managing operators" in
[quotes/README.md](../quotes/README.md) for the SQL to add employees,
reset passwords, and revoke access. Anyone in `quote_operators` with
`active = true` can sign in to both the quote builder and the intranet.
