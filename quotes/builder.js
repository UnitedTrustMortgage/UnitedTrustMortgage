/* ============================================================
   UTM SITE — Operator quote builder (vanilla JS port of
   QuoteEditorPage.tsx from cadence-crm)

   Flow:
   1. Boot → check /api/auth/me. If 401, show login. Else show app.
   2. App shell:
        - Dashboard: list of quotes (or "+ New quote" if empty)
        - Editor: intake form + options + live preview + share
   3. Save → POST /api/quotes (create) or POST /api/quotes/:id/revisions
            (append revision)
   4. Share link → https://quotes.myunitedtrust.com/<public_token>
   ============================================================ */

(function () {
  'use strict';

  const $  = (sel, root = document) => root.querySelector(sel);

  // ── Constants (mirror cadence-crm's QuoteEditorPage option lists) ──
  const STATES = [
    'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA',
    'KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ',
    'NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT',
    'VA','WA','WV','WI','WY','DC',
  ];

  const PURPOSE_OPTIONS = [
    { value: 'cashout',  label: 'Cash-out refinance' },
    { value: 'rateterm', label: 'Rate / term refi' },
    { value: 'purchase', label: 'Purchase' },
  ];
  const PROPERTY_TYPE_OPTIONS = [
    { value: 'sfr',          label: 'Single family' },
    { value: '2-4',          label: '2–4 unit' },
    { value: '5+',           label: 'Multi Unit 5+' },
    { value: 'condo',        label: 'Condo' },
    { value: 'townhome',     label: 'Townhome' },
    { value: 'manufactured', label: 'Manufactured' },
  ];
  const OCCUPANCY_OPTIONS = [
    { value: 'primary',    label: 'Primary' },
    { value: 'second',     label: 'Second home' },
    { value: 'investment', label: 'Investment' },
  ];
  const PRODUCT_OPTIONS = [
    { value: '30yr-nonqm', label: '30-Yr Non-QM Fixed' },
    { value: '30yr-conv',  label: '30-Yr Conventional Fixed' },
    { value: '15yr-conv',  label: '15-Yr Conventional Fixed' },
    { value: '7-1arm',     label: '7/1 ARM' },
    { value: 'dscr',       label: 'DSCR Investor' },
  ];
  const CREDIT_OPTIONS = [
    { value: '760+',    label: '760+' },
    { value: '720-759', label: '720–759' },
    { value: '680-719', label: '680–719' },
    { value: '<680',    label: '< 680' },
  ];

  function blankIntake() {
    return {
      borrowerName: '',
      email: '',
      phone: '',
      creditScore: '720-759',
      address: '',
      city: '',
      state: '',
      zip: '',
      propertyType: 'sfr',
      units: 1,
      occupancy: 'primary',
      estValue: '',
      loanBalance: '',
      loanPurpose: 'rateterm',
      product: '30yr-conv',
      lockPeriod: 30,
      desiredCashOut: 0,
      escrowWaived: false,
      monthlyTaxes: '',
      monthlyInsurance: '',
      allowPPP: false,
      // LO-only — never shown to the borrower.
      wholesaleLender: '',
      priceToMe: '',
      notes: '',
    };
  }

  function blankOption() {
    return {
      id: 'opt_' + Math.random().toString(36).slice(2, 10),
      label: '',
      loanAmount: 0,
      rate: 0,
      apr: null,
      termMonths: 360,
      productType: '30-Yr Fixed',
      monthlyPayment: 0,
      cashOut: null,
      points: 0,
      pointsCost: 0,
      lenderFees: 0,
      thirdPartyFees: 0,
      taxesAndGov: 0,
      prepaidsAndEscrow: 0,
      lenderCredit: 0,
      hasPpp: false,
      pppDescription: null,
      recommended: false,
      badge: null,
      notes: null,
    };
  }

  // ── State ──────────────────────────────────────────────────────────
  const state = {
    operator: null,
    view: 'login',          // 'login' | 'dashboard' | 'editor'
    quotes: [],             // dashboard list
    editing: null,          // { quote: {id,public_token,...}|null, form, options, title, note }
    saving: false,
    toast: null,            // { type:'ok'|'err', msg }
  };

  // ── Boot ───────────────────────────────────────────────────────────
  async function boot() {
    try {
      const res = await fetch('/api/auth/me');
      if (res.ok) {
        const j = await res.json();
        state.operator = j.operator;
        state.view = 'dashboard';
        await loadQuotes();
      }
    } catch (_) { /* offline */ }
    render();
  }

  async function loadQuotes() {
    try {
      const res = await fetch('/api/quotes');
      if (res.ok) {
        const j = await res.json();
        state.quotes = j.quotes || [];
      }
    } catch (_) { state.quotes = []; }
  }

  // ── Login ──────────────────────────────────────────────────────────
  function bindLogin() {
    const form = $('#qb-login-form');
    const input = $('#qb-pass-input');
    const errBox = $('#qb-login-error');
    if (!form) return;
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      errBox.hidden = true;
      const code = input.value.trim();
      if (!code) return;
      try {
        const res = await fetch('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ passCode: code }),
        });
        const j = await res.json().catch(() => ({}));
        if (!res.ok) {
          errBox.textContent = j.error || 'Login failed';
          errBox.hidden = false;
          return;
        }
        state.operator = j.operator;
        state.view = 'dashboard';
        await loadQuotes();
        render();
      } catch (err) {
        errBox.textContent = err.message || 'Network error';
        errBox.hidden = false;
      }
    });
  }

  async function logout() {
    try { await fetch('/api/auth/logout', { method: 'POST' }); } catch (_) {}
    state.operator = null;
    state.view = 'login';
    state.quotes = [];
    state.editing = null;
    render();
  }

  // ── Render ─────────────────────────────────────────────────────────
  function render() {
    const login = $('#qb-login');
    const app   = $('#qb-app');
    if (state.view === 'login') {
      login.hidden = false;
      app.hidden = true;
      bindLogin();
      return;
    }
    login.hidden = true;
    app.hidden = false;
    app.innerHTML = topbar() + (state.view === 'dashboard' ? dashboardHtml() : editorHtml());
    if (state.view === 'dashboard') bindDashboard();
    else bindEditor();
    bindTopbar();
    renderToast();
  }

  function topbar() {
    return `
      <header class="qb-topbar">
        <div class="qb-topbar-left">
          <a href="/quotes/" class="qb-topbar-brand" data-nav="dashboard">
            <span class="qb-brand-mark">UTM</span>
            <div>
              <div class="qb-brand-name">United Trust Mortgage</div>
            </div>
          </a>
          <span class="qb-topbar-tag">QUOTE BUILDER</span>
        </div>
        <div class="qb-topbar-right">
          <span class="qb-who">Signed in as <strong>${escapeHtml(state.operator?.name ?? '?')}</strong></span>
          <button class="qb-link-btn" data-act="logout">Sign out</button>
        </div>
      </header>
    `;
  }

  function bindTopbar() {
    document.querySelectorAll('[data-nav="dashboard"]').forEach((el) => {
      el.addEventListener('click', (e) => { e.preventDefault(); openDashboard(); });
    });
    document.querySelectorAll('[data-act="logout"]').forEach((el) => {
      el.addEventListener('click', logout);
    });
  }

  // ── Dashboard ──────────────────────────────────────────────────────
  function dashboardHtml() {
    return `
      <main class="qb-form-col" style="max-width:1320px">
        <div class="qb-page-head">
          <div class="qb-crumbs">Quote Builder</div>
          <h1 class="qb-h1">Your <em>quotes</em></h1>
        </div>
        <div style="display:flex;gap:10px;align-items:center;justify-content:space-between;margin-bottom:8px">
          <p style="color:var(--muted);font-size:14px">
            Build a comparison and share the link with the borrower.
            They pick an option and you get a text + email.
          </p>
          <button class="qb-btn qb-btn-primary" data-act="new-quote">+ New quote</button>
        </div>

        ${
          state.quotes.length === 0
            ? `<div class="qb-empty">No quotes yet — click <strong>+ New quote</strong> to build one.</div>`
            : `
            <div class="qb-dash-scroll">
            <table class="qb-dash-table">
              <thead>
                <tr>
                  <th>First name</th>
                  <th>Last name</th>
                  <th>Phone</th>
                  <th>Email</th>
                  <th>Transaction</th>
                  <th>Loan amount</th>
                  <th>State</th>
                  <th>Wholesale lender</th>
                  <th>Status</th>
                  <th>Last activity</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                ${state.quotes.map((q) => {
                  const nm = splitName(q.borrower_name);
                  return `
                  <tr>
                    <td>${escapeHtml(nm.first || '—')}</td>
                    <td>${escapeHtml(nm.last || '—')}</td>
                    <td>${q.borrower_phone ? `<a class="qb-cell-link" href="tel:${escapeAttr(q.borrower_phone)}">${escapeHtml(q.borrower_phone)}</a>` : '—'}</td>
                    <td>${q.borrower_email ? `<a class="qb-cell-link" href="mailto:${escapeAttr(q.borrower_email)}">${escapeHtml(q.borrower_email)}</a>` : '—'}</td>
                    <td>${escapeHtml(q.transaction_type || '—')}</td>
                    <td class="qb-mono">${fmtMoneyOrDash(q.loan_amount)}</td>
                    <td>${escapeHtml(q.property_state || '—')}</td>
                    <td>${escapeHtml(q.wholesale_lender || '—')}</td>
                    <td><span class="qb-status qb-status-${escapeAttr(q.status)}">${escapeHtml(q.status)}</span></td>
                    <td>${fmtRelative(q.updated_at)}</td>
                    <td style="text-align:right;white-space:nowrap">
                      <button class="qb-link-btn" data-edit="${escapeAttr(q.id)}">Edit</button>
                      <button class="qb-link-btn" data-share="${escapeAttr(q.public_token)}">Copy link</button>
                    </td>
                  </tr>
                `;}).join('')}
              </tbody>
            </table>
            </div>
            `
        }
      </main>
    `;
  }

  function bindDashboard() {
    $('[data-act="new-quote"]')?.addEventListener('click', () => openEditor(null));
    document.querySelectorAll('[data-edit]').forEach((el) => {
      el.addEventListener('click', async () => {
        const id = el.dataset.edit;
        await openEditor(id);
      });
    });
    document.querySelectorAll('[data-share]').forEach((el) => {
      el.addEventListener('click', () => {
        const token = el.dataset.share;
        copyShareLink(token);
      });
    });
  }

  async function openDashboard() {
    state.view = 'dashboard';
    state.editing = null;
    await loadQuotes();
    render();
  }

  async function openEditor(quoteId) {
    if (!quoteId) {
      state.editing = {
        quote: null,
        form: blankIntake(),
        options: [blankOption()],
        title: '',
        note: '',
      };
    } else {
      // Load existing quote.
      try {
        const res = await fetch(`/api/quotes/${encodeURIComponent(quoteId)}`);
        if (!res.ok) {
          toast('err', `Couldn't load quote (HTTP ${res.status})`);
          return;
        }
        const { quote, revision } = await res.json();
        const form = { ...blankIntake() };
        if (revision) {
          Object.assign(form, revision.borrower_json || {});
          Object.assign(form, revision.loan_json || {});
          Object.assign(form, revision.property_json || {});
        }
        // LO-only fields live on the quote row (columns), not the revision JSON.
        form.wholesaleLender = quote.wholesale_lender || '';
        form.priceToMe = quote.price_to_me || '';
        form.notes = quote.internal_notes || '';
        state.editing = {
          quote,
          form,
          options: (revision?.options_json && revision.options_json.length > 0)
            ? revision.options_json
            : [blankOption()],
          title: quote.title || '',
          note: quote.note || '',
        };
      } catch (e) {
        toast('err', e.message || 'Load failed');
        return;
      }
    }
    state.view = 'editor';
    render();
  }

  // ── Editor ─────────────────────────────────────────────────────────

  function editorHtml() {
    const e = state.editing;
    if (!e) return '';
    const isPurchase = e.form.loanPurpose === 'purchase';

    const ltv = (() => {
      const balance = Number(e.form.loanBalance) || 0;
      const value   = Number(e.form.estValue) || 0;
      if (!balance || !value) return 0;
      return (balance / value) * 100;
    })();

    const downPayment = (() => {
      if (!isPurchase) return null;
      const price = Number(e.form.estValue) || 0;
      const loan  = Number(e.form.loanBalance) || 0;
      if (!price || !loan) return null;
      return Math.max(0, price - loan);
    })();

    return `
      <div class="qb-layout">
        <main class="qb-form-col">
          <div class="qb-page-head">
            <div class="qb-crumbs">
              <a href="#" data-nav="dashboard">Quote Builder</a>
              &nbsp;/&nbsp; ${e.quote ? 'Edit quote' : 'New quote'}
            </div>
            <h1 class="qb-h1">${e.quote ? 'Edit' : 'Build a'} <em>${escapeHtml(loanPurposeLabel(e.form.loanPurpose))}</em> quote.</h1>
          </div>

          <!-- 01 Borrower -->
          <section class="qb-section">
            <div class="qb-section-head">
              <h2 class="qb-section-title"><span class="qb-section-num">01</span> Borrower</h2>
              <span class="qb-section-hint">Who you're pricing</span>
            </div>
            <div class="qb-fields">
              ${field('Full legal name', 'text', 'borrowerName', e.form.borrowerName, 'First Last', { required: true })}
              ${fieldChips('Credit score range', 'creditScore', e.form.creditScore, CREDIT_OPTIONS)}
              ${field('Email', 'email', 'email', e.form.email, 'borrower@example.com')}
              ${field('Phone', 'tel', 'phone', e.form.phone, '(555) 123-4567')}
            </div>
          </section>

          <!-- 02 Property -->
          <section class="qb-section">
            <div class="qb-section-head">
              <h2 class="qb-section-title"><span class="qb-section-num">02</span> Property</h2>
              <span class="qb-section-hint">What & where</span>
            </div>
            <div class="qb-fields">
              ${field('Street address', 'text', 'address', e.form.address, '123 Main St', { full: true })}
              ${field('City', 'text', 'city', e.form.city, 'Muskogee')}
              ${fieldSelect('State', 'state', e.form.state, ['', ...STATES].map((s) => ({ value: s, label: s || '—' })))}
              ${field('ZIP', 'text', 'zip', e.form.zip, '74429', { required: true, mono: true, maxLength: 5 })}
              ${fieldChips('Property type', 'propertyType', e.form.propertyType, PROPERTY_TYPE_OPTIONS, { full: true })}
              ${fieldChips('Occupancy', 'occupancy', e.form.occupancy, OCCUPANCY_OPTIONS)}
              ${field('Number of units', 'number', 'units', e.form.units, '1')}
              ${fieldMoney(isPurchase ? 'Purchase price' : 'Estimated value', 'estValue', e.form.estValue, '260,000', { required: true, hint: isPurchase ? 'Contract price' : 'AVM or recent appraisal' })}
              ${fieldMoney(isPurchase ? 'Loan amount' : 'Current loan balance', 'loanBalance', e.form.loanBalance, '195,000')}
            </div>

            <div class="qb-ltv" style="margin-top:18px;padding:14px;background:rgba(244,241,232,0.03);border:1px solid var(--line)">
              <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:8px">
                <span style="font-size:12px;color:var(--muted)">Loan-to-value</span>
                <strong class="qb-input qb-mono" style="background:transparent;border:0;padding:0;width:auto;font-size:14px">${ltv ? ltv.toFixed(1) + '%' : '—'}</strong>
              </div>
              <div style="height:6px;background:rgba(244,241,232,0.06);position:relative;overflow:hidden">
                <div style="height:100%;width:${Math.min(ltv, 100)}%;background:${ltv > 80 ? '#b13e1c' : ltv > 70 ? 'var(--champagne)' : 'var(--emerald-bright)'};transition:width 0.25s"></div>
              </div>
            </div>

            ${
              isPurchase
                ? `
              <div style="margin-top:14px;padding:14px;background:rgba(244,241,232,0.03);border:1px solid var(--line)">
                <div style="font-size:12px;color:var(--muted);margin-bottom:8px">Down payment</div>
                <div class="qb-fields">
                  ${fieldMoney('Amount', '__dpAmount', downPayment ?? '', '65,000')}
                  ${fieldPct('Percent of price', '__dpPct',
                    (downPayment != null && Number(e.form.estValue) > 0)
                      ? Number(((downPayment / Number(e.form.estValue)) * 100).toFixed(2))
                      : '',
                    '20')}
                </div>
                <div style="font-family:var(--font-mono);font-size:10.5px;color:var(--muted-faint);letter-spacing:0.14em;text-transform:uppercase;margin-top:8px">
                  ${Number(e.form.estValue) > 0 ? 'Editing either updates the loan amount' : 'Enter purchase price first'}
                </div>
              </div>
            `
                : ''
            }
          </section>

          <!-- 03 Loan structure -->
          <section class="qb-section">
            <div class="qb-section-head">
              <h2 class="qb-section-title"><span class="qb-section-num">03</span> Loan structure</h2>
              <span class="qb-section-hint">What product to price</span>
            </div>
            <div class="qb-fields">
              ${fieldChips('Loan purpose', 'loanPurpose', e.form.loanPurpose, PURPOSE_OPTIONS, { full: true })}
              ${fieldSelect('Product', 'product', e.form.product, PRODUCT_OPTIONS)}
              ${field('Lock period (days)', 'number', 'lockPeriod', e.form.lockPeriod, '30')}
              ${e.form.loanPurpose === 'cashout' ? fieldMoney('Desired cash-out', 'desiredCashOut', e.form.desiredCashOut, '0') : ''}
              ${fieldMoney('Monthly property taxes', 'monthlyTaxes', e.form.monthlyTaxes, '270')}
              ${fieldMoney('Monthly insurance', 'monthlyInsurance', e.form.monthlyInsurance, '120')}
            </div>
            <div style="margin-top:14px;display:flex;gap:18px;flex-wrap:wrap">
              ${toggle('Escrow waived (no T&I escrow)', 'escrowWaived', e.form.escrowWaived)}
              ${toggle('Allow prepayment penalty', 'allowPPP', e.form.allowPPP)}
            </div>
          </section>

          <!-- 04 Notes -->
          <section class="qb-section">
            <div class="qb-section-head">
              <h2 class="qb-section-title"><span class="qb-section-num">04</span> Notes</h2>
              <span class="qb-section-hint">Shown to borrower</span>
            </div>
            <div class="qb-fields">
              ${field('Quote title (shown to borrower)', 'text', '__title', e.title, 'Refinance — John Smith', { full: true })}
              <div class="qb-field qb-full">
                <div class="qb-label-row"><label class="qb-label">Note to client (optional)</label></div>
                <textarea class="qb-textarea" data-field="__note" placeholder="Optional message that appears under the quote title.">${escapeHtml(e.note)}</textarea>
              </div>
            </div>
          </section>

          <!-- LO-only — wholesale lender, price-to-me, private notes. Saved to
               dedicated columns; never returned by the borrower endpoint. -->
          <section class="qb-section qb-lo">
            <div class="qb-lo-head">
              <span class="qb-lo-badge">LO ONLY</span>
              <div class="qb-lo-titles">
                <div class="qb-lo-title">Internal notes</div>
                <div class="qb-lo-sub">Never shown to the borrower</div>
              </div>
            </div>
            <div class="qb-fields">
              ${field('Wholesale lender', 'text', 'wholesaleLender', e.form.wholesaleLender, 'e.g. UWM, Rocket Pro TPO, PennyMac')}
              ${field('Price to me', 'text', 'priceToMe', e.form.priceToMe, '100.000', { hint: 'e.g. 100.250', mono: true })}
              <div class="qb-field qb-full">
                <div class="qb-label-row"><label class="qb-label">Notes</label></div>
                <textarea class="qb-textarea" data-field="notes" placeholder="Lock window, rep name, special pricing, anything you want to remember…">${escapeHtml(e.form.notes)}</textarea>
              </div>
            </div>
          </section>

          <!-- 05 Quote options -->
          <section class="qb-section">
            <div class="qb-section-head">
              <h2 class="qb-section-title"><span class="qb-section-num">05</span> Quote options</h2>
              <span class="qb-section-hint">Each becomes a card the borrower sees</span>
            </div>
            <div class="qb-opts">
              ${e.options.map((opt, i) => renderOptionEditor(opt, i)).join('')}
            </div>
            <button class="qb-btn qb-btn-ghost" data-act="add-option" style="margin-top:16px;width:100%">+ Add another option</button>
          </section>
        </main>

        <!-- Live preview rail -->
        <aside class="qb-rail">
          <div class="qb-rail-eyebrow">Live snapshot</div>
          <h2 class="qb-rail-h">${escapeHtml(e.title || 'Untitled quote')}</h2>
          <div class="qb-rail-row"><span class="lbl">Borrower</span><span class="val">${escapeHtml(e.form.borrowerName || '—')}</span></div>
          <div class="qb-rail-row"><span class="lbl">${isPurchase ? 'Purchase price' : 'Est. value'}</span><span class="val">${fmtMoneyOrDash(Number(e.form.estValue) || null)}</span></div>
          <div class="qb-rail-row"><span class="lbl">${isPurchase ? 'Loan amount' : 'Loan balance'}</span><span class="val">${fmtMoneyOrDash(Number(e.form.loanBalance) || null)}</span></div>
          <div class="qb-rail-row"><span class="lbl">LTV</span><span class="val">${ltv ? ltv.toFixed(1) + '%' : '—'}</span></div>
          <div class="qb-rail-row"><span class="lbl">Options</span><span class="val">${e.options.filter((o) => (o.rate ?? 0) > 0 || (o.loanAmount ?? 0) > 0).length}</span></div>

          <div class="qb-rail-actions">
            <button class="qb-btn qb-btn-primary" data-act="save" ${state.saving ? 'disabled' : ''}>
              ${state.saving ? 'Saving…' : (e.quote ? 'Save changes' : 'Save & generate link')}
            </button>
            ${
              e.quote?.public_token
                ? `
              <div class="qb-share-box">
                <input readonly value="${escapeAttr(shareUrl(e.quote.public_token))}" id="qb-share-input">
                <button class="qb-btn" data-act="copy-share">Copy</button>
              </div>
              <a href="${escapeAttr(shareUrl(e.quote.public_token))}" target="_blank" rel="noopener" class="qb-link-btn" style="text-align:center">
                Open borrower view ↗
              </a>
            `
                : `<p style="color:var(--muted-faint);font-size:11.5px;text-align:center">Share link appears after first save.</p>`
            }
          </div>
        </aside>
      </div>
    `;
  }

  function loanPurposeLabel(v) {
    return PURPOSE_OPTIONS.find((p) => p.value === v)?.label?.toLowerCase() || 'loan';
  }

  function renderOptionEditor(opt, i) {
    return `
      <div class="qb-opt" data-opt-idx="${i}">
        <div class="qb-opt-head">
          <div class="qb-opt-name">Option ${i + 1}</div>
          <button class="qb-link-btn qb-btn-danger" data-act="remove-option" data-idx="${i}">Remove</button>
        </div>
        <div class="qb-fields">
          ${field('Label (e.g. "5 Year PPP")', 'text', `__opt.${i}.label`, opt.label, '5 Year PPP')}
          ${fieldSelect('Product type', `__opt.${i}.productType`, opt.productType, [
            '30-Yr Fixed', '15-Yr Fixed', '7/1 ARM', '5/1 ARM', '30-Yr Non-QM Fixed', 'DSCR'
          ].map((v) => ({ value: v, label: v })))}
          ${fieldMoney('Loan amount', `__opt.${i}.loanAmount`, opt.loanAmount, '880,000')}
          ${field('Term (months)', 'number', `__opt.${i}.termMonths`, opt.termMonths, '360')}
          ${fieldPct('Rate', `__opt.${i}.rate`, opt.rate, '6.375', { decimals: 3 })}
          ${fieldPct('APR (optional)', `__opt.${i}.apr`, opt.apr, '6.500', { decimals: 3 })}
          ${fieldMoney('Monthly payment (P&I)', `__opt.${i}.monthlyPayment`, opt.monthlyPayment, '5,490.06', { cents: true })}
          ${field('Points', 'number', `__opt.${i}.points`, opt.points, '0', { step: '0.001' })}
          ${fieldMoney('Points cost', `__opt.${i}.pointsCost`, opt.pointsCost, '0')}
          ${fieldMoney('Lender fees', `__opt.${i}.lenderFees`, opt.lenderFees, '2,500')}
          ${fieldMoney('Third-party fees', `__opt.${i}.thirdPartyFees`, opt.thirdPartyFees, '12,870')}
          ${fieldMoney("Taxes & gov't", `__opt.${i}.taxesAndGov`, opt.taxesAndGov, '28,299')}
          ${fieldMoney('Prepaids & escrow', `__opt.${i}.prepaidsAndEscrow`, opt.prepaidsAndEscrow, '5,789.48', { cents: true })}
          ${fieldMoney('Lender credit', `__opt.${i}.lenderCredit`, opt.lenderCredit, '0')}
          ${field('Cash to borrower (refis)', 'number', `__opt.${i}.cashOut`, opt.cashOut ?? '', '0')}
        </div>
        <div style="margin-top:14px;display:flex;gap:18px;flex-wrap:wrap">
          ${toggle('Has prepayment penalty', `__opt.${i}.hasPpp`, opt.hasPpp)}
          ${toggle('Mark as Recommended', `__opt.${i}.recommended`, opt.recommended)}
        </div>
        ${
          opt.hasPpp
            ? `<div class="qb-field" style="margin-top:14px">
                ${field('PPP description', 'text', `__opt.${i}.pppDescription`, opt.pppDescription ?? '', '5 Year | 5% FIXED')}
               </div>`
            : ''
        }
      </div>
    `;
  }

  // ── Editor bindings ────────────────────────────────────────────────
  function bindEditor() {
    const e = state.editing;
    if (!e) return;

    // Plain inputs
    document.querySelectorAll('[data-field]').forEach((el) => {
      el.addEventListener('input', () => updateField(el.dataset.field, parseInputValue(el)));
    });
    // Chips
    document.querySelectorAll('[data-chips]').forEach((wrap) => {
      const key = wrap.dataset.chips;
      wrap.querySelectorAll('button').forEach((btn) => {
        btn.addEventListener('click', () => {
          updateField(key, btn.dataset.val);
        });
      });
    });
    // Toggles
    document.querySelectorAll('[data-toggle-field]').forEach((el) => {
      el.addEventListener('change', () => updateField(el.dataset.toggleField, el.checked));
    });
    // Actions
    $('[data-act="add-option"]')?.addEventListener('click', () => {
      e.options.push(blankOption());
      render();
    });
    document.querySelectorAll('[data-act="remove-option"]').forEach((b) => {
      b.addEventListener('click', () => {
        const i = Number(b.dataset.idx);
        e.options.splice(i, 1);
        if (e.options.length === 0) e.options.push(blankOption());
        render();
      });
    });
    $('[data-act="save"]')?.addEventListener('click', save);
    $('[data-act="copy-share"]')?.addEventListener('click', () => {
      const input = $('#qb-share-input');
      input?.select();
      navigator.clipboard?.writeText(input.value).then(
        () => toast('ok', 'Share link copied'),
        () => toast('err', "Couldn't copy"),
      );
    });
  }

  function parseInputValue(el) {
    if (el.type === 'checkbox') return el.checked;
    if (el.type === 'number') {
      const v = el.value === '' ? '' : Number(el.value);
      return Number.isFinite(v) || v === '' ? v : '';
    }
    if (el.dataset.kind === 'money') {
      const raw = el.value.replace(/[^0-9.]/g, '');
      return raw === '' ? '' : Number(raw);
    }
    if (el.dataset.kind === 'pct') {
      const raw = el.value.replace(/[^0-9.]/g, '');
      return raw === '' ? null : Number(raw);
    }
    return el.value;
  }

  function updateField(key, value) {
    const e = state.editing;
    if (!e) return;

    // Special-case top-level title/note
    if (key === '__title') { e.title = String(value || ''); return; }
    if (key === '__note')  { e.note  = String(value || ''); return; }

    // Special-case down-payment dual controls
    if (key === '__dpAmount') {
      const price = Number(e.form.estValue) || 0;
      if (!price) return;
      const dp = typeof value === 'number' ? value : 0;
      e.form.loanBalance = Math.max(0, price - dp);
      render();
      return;
    }
    if (key === '__dpPct') {
      const price = Number(e.form.estValue) || 0;
      if (!price || value == null || value === '') return;
      const dp = Math.round(price * (Number(value) / 100));
      e.form.loanBalance = Math.max(0, price - dp);
      render();
      return;
    }

    // Option fields: __opt.<idx>.<field>
    const optMatch = key.match(/^__opt\.(\d+)\.(.+)$/);
    if (optMatch) {
      const i = Number(optMatch[1]);
      const f = optMatch[2];
      if (!e.options[i]) return;
      e.options[i][f] = value;
      // re-render if it's a flag that affects sub-fields (hasPpp shows
      // the description input) or if it's loanPurpose (changes layout)
      if (f === 'hasPpp') render();
      return;
    }

    // Standard form fields
    e.form[key] = value;

    // Live re-render for things that drive layout (loan purpose,
    // estValue/loanBalance for the down-payment block, ltv bar).
    if (key === 'loanPurpose' || key === 'estValue' || key === 'loanBalance') {
      render();
    }
  }

  // ── Save ───────────────────────────────────────────────────────────
  async function save() {
    const e = state.editing;
    if (!e || state.saving) return;
    if (!e.form.borrowerName?.trim()) {
      toast('err', 'Borrower name is required');
      return;
    }

    state.saving = true;
    render();

    const borrower = {
      borrowerName: e.form.borrowerName,
      email: e.form.email,
      phone: e.form.phone,
      creditScore: e.form.creditScore,
    };
    const property = {
      address: e.form.address,
      city: e.form.city,
      state: e.form.state,
      zip: e.form.zip,
      propertyType: e.form.propertyType,
      units: e.form.units,
      occupancy: e.form.occupancy,
      type: PROPERTY_TYPE_OPTIONS.find((p) => p.value === e.form.propertyType)?.label,
      estValue: Number(e.form.estValue) || null,
      loanBalance: Number(e.form.loanBalance) || null,
    };
    const loan = {
      loanPurpose: e.form.loanPurpose,
      purpose: PURPOSE_OPTIONS.find((p) => p.value === e.form.loanPurpose)?.label,
      product: e.form.product,
      lockPeriod: e.form.lockPeriod,
      desiredCashOut: e.form.desiredCashOut,
      escrowWaived: e.form.escrowWaived,
      monthlyTaxes: e.form.monthlyTaxes === '' ? null : Number(e.form.monthlyTaxes),
      monthlyInsurance: e.form.monthlyInsurance === '' ? null : Number(e.form.monthlyInsurance),
      allowPPP: e.form.allowPPP,
      // NOTE: internal notes are intentionally NOT in loan_json — they ship to
      // the borrower's browser in the public payload. They go in the
      // internal_notes column via the top-level fields below.
    };

    // LO-only fields — sent at the top level so the function writes them to
    // dedicated columns that the borrower endpoint never returns.
    const loOnly = {
      wholesaleLender: e.form.wholesaleLender || null,
      priceToMe: e.form.priceToMe || null,
      internalNotes: e.form.notes || null,
    };

    try {
      let res, body;
      if (!e.quote) {
        body = {
          borrowerName: e.form.borrowerName,
          borrowerEmail: e.form.email || null,
          borrowerPhone: e.form.phone || null,
          title: e.title,
          note: e.note,
          ...loOnly,
          initialRevision: { borrower, property, loan, options: e.options },
        };
        res = await fetch('/api/quotes', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
      } else {
        body = {
          title: e.title,
          note: e.note,
          ...loOnly,
          borrower,
          property,
          loan,
          options: e.options,
        };
        res = await fetch(`/api/quotes/${encodeURIComponent(e.quote.id)}/revisions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
      }
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || `Save failed (HTTP ${res.status})`);
      state.editing.quote = j.quote;
      toast('ok', 'Saved');
    } catch (err) {
      toast('err', err.message || 'Save failed');
    } finally {
      state.saving = false;
      render();
    }
  }

  // ── Helpers ────────────────────────────────────────────────────────
  function shareUrl(token) {
    return `https://quotes.myunitedtrust.com/${encodeURIComponent(token)}`;
  }

  function copyShareLink(token) {
    const url = shareUrl(token);
    navigator.clipboard?.writeText(url).then(
      () => toast('ok', 'Share link copied'),
      () => toast('err', "Couldn't copy"),
    );
  }

  function toast(type, msg) {
    state.toast = { type, msg };
    renderToast();
    setTimeout(() => {
      if (state.toast && state.toast.msg === msg) {
        state.toast = null;
        renderToast();
      }
    }, 2800);
  }

  function renderToast() {
    let el = $('.qb-toast');
    if (!state.toast) { el?.remove(); return; }
    if (!el) {
      el = document.createElement('div');
      document.body.appendChild(el);
    }
    el.className = `qb-toast ${state.toast.type === 'err' ? 'qb-toast-err' : ''}`;
    el.textContent = state.toast.msg;
  }

  // ── Field builders ─────────────────────────────────────────────────
  function field(label, type, key, value, placeholder, opts = {}) {
    const full = opts.full ? ' qb-full' : '';
    const required = opts.required ? '<span class="qb-req">*</span>' : '';
    const hint = opts.hint ? `<span class="qb-hint">${escapeHtml(opts.hint)}</span>` : '';
    const max = opts.maxLength ? ` maxlength="${opts.maxLength}"` : '';
    const step = opts.step ? ` step="${opts.step}"` : '';
    const monoCls = opts.mono ? ' qb-mono' : '';
    return `
      <div class="qb-field${full}">
        <div class="qb-label-row"><label class="qb-label">${escapeHtml(label)}${required}</label>${hint}</div>
        <input class="qb-input${monoCls}" type="${type}" data-field="${escapeAttr(key)}"
               value="${escapeAttr(value ?? '')}" placeholder="${escapeAttr(placeholder || '')}"${max}${step}>
      </div>
    `;
  }

  function fieldMoney(label, key, value, placeholder, opts = {}) {
    const full = opts.full ? ' qb-full' : '';
    const required = opts.required ? '<span class="qb-req">*</span>' : '';
    const hint = opts.hint ? `<span class="qb-hint">${escapeHtml(opts.hint)}</span>` : '';
    const display = value === '' || value == null
      ? ''
      : Number(value).toLocaleString('en-US',
          opts.cents
            ? { minimumFractionDigits: 2, maximumFractionDigits: 2 }
            : {}
        );
    return `
      <div class="qb-field${full}">
        <div class="qb-label-row"><label class="qb-label">${escapeHtml(label)}${required}</label>${hint}</div>
        <div class="qb-input-wrap">
          <span class="qb-prefix">$</span>
          <input class="qb-input qb-mono qb-with-prefix" type="text" inputmode="decimal"
                 data-field="${escapeAttr(key)}" data-kind="money"
                 value="${escapeAttr(display)}" placeholder="${escapeAttr(placeholder || '0')}">
        </div>
      </div>
    `;
  }

  function fieldPct(label, key, value, placeholder, opts = {}) {
    const display = value === '' || value == null ? '' : String(value);
    return `
      <div class="qb-field">
        <div class="qb-label-row"><label class="qb-label">${escapeHtml(label)}</label></div>
        <div class="qb-input-wrap">
          <input class="qb-input qb-mono qb-with-suffix" type="text" inputmode="decimal"
                 data-field="${escapeAttr(key)}" data-kind="pct"
                 value="${escapeAttr(display)}" placeholder="${escapeAttr(placeholder || '0')}">
          <span class="qb-suffix">%</span>
        </div>
      </div>
    `;
  }

  function fieldSelect(label, key, value, options, opts = {}) {
    const full = opts.full ? ' qb-full' : '';
    return `
      <div class="qb-field${full}">
        <div class="qb-label-row"><label class="qb-label">${escapeHtml(label)}</label></div>
        <select class="qb-select" data-field="${escapeAttr(key)}">
          ${options.map((o) =>
            `<option value="${escapeAttr(o.value)}"${o.value === value ? ' selected' : ''}>${escapeHtml(o.label)}</option>`,
          ).join('')}
        </select>
      </div>
    `;
  }

  function fieldChips(label, key, value, options, opts = {}) {
    const full = opts.full ? ' qb-full' : '';
    return `
      <div class="qb-field${full}">
        <div class="qb-label-row"><label class="qb-label">${escapeHtml(label)}</label></div>
        <div class="qb-chips" data-chips="${escapeAttr(key)}">
          ${options.map((o) =>
            `<button type="button" class="qb-chip ${o.value === value ? 'qb-chip-on' : ''}" data-val="${escapeAttr(o.value)}">${escapeHtml(o.label)}</button>`,
          ).join('')}
        </div>
      </div>
    `;
  }

  function toggle(label, key, value) {
    return `
      <label class="qb-toggle">
        <input type="checkbox" data-toggle-field="${escapeAttr(key)}"${value ? ' checked' : ''}>
        <span class="qb-toggle-slot"></span>
        <span>${escapeHtml(label)}</span>
      </label>
    `;
  }

  // ── Format helpers ─────────────────────────────────────────────────
  function fmtMoneyOrDash(n) {
    if (n == null) return '—';
    return `$${Math.round(n).toLocaleString()}`;
  }

  // Split a stored full name into first / last for the dashboard columns. The
  // borrower view derives the first name the same way (first whitespace token).
  function splitName(full) {
    const parts = String(full || '').trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return { first: '', last: '' };
    if (parts.length === 1) return { first: parts[0], last: '' };
    return { first: parts[0], last: parts.slice(1).join(' ') };
  }

  function fmtRelative(iso) {
    if (!iso) return '—';
    const t = new Date(iso).getTime();
    if (Number.isNaN(t)) return '—';
    const d = Date.now() - t;
    const s = Math.floor(d / 1000);
    if (s < 60) return 'just now';
    const m = Math.floor(s / 60);
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    const days = Math.floor(h / 24);
    if (days < 30) return `${days}d ago`;
    return new Date(iso).toLocaleDateString();
  }

  function escapeHtml(s) {
    if (s == null) return '';
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
  function escapeAttr(s) { return escapeHtml(s); }

  // ── Go ─────────────────────────────────────────────────────────────
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
