/* ============================================================
   UTM Intranet — content data
   This file is the single place to edit intranet content. No build
   step: edit, commit, push — Netlify redeploys and everyone sees it.

   Sections:
     1. quickLinks              — frequently used links, grouped
     2. aeList                  — Account Executive directory
     3. businessPurposeStates   — where we can do business-purpose loans
     4. pppStates               — where prepayment penalties are allowed

   State status values (drives the color coding):
     'allowed'     → green   — good to go
     'restricted'  → amber   — allowed with conditions (explain in note)
     'not-allowed' → red     — do not originate / no PPP
     'verify'      → gray    — placeholder, needs confirmation
   ============================================================ */

window.INTRANET_DATA = {

  // ── 1. Quick links ─────────────────────────────────────────
  quickLinks: [
    {
      group: 'UTM Tools',
      links: [
        { label: 'Quote Builder', url: '/quotes/', desc: 'Build + share borrower comparison quotes' },
        { label: 'Calculators', url: '/calculators/', desc: 'DSCR, payment, and cash-out calculators' },
        { label: 'Market Data', url: '/market-data/', desc: 'Rates + market snapshot' },
        { label: 'Deal Analyzer', url: '/analyze/', desc: 'Investment property analyzer' },
        { label: 'STR Outlook', url: '/str-outlook/', desc: 'Short-term rental market outlook' },
        { label: 'Main Site', url: 'https://www.myunitedtrust.com', desc: 'Public website' },
      ],
    },
    {
      group: 'Lender Portals',
      links: [
        // TODO: replace with the portals the team actually uses.
        { label: 'Sample Lender Portal', url: 'https://example.com', desc: 'SAMPLE — replace with real portal link' },
      ],
    },
    {
      group: 'Operations',
      links: [
        // TODO: credit vendors, AMC, e-sign, CRM, etc.
        { label: 'Sample Ops Link', url: 'https://example.com', desc: 'SAMPLE — replace with real link' },
      ],
    },
  ],

  // ── 2. Account Executive directory ─────────────────────────
  // One row per AE. `products` is a short comma-separated summary.
  aeList: [
    {
      name: 'Sample AE',
      lender: 'Sample Wholesale Lender',
      phone: '(555) 555-0100',
      email: 'ae@example.com',
      products: 'DSCR, Bank Statement, Non-QM',
      notes: 'SAMPLE ROW — replace with the real AE list.',
    },
  ],

  // ── 3. Business-purpose loan states ────────────────────────
  businessPurposeStates: {
    updated: '2026-09-17',
    intro: 'Where UTM can originate business-purpose (DSCR / investor) loans. Statuses below are placeholders — confirm each state with compliance/lender guidelines before quoting.',
    states: {
      AL: { status: 'verify', note: '' }, AK: { status: 'verify', note: '' },
      AZ: { status: 'verify', note: '' }, AR: { status: 'verify', note: '' },
      CA: { status: 'verify', note: '' }, CO: { status: 'verify', note: '' },
      CT: { status: 'verify', note: '' }, DE: { status: 'verify', note: '' },
      FL: { status: 'verify', note: '' }, GA: { status: 'verify', note: '' },
      HI: { status: 'verify', note: '' }, ID: { status: 'verify', note: '' },
      IL: { status: 'verify', note: '' }, IN: { status: 'verify', note: '' },
      IA: { status: 'verify', note: '' }, KS: { status: 'verify', note: '' },
      KY: { status: 'verify', note: '' }, LA: { status: 'verify', note: '' },
      ME: { status: 'verify', note: '' }, MD: { status: 'verify', note: '' },
      MA: { status: 'verify', note: '' }, MI: { status: 'verify', note: '' },
      MN: { status: 'verify', note: '' }, MS: { status: 'verify', note: '' },
      MO: { status: 'verify', note: '' }, MT: { status: 'verify', note: '' },
      NE: { status: 'verify', note: '' }, NV: { status: 'verify', note: '' },
      NH: { status: 'verify', note: '' }, NJ: { status: 'verify', note: '' },
      NM: { status: 'verify', note: '' }, NY: { status: 'verify', note: '' },
      NC: { status: 'verify', note: '' }, ND: { status: 'verify', note: '' },
      OH: { status: 'verify', note: '' }, OK: { status: 'verify', note: '' },
      OR: { status: 'verify', note: '' }, PA: { status: 'verify', note: '' },
      RI: { status: 'verify', note: '' }, SC: { status: 'verify', note: '' },
      SD: { status: 'verify', note: '' }, TN: { status: 'verify', note: '' },
      TX: { status: 'verify', note: '' }, UT: { status: 'verify', note: '' },
      VT: { status: 'verify', note: '' }, VA: { status: 'verify', note: '' },
      WA: { status: 'verify', note: '' }, WV: { status: 'verify', note: '' },
      WI: { status: 'verify', note: '' }, WY: { status: 'verify', note: '' },
      DC: { status: 'verify', note: '' },
    },
  },

  // ── 4. Prepayment penalty (PPP) states ─────────────────────
  pppStates: {
    updated: '2026-09-17',
    intro: 'Where prepayment penalties are allowed on business-purpose loans. Statuses below are placeholders — confirm each state with compliance/lender guidelines. Terms and caps vary by lender.',
    states: {
      AL: { status: 'verify', note: '' }, AK: { status: 'verify', note: '' },
      AZ: { status: 'verify', note: '' }, AR: { status: 'verify', note: '' },
      CA: { status: 'verify', note: '' }, CO: { status: 'verify', note: '' },
      CT: { status: 'verify', note: '' }, DE: { status: 'verify', note: '' },
      FL: { status: 'verify', note: '' }, GA: { status: 'verify', note: '' },
      HI: { status: 'verify', note: '' }, ID: { status: 'verify', note: '' },
      IL: { status: 'verify', note: '' }, IN: { status: 'verify', note: '' },
      IA: { status: 'verify', note: '' }, KS: { status: 'verify', note: '' },
      KY: { status: 'verify', note: '' }, LA: { status: 'verify', note: '' },
      ME: { status: 'verify', note: '' }, MD: { status: 'verify', note: '' },
      MA: { status: 'verify', note: '' }, MI: { status: 'verify', note: '' },
      MN: { status: 'verify', note: '' }, MS: { status: 'verify', note: '' },
      MO: { status: 'verify', note: '' }, MT: { status: 'verify', note: '' },
      NE: { status: 'verify', note: '' }, NV: { status: 'verify', note: '' },
      NH: { status: 'verify', note: '' }, NJ: { status: 'verify', note: '' },
      NM: { status: 'verify', note: '' }, NY: { status: 'verify', note: '' },
      NC: { status: 'verify', note: '' }, ND: { status: 'verify', note: '' },
      OH: { status: 'verify', note: '' }, OK: { status: 'verify', note: '' },
      OR: { status: 'verify', note: '' }, PA: { status: 'verify', note: '' },
      RI: { status: 'verify', note: '' }, SC: { status: 'verify', note: '' },
      SD: { status: 'verify', note: '' }, TN: { status: 'verify', note: '' },
      TX: { status: 'verify', note: '' }, UT: { status: 'verify', note: '' },
      VT: { status: 'verify', note: '' }, VA: { status: 'verify', note: '' },
      WA: { status: 'verify', note: '' }, WV: { status: 'verify', note: '' },
      WI: { status: 'verify', note: '' }, WY: { status: 'verify', note: '' },
      DC: { status: 'verify', note: '' },
    },
  },
};
