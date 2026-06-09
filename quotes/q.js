/* ============================================================
   UTM SITE — Borrower quote view (vanilla JS port of
   PublicQuotePage.tsx + LoanComparison.tsx from cadence-crm)

   - Reads token from ?t=<token> query param
   - Fetches quote from /api/public/quotes/:token (Netlify Function)
   - Renders the comparison cards with the same logic the React app uses
   - On "Select this option" click, POSTs to /api/public/quotes/:token/select
     which fans out notifications via the cadence-crm webhook
   ============================================================ */

(function () {
  'use strict';

  const $  = (sel, root = document) => root.querySelector(sel);

  // ── State ──────────────────────────────────────────────────────────
  const state = {
    token: null,
    data: null,           // { quote, revision }
    filter: 'all',        // 'all' | 'ppp' | 'noppp' | 'lowrate' | 'maxcash'
    sort: 'option',       // 'option' | 'payment' | 'rate' | 'nopoints' | 'noppp' | 'cash'
    expanded: {},         // { [optionId]: true } — breakdown open state
    submittingIndex: null,
    selectError: null,
    confirmation: null,   // { optionIndex, message }
  };

  // ── Boot ───────────────────────────────────────────────────────────
  function init() {
    state.token = tokenFromUrl();
    if (!state.token) {
      renderError('Missing quote token in URL.');
      return;
    }
    fetchQuote();
  }

  // The borrower link is a clean path on the quotes subdomain
  // (quotes.myunitedtrust.com/<token>). A Netlify 200-rewrite serves q.html
  // while keeping that URL in the bar, so the token lives in the PATH, not the
  // query string. Fall back to ?t=<token> for direct /quotes/q.html?t= access
  // (local dev, previews).
  function tokenFromUrl() {
    const q = new URLSearchParams(window.location.search).get('t');
    if (q) return q.trim();
    const seg = window.location.pathname.split('/').filter(Boolean);
    const last = seg[seg.length - 1];
    if (last && !/^(q\.html|index\.html|quotes)$/i.test(last)) {
      return decodeURIComponent(last);
    }
    return null;
  }

  async function fetchQuote() {
    try {
      const res = await fetch(`/api/public/quotes/${encodeURIComponent(state.token)}`);
      if (!res.ok) {
        if (res.status === 404) {
          renderError('This quote link is invalid or has expired.');
        } else {
          renderError(`Couldn't load quote (HTTP ${res.status}).`);
        }
        return;
      }
      state.data = await res.json();
      render();
    } catch (e) {
      renderError(e.message || 'Network error');
    }
  }

  // ── Selection ──────────────────────────────────────────────────────
  async function handleSelect(idx) {
    if (state.confirmation || state.submittingIndex != null) return;
    state.selectError = null;
    state.submittingIndex = idx;
    render();
    try {
      const res = await fetch(`/api/public/quotes/${encodeURIComponent(state.token)}/select`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ optionIndex: idx }),
      });
      const result = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(result.error || `Couldn't record your selection (HTTP ${res.status}).`);
      }
      state.confirmation = { optionIndex: idx, message: result.message || '' };
    } catch (e) {
      state.selectError = e.message || 'Something went wrong.';
    } finally {
      state.submittingIndex = null;
      render();
      // Scroll the confirmation into view so the borrower sees it.
      if (state.confirmation) {
        setTimeout(() => {
          $('.q-confirmation')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }, 60);
      }
    }
  }

  // ── Render ─────────────────────────────────────────────────────────

  function render() {
    const root = $('#q-root');
    if (!state.data) {
      root.innerHTML = '<div class="q-loading">Loading your loan options…</div>';
      return;
    }
    const { quote, revision } = state.data;
    const options = revision?.options ?? [];
    const loanPurpose = deriveLoanPurpose(revision);
    const taxesEscrow = deriveTaxesEscrow(revision);
    const balances = deriveBalances(revision, loanPurpose);
    const summary = deriveBorrowerSummary(revision);

    const firstName = (quote.borrowerName || '').trim().split(/\s+/)[0] || 'there';
    const filtered = applyFilterSort(options, state.filter, state.sort, loanPurpose);

    root.innerHTML = `
      <header class="q-header">
        <div>
          <div class="q-eyebrow">Loan Comparison</div>
          <h1 class="q-headline">
            ${escapeHtml(quote.title || 'Your loan options')}
            ${
              titleMentionsBorrower(quote.title || '', quote.borrowerName)
                ? ''
                : ` <em>— ${escapeHtml(quote.borrowerName)}</em>`
            }
          </h1>
          <p class="q-subhead">
            ${escapeHtml(firstName)}, here are the loan options we put together. Compare the rate,
            monthly payment, and closing costs side by side, then pick the one you'd like
            to move forward with.
          </p>
        </div>
        ${
          summary.length
            ? `
          <aside class="q-borrower-card">
            ${summary
              .map(
                (row) => `
              <div class="q-borrower-row">
                <span class="q-borrower-label">${escapeHtml(row.label)}</span>
                <span class="q-borrower-val">${escapeHtml(row.value)}</span>
              </div>`,
              )
              .join('')}
          </aside>
        `
            : ''
        }
      </header>

      ${renderToolbar(options.length, filtered.length, loanPurpose)}

      ${
        options.length === 0
          ? `<div class="q-loading">No options to display yet.</div>`
          : `<div class="q-grid">${filtered
              .map((opt) =>
                renderCard(opt, options.indexOf(opt), options.length, {
                  loanPurpose,
                  monthlyTaxes: taxesEscrow.taxes,
                  monthlyInsurance: taxesEscrow.insurance,
                  escrowed: taxesEscrow.escrowed,
                  existingBalance: balances.existingBalance,
                  purchasePrice: balances.purchasePrice,
                }),
              )
              .join('')}</div>`
      }

      ${state.selectError ? renderError_banner(state.selectError) : ''}
      ${state.confirmation ? renderConfirmation(state.confirmation) : ''}
    `;

    bindHandlers();
  }

  function renderToolbar(total, shown, loanPurpose) {
    const isCashout = loanPurpose === 'cashout';
    const allLabel = `All ${total} option${total === 1 ? '' : 's'}`;
    return `
      <div class="q-toolbar">
        <div class="q-seg" role="tablist">
          <button data-filter="all" class="${state.filter === 'all' ? 'q-active' : ''}">${escapeHtml(allLabel)}</button>
          ${
            isCashout
              ? `
            <button data-filter="noppp" class="${state.filter === 'noppp' ? 'q-active' : ''}">No PPP only</button>
            <button data-filter="maxcash" class="${state.filter === 'maxcash' ? 'q-active' : ''}">Max cash-out</button>
          `
              : `
            <button data-filter="ppp" class="${state.filter === 'ppp' ? 'q-active' : ''}">PPP</button>
            <button data-filter="lowrate" class="${state.filter === 'lowrate' ? 'q-active' : ''}">Lowest rate</button>
          `
          }
        </div>
        <label class="q-sort-by">
          <span>Sort by</span>
          <select data-sort>
            <option value="option" ${state.sort === 'option' ? 'selected' : ''}>Option number</option>
            <option value="payment" ${state.sort === 'payment' ? 'selected' : ''}>Lowest payment</option>
            <option value="rate" ${state.sort === 'rate' ? 'selected' : ''}>Lowest rate</option>
            <option value="nopoints" ${state.sort === 'nopoints' ? 'selected' : ''}>No points first</option>
            <option value="noppp" ${state.sort === 'noppp' ? 'selected' : ''}>No PPP first</option>
            ${isCashout ? `<option value="cash" ${state.sort === 'cash' ? 'selected' : ''}>Most cash to borrower</option>` : ''}
          </select>
          <span class="q-tool-count">${shown === total ? `${total}` : `${shown} of ${total}`}</span>
        </label>
      </div>
    `;
  }

  function renderCard(opt, idx, total, ctx) {
    const badge = badgeMeta(opt);
    const isSelected = state.confirmation?.optionIndex === idx;
    const isSubmitting = state.submittingIndex === idx;
    const locked = !!state.confirmation;
    const cardClasses = [
      'q-card',
      opt.recommended ? 'q-recommended' : '',
      isSelected ? 'q-selected' : '',
      locked && !isSelected ? 'q-dimmed' : '',
    ]
      .filter(Boolean)
      .join(' ');

    const ti =
      (ctx.monthlyTaxes != null ? ctx.monthlyTaxes : 0) +
      (ctx.monthlyInsurance != null ? ctx.monthlyInsurance : 0);
    const hasTI = ctx.monthlyTaxes != null || ctx.monthlyInsurance != null;
    const showTotal = ctx.escrowed && hasTI;

    const expanded = !!state.expanded[opt.id];

    return `
      <article class="${cardClasses}">
        <div class="q-card-head">
          <div class="q-opt-num"><strong>${idx + 1}</strong>/${total}</div>
          ${badge ? `<span class="q-badge ${badge.className}">${escapeHtml(badge.label)}</span>` : ''}
        </div>
        ${opt.label ? `<div class="q-opt-name">${escapeHtml(opt.label)}</div>` : ''}
        <div class="q-opt-note ${opt.notes ? '' : 'q-opt-note-empty'}">
          ${opt.notes ? escapeHtml(opt.notes) : '—'}
        </div>

        <div class="q-rate-block">
          <span class="q-rate-num">${Number(opt.rate).toFixed(3)}</span><span class="q-rate-pct">%</span>
          <div class="q-rate-label">Interest rate · ${escapeHtml(productLabel(opt))}</div>
          ${opt.apr != null ? `<div class="q-apr">APR <span class="q-num">${fmtRate(opt.apr)}</span></div>` : ''}
        </div>

        <div class="q-stats">
          <div class="q-stat">
            <span class="q-stat-label">Monthly payment</span>
            <span class="q-stat-val q-big">${fmtMoney(opt.monthlyPayment, true)}</span>
          </div>
          ${
            hasTI
              ? `
            <div class="q-stat">
              <span class="q-stat-label">Taxes &amp; insurance</span>
              <span class="q-stat-val">${fmtMoney(ti, true)}</span>
            </div>
          `
              : ''
          }
          ${
            showTotal
              ? `
            <div class="q-stat">
              <span class="q-stat-label">Total est. payment</span>
              <span class="q-stat-val q-big">${fmtMoney((opt.monthlyPayment || 0) + ti, true)}</span>
            </div>
          `
              : ''
          }
          ${
            opt.cashOut != null && opt.cashOut !== 0
              ? `
            <div class="q-stat">
              <span class="q-stat-label">Cash to you</span>
              <span class="q-stat-val">${fmtMoney(opt.cashOut)}</span>
            </div>
          `
              : ''
          }
          <div class="q-stat">
            <span class="q-stat-label">Lender credit</span>
            <span class="q-stat-val ${(opt.lenderCredit ?? 0) > 0 ? 'q-good' : ''}">
              ${(opt.lenderCredit ?? 0) > 0 ? `+${fmtMoney(opt.lenderCredit)}` : '—'}
            </span>
          </div>
          <div class="q-stat">
            <span class="q-stat-label">Points</span>
            <span class="q-stat-val">
              ${opt.points != null ? Number(opt.points).toFixed(2) : '—'}
              <span class="q-stat-sub">${fmtMoney(opt.pointsCost ?? 0)}</span>
            </span>
          </div>
        </div>

        <div class="q-ppp-row ${opt.hasPpp ? 'q-has-ppp' : 'q-no-ppp'}">
          <span class="q-dot ${opt.hasPpp ? 'q-ppp' : 'q-nop'}"></span>
          <span class="q-ppp-label">${opt.hasPpp ? 'Prepayment penalty' : 'No penalty'}</span>
          <span class="q-ppp-term">${escapeHtml(opt.hasPpp ? (opt.pppDescription || '') : 'No prepayment penalty')}</span>
        </div>

        ${renderBreakdown(opt, idx, ctx, expanded)}

        <div class="q-card-actions">
          <button class="q-btn" data-toggle="${escapeAttr(opt.id)}" type="button">
            ${expanded ? 'Hide breakdown' : 'See breakdown'}
          </button>
          <button
            class="q-btn q-primary ${isSelected ? 'q-selected' : ''}"
            data-select="${idx}"
            type="button"
            ${locked || isSubmitting ? 'disabled' : ''}
          >
            ${
              isSelected
                ? '✓ Selected'
                : isSubmitting
                ? 'Submitting…'
                : locked
                ? 'Another option selected'
                : 'Select this option'
            }
          </button>
        </div>
      </article>
    `;
  }

  function renderBreakdown(opt, _idx, ctx, expanded) {
    const isPurchase = ctx.loanPurpose === 'purchase';
    const lenderCredit = opt.lenderCredit ?? 0;
    const lenderFees = opt.lenderFees ?? 0;
    const thirdPartyFees = opt.thirdPartyFees ?? 0;
    const taxesAndGov = opt.taxesAndGov ?? 0;
    const prepaidsAndEscrow = opt.prepaidsAndEscrow ?? 0;
    const pointsCost = opt.pointsCost ?? 0;

    const pivot = isPurchase
      ? ctx.purchasePrice ?? opt.loanAmount
      : ctx.existingBalance ?? 0;

    const cashFlow =
      (opt.loanAmount ?? 0) -
      pivot +
      lenderCredit -
      lenderFees -
      thirdPartyFees -
      taxesAndGov -
      prepaidsAndEscrow -
      pointsCost;

    const cashLabel = cashFlow >= 0 ? 'Cash to borrower' : 'Cash from borrower';
    const cashValue =
      cashFlow >= 0
        ? `+ ${fmtMoney(cashFlow, true)}`
        : `− ${fmtMoney(-cashFlow, true)}`;

    const totalClosingCosts =
      lenderFees + thirdPartyFees + taxesAndGov + prepaidsAndEscrow + pointsCost - lenderCredit;
    const tccValue =
      totalClosingCosts === 0
        ? '—'
        : totalClosingCosts > 0
        ? `− ${fmtMoney(totalClosingCosts, true)}`
        : `+ ${fmtMoney(-totalClosingCosts, true)}`;

    const downPayment =
      isPurchase && ctx.purchasePrice != null && ctx.purchasePrice > 0
        ? Math.max(0, ctx.purchasePrice - (opt.loanAmount ?? 0))
        : null;

    return `
      <div class="q-breakdown ${expanded ? 'q-open' : ''}">
        <div class="q-breakdown-head">Cash from / to borrower</div>
        ${bdRow('Loan amount', `+ ${fmtMoney(opt.loanAmount ?? 0)}`)}
        ${
          isPurchase
            ? ctx.purchasePrice != null && ctx.purchasePrice > 0
              ? bdRow('Purchase price', `− ${fmtMoney(ctx.purchasePrice)}`) +
                (downPayment != null ? bdRow('Down payment', fmtMoney(downPayment)) : '')
              : ''
            : ctx.existingBalance != null && ctx.existingBalance > 0
            ? bdRow('Existing balance payoff', `− ${fmtMoney(ctx.existingBalance)}`)
            : ''
        }
        ${bdRow(
          'Lender credit',
          lenderCredit > 0 ? `+ ${fmtMoney(lenderCredit)}` : '—',
          { good: lenderCredit > 0 },
        )}
        ${bdRow('Lender fees', signedNeg(opt.lenderFees))}
        ${bdRow('Third party fees', signedNeg(opt.thirdPartyFees))}
        ${bdRow("Taxes & gov't", signedNeg(opt.taxesAndGov))}
        ${bdRow('Prepaids & escrow', signedNeg(opt.prepaidsAndEscrow, true))}
        ${bdRow('Points cost', signedNeg(opt.pointsCost))}
        ${bdRow('Total closing costs', tccValue, { subtotal: true })}
        ${bdRow(cashLabel, cashValue, { total: true })}
      </div>
    `;
  }

  function bdRow(label, value, opts = {}) {
    const classes = ['q-bd-row'];
    if (opts.total) classes.push('q-bd-total');
    if (opts.subtotal) classes.push('q-bd-subtotal');
    const valClasses = ['q-bd-val'];
    if (opts.good) valClasses.push('q-good');
    return `
      <div class="${classes.join(' ')}">
        <span class="q-bd-lbl">${escapeHtml(label)}</span>
        <span class="${valClasses.join(' ')}">${escapeHtml(value)}</span>
      </div>
    `;
  }

  function renderConfirmation(c) {
    return `
      <div class="q-confirmation">
        <div class="q-confirmation-title">
          You picked Option ${String(c.optionIndex + 1).padStart(2, '0')} —
          your loan officer has been notified.
        </div>
        <div class="q-confirmation-sub">
          ${escapeHtml(c.message) ||
            "We'll reach out shortly with next steps to lock your rate and start the paperwork."}
        </div>
      </div>
    `;
  }

  function renderError_banner(msg) {
    return `
      <div class="q-confirmation q-err" role="alert">
        <div class="q-confirmation-title">Something went wrong</div>
        <div class="q-confirmation-sub">${escapeHtml(msg)}</div>
      </div>
    `;
  }

  function renderError(msg) {
    $('#q-root').innerHTML = `
      <div class="q-error">
        <div>
          <h1>Quote not available</h1>
          <p style="text-align:center;color:var(--muted)">${escapeHtml(msg)}</p>
        </div>
      </div>
    `;
  }

  // ── Event delegation ───────────────────────────────────────────────
  function bindHandlers() {
    // Filter chips
    document.querySelectorAll('.q-seg button[data-filter]').forEach((b) => {
      b.addEventListener('click', () => {
        state.filter = b.dataset.filter;
        render();
      });
    });
    // Sort dropdown
    const sortEl = document.querySelector('select[data-sort]');
    if (sortEl) {
      sortEl.addEventListener('change', () => {
        state.sort = sortEl.value;
        render();
      });
    }
    // Breakdown toggles
    document.querySelectorAll('button[data-toggle]').forEach((b) => {
      b.addEventListener('click', () => {
        const id = b.dataset.toggle;
        state.expanded[id] = !state.expanded[id];
        render();
      });
    });
    // Select buttons
    document.querySelectorAll('button[data-select]').forEach((b) => {
      b.addEventListener('click', () => {
        const idx = Number(b.dataset.select);
        handleSelect(idx);
      });
    });
  }

  // ── Derive helpers (mirror PublicQuotePage.tsx) ─────────────────────
  function deriveLoanPurpose(revision) {
    if (!revision) return 'cashout';
    const loan = revision.loan || {};
    const raw = loan.loanPurpose ?? loan.purpose;
    if (typeof raw !== 'string') return 'cashout';
    const norm = raw.toLowerCase();
    if (norm.includes('cash')) return 'cashout';
    if (norm.includes('purchase')) return 'purchase';
    if (norm.includes('rate') || norm.includes('term') || norm.includes('refi')) return 'rateterm';
    if (norm === 'cashout' || norm === 'rateterm' || norm === 'purchase') return norm;
    return 'cashout';
  }

  function deriveTaxesEscrow(revision) {
    if (!revision) return { taxes: null, insurance: null, escrowed: false };
    const loan = revision.loan || {};
    const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
    return {
      taxes: num(loan.monthlyTaxes),
      insurance: num(loan.monthlyInsurance),
      escrowed: loan.escrowWaived === true ? false : true,
    };
  }

  function deriveBalances(revision, loanPurpose) {
    if (!revision) return { existingBalance: null, purchasePrice: null };
    const property = revision.property || {};
    const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
    const isPurchase = loanPurpose === 'purchase';
    return {
      existingBalance: isPurchase ? null : num(property.loanBalance),
      purchasePrice: isPurchase ? num(property.estValue) : null,
    };
  }

  function deriveBorrowerSummary(revision) {
    if (!revision) return [];
    const loan = revision.loan || {};
    const property = revision.property || {};
    const out = [];
    if (typeof loan.purpose === 'string' && loan.purpose) out.push({ label: 'Loan', value: loan.purpose });
    if (typeof property.type === 'string' && property.type) out.push({ label: 'Property', value: property.type });
    if (typeof property.address === 'string' && property.address) out.push({ label: 'Address', value: property.address });
    return out;
  }

  // ── Filter / sort (port of LoanComparison filtered useMemo) ─────────
  function applyFilterSort(options, filter, sort, loanPurpose) {
    if (!options.length) return [];
    const isCashout = loanPurpose === 'cashout';
    let arr = options.slice();
    if (filter === 'noppp') arr = arr.filter((o) => !o.hasPpp);
    else if (filter === 'ppp') arr = arr.filter((o) => o.hasPpp);
    else if (filter === 'maxcash' && isCashout) {
      const max = Math.max(...arr.map((o) => o.cashOut ?? -Infinity));
      if (max !== -Infinity) arr = arr.filter((o) => (o.cashOut ?? -Infinity) === max);
    } else if (filter === 'lowrate') {
      const min = Math.min(...arr.map((o) => o.rate));
      arr = arr.filter((o) => o.rate === min);
    }

    const indexById = new Map(options.map((o, i) => [o.id, i]));
    arr.sort((a, b) => {
      if (sort === 'rate') return a.rate - b.rate;
      if (sort === 'payment') return a.monthlyPayment - b.monthlyPayment;
      if (sort === 'cash') return (b.cashOut ?? 0) - (a.cashOut ?? 0);
      if (sort === 'nopoints') {
        const ap = (a.points ?? 0) === 0 ? 0 : 1;
        const bp = (b.points ?? 0) === 0 ? 0 : 1;
        if (ap !== bp) return ap - bp;
        return (a.points ?? 0) - (b.points ?? 0);
      }
      if (sort === 'noppp') {
        const ap = a.hasPpp ? 1 : 0;
        const bp = b.hasPpp ? 1 : 0;
        if (ap !== bp) return ap - bp;
      }
      return (indexById.get(a.id) ?? 0) - (indexById.get(b.id) ?? 0);
    });
    return arr;
  }

  function badgeMeta(opt) {
    if (opt.badge === 'lowest_payment') return { className: 'q-badge-low', label: 'Lowest payment' };
    if (opt.badge === 'most_flexible') return { className: 'q-badge-flex', label: 'No penalty' };
    if (opt.badge === 'recommended' || opt.recommended)
      return { className: 'q-badge-rec', label: 'Recommended' };
    return null;
  }

  function productLabel(opt) {
    const years = Math.round((opt.termMonths || 0) / 12);
    const product = (opt.productType || '').trim();
    if (!product) return `${years}-yr`;
    const yearMentioned = new RegExp(`\\b${years}[ -]?(yr|year)`, 'i').test(product);
    return yearMentioned ? product : `${years}-yr ${product}`;
  }

  function titleMentionsBorrower(title, borrowerName) {
    const t = (title || '').toLowerCase();
    const first = (borrowerName || '').trim().split(/\s+/)[0]?.toLowerCase();
    if (!first) return false;
    return t.includes(first);
  }

  // ── Format helpers ─────────────────────────────────────────────────
  function fmtMoney(n, cents) {
    if (n == null || Number.isNaN(n)) return '—';
    const opts = cents
      ? { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 }
      : { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0 };
    return Number(n).toLocaleString('en-US', opts);
  }
  function fmtRate(n) {
    if (n == null) return '—';
    return `${Number(n).toFixed(3)}%`;
  }
  function signedNeg(n, cents) {
    if (n == null) return '—';
    if (n === 0) return '—';
    return `− ${fmtMoney(Math.abs(n), cents)}`;
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
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
