/* ============================================================
   UTM Intranet — employee resource hub
   Vanilla JS SPA riding on the same email + password auth as the
   quote builder (/api/auth/*, quote_operators table in Supabase).
   One internal login works for both tools.

   Flow:
   1. Boot → check /api/auth/me. If 401, show login. Else show app.
   2. Hash routing: #/home, #/ae, #/biz-states, #/ppp-states, #/links.
   3. All content comes from /intranet/data.js (window.INTRANET_DATA)
      — edit that file to update the intranet.
   ============================================================ */

(function () {
  'use strict';

  const $ = (sel, root = document) => root.querySelector(sel);

  const DATA = window.INTRANET_DATA || {};

  const STATE_NAMES = {
    AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas', CA: 'California',
    CO: 'Colorado', CT: 'Connecticut', DE: 'Delaware', FL: 'Florida', GA: 'Georgia',
    HI: 'Hawaii', ID: 'Idaho', IL: 'Illinois', IN: 'Indiana', IA: 'Iowa',
    KS: 'Kansas', KY: 'Kentucky', LA: 'Louisiana', ME: 'Maine', MD: 'Maryland',
    MA: 'Massachusetts', MI: 'Michigan', MN: 'Minnesota', MS: 'Mississippi',
    MO: 'Missouri', MT: 'Montana', NE: 'Nebraska', NV: 'Nevada',
    NH: 'New Hampshire', NJ: 'New Jersey', NM: 'New Mexico', NY: 'New York',
    NC: 'North Carolina', ND: 'North Dakota', OH: 'Ohio', OK: 'Oklahoma',
    OR: 'Oregon', PA: 'Pennsylvania', RI: 'Rhode Island', SC: 'South Carolina',
    SD: 'South Dakota', TN: 'Tennessee', TX: 'Texas', UT: 'Utah', VT: 'Vermont',
    VA: 'Virginia', WA: 'Washington', WV: 'West Virginia', WI: 'Wisconsin',
    WY: 'Wyoming', DC: 'Washington, D.C.',
  };

  const STATUS_META = {
    'allowed':     { label: 'Allowed',      cls: 'ok' },
    'restricted':  { label: 'Restricted',   cls: 'warn' },
    'not-allowed': { label: 'Not allowed',  cls: 'no' },
    'verify':      { label: 'Verify',       cls: 'verify' },
  };

  const NAV = [
    { hash: '#/home',       label: 'Home' },
    { hash: '#/ae',         label: 'AE Directory' },
    { hash: '#/biz-states', label: 'Business-Purpose States' },
    { hash: '#/ppp-states', label: 'PPP States' },
    { hash: '#/links',      label: 'Quick Links' },
  ];

  const state = {
    operator: null,
  };

  // ── Boot ───────────────────────────────────────────────────────────
  async function boot() {
    try {
      const res = await fetch('/api/auth/me');
      if (res.ok) {
        const j = await res.json();
        state.operator = j.operator;
        showApp();
        return;
      }
    } catch (_) { /* fall through to login */ }
    showLogin();
  }

  // ── Login ──────────────────────────────────────────────────────────
  function showLogin() {
    $('#in-app').hidden = true;
    $('#in-login').hidden = false;
    const form = $('#in-login-form');
    const emailInput = $('#in-email-input');
    const passInput = $('#in-pass-input');
    const errBox = $('#in-login-error');
    if (form.dataset.wired) return;
    form.dataset.wired = '1';
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      errBox.hidden = true;
      const email = emailInput.value.trim();
      const password = passInput.value.trim();
      if (!email || !password) return;
      const btn = form.querySelector('button[type=submit]');
      btn.disabled = true;
      try {
        const res = await fetch('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password }),
        });
        const j = await res.json().catch(() => ({}));
        if (!res.ok) {
          errBox.textContent = j.error || 'Login failed';
          errBox.hidden = false;
          return;
        }
        state.operator = j.operator;
        passInput.value = '';
        showApp();
      } catch (_) {
        errBox.textContent = 'Network error — try again.';
        errBox.hidden = false;
      } finally {
        btn.disabled = false;
      }
    });
  }

  async function logout() {
    try { await fetch('/api/auth/logout', { method: 'POST' }); } catch (_) {}
    state.operator = null;
    location.hash = '';
    showLogin();
  }

  // ── App shell ──────────────────────────────────────────────────────
  function showApp() {
    $('#in-login').hidden = true;
    const app = $('#in-app');
    app.hidden = false;
    app.innerHTML = `
      <header class="in-topbar">
        <div class="in-topbar-left">
          <a href="#/home" class="in-topbar-brand">
            <img src="/assets/utm-blue.png" alt="United Trust Mortgage" class="in-brand-logo">
            <span class="in-topbar-sub text-mono">INTRANET</span>
          </a>
        </div>
        <nav class="in-nav" id="in-nav"></nav>
        <div class="in-topbar-right">
          <span class="in-operator text-mono">${esc(state.operator?.name || '')}</span>
          <button class="in-btn in-btn-ghost" id="in-logout-btn">Sign out</button>
        </div>
      </header>
      <main class="in-main" id="in-main"></main>
      <footer class="in-footer text-mono">
        Internal use only · Content lives in <code>intranet/data.js</code> — ask Arin for updates
      </footer>
    `;
    $('#in-logout-btn').addEventListener('click', logout);
    renderNav();
    route();
  }

  function renderNav() {
    const nav = $('#in-nav');
    if (!nav) return;
    const current = location.hash || '#/home';
    nav.innerHTML = NAV.map((n) =>
      `<a href="${n.hash}" class="in-nav-link${current === n.hash ? ' active' : ''}">${n.label}</a>`
    ).join('');
  }

  // ── Routing ────────────────────────────────────────────────────────
  function route() {
    if (!state.operator) return;
    const main = $('#in-main');
    if (!main) return;
    renderNav();
    const hash = location.hash || '#/home';
    switch (hash) {
      case '#/ae':         renderAE(main); break;
      case '#/biz-states': renderStates(main, DATA.businessPurposeStates, 'Business-Purpose Loan States'); break;
      case '#/ppp-states': renderStates(main, DATA.pppStates, 'Prepayment Penalty (PPP) States'); break;
      case '#/links':      renderLinks(main); break;
      case '#/home':
      default:             renderHome(main); break;
    }
    window.scrollTo(0, 0);
  }
  window.addEventListener('hashchange', route);

  // ── Views ──────────────────────────────────────────────────────────
  function renderHome(main) {
    const firstName = (state.operator?.name || '').split(' ')[0];
    const cards = [
      { hash: '#/ae', title: 'AE Directory', desc: 'Account executives by lender — phone, email, products.', count: `${(DATA.aeList || []).length} contacts` },
      { hash: '#/biz-states', title: 'Business-Purpose States', desc: 'Where we can originate business-purpose (DSCR / investor) loans.', count: stateCount(DATA.businessPurposeStates) },
      { hash: '#/ppp-states', title: 'PPP States', desc: 'Where prepayment penalties are allowed on business-purpose loans.', count: stateCount(DATA.pppStates) },
      { hash: '#/links', title: 'Quick Links', desc: 'Lender portals, UTM tools, and everyday resources.', count: `${(DATA.quickLinks || []).reduce((n, g) => n + g.links.length, 0)} links` },
    ];
    main.innerHTML = `
      <div class="in-hero">
        <div class="in-kicker text-mono">EMPLOYEE RESOURCES</div>
        <h1 class="in-h1">Welcome${firstName ? ', ' + esc(firstName) : ''}.</h1>
        <p class="in-hero-sub">Everything the team reaches for daily — in one place.</p>
      </div>
      <div class="in-card-grid">
        ${cards.map((c) => `
          <a href="${c.hash}" class="in-card">
            <div class="in-card-title">${c.title}</div>
            <div class="in-card-desc">${c.desc}</div>
            <div class="in-card-count text-mono">${c.count}</div>
          </a>
        `).join('')}
      </div>
      ${renderLinkGroupsHTML(true)}
    `;
  }

  function renderAE(main) {
    const list = DATA.aeList || [];
    main.innerHTML = `
      <div class="in-view-head">
        <h1 class="in-h1">AE Directory</h1>
        <input type="search" id="in-search" class="in-input in-search" placeholder="Search name, lender, product…">
      </div>
      <div class="in-table-wrap">
        <table class="in-table">
          <thead>
            <tr><th>Name</th><th>Lender</th><th>Phone</th><th>Email</th><th>Products</th><th>Notes</th></tr>
          </thead>
          <tbody id="in-ae-body"></tbody>
        </table>
      </div>
    `;
    const body = $('#in-ae-body');
    const draw = (q) => {
      const rows = list.filter((a) =>
        !q || [a.name, a.lender, a.products, a.notes, a.email].join(' ').toLowerCase().includes(q)
      );
      body.innerHTML = rows.length ? rows.map((a) => `
        <tr>
          <td class="in-td-strong">${esc(a.name)}</td>
          <td>${esc(a.lender)}</td>
          <td class="text-mono in-td-nowrap">${a.phone ? `<a href="tel:${esc(a.phone.replace(/[^\d+]/g, ''))}">${esc(a.phone)}</a>` : '—'}</td>
          <td>${a.email ? `<a href="mailto:${esc(a.email)}">${esc(a.email)}</a>` : '—'}</td>
          <td>${esc(a.products || '—')}</td>
          <td class="in-td-muted">${esc(a.notes || '')}</td>
        </tr>
      `).join('') : `<tr><td colspan="6" class="in-empty">No matches.</td></tr>`;
    };
    draw('');
    $('#in-search').addEventListener('input', (e) => draw(e.target.value.trim().toLowerCase()));
  }

  function renderStates(main, section, title) {
    section = section || { states: {} };
    const entries = Object.entries(section.states || {});
    main.innerHTML = `
      <div class="in-view-head">
        <div>
          <h1 class="in-h1">${title}</h1>
          ${section.updated ? `<div class="in-updated text-mono">UPDATED ${esc(section.updated)}</div>` : ''}
        </div>
        <input type="search" id="in-search" class="in-input in-search" placeholder="Search state…">
      </div>
      ${section.intro ? `<p class="in-intro">${esc(section.intro)}</p>` : ''}
      <div class="in-legend text-mono">
        <span class="in-badge ok">Allowed</span>
        <span class="in-badge warn">Restricted</span>
        <span class="in-badge no">Not allowed</span>
        <span class="in-badge verify">Verify</span>
      </div>
      <div class="in-state-grid" id="in-state-grid"></div>
    `;
    const grid = $('#in-state-grid');
    const draw = (q) => {
      const rows = entries.filter(([abbr]) =>
        !q || abbr.toLowerCase().includes(q) || (STATE_NAMES[abbr] || '').toLowerCase().includes(q)
      );
      grid.innerHTML = rows.length ? rows.map(([abbr, s]) => {
        const meta = STATUS_META[s.status] || STATUS_META.verify;
        return `
          <div class="in-state ${meta.cls}">
            <div class="in-state-top">
              <span class="in-state-abbr text-mono">${abbr}</span>
              <span class="in-badge ${meta.cls}">${meta.label}</span>
            </div>
            <div class="in-state-name">${esc(STATE_NAMES[abbr] || abbr)}</div>
            ${s.note ? `<div class="in-state-note">${esc(s.note)}</div>` : ''}
          </div>
        `;
      }).join('') : `<div class="in-empty">No matches.</div>`;
    };
    draw('');
    $('#in-search').addEventListener('input', (e) => draw(e.target.value.trim().toLowerCase()));
  }

  function renderLinks(main) {
    main.innerHTML = `
      <div class="in-view-head">
        <h1 class="in-h1">Quick Links</h1>
      </div>
      ${renderLinkGroupsHTML(false)}
    `;
  }

  function renderLinkGroupsHTML(homePreview) {
    const groups = DATA.quickLinks || [];
    const shown = homePreview ? groups.slice(0, 1) : groups;
    return `
      <div class="in-links">
        ${homePreview ? `<div class="in-kicker text-mono">QUICK LINKS</div>` : ''}
        ${shown.map((g) => `
          <div class="in-link-group">
            <div class="in-link-group-title">${esc(g.group)}</div>
            <div class="in-link-grid">
              ${g.links.map((l) => `
                <a class="in-link" href="${esc(l.url)}" target="_blank" rel="noopener">
                  <div class="in-link-label">${esc(l.label)}</div>
                  ${l.desc ? `<div class="in-link-desc">${esc(l.desc)}</div>` : ''}
                </a>
              `).join('')}
            </div>
          </div>
        `).join('')}
        ${homePreview && groups.length > 1 ? `<a href="#/links" class="in-more text-mono">ALL LINKS →</a>` : ''}
      </div>
    `;
  }

  // ── Helpers ────────────────────────────────────────────────────────
  function stateCount(section) {
    const states = Object.values(section?.states || {});
    const ok = states.filter((s) => s.status === 'allowed').length;
    const pending = states.filter((s) => s.status === 'verify').length;
    if (pending === states.length) return `${states.length} states · needs review`;
    return `${ok} allowed of ${states.length}`;
  }

  function esc(s) {
    return String(s ?? '')
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  boot();
})();
