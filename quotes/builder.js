/* ============================================================
   UTM — Operator quote builder
   Vanilla-JS port of cadence-crm's QuoteEditorPage.tsx (the source of
   truth for editor behavior: loan math, Quick Fill globals, Populate
   Options, per-option override toggles, duplicate, action bar) plus a
   dashboard and pass-code auth in front.

   Flow:
   1. Boot → check /api/auth/me. If 401, show login. Else show app.
   2. Dashboard: list of quotes (borrower, contact, transaction,
      loan amount, state, wholesale lender, status) + copy share link.
   3. Editor: intake → Quick Fill globals → options (auto-calculated
      payment / points cost / prepaids / total with per-field Override)
      → live rail + sticky action bar.
   4. Save → POST /api/quotes (create) or POST /api/quotes/:id/revisions.
   5. Share → https://quotes.myunitedtrust.com/<public_token>
   ============================================================ */

(function () {
  'use strict';

  const $  = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  // ── Constants (mirror QuoteEditorPage.tsx) ─────────────────────────
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
  const PER_OPTION_PRODUCTS = [
    '30-yr Fixed', '15-yr Fixed', '5/6 ARM', '7/6 ARM', '10/6 ARM', 'Interest-Only',
  ];
  const CREDIT_OPTIONS = [
    { value: '760+',    label: '760+' },
    { value: '720-759', label: '720–759' },
    { value: '680-719', label: '680–719' },
    { value: '<680',    label: 'Below 680' },
  ];
  const LOCK_OPTIONS = [
    { value: 15, label: '15 days' },
    { value: 30, label: '30 days' },
    { value: 45, label: '45 days' },
    { value: 60, label: '60 days' },
  ];

  function uuid() {
    return (crypto.randomUUID && crypto.randomUUID()) ||
      'opt_' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
  }

  // blankIntake mirrors QuoteEditorPage's defaults (occupancy investment,
  // cash-out purpose, non-QM product, PPP allowed, credit unset).
  function blankIntake() {
    return {
      // Borrower
      borrowerName: '',
      email: '',
      phone: '',
      creditScore: '',
      // Property
      address: '',
      city: '',
      state: '',
      zip: '',
      propertyType: 'sfr',
      units: 1,
      occupancy: 'investment',
      estValue: '',
      loanBalance: '',
      // Loan structure
      loanPurpose: 'cashout',
      product: '30yr-nonqm',
      lockPeriod: 30,
      desiredCashOut: '',
      escrowWaived: false,
      monthlyTaxes: '',
      monthlyInsurance: '',
      allowPPP: true,
      // Notes
      maxMonthly: '',
      targetCloseDate: '',
      // Quick Fill / Global Assumptions — drive "Populate Options".
      globalLoanAmount: '',
      globalLoanTerm: 360,
      hazardAnnualPremium: '',
      prepaidInterestDays: 15,
      defaultLenderFees: '',
      defaultThirdPartyFees: '',
      defaultTaxesAndGov: '',
      defaultOriginationFee: '',
      defaultPoints: '',
      // LO-only — never shown to the borrower (stored in columns).
      wholesaleLender: '',
      priceToMe: '',
      notes: '',
    };
  }

  function blankOption() {
    return {
      id: uuid(),
      label: '',
      loanAmount: 0,
      rate: 0,
      apr: null,
      termMonths: 360,
      productType: '30-yr Fixed',
      monthlyPayment: 0,
      cashOut: null,
      points: null,
      pointsCost: null,
      originationFee: null,
      lenderFees: null,
      thirdPartyFees: null,
      taxesAndGov: null,
      prepaidsAndEscrow: null,
      prepaidAdjustment: null,
      lenderCredit: null,
      sellerCredit: null,
      totalClosingCosts: null,
      monthlyPaymentOverride: false,
      prepaidsOverride: false,
      totalClosingCostsOverride: false,
      purchasePriceOverride: null,
      hasPpp: false,
      pppDescription: null,
      recommended: false,
      badge: null,
      notes: null,
    };
  }

  // ── Loan-math helpers (direct port of QuoteEditorPage.tsx) ─────────
  // All return 0 (or null) when inputs are missing/invalid so the UI
  // shows "$0" or "—" rather than NaN.

  function calcMonthlyPayment(loanAmount, annualRatePct, termMonths) {
    if (!loanAmount || !termMonths || annualRatePct <= 0) return 0;
    const r = annualRatePct / 100 / 12;
    const factor = Math.pow(1 + r, termMonths);
    const pmt = (loanAmount * (r * factor)) / (factor - 1);
    return Number.isFinite(pmt) ? pmt : 0;
  }

  function calcPointsCost(loanAmount, pointsPct) {
    if (!loanAmount || !pointsPct) return 0;
    return loanAmount * (pointsPct / 100);
  }

  function calcDailyInterest(loanAmount, annualRatePct) {
    if (!loanAmount || annualRatePct <= 0) return 0;
    return (loanAmount * annualRatePct) / 100 / 365;
  }

  // Prepaids = daily interest × prepaid days (+ 12 mo hazard on purchases)
  // (+ 2 mo taxes + 2 mo insurance when escrowed) + option-level adjustment.
  function calcPrepaids(form, opt) {
    const interest =
      calcDailyInterest(opt.loanAmount, opt.rate) * (Number(form.prepaidInterestDays) || 0);
    const hazard12 = form.loanPurpose === 'purchase' ? (Number(form.hazardAnnualPremium) || 0) : 0;
    const escrowCushion = !form.escrowWaived
      ? 2 * (Number(form.monthlyTaxes) || 0) + 2 * (Number(form.monthlyInsurance) || 0)
      : 0;
    return interest + hazard12 + escrowCushion + (Number(opt.prepaidAdjustment ?? 0) || 0);
  }

  function sumClosingCosts(opt) {
    return (
      (Number(opt.pointsCost ?? 0) || 0) +
      (Number(opt.originationFee ?? 0) || 0) +
      (Number(opt.lenderFees ?? 0) || 0) +
      (Number(opt.thirdPartyFees ?? 0) || 0) +
      (Number(opt.taxesAndGov ?? 0) || 0) +
      (Number(opt.prepaidsAndEscrow ?? 0) || 0)
    );
  }

  // ── State ──────────────────────────────────────────────────────────
  const state = {
    operator: null,
    view: 'login',          // 'login' | 'dashboard' | 'editor'
    quotes: [],             // dashboard list
    editing: null,          // { quote, form, options, title, note }
    saving: false,
    toast: null,
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
    $$('[data-nav="dashboard"]').forEach((el) => {
      el.addEventListener('click', (e) => { e.preventDefault(); openDashboard(); });
    });
    $$('[data-act="logout"]').forEach((el) => {
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
          <p style="color:var(--text-muted);font-size:14px">
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
    $$('[data-edit]').forEach((el) => {
      el.addEventListener('click', async () => {
        await openEditor(el.dataset.edit);
      });
    });
    $$('[data-share]').forEach((el) => {
      el.addEventListener('click', () => copyShareLink(el.dataset.share));
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
        form.notes = quote.internal_notes || form.notes || '';
        state.editing = {
          quote,
          form,
          // Default any fields older revisions don't carry (override flags etc.).
          options: (revision?.options_json && revision.options_json.length > 0)
            ? revision.options_json.map((o) => ({ ...blankOption(), ...o }))
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

  // ── Editor derived values (port of the useMemo blocks) ─────────────
  function calcLtv(form) {
    const balance = Number(form.loanBalance) || 0;
    const value   = Number(form.estValue) || 0;
    if (!balance || !value) return 0;
    return (balance / value) * 100;
  }

  // Heuristic indicative rate range — same algorithm as the source.
  function calcRateRange(form) {
    let low = 6.375;
    let high = 7.75;
    if (form.occupancy === 'primary') { low -= 0.5; high -= 0.5; }
    if (form.creditScore === '760+') { low -= 0.125; high -= 0.125; }
    else if (form.creditScore === '<680') { low += 0.5; high += 0.5; }
    if (!form.allowPPP) { low += 0.5; }
    return { low: low.toFixed(3), high: high.toFixed(3) };
  }

  // Estimated cash to borrower — balance minus the reference fee stack.
  function calcCashEst(form) {
    const balance = Number(form.loanBalance) || 0;
    if (!balance) return null;
    const fees = 4650 + 4202 + 309 + 1000;
    return balance - fees;
  }

  function calcDownPayment(form) {
    if (form.loanPurpose !== 'purchase') return null;
    const price = Number(form.estValue) || 0;
    const loan  = Number(form.loanBalance) || 0;
    if (!price || !loan) return null;
    return Math.max(0, price - loan);
  }

  // Cash to close = down payment + total closing costs from the first
  // option that has them (costs are usually similar across rate variants).
  function calcCashToClose(form, options) {
    const dp = calcDownPayment(form);
    if (form.loanPurpose !== 'purchase' || dp == null) return null;
    const firstWithCosts = options.find(
      (o) => o.totalClosingCosts != null && o.totalClosingCosts > 0,
    );
    return dp + (firstWithCosts?.totalClosingCosts ?? 0);
  }

  function calcChecks(form) {
    return [
      { label: 'Borrower name', done: !!form.borrowerName },
      { label: 'Property address & ZIP', done: !!form.zip && !!form.address },
      { label: 'Loan basics', done: !!form.loanBalance && !!form.estValue },
      { label: 'Property & occupancy', done: !!form.propertyType && !!form.occupancy },
      { label: 'Credit score range', done: !!form.creditScore },
    ];
  }

  function calcCompleteness(form) {
    const required = ['borrowerName','zip','loanBalance','estValue','creditScore','propertyType','occupancy'];
    const filled = required.filter((k) => form[k] !== '' && form[k] != null).length;
    return Math.round((filled / required.length) * 100);
  }

  function hasOptionData(options) {
    return options.some(
      (o) =>
        o.rate > 0 ||
        o.loanAmount > 0 ||
        (o.pointsCost ?? 0) > 0 ||
        (o.lenderFees ?? 0) > 0 ||
        (o.thirdPartyFees ?? 0) > 0 ||
        (o.taxesAndGov ?? 0) > 0 ||
        (o.prepaidsAndEscrow ?? 0) > 0 ||
        (o.originationFee ?? 0) > 0,
    );
  }

  // ── Editor HTML ────────────────────────────────────────────────────
  function editorHtml() {
    const e = state.editing;
    if (!e) return '';
    const f = e.form;
    const isPurchase = f.loanPurpose === 'purchase';
    const ltv = calcLtv(f);
    const rr = calcRateRange(f);
    const downPayment = calcDownPayment(f);

    return `
      <div class="qb-layout">
        <main class="qb-form-col">
          <div class="qb-page-head">
            <div class="qb-crumbs">
              <a href="#" data-nav="dashboard">Quote Builder</a>
              &nbsp;/&nbsp; ${e.quote ? 'Edit quote' : 'New quote'}
            </div>
            <h1 class="qb-h1">Build a <em>${escapeHtml(purposeShort(f.loanPurpose))}</em> quote.</h1>
            <p style="color:var(--text-muted);font-size:14px;margin-top:10px;max-width:62ch">
              Fill in the borrower and property basics. Add the options the
              client will see, then share the link.
            </p>
          </div>

          <!-- 01 Borrower -->
          <section class="qb-section">
            <div class="qb-section-head">
              <h2 class="qb-section-title"><span class="qb-section-num">01</span> Borrower</h2>
              <span class="qb-section-hint">Required for soft pricing</span>
            </div>
            <div class="qb-fields">
              ${field('Full legal name', 'text', 'borrowerName', f.borrowerName, 'First Last', { required: true })}
              ${fieldChips('Credit score range', 'creditScore', f.creditScore, CREDIT_OPTIONS, { required: true, hint: 'Soft estimate is fine' })}
              ${field('Email', 'email', 'email', f.email, 'borrower@example.com')}
              ${field('Phone', 'tel', 'phone', f.phone, '(555) 123-4567')}
            </div>
          </section>

          <!-- 02 Property -->
          <section class="qb-section">
            <div class="qb-section-head">
              <h2 class="qb-section-title"><span class="qb-section-num">02</span> Property</h2>
              <span class="qb-section-hint">${isPurchase ? 'Purchase target' : 'Subject of the refinance'}</span>
            </div>
            <div class="qb-fields">
              ${field('Street address', 'text', 'address', f.address, '123 Main St', { full: true })}
              <div class="qb-field qb-full">
                <div class="qb-addr-grid">
                  ${field('City', 'text', 'city', f.city, 'Muskogee')}
                  ${fieldSelect('State', 'state', f.state, [{ value: '', label: '—' }, ...STATES.map((s) => ({ value: s, label: s }))])}
                  ${field('ZIP', 'text', 'zip', f.zip, '74429', { required: true, mono: true, maxLength: 5 })}
                </div>
              </div>
              ${fieldChips('Property type', 'propertyType', f.propertyType, PROPERTY_TYPE_OPTIONS, { full: true, required: true })}
              ${fieldChips('Occupancy', 'occupancy', f.occupancy, OCCUPANCY_OPTIONS, { required: true })}
              ${field('Number of units', 'number', 'units', f.units, '1')}
              ${fieldMoney(isPurchase ? 'Purchase price' : 'Estimated value', 'estValue', f.estValue, '260,000', { required: true, hint: isPurchase ? 'Contract price' : 'AVM or recent appraisal' })}
              ${fieldMoney(isPurchase ? 'Loan amount' : 'Current loan balance', 'loanBalance', f.loanBalance, '195,000')}
            </div>

            <div class="qb-ltv">
              <div class="qb-ltv-head">
                <span>Loan-to-value</span>
                <strong class="qb-mono" data-dv="ltv-num">${ltv ? ltv.toFixed(1) + '%' : '—'}</strong>
              </div>
              <div class="qb-ltv-bar">
                <div class="qb-ltv-fill ${ltvClass(ltv)}" data-dv="ltv-fill" style="width:${Math.min(ltv, 100)}%"></div>
                <div class="qb-ltv-marks">
                  <span class="qb-ltv-mark"></span><span class="qb-ltv-mark"></span>
                  <span class="qb-ltv-mark"></span><span class="qb-ltv-mark"></span>
                  <span class="qb-ltv-mark"></span>
                </div>
              </div>
              <div class="qb-ltv-foot">
                <span>0%</span><span>50%</span><span>75%</span><span>80%</span><span>100%</span>
              </div>
              <div class="qb-inline-note" data-dv="ltv-note" ${ltv > 80 ? '' : 'hidden'}>
                LTV above 80% — limited program eligibility. Consider lowering
                the requested loan amount.
              </div>
            </div>

            ${
              isPurchase
                ? `
              <div class="qb-ltv" style="margin-top:12px">
                <div class="qb-ltv-head"><span>Down payment</span></div>
                <div class="qb-fields" style="margin-top:4px">
                  ${fieldMoney('Amount', '__dpAmount', downPayment ?? '', '65,000')}
                  ${fieldPct('Percent of price', '__dpPct',
                    (downPayment != null && Number(f.estValue) > 0)
                      ? Number(((downPayment / Number(f.estValue)) * 100).toFixed(2))
                      : '',
                    '20')}
                </div>
                <div class="qb-ltv-foot" style="justify-content:flex-start;margin-top:8px">
                  <span>${Number(f.estValue) > 0 ? 'Editing either field auto-updates the loan amount' : 'Enter purchase price first'}</span>
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
              ${fieldChips('Loan purpose', 'loanPurpose', f.loanPurpose, PURPOSE_OPTIONS, { full: true })}
              ${fieldSelect('Product', 'product', f.product, PRODUCT_OPTIONS)}
              ${fieldSelect('Lock period', 'lockPeriod', f.lockPeriod, LOCK_OPTIONS, { numeric: true })}
              ${fieldMoney('Desired cash-out at close', 'desiredCashOut', f.desiredCashOut, '50,000', { full: true, hint: 'Free-and-clear: leave balance blank — loan amount = this cash-out' })}
              ${fieldMoney('Monthly property taxes', 'monthlyTaxes', f.monthlyTaxes, '270', { hint: 'Used for the T&I row' })}
              ${fieldMoney('Monthly insurance', 'monthlyInsurance', f.monthlyInsurance, '120', { hint: 'Hazard / homeowners' })}
            </div>
            <div style="margin-top:18px;display:grid;gap:8px">
              ${toggleRow('escrowWaived', f.escrowWaived, 'Waive escrow',
                "Borrower pays taxes & insurance directly. Leave off to show a 'Total est. payment' row that adds T&I to the monthly P&I.")}
              ${toggleRow('allowPPP', f.allowPPP, 'Allow prepayment penalty options',
                'PPP options trade ~0.5% lower rate for a 3-year lock-in')}
            </div>
          </section>

          <!-- 04 Notes (intake-side) -->
          <section class="qb-section">
            <div class="qb-section-head">
              <h2 class="qb-section-title"><span class="qb-section-num">04</span> Notes <em class="qb-title-aside">optional</em></h2>
              <span class="qb-section-hint">Anything we should know</span>
            </div>
            <div class="qb-fields">
              ${fieldMoney('Max comfortable monthly payment', 'maxMonthly', f.maxMonthly, '1,600', { hint: 'Flags options out of range' })}
              ${field('Target close date', 'date', 'targetCloseDate', f.targetCloseDate, '')}
            </div>
          </section>

          <!-- 05 Quick Fill / Global Assumptions -->
          <section class="qb-section">
            <div class="qb-section-head">
              <h2 class="qb-section-title"><span class="qb-section-num">05</span> Quick Fill <em class="qb-title-aside">global assumptions</em></h2>
              <span class="qb-section-hint">Enter once, then click Populate Options</span>
            </div>
            <div class="qb-fields">
              ${fieldMoney('Loan amount', 'globalLoanAmount', f.globalLoanAmount, '500,000', {
                hint: isPurchase ? 'Loan the borrower is taking out' : 'Desired new loan (gross)',
              })}
              ${field('Loan term (months)', 'number', 'globalLoanTerm', f.globalLoanTerm, '360')}
              ${fieldMoney('Property taxes (monthly)', 'monthlyTaxes', f.monthlyTaxes, '270')}
              ${fieldMoney('Hazard insurance (monthly)', 'monthlyInsurance', f.monthlyInsurance, '120')}
              ${fieldMoney('Hazard insurance (annual premium)', 'hazardAnnualPremium', f.hazardAnnualPremium, '1,440', { hint: 'Prepaids on purchases' })}
              ${field('Prepaid interest (days)', 'number', 'prepaidInterestDays', f.prepaidInterestDays, '15', { hint: 'Closing to month end' })}
              ${field('Closing date', 'date', 'targetCloseDate', f.targetCloseDate, '')}
              ${fieldPct('Default points %', 'defaultPoints', f.defaultPoints, '0.000')}
              ${fieldMoney('Default origination fee', 'defaultOriginationFee', f.defaultOriginationFee, '1,495')}
              ${fieldMoney('Default lender fees', 'defaultLenderFees', f.defaultLenderFees, '850')}
              ${fieldMoney('Default third-party fees', 'defaultThirdPartyFees', f.defaultThirdPartyFees, '2,400')}
              ${fieldMoney("Default taxes & gov't", 'defaultTaxesAndGov', f.defaultTaxesAndGov, '450')}
              <div class="qb-field qb-full">
                ${toggleRow('__escrowed', !f.escrowWaived, 'Escrowed (taxes & insurance)',
                  'Adds 2 months of taxes + 2 months of insurance to the prepaids cushion when on.')}
              </div>
            </div>
            <div class="qb-qf-foot">
              <p data-dv="qf-formula">${qfFormulaHtml(f)}</p>
              <button type="button" class="qb-btn qb-btn-primary" data-act="populate">Populate Options</button>
            </div>
          </section>

          <!-- 06 Quote options -->
          <section class="qb-section">
            <div class="qb-section-head">
              <h2 class="qb-section-title"><span class="qb-section-num">06</span> Quote options</h2>
              <span class="qb-section-hint">${e.options.length} option${e.options.length === 1 ? '' : 's'} — these show on the comparison page</span>
            </div>
            <div class="qb-opts">
              ${e.options.map((opt, i) => renderOptionEditor(opt, i, f)).join('')}
            </div>
            <button class="qb-btn qb-btn-ghost" data-act="add-option" style="margin-top:16px;width:100%">+ Add another option</button>
          </section>

          <!-- 07 Comparison page meta -->
          <section class="qb-section">
            <div class="qb-section-head">
              <h2 class="qb-section-title"><span class="qb-section-num">07</span> Comparison page</h2>
              <span class="qb-section-hint">What the client sees</span>
            </div>
            <div class="qb-fields">
              ${field('Headline', 'text', '__title', e.title, 'e.g. Cash-Out Refinance', { full: true })}
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
              ${field('Wholesale lender', 'text', 'wholesaleLender', f.wholesaleLender, 'e.g. UWM, Rocket Pro TPO, PennyMac')}
              ${field('Price to me', 'text', 'priceToMe', f.priceToMe, '100.000', { hint: 'e.g. 100.250', mono: true })}
              <div class="qb-field qb-full">
                <div class="qb-label-row"><label class="qb-label">Notes</label></div>
                <textarea class="qb-textarea" data-field="notes" placeholder="Lock window, rep name, special pricing, anything you want to remember…">${escapeHtml(f.notes)}</textarea>
              </div>
            </div>
          </section>

          <p class="qb-disclaimer">
            Soft pricing only — no credit pull required to generate the
            comparison. The options entered here become the cards on the share
            page; final rate, APR, and costs are subject to underwriting review
            and a formal Loan Estimate.
          </p>
        </main>

        <!-- Live estimate rail -->
        <aside class="qb-rail">
          <div class="qb-rail-eyebrow">Live estimate</div>
          <h2 class="qb-rail-h">Quote preview</h2>

          <div class="qb-pv-rate">
            <div class="qb-pv-rate-label">Indicative rate range</div>
            <div class="qb-pv-rate-range" data-dv="rate-range">${rr.low}<span class="qb-pct">%</span><span class="qb-dash">–</span>${rr.high}<span class="qb-pct">%</span></div>
            <div class="qb-pv-rate-foot">Soft estimate · adjusts with occupancy, FICO, and PPP allow</div>
          </div>

          <div class="qb-rail-row"><span class="lbl">${isPurchase ? 'Loan amount' : 'Loan balance'}</span><span class="val" data-dv="rr-loan">${fmtMoneyOrDash(f.loanBalance)}</span></div>
          <div class="qb-rail-row"><span class="lbl">${isPurchase ? 'Purchase price' : 'Estimated value'}</span><span class="val" data-dv="rr-value">${fmtMoneyOrDash(f.estValue)}</span></div>
          <div class="qb-rail-row"><span class="lbl">LTV</span><span class="val" data-dv="rr-ltv" style="color:${ltvRailColor(ltv)}">${ltv ? ltv.toFixed(1) + '%' : '—'}</span></div>

          <div class="qb-rail-divider"></div>

          ${
            isPurchase
              ? `
            <div class="qb-rail-row qb-rail-big"><span class="lbl">Est. cash to close</span><span class="val" data-dv="rr-cash">${calcCashToClose(f, e.options) != null ? fmtMoneyOrDash(calcCashToClose(f, e.options)) : '—'}</span></div>
            <div class="qb-rail-row qb-rail-muted"><span class="lbl">Down payment + est. closing costs</span><span class="val" data-dv="rr-cash-sub" style="font-size:11px">${downPayment != null ? fmtMoneyOrDash(downPayment) + ' down' : 'Add price & loan amount'}</span></div>
          `
              : `
            <div class="qb-rail-row qb-rail-big"><span class="lbl">Est. cash to borrower</span><span class="val" data-dv="rr-cash">${calcCashEst(f) != null ? fmtMoneyOrDash(calcCashEst(f)) : '—'}</span></div>
            <div class="qb-rail-row qb-rail-muted"><span class="lbl">Net of est. fees & prepaids</span><span class="val" style="font-size:11px">~$10,160 deducted</span></div>
          `
          }

          <div class="qb-checks" data-dv="checks">${checksHtml(f)}</div>

          <div class="qb-rail-actions">
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
                : `<p style="color:var(--text-soft);font-size:11.5px;text-align:center">Share link appears after first save.</p>`
            }
            <p style="color:var(--text-soft);font-size:11px;text-align:center;line-height:1.5;margin-top:6px">
              Estimates only. A formal Loan Estimate is required before any commitment.
            </p>
          </div>
        </aside>
      </div>

      <!-- Sticky action bar (port of qe-actionbar) -->
      <div class="qb-actionbar">
        <div class="qb-ab-info">
          <div class="qb-ab-block">
            <div class="qb-ab-label">Form complete</div>
            <div class="qb-ab-val" data-dv="ab-complete">${calcCompleteness(f)}%</div>
          </div>
          <div class="qb-ab-divider"></div>
          <div class="qb-ab-block">
            <div class="qb-ab-label">LTV</div>
            <div class="qb-ab-val" data-dv="ab-ltv">${ltv ? ltv.toFixed(1) + '%' : '—'}</div>
          </div>
          <div class="qb-ab-divider"></div>
          <div class="qb-ab-block">
            <div class="qb-ab-label">Borrower</div>
            <div class="qb-ab-val" style="font-size:14px" data-dv="ab-borrower">${escapeHtml(f.borrowerName || 'Unnamed')}</div>
          </div>
          <div class="qb-ab-divider"></div>
          <div class="qb-ab-block">
            <div class="qb-ab-label">Status</div>
            <div class="qb-ab-val" style="font-size:14px">${escapeHtml(e.quote?.status ?? 'draft')}</div>
          </div>
        </div>
        <div class="qb-ab-actions">
          ${
            e.quote?.public_token
              ? `
            <button class="qb-btn" data-act="copy-share-2">Copy link</button>
            <button class="qb-btn" data-act="open-client">View as client</button>
          `
              : ''
          }
          <button class="qb-btn qb-btn-primary" data-act="save" ${state.saving ? 'disabled' : ''}>
            ${state.saving ? 'Saving…' : (e.quote ? 'Save revision' : 'Save quote')}
          </button>
        </div>
      </div>
    `;
  }

  function purposeShort(v) {
    return v === 'cashout' ? 'cash-out' : v === 'rateterm' ? 'rate/term' : 'purchase';
  }
  function ltvClass(ltv) { return ltv > 80 ? 'qb-bad' : ltv > 70 ? 'qb-warn' : ''; }
  function ltvRailColor(ltv) {
    return ltv > 80 ? '#b13e1c' : ltv > 70 ? '#8a6d2f' : 'var(--ink)';
  }

  function qfFormulaHtml(f) {
    return `<strong>Prepaids</strong> = <span class="qb-mono">daily interest × ${Number(f.prepaidInterestDays) || 0} days</span>` +
      (f.loanPurpose === 'purchase' ? ' + 12 months hazard insurance' : '') +
      (f.escrowWaived ? '' : ' + 2 months taxes + 2 months insurance') +
      ' + option-level adjustment.';
  }

  function checksHtml(f) {
    return calcChecks(f).map((c) => `
      <div class="qb-check ${c.done ? 'qb-done' : ''}">
        <span class="qb-ck">${c.done ? '✓' : ''}</span><span>${escapeHtml(c.label)}</span>
      </div>
    `).join('');
  }

  function renderOptionEditor(opt, i, f) {
    const isPurchase = f.loanPurpose === 'purchase';
    return `
      <div class="qb-opt" data-opt-idx="${i}">
        <div class="qb-opt-head">
          <div class="qb-opt-name" data-dv="opt.${i}.title">Option ${String(i + 1).padStart(2, '0')}${opt.label ? ' — ' + escapeHtml(opt.label) : ''}</div>
          <div style="display:flex;gap:8px">
            <button class="qb-link-btn" data-act="dup-option" data-idx="${i}" title="Clone this option's cost structure into a new option">Duplicate</button>
            ${state.editing.options.length > 1 ? `<button class="qb-link-btn qb-btn-danger" data-act="remove-option" data-idx="${i}">Remove</button>` : ''}
          </div>
        </div>
        <div class="qb-fields">
          ${field('Label (optional)', 'text', `__opt.${i}.label`, opt.label ?? '', 'e.g. Best Rate')}
          ${fieldSelect('Product', `__opt.${i}.productType`, opt.productType, PER_OPTION_PRODUCTS.map((v) => ({ value: v, label: v })))}
          ${fieldMoney('Loan amount', `__opt.${i}.loanAmount`, opt.loanAmount || '', '500,000')}
          ${field('Term (months)', 'number', `__opt.${i}.termMonths`, opt.termMonths, '360')}
          ${
            isPurchase
              ? fieldMoney('Purchase price override', `__opt.${i}.purchasePriceOverride`, opt.purchasePriceOverride ?? '',
                  Number(f.estValue) > 0 ? Number(f.estValue).toLocaleString('en-US') : '1,100,000',
                  { full: true, hint: (opt.purchasePriceOverride != null && opt.purchasePriceOverride > 0) ? 'This card only' : `Inherits ${fmtMoneyOrDash(Number(f.estValue) || 0)}` })
              : ''
          }
          ${fieldPct('Rate', `__opt.${i}.rate`, opt.rate || '', '7.125')}
          ${fieldPct('APR', `__opt.${i}.apr`, opt.apr ?? '', '0.000')}
          ${computedMoney('Monthly payment', i, 'monthlyPayment', 'monthlyPaymentOverride', opt.monthlyPayment ?? 0, !!opt.monthlyPaymentOverride, 'Auto from loan × rate × term', '3,367')}
          ${fieldMoney('Cash out (refis)', `__opt.${i}.cashOut`, opt.cashOut ?? '', '0')}
          ${field('Points', 'number', `__opt.${i}.points`, opt.points ?? '', '0', { step: '0.001' })}
          <div class="qb-field">
            <div class="qb-label-row"><label class="qb-label">Points cost</label><span class="qb-hint">Auto from loan × points %</span></div>
            <div class="qb-input qb-mono qb-readonly" data-dv="opt.${i}.pointsCost">${fmtMoneyOrDash(opt.pointsCost ?? 0)}</div>
          </div>
          ${fieldMoney('Origination fee', `__opt.${i}.originationFee`, opt.originationFee ?? '', '1,495')}
          ${fieldMoney('Lender fees', `__opt.${i}.lenderFees`, opt.lenderFees ?? '', '850')}
          ${fieldMoney('3rd-party fees', `__opt.${i}.thirdPartyFees`, opt.thirdPartyFees ?? '', '2,400')}
          ${fieldMoney("Taxes & gov't", `__opt.${i}.taxesAndGov`, opt.taxesAndGov ?? '', '450')}
          ${computedMoney('Prepaids & escrow', i, 'prepaidsAndEscrow', 'prepaidsOverride', opt.prepaidsAndEscrow ?? 0, !!opt.prepaidsOverride, 'Auto — see Quick Fill formula', '5,789')}
          ${fieldMoney('Prepaid adjustment', `__opt.${i}.prepaidAdjustment`, opt.prepaidAdjustment ?? '', '0', { hint: 'Add/subtract from auto prepaids' })}
          ${fieldMoney('Lender credit', `__opt.${i}.lenderCredit`, opt.lenderCredit ?? '', '0', { full: true, hint: 'Credit applied against closing costs' })}
          ${
            isPurchase
              ? fieldMoney('Seller credit', `__opt.${i}.sellerCredit`, opt.sellerCredit ?? '', '0', { full: true, hint: 'Seller concession toward closing costs (purchase only)' })
              : ''
          }
          ${computedMoney('Total closing costs', i, 'totalClosingCosts', 'totalClosingCostsOverride', opt.totalClosingCosts ?? 0, !!opt.totalClosingCostsOverride, "Auto-sum: points + origination + lender + 3rd-party + taxes & gov't + prepaids", '12,870', { full: true })}
          <div class="qb-field qb-full">
            ${toggleRow(`__opt.${i}.hasPpp`, !!opt.hasPpp, 'Prepay penalty', "Show a 'PPP applies' badge on the client view")}
          </div>
          ${
            opt.hasPpp
              ? field('PPP description', 'text', `__opt.${i}.pppDescription`, opt.pppDescription ?? '', 'e.g. 5/4/3/2/1', { full: true })
              : ''
          }
          <div class="qb-field qb-full">
            ${toggleRow(`__opt.${i}.recommended`, !!opt.recommended, 'Recommended', 'Highlights this card on the client view')}
          </div>
        </div>
      </div>
    `;
  }

  // ── Editor bindings ────────────────────────────────────────────────
  function bindEditor() {
    const e = state.editing;
    if (!e) return;

    // Plain inputs / selects / textareas
    $$('[data-field]').forEach((el) => {
      const evt = el.tagName === 'SELECT' ? 'change' : 'input';
      el.addEventListener(evt, () => updateField(el.dataset.field, parseInputValue(el)));
    });
    // Chips. updateField only re-renders for layout-driving keys (loanPurpose);
    // for the rest flip the active chip in place so the click is visible.
    $$('[data-chips]').forEach((wrap) => {
      const key = wrap.dataset.chips;
      wrap.querySelectorAll('button').forEach((btn) => {
        btn.addEventListener('click', () => {
          updateField(key, btn.dataset.val);
          if (!wrap.isConnected) return; // a re-render replaced this DOM
          wrap.querySelectorAll('button').forEach((b) =>
            b.classList.toggle('qb-chip-on', b === btn));
        });
      });
    });
    // Toggle rows (button switches, cadence qe-switch style)
    $$('[data-trow]').forEach((btn) => {
      btn.addEventListener('click', () => toggleTRow(btn.dataset.trow));
    });
    // Override pills
    $$('[data-ovr]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const m = btn.dataset.ovr.match(/^(\d+)\.(.+)$/);
        if (!m) return;
        flipOverride(Number(m[1]), m[2]);
      });
    });
    // Option actions
    $('[data-act="add-option"]')?.addEventListener('click', () => {
      e.options.push(blankOption());
      render();
    });
    $$('[data-act="remove-option"]').forEach((b) => {
      b.addEventListener('click', () => {
        const i = Number(b.dataset.idx);
        if (e.options.length === 1) return;
        e.options.splice(i, 1);
        render();
      });
    });
    $$('[data-act="dup-option"]').forEach((b) => {
      b.addEventListener('click', () => duplicateOption(Number(b.dataset.idx)));
    });
    // Populate Options (confirm if options already carry data)
    $('[data-act="populate"]')?.addEventListener('click', () => {
      if (
        hasOptionData(e.options) &&
        !window.confirm(
          "This will recalculate every option using the global assumptions. Fields you toggled to 'Override' will be kept. Continue?",
        )
      ) return;
      populateOptions();
      render();
      toast('ok', 'Options populated from globals');
    });
    // Action bar + rail
    $$('[data-act="save"]').forEach((b) => b.addEventListener('click', save));
    $('[data-act="copy-share"]')?.addEventListener('click', () => {
      const input = $('#qb-share-input');
      input?.select();
      navigator.clipboard?.writeText(input.value).then(
        () => toast('ok', 'Share link copied'),
        () => toast('err', "Couldn't copy"),
      );
    });
    $('[data-act="copy-share-2"]')?.addEventListener('click', () => {
      if (e.quote?.public_token) copyShareLink(e.quote.public_token);
    });
    $('[data-act="open-client"]')?.addEventListener('click', () => {
      if (e.quote?.public_token) window.open(shareUrl(e.quote.public_token), '_blank', 'noopener');
    });
  }

  function duplicateOption(idx) {
    const e = state.editing;
    const src = e.options[idx];
    if (!src) return;
    const clone = {
      ...src,
      id: uuid(),
      // Rename so the operator notices it's a clone; cost stack carries over.
      label: src.label ? `${src.label} (copy)` : '',
      recommended: false,
      badge: null,
    };
    e.options.splice(idx + 1, 0, clone);
    render();
  }

  function toggleTRow(key) {
    const e = state.editing;
    if (key === '__escrowed') {
      // Quick Fill's "Escrowed" is the inverse of escrowWaived.
      e.form.escrowWaived = !e.form.escrowWaived;
      render();
      return;
    }
    const optMatch = key.match(/^__opt\.(\d+)\.(.+)$/);
    if (optMatch) {
      const i = Number(optMatch[1]);
      const fkey = optMatch[2];
      if (!e.options[i]) return;
      e.options[i][fkey] = !e.options[i][fkey];
      if (fkey === 'hasPpp') { render(); return; }
      // recommended — flip the switch in place
      const btn = document.querySelector(`[data-trow="${cssEscape(key)}"]`);
      btn?.classList.toggle('qb-on', e.options[i][fkey]);
      return;
    }
    e.form[key] = !e.form[key];
    if (key === 'escrowWaived') { render(); return; } // affects QF formula + escrowed mirror
    if (key === 'allowPPP') {
      const btn = document.querySelector(`[data-trow="${cssEscape(key)}"]`);
      btn?.classList.toggle('qb-on', e.form[key]);
      refreshDerived();
      return;
    }
    render();
  }

  // Flip a computed field between auto and manual. Turning override OFF
  // recalcs immediately so the field shows the formula value again.
  function flipOverride(i, flagKey) {
    const e = state.editing;
    const opt = e.options[i];
    if (!opt) return;
    const turningOn = !opt[flagKey];
    opt[flagKey] = turningOn;
    if (!turningOn) {
      if (flagKey === 'monthlyPaymentOverride') {
        opt.monthlyPayment = calcMonthlyPayment(opt.loanAmount, opt.rate, opt.termMonths);
      } else if (flagKey === 'prepaidsOverride') {
        opt.prepaidsAndEscrow = calcPrepaids(e.form, opt);
      } else if (flagKey === 'totalClosingCostsOverride') {
        opt.totalClosingCosts = sumClosingCosts(opt);
      }
    }
    render();
  }

  function parseInputValue(el) {
    if (el.type === 'checkbox') return el.checked;
    if (el.tagName === 'SELECT' && el.dataset.numeric) {
      return Number(el.value) || 0;
    }
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
      return raw === '' || raw === '.' ? null : Number(raw);
    }
    return el.value;
  }

  function updateField(key, value) {
    const e = state.editing;
    if (!e) return;

    if (key === '__title') {
      e.title = String(value || '');
      return;
    }
    if (key === '__note') { e.note = String(value || ''); return; }

    // Down-payment dual controls drive loanBalance.
    if (key === '__dpAmount' || key === '__dpPct') {
      const price = Number(e.form.estValue) || 0;
      if (!price) return;
      if (key === '__dpAmount') {
        const dp = typeof value === 'number' ? value : 0;
        e.form.loanBalance = Math.max(0, price - dp);
      } else {
        if (value == null || value === '') return;
        const dp = Math.round(price * (Number(value) / 100));
        e.form.loanBalance = Math.max(0, price - dp);
      }
      syncInput('loanBalance', e.form.loanBalance);
      syncDownPaymentInputs();
      refreshDerived();
      return;
    }

    // Option fields: __opt.<idx>.<field> — recompute the dependent values
    // exactly like QuoteEditorPage's updateOption.
    const optMatch = key.match(/^__opt\.(\d+)\.(.+)$/);
    if (optMatch) {
      updateOptionField(Number(optMatch[1]), optMatch[2], value);
      return;
    }

    // Standard intake fields.
    e.form[key] = value;

    // loanPurpose changes the layout (purchase blocks, labels, seller credit)
    if (key === 'loanPurpose') { render(); return; }

    if (key === 'estValue' || key === 'loanBalance') {
      syncDownPaymentInputs();
    }
    refreshDerived();
  }

  function updateOptionField(i, fkey, value) {
    const e = state.editing;
    const opt = e.options[i];
    if (!opt) return;

    // Normalize per the source's onChange handlers.
    const NULLABLE_MONEY = [
      'cashOut','originationFee','lenderFees','thirdPartyFees','taxesAndGov',
      'prepaidAdjustment','lenderCredit','sellerCredit','purchasePriceOverride',
    ];
    if (fkey === 'loanAmount' || fkey === 'monthlyPayment' || fkey === 'termMonths') {
      opt[fkey] = Number(value) || 0;
    } else if (fkey === 'rate') {
      opt.rate = value == null ? 0 : Number(value) || 0;
    } else if (fkey === 'apr') {
      opt.apr = value === '' || value == null ? null : Number(value);
    } else if (fkey === 'points') {
      opt.points = value === '' || value == null ? null : Number(value);
    } else if (fkey === 'prepaidsAndEscrow' || fkey === 'totalClosingCosts') {
      opt[fkey] = value === '' || value == null ? null : Number(value);
    } else if (NULLABLE_MONEY.includes(fkey)) {
      opt[fkey] = value === '' || value == null ? null : Number(value);
    } else {
      opt[fkey] = value;
    }

    // ── Dependent recomputes (direct port of updateOption) ──
    const piTouched = fkey === 'loanAmount' || fkey === 'rate' || fkey === 'termMonths';
    if (piTouched && !opt.monthlyPaymentOverride) {
      opt.monthlyPayment = calcMonthlyPayment(opt.loanAmount, opt.rate, opt.termMonths);
    }
    const pointsTouched = fkey === 'loanAmount' || fkey === 'points';
    if (pointsTouched) {
      opt.pointsCost = calcPointsCost(opt.loanAmount, opt.points);
    }
    const prepaidTouched = fkey === 'loanAmount' || fkey === 'rate' || fkey === 'prepaidAdjustment';
    if (prepaidTouched && !opt.prepaidsOverride) {
      opt.prepaidsAndEscrow = calcPrepaids(e.form, opt);
    }
    const PART_KEYS = ['pointsCost','originationFee','lenderFees','thirdPartyFees','taxesAndGov','prepaidsAndEscrow'];
    const touchedAPart = PART_KEYS.includes(fkey) || pointsTouched || prepaidTouched;
    if (touchedAPart && !opt.totalClosingCostsOverride) {
      opt.totalClosingCosts = sumClosingCosts(opt);
    }

    refreshDerived();
  }

  // Apply globals to existing options and recompute every derived number —
  // direct port of populateOptions(). Doesn't add or remove options.
  function populateOptions() {
    const e = state.editing;
    const f = e.form;
    const isPurchasePurpose = f.loanPurpose === 'purchase';
    e.options = e.options.map((o) => {
      const m = { ...o };
      const globalLoan = f.globalLoanAmount === '' ? 0 : Number(f.globalLoanAmount);
      if (globalLoan > 0) {
        m.loanAmount = globalLoan;
      } else if (isPurchasePurpose) {
        if (f.loanBalance !== '' && Number(f.loanBalance) > 0) m.loanAmount = Number(f.loanBalance);
      } else {
        const existing = f.loanBalance === '' ? 0 : Number(f.loanBalance);
        const cashout  = f.desiredCashOut === '' ? 0 : Number(f.desiredCashOut);
        if (existing + cashout > 0) m.loanAmount = existing + cashout;
      }
      if (Number(f.globalLoanTerm) > 0) m.termMonths = Number(f.globalLoanTerm);

      // Defaults only fill empty fields — re-running Populate never blows
      // away an option-specific value the operator typed.
      if ((m.points == null || m.points === 0) && f.defaultPoints !== '') m.points = Number(f.defaultPoints);
      if ((m.originationFee == null || m.originationFee === 0) && f.defaultOriginationFee !== '') m.originationFee = Number(f.defaultOriginationFee);
      if ((m.lenderFees == null || m.lenderFees === 0) && f.defaultLenderFees !== '') m.lenderFees = Number(f.defaultLenderFees);
      if ((m.thirdPartyFees == null || m.thirdPartyFees === 0) && f.defaultThirdPartyFees !== '') m.thirdPartyFees = Number(f.defaultThirdPartyFees);
      if ((m.taxesAndGov == null || m.taxesAndGov === 0) && f.defaultTaxesAndGov !== '') m.taxesAndGov = Number(f.defaultTaxesAndGov);

      if (!m.monthlyPaymentOverride) {
        m.monthlyPayment = calcMonthlyPayment(m.loanAmount, m.rate, m.termMonths);
      }
      m.pointsCost = calcPointsCost(m.loanAmount, m.points);
      if (!m.prepaidsOverride) {
        m.prepaidsAndEscrow = calcPrepaids(f, m);
      }
      if (!m.totalClosingCostsOverride) {
        m.totalClosingCosts = sumClosingCosts(m);
      }
      return m;
    });
  }

  // ── Surgical DOM refresh (no re-render → typing keeps focus) ────────
  function setDv(name, html) {
    const el = document.querySelector(`[data-dv="${cssEscape(name)}"]`);
    if (el) el.innerHTML = html;
  }
  function syncInput(fieldKey, numValue) {
    const el = document.querySelector(`[data-field="${cssEscape(fieldKey)}"]`);
    if (!el || el === document.activeElement) return;
    el.value = numValue === '' || numValue == null ? '' : Number(numValue).toLocaleString('en-US');
  }
  function syncDownPaymentInputs() {
    const e = state.editing;
    if (e.form.loanPurpose !== 'purchase') return;
    const dp = calcDownPayment(e.form);
    const amountEl = document.querySelector('[data-field="__dpAmount"]');
    if (amountEl && amountEl !== document.activeElement) {
      amountEl.value = dp == null ? '' : Math.round(dp).toLocaleString('en-US');
    }
    const pctEl = document.querySelector('[data-field="__dpPct"]');
    if (pctEl && pctEl !== document.activeElement) {
      pctEl.value = (dp != null && Number(e.form.estValue) > 0)
        ? String(Number(((dp / Number(e.form.estValue)) * 100).toFixed(2)))
        : '';
    }
  }

  function refreshDerived() {
    const e = state.editing;
    if (!e || state.view !== 'editor') return;
    const f = e.form;
    const ltv = calcLtv(f);
    const rr = calcRateRange(f);

    setDv('ltv-num', ltv ? ltv.toFixed(1) + '%' : '—');
    const fill = document.querySelector('[data-dv="ltv-fill"]');
    if (fill) {
      fill.style.width = `${Math.min(ltv, 100)}%`;
      fill.className = `qb-ltv-fill ${ltvClass(ltv)}`;
    }
    const note = document.querySelector('[data-dv="ltv-note"]');
    if (note) note.hidden = !(ltv > 80);

    setDv('rate-range', `${rr.low}<span class="qb-pct">%</span><span class="qb-dash">–</span>${rr.high}<span class="qb-pct">%</span>`);
    setDv('rr-loan', fmtMoneyOrDash(f.loanBalance));
    setDv('rr-value', fmtMoneyOrDash(f.estValue));
    const railLtv = document.querySelector('[data-dv="rr-ltv"]');
    if (railLtv) {
      railLtv.textContent = ltv ? ltv.toFixed(1) + '%' : '—';
      railLtv.style.color = ltvRailColor(ltv);
    }
    if (f.loanPurpose === 'purchase') {
      const ctc = calcCashToClose(f, e.options);
      setDv('rr-cash', ctc != null ? fmtMoneyOrDash(ctc) : '—');
      const dp = calcDownPayment(f);
      setDv('rr-cash-sub', dp != null ? fmtMoneyOrDash(dp) + ' down' : 'Add price & loan amount');
    } else {
      const cash = calcCashEst(f);
      setDv('rr-cash', cash != null ? fmtMoneyOrDash(cash) : '—');
    }
    setDv('checks', checksHtml(f));
    setDv('ab-complete', `${calcCompleteness(f)}%`);
    setDv('ab-ltv', ltv ? ltv.toFixed(1) + '%' : '—');
    setDv('ab-borrower', escapeHtml(f.borrowerName || 'Unnamed'));
    setDv('qf-formula', qfFormulaHtml(f));

    // Per-option computed displays.
    e.options.forEach((opt, i) => {
      setDv(`opt.${i}.title`, `Option ${String(i + 1).padStart(2, '0')}${opt.label ? ' — ' + escapeHtml(opt.label) : ''}`);
      setDv(`opt.${i}.pointsCost`, fmtMoneyOrDash(opt.pointsCost ?? 0));
      if (!opt.monthlyPaymentOverride) setDv(`opt.${i}.monthlyPayment`, fmtMoneyOrDash(opt.monthlyPayment));
      if (!opt.prepaidsOverride) setDv(`opt.${i}.prepaidsAndEscrow`, fmtMoneyOrDash(opt.prepaidsAndEscrow ?? 0));
      if (!opt.totalClosingCostsOverride) setDv(`opt.${i}.totalClosingCosts`, fmtMoneyOrDash(opt.totalClosingCosts ?? 0));
    });
  }

  // ── Save (payload mirrors buildPayload + LO-only columns) ───────────
  function buildPayload(f, options) {
    return {
      borrower: {
        borrowerName: f.borrowerName,
        email: f.email,
        phone: f.phone,
        creditScore: f.creditScore,
      },
      property: {
        address: f.address,
        city: f.city,
        state: f.state,
        zip: f.zip,
        propertyType: f.propertyType,
        units: f.units,
        occupancy: f.occupancy,
        type: PROPERTY_TYPE_OPTIONS.find((p) => p.value === f.propertyType)?.label,
        estValue: f.estValue === '' ? null : Number(f.estValue),
        loanBalance: f.loanBalance === '' ? null : Number(f.loanBalance),
      },
      loan: {
        loanPurpose: f.loanPurpose,
        purpose: PURPOSE_OPTIONS.find((p) => p.value === f.loanPurpose)?.label,
        product: f.product,
        lockPeriod: f.lockPeriod,
        desiredCashOut: f.desiredCashOut,
        escrowWaived: f.escrowWaived,
        monthlyTaxes: f.monthlyTaxes === '' ? null : Number(f.monthlyTaxes),
        monthlyInsurance: f.monthlyInsurance === '' ? null : Number(f.monthlyInsurance),
        allowPPP: f.allowPPP,
        maxMonthly: f.maxMonthly,
        targetCloseDate: f.targetCloseDate,
        globalLoanAmount: f.globalLoanAmount,
        globalLoanTerm: f.globalLoanTerm,
        hazardAnnualPremium: f.hazardAnnualPremium,
        prepaidInterestDays: f.prepaidInterestDays,
        defaultLenderFees: f.defaultLenderFees,
        defaultThirdPartyFees: f.defaultThirdPartyFees,
        defaultTaxesAndGov: f.defaultTaxesAndGov,
        defaultOriginationFee: f.defaultOriginationFee,
        defaultPoints: f.defaultPoints,
        // NOTE: internal notes intentionally NOT here — loan_json ships to the
        // borrower's browser. They go to the internal_notes column below.
      },
      options,
    };
  }

  async function save() {
    const e = state.editing;
    if (!e || state.saving) return;
    if (!e.form.borrowerName?.trim()) {
      toast('err', 'Borrower name is required');
      return;
    }

    state.saving = true;
    $$('[data-act="save"]').forEach((b) => { b.disabled = true; b.textContent = 'Saving…'; });

    const payload = buildPayload(e.form, e.options);
    // LO-only fields — top level so the function writes them to dedicated
    // columns the borrower endpoint never returns.
    const loOnly = {
      wholesaleLender: e.form.wholesaleLender || null,
      priceToMe: e.form.priceToMe || null,
      internalNotes: e.form.notes || null,
    };

    try {
      let res;
      if (!e.quote) {
        res = await fetch('/api/quotes', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            borrowerName: e.form.borrowerName,
            borrowerEmail: e.form.email || null,
            borrowerPhone: e.form.phone || null,
            title: e.title,
            note: e.note,
            ...loOnly,
            initialRevision: payload,
          }),
        });
      } else {
        res = await fetch(`/api/quotes/${encodeURIComponent(e.quote.id)}/revisions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: e.title,
            note: e.note,
            ...loOnly,
            ...payload,
          }),
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
  function labelRow(label, opts = {}) {
    const required = opts.required ? '<span class="qb-req">*</span>' : '';
    const hint = opts.hint ? `<span class="qb-hint">${escapeHtml(opts.hint)}</span>` : '';
    return `<div class="qb-label-row"><label class="qb-label">${escapeHtml(label)}${required}</label>${hint}</div>`;
  }

  function field(label, type, key, value, placeholder, opts = {}) {
    const full = opts.full ? ' qb-full' : '';
    const max = opts.maxLength ? ` maxlength="${opts.maxLength}"` : '';
    const step = opts.step ? ` step="${opts.step}"` : '';
    const monoCls = opts.mono || type === 'number' ? ' qb-mono' : '';
    return `
      <div class="qb-field${full}">
        ${labelRow(label, opts)}
        <input class="qb-input${monoCls}" type="${type}" data-field="${escapeAttr(key)}"
               value="${escapeAttr(value ?? '')}" placeholder="${escapeAttr(placeholder || '')}"${max}${step}>
      </div>
    `;
  }

  function fieldMoney(label, key, value, placeholder, opts = {}) {
    const full = opts.full ? ' qb-full' : '';
    const display = value === '' || value == null
      ? ''
      : Number(value).toLocaleString('en-US',
          opts.cents ? { minimumFractionDigits: 2, maximumFractionDigits: 2 } : {});
    return `
      <div class="qb-field${full}">
        ${labelRow(label, opts)}
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
    const full = opts.full ? ' qb-full' : '';
    const display = value === '' || value == null ? '' : String(value);
    return `
      <div class="qb-field${full}">
        ${labelRow(label, opts)}
        <div class="qb-input-wrap">
          <input class="qb-input qb-mono qb-with-suffix" type="text" inputmode="decimal"
                 data-field="${escapeAttr(key)}" data-kind="pct"
                 value="${escapeAttr(display)}" placeholder="${escapeAttr(placeholder || '0.000')}">
          <span class="qb-suffix">%</span>
        </div>
      </div>
    `;
  }

  function fieldSelect(label, key, value, options, opts = {}) {
    const full = opts.full ? ' qb-full' : '';
    return `
      <div class="qb-field${full}">
        ${labelRow(label, opts)}
        <select class="qb-select" data-field="${escapeAttr(key)}"${opts.numeric ? ' data-numeric="1"' : ''}>
          ${options.map((o) =>
            `<option value="${escapeAttr(o.value)}"${String(o.value) === String(value) ? ' selected' : ''}>${escapeHtml(o.label)}</option>`,
          ).join('')}
        </select>
      </div>
    `;
  }

  function fieldChips(label, key, value, options, opts = {}) {
    const full = opts.full ? ' qb-full' : '';
    return `
      <div class="qb-field${full}">
        ${labelRow(label, opts)}
        <div class="qb-chips" data-chips="${escapeAttr(key)}">
          ${options.map((o) =>
            `<button type="button" class="qb-chip ${o.value === value ? 'qb-chip-on' : ''}" data-val="${escapeAttr(o.value)}">${escapeHtml(o.label)}</button>`,
          ).join('')}
        </div>
      </div>
    `;
  }

  // ToggleRow — title + description + switch button (port of qe-toggle-row).
  function toggleRow(key, value, title, desc) {
    return `
      <div class="qb-toggle-row">
        <div class="qb-toggle-text">
          <strong>${escapeHtml(title)}</strong>
          ${desc ? `<div class="qb-desc">${escapeHtml(desc)}</div>` : ''}
        </div>
        <button type="button" class="qb-switch ${value ? 'qb-on' : ''}" data-trow="${escapeAttr(key)}" aria-pressed="${value}"></button>
      </div>
    `;
  }

  // ComputedMoneyField — read-only auto value with an Override pill that
  // swaps in an editable money input (port of qe-computed-field).
  function computedMoney(label, i, key, flagKey, value, override, autoHint, placeholder, opts = {}) {
    const full = opts.full ? ' qb-full' : '';
    const hint = override ? 'Manual override' : autoHint;
    const display = value === '' || value == null ? '' : Math.round(Number(value)).toLocaleString('en-US');
    return `
      <div class="qb-field${full}">
        ${labelRow(label, { hint })}
        <div class="qb-computed">
          ${
            override
              ? `<div class="qb-input-wrap" style="flex:1">
                   <span class="qb-prefix">$</span>
                   <input class="qb-input qb-mono qb-with-prefix" type="text" inputmode="decimal"
                          data-field="__opt.${i}.${escapeAttr(key)}" data-kind="money"
                          value="${escapeAttr(display)}" placeholder="${escapeAttr(placeholder || '0')}">
                 </div>`
              : `<div class="qb-input qb-mono qb-readonly" style="flex:1" data-dv="opt.${i}.${escapeAttr(key)}">${fmtMoneyOrDash(value)}</div>`
          }
          <button type="button" class="qb-override ${override ? 'qb-on' : ''}" data-ovr="${i}.${escapeAttr(flagKey)}"
                  title="${override ? 'Click to revert to auto-calculated value' : 'Click to manually override this value'}"
                  aria-pressed="${override}">Override</button>
        </div>
      </div>
    `;
  }

  // ── Format helpers ─────────────────────────────────────────────────
  function fmtMoneyOrDash(n) {
    if (n == null || n === '' || Number.isNaN(Number(n))) return '—';
    return `$${Math.round(Number(n)).toLocaleString('en-US')}`;
  }

  // Split a stored full name into first / last for the dashboard columns.
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
  function cssEscape(s) {
    return (window.CSS && CSS.escape) ? CSS.escape(s) : String(s).replace(/["\\]/g, '\\$&');
  }

  // ── Go ─────────────────────────────────────────────────────────────
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
