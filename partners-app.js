/* ============================================================
   UTM Partners — Flyer builder (live preview + export)
   ============================================================ */
(function () {
  'use strict';

  const $  = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  // ── State ────────────────────────────────────────────────────
  const STATE = {
    brand: 'solo',           // 'solo' | 'co'
    flyer: 'open-house',     // 'open-house' | 'just-funded' | 'loan-programs'
    theme: 'navy',
    partner: {},             // info form
    fields:  {},             // flyer-specific fields
    headshot: null,          // dataURL
    propertyPhoto: null,     // dataURL
    tagline: '',
  };

  // Restore from localStorage
  function load(key) { try { return JSON.parse(localStorage.getItem(key)); } catch (_) { return null; } }
  function save(key, val) { try { localStorage.setItem(key, JSON.stringify(val)); } catch (_) {} }
  STATE.brand    = load('utm.partners.brand')    || 'solo';
  STATE.flyer    = load('utm.partners.flyer')    || 'just-funded';
  STATE.template = load('utm.partners.template') || 'editorial';
  STATE.partner  = load('utm.partners.info')     || {};
  STATE.fields   = load('utm.partners.fields')   || {};
  STATE.headshot = load('utm.partners.headshot') || null;
  STATE.propertyPhoto = load('utm.partners.propertyPhoto') || null;
  STATE.tagline  = load('utm.partners.tagline')  || '';

  // ── Template palettes (Editorial = dark, Deal Tape = light) ──
  const TEMPLATES_PAL = {
    editorial: {
      bg: '#0b1410',
      ink: '#f4f1e8',
      accent: '#c9a961',
      emerald: '#1f5b4a',
      muted: 'rgba(244,241,232,0.62)',
      rule: 'rgba(244,241,232,0.10)',
      ruleStrong: 'rgba(201,169,97,0.35)',
      stripBg: 'rgba(0,0,0,0.32)',
    },
    dealtape: {
      bg: '#f4f1e8',
      ink: '#0b1410',
      accent: '#0b1410',
      emeraldLine: '#1f5b4a',
      muted: 'rgba(11,20,16,0.58)',
      rule: 'rgba(11,20,16,0.14)',
      ruleStrong: 'rgba(11,20,16,0.32)',
      stripBg: 'rgba(11,20,16,0.06)',
      italic: '#1f5b4a',
    },
  };

  // ── Flyer-type field templates ───────────────────────────────
  const FLYER_TEMPLATES = {
    'open-house': {
      title: 'Open House details',
      defaultHeadline: 'Open House',
      fields: [
        { id: 'fAddr',  label: 'Property address', placeholder: '1234 Sunset Blvd, Los Angeles, CA' },
        { id: 'fPrice', label: 'List price',       placeholder: '$1,250,000' },
        { id: 'fBeds',  label: 'Beds',             placeholder: '4' },
        { id: 'fBaths', label: 'Baths',            placeholder: '3' },
        { id: 'fSqft',  label: 'Sq ft',            placeholder: '2,400' },
        { id: 'fDate',  label: 'Open house date',  placeholder: 'Sat Apr 27 · 1–4pm' },
      ],
      photo: true,
    },
    'just-funded': {
      title: 'Just Funded details',
      defaultHeadline: 'Just Funded',
      fields: [
        { id: 'fDealNo',    label: 'Deal number',      placeholder: '2419' },
        { id: 'fLoanAmt',   label: 'Loan amount',      placeholder: '$1,275,000' },
        { id: 'fPropVal',   label: 'Property value',   placeholder: '$1,700,000' },
        { id: 'fLocation',  label: 'Location',         placeholder: 'Miami Beach, FL' },
        { id: 'fPropType',  label: 'Property type',    placeholder: 'Investment property' },
        { id: 'fProgram',   label: 'Program',          placeholder: 'DSCR' },
        { id: 'fLoanType',  label: 'Loan type',        placeholder: 'Cash-Out Refinance' },
        { id: 'fTerm',      label: 'Term',             placeholder: '30 yr fxd' },
        { id: 'fLTV',       label: 'LTV',              placeholder: '75%' },
        { id: 'fDSCR',      label: 'DSCR',             placeholder: '1.42×' },
        { id: 'fFICO',      label: 'FICO',             placeholder: '742' },
        { id: 'fRate',      label: 'Rate',             placeholder: '7.125%' },
        { id: 'fCloseDays', label: 'Days to close',    placeholder: '18' },
        { id: 'fBeds',      label: 'Beds',             placeholder: '8' },
        { id: 'fBaths',     label: 'Baths',            placeholder: '6' },
        { id: 'fSqft',      label: 'Sq ft',            placeholder: '5,400' },
        { id: 'fNarrative', label: 'The deal (story)', placeholder: 'A repeat investor needed cash-out to acquire a fourth Miami-area rental. Two banks declined on documentation. We underwrote on rent — DSCR 1.42× — and closed in under three weeks.' },
      ],
      photo: true,
    },
    'loan-programs': {
      title: 'Loan Program flyer details',
      defaultHeadline: 'Loan Program',
      fields: [
        { id: 'fProgram',  label: 'Program name',  placeholder: 'DSCR Loan' },
        { id: 'fHook',     label: 'One-line hook', placeholder: 'Qualify on rental cash flow.' },
        { id: 'fBullet1',  label: 'Bullet 1',      placeholder: 'No tax returns required' },
        { id: 'fBullet2',  label: 'Bullet 2',      placeholder: 'Up to 80% LTV' },
        { id: 'fBullet3',  label: 'Bullet 3',      placeholder: 'Close in an LLC' },
        { id: 'fBullet4',  label: 'Bullet 4',      placeholder: '660+ FICO' },
      ],
      photo: false,
    },
  };

  const PARTNER_FIELDS = ['pFirst','pLast','pEmail','pPhone','pLicense','pCompany','pWebsite','pCompanyLic'];

  // ── Notifications ────────────────────────────────────────────
  const notif = $('#notif');
  const notifMsg = $('#notifMsg');
  let notifT;
  function flash(msg) {
    if (!notif || !notifMsg) return;
    notifMsg.textContent = msg;
    notif.classList.add('visible');
    clearTimeout(notifT);
    notifT = setTimeout(() => notif.classList.remove('visible'), 1500);
  }

  // ── Render fields panel based on flyer type ──────────────────
  const fieldsTitle = $('#fieldsPanelTitle');
  const fieldsBody  = $('#fieldsPanelBody');

  function renderFields() {
    const tpl = FLYER_TEMPLATES[STATE.flyer];
    if (!tpl || !fieldsBody) return;
    if (fieldsTitle) fieldsTitle.textContent = tpl.title;
    fieldsBody.innerHTML = '';
    const grid = document.createElement('div');
    grid.className = 'form-grid';
    tpl.fields.forEach(f => {
      const wrap = document.createElement('div');
      wrap.className = 'fg';
      wrap.innerHTML =
        `<label for="${f.id}">${f.label}</label>` +
        `<input type="text" id="${f.id}" placeholder="${f.placeholder || ''}"/>`;
      grid.appendChild(wrap);
    });

    // Property photo upload (open-house & just-funded)
    if (tpl.photo) {
      const wrap = document.createElement('div');
      wrap.className = 'fg full';
      wrap.innerHTML =
        `<label>Property photo</label>
         <div class="upload-drop" id="propPhotoDrop">
           <input type="file" id="propPhotoInput" accept="image/*"/>
           <div class="upload-drop-empty">
             <div class="upload-icon">⤴</div>
             <div class="upload-title">Upload property photo</div>
             <div class="upload-sub">JPG or PNG · 4:3 or wider works best</div>
           </div>
           <div class="upload-preview" style="display:${STATE.propertyPhoto ? 'flex' : 'none'};">
             <img class="upload-preview-img" alt="" src="${STATE.propertyPhoto || ''}"/>
             <div class="upload-preview-info">
               <div class="upload-preview-name">Property photo</div>
               <div class="upload-preview-meta">Ready to use</div>
             </div>
             <button type="button" class="upload-remove" data-remove="propPhoto" aria-label="Remove">✕</button>
           </div>
         </div>`;
      grid.appendChild(wrap);
    }

    fieldsBody.appendChild(grid);

    // Restore values + bind
    tpl.fields.forEach(f => {
      const el = document.getElementById(f.id);
      if (!el) return;
      if (STATE.fields[f.id] != null) el.value = STATE.fields[f.id];
      el.addEventListener('input', () => {
        STATE.fields[f.id] = el.value;
        save('utm.partners.fields', STATE.fields);
        renderFlyer();
      });
    });

    if (tpl.photo) wireUpload('propPhotoDrop', 'propPhotoInput', img => {
      STATE.propertyPhoto = img;
      save('utm.partners.propertyPhoto', img);
      renderFlyer();
    });

    // Re-bind upload remove buttons inside this panel
    $$('.upload-remove[data-remove="propPhoto"]', fieldsBody).forEach(btn => {
      btn.addEventListener('click', () => {
        const drop = btn.closest('.upload-drop');
        if (!drop) return;
        const empty   = drop.querySelector('.upload-drop-empty');
        const preview = drop.querySelector('.upload-preview');
        const input   = drop.querySelector('input[type="file"]');
        if (input)   input.value = '';
        if (empty)   empty.style.display = '';
        if (preview) preview.style.display = 'none';
        STATE.propertyPhoto = null;
        save('utm.partners.propertyPhoto', null);
        renderFlyer();
      });
    });
  }

  // ── Branding mode ───────────────────────────────────────────
  const brandOpts  = $$('.brand-opt');
  const cobrandRev = $('#cobrandReveal');
  const brandPill  = $('#brandStatusPill');

  function setBrand(mode) {
    STATE.brand = mode;
    save('utm.partners.brand', mode);
    brandOpts.forEach(b => {
      const active = b.dataset.brand === mode;
      b.classList.toggle('active', active);
      b.setAttribute('aria-checked', active ? 'true' : 'false');
    });
    if (cobrandRev) cobrandRev.style.display = mode === 'co' ? 'block' : 'none';
    if (brandPill)  brandPill.textContent     = mode === 'co' ? 'Co-brand' : 'Solo';
    renderFlyer();
  }
  brandOpts.forEach(b => b.addEventListener('click', () => setBrand(b.dataset.brand)));

  // ── Flyer type tabs ─────────────────────────────────────────
  const flyerBtns = $$('.flyer-type-btn');
  function setFlyerType(type) {
    STATE.flyer = type;
    save('utm.partners.flyer', type);
    flyerBtns.forEach(b => b.classList.toggle('active', b.dataset.flyer === type));
    renderFields();
    renderFlyer();
  }
  flyerBtns.forEach(b => b.addEventListener('click', () => setFlyerType(b.dataset.flyer)));

  // ── Template toggle (Editorial / Deal Tape) ─────────────────
  const tplOpts = $$('.tpl-opt');
  function setTemplate(tpl) {
    STATE.template = tpl;
    save('utm.partners.template', tpl);
    tplOpts.forEach(o => {
      const sel = o.dataset.template === tpl;
      o.classList.toggle('selected', sel);
      o.setAttribute('aria-checked', sel ? 'true' : 'false');
    });
    renderFlyer();
  }
  tplOpts.forEach(o => o.addEventListener('click', () => setTemplate(o.dataset.template)));
  // Restore selection
  tplOpts.forEach(o => o.classList.toggle('selected', o.dataset.template === STATE.template));

  // ── Tagline ─────────────────────────────────────────────────
  const tagInput = $('#tagline');
  if (tagInput) {
    tagInput.value = STATE.tagline;
    tagInput.addEventListener('input', () => {
      STATE.tagline = tagInput.value;
      save('utm.partners.tagline', STATE.tagline);
      renderFlyer();
    });
  }

  // ── Partner info ────────────────────────────────────────────
  function bindPartnerInfo() {
    PARTNER_FIELDS.forEach(id => {
      const el = document.getElementById(id);
      if (!el) return;
      if (STATE.partner[id] != null) el.value = STATE.partner[id];
      el.addEventListener('input', () => {
        STATE.partner[id] = el.value;
        save('utm.partners.info', STATE.partner);
        renderFlyer();
      });
    });
  }

  // ── Upload helper ───────────────────────────────────────────
  function wireUpload(dropId, inputId, onLoad) {
    const drop  = document.getElementById(dropId);
    const input = document.getElementById(inputId);
    if (!drop || !input) return;
    const empty   = drop.querySelector('.upload-drop-empty');
    const preview = drop.querySelector('.upload-preview');
    const img     = preview && preview.querySelector('.upload-preview-img');
    const name    = preview && preview.querySelector('.upload-preview-name');

    function applyFile(file) {
      if (!file) return;
      const reader = new FileReader();
      reader.onload = e => {
        const url = e.target.result;
        if (img) img.src = url;
        if (name && file.name) name.textContent = file.name;
        if (empty) empty.style.display = 'none';
        if (preview) preview.style.display = 'flex';
        if (onLoad) onLoad(url);
      };
      reader.readAsDataURL(file);
    }

    input.addEventListener('change', e => applyFile(e.target.files && e.target.files[0]));
    drop.addEventListener('dragover', e => { e.preventDefault(); drop.classList.add('drop-hover'); });
    drop.addEventListener('dragleave', () => drop.classList.remove('drop-hover'));
    drop.addEventListener('drop', e => {
      e.preventDefault();
      drop.classList.remove('drop-hover');
      const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
      if (f) applyFile(f);
    });
  }

  // Wire headshot drop, restore preview if cached
  wireUpload('pHeadshotDrop', 'pHeadshotInput', dataUrl => {
    STATE.headshot = dataUrl;
    save('utm.partners.headshot', dataUrl);
    renderFlyer();
  });

  function restoreHeadshotPreview() {
    if (!STATE.headshot) return;
    const drop = $('#pHeadshotDrop');
    if (!drop) return;
    const empty   = drop.querySelector('.upload-drop-empty');
    const preview = drop.querySelector('.upload-preview');
    const img     = preview && preview.querySelector('.upload-preview-img');
    const name    = preview && preview.querySelector('.upload-preview-name');
    if (img) img.src = STATE.headshot;
    if (name) name.textContent = 'Headshot';
    if (empty) empty.style.display = 'none';
    if (preview) preview.style.display = 'flex';
  }

  // Generic remove buttons (all .upload-remove)
  document.addEventListener('click', e => {
    const btn = e.target.closest('.upload-remove');
    if (!btn) return;
    const drop = btn.closest('.upload-drop');
    if (!drop) return;
    const empty   = drop.querySelector('.upload-drop-empty');
    const preview = drop.querySelector('.upload-preview');
    const input   = drop.querySelector('input[type="file"]');
    if (input)   input.value = '';
    if (empty)   empty.style.display = '';
    if (preview) preview.style.display = 'none';
    if (btn.dataset.remove === 'pHeadshot') {
      STATE.headshot = null;
      save('utm.partners.headshot', null);
      renderFlyer();
    } else if (btn.dataset.remove === 'propPhoto') {
      STATE.propertyPhoto = null;
      save('utm.partners.propertyPhoto', null);
      renderFlyer();
    }
  });

  // ── Render flyer canvas ─────────────────────────────────────
  const canvas = $('#flyerCanvas');
  function esc(s) {
    if (s == null) return '';
    return String(s).replace(/[&<>"]/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;' }[c]));
  }

  function partnerNameLine() {
    const f = (STATE.partner.pFirst || '').trim();
    const l = (STATE.partner.pLast  || '').trim();
    return [f, l].filter(Boolean).join(' ') || 'Your Name';
  }

  function quarterTag() {
    const d = new Date();
    const q = Math.floor(d.getMonth() / 3) + 1;
    return `Q${q} · ${d.getFullYear()}`;
  }

  // Take just the headline portion of a free-form program field, e.g. "DSCR - 30 Year Fixed" → "DSCR"
  function shortProgram(s) {
    if (!s) return '';
    return s.split(/[-–—·•]/)[0].trim();
  }

  // Build optional metric rows — never show "—" placeholders
  function metricRows(t, items) {
    return items.filter(i => (i.v || '').trim().length > 0);
  }

  function renderJustFundedEditorial(t) {
    const f = STATE.fields;
    const p = STATE.partner;

    // Headline shape: "A $X.XXM investment property, closed in N days." with italic on amount + "N days"
    const loanAmt   = (f.fLoanAmt || '$1,275,000').trim();
    const propType  = (f.fPropType || 'investment property').trim().toLowerCase();
    const closeDays = (f.fCloseDays || '18').trim();
    const dealNo    = (f.fDealNo || '2419').trim();
    const program   = shortProgram(f.fProgram) || 'DSCR';
    const loanType  = f.fLoanType || 'Cash-Out Refinance';
    const location  = f.fLocation || 'Miami Beach, FL';

    const partnerName = partnerNameLine();
    const phone = p.pPhone || '(305) 555-0142';
    const email = p.pEmail || 'scenarios@unitedtrust.com';

    const propCaption = [f.fBeds && `${esc(f.fBeds)} BD`, f.fBaths && `${esc(f.fBaths)} BA`, f.fSqft && `${esc(f.fSqft)} SQFT`].filter(Boolean).join(' · ');
    const photoBlock = STATE.propertyPhoto
      ? `<div style="aspect-ratio:4/3; background-image:url('${STATE.propertyPhoto}'); background-size:cover; background-position:center;"></div>`
      : `<div style="aspect-ratio:4/3; background-color:rgba(0,0,0,0.32); background-image:repeating-linear-gradient(135deg, transparent 0 22px, rgba(95,184,154,0.08) 22px 23px); display:flex; align-items:center; justify-content:center; color:${t.muted}; padding:20px;">
           <div style="text-align:center;">
             <div style="font-family:'Fraunces',serif; font-style:italic; font-size:14px;">[ property image ]</div>
             ${propCaption ? `<div style="font-family:'JetBrains Mono',monospace; font-size:8px; letter-spacing:0.2em; text-transform:uppercase; margin-top:8px; opacity:0.75;">${propCaption}</div>` : ''}
             <div style="font-family:'JetBrains Mono',monospace; font-size:7px; letter-spacing:0.2em; text-transform:uppercase; margin-top:18px; opacity:0.6;">Subject property</div>
           </div>
         </div>`;

    // Deal ledger rows — only filled
    const ledger = metricRows(t, [
      { k: 'Loan Amount',    v: loanAmt },
      { k: 'Property',       v: f.fPropType },
      { k: 'Location',       v: f.fLocation },
      { k: 'Program',        v: f.fProgram ? `${program} · ${f.fTerm || ''}`.trim().replace(/·\s*$/, '') : '' },
      { k: 'Property Value', v: f.fPropVal },
      { k: 'LTV',            v: f.fLTV },
      { k: 'DSCR',           v: f.fDSCR },
      { k: 'FICO',           v: f.fFICO },
      { k: 'Rate',           v: f.fRate },
      { k: 'Days to Close',  v: f.fCloseDays },
    ]);

    canvas.innerHTML = `
      <div style="background:${t.bg}; color:${t.ink}; min-height:780px; display:flex; flex-direction:column; font-family:'Inter',sans-serif; position:relative;">
        <!-- atmospheric grid -->
        <div style="position:absolute; inset:0; pointer-events:none; opacity:0.18; background-image: linear-gradient(to right, rgba(201,169,97,0.18) 1px, transparent 1px), linear-gradient(to bottom, rgba(201,169,97,0.18) 1px, transparent 1px); background-size:48px 48px; mask-image:radial-gradient(ellipse 80% 60% at 50% 30%, black 30%, transparent 90%); -webkit-mask-image:radial-gradient(ellipse 80% 60% at 50% 30%, black 30%, transparent 90%);"></div>

        <!-- Top bar — logo only -->
        <header style="position:relative; padding:22px 36px; border-bottom:1px solid ${t.ruleStrong};">
          <div style="font-family:'Fraunces',serif; font-size:24px; font-weight:500; letter-spacing:-0.02em; color:${t.ink};">
            United Trust <span style="font-style:italic; font-weight:300; color:${t.accent};">Mortgage</span>
          </div>
        </header>

        <!-- Body -->
        <div style="position:relative; padding:32px 28px 24px; flex:1; display:flex; flex-direction:column; gap:22px;">
          <!-- Eyebrow -->
          <div style="display:inline-flex; align-items:center; gap:10px; font-family:'JetBrains Mono',monospace; font-size:9.5px; letter-spacing:0.22em; text-transform:uppercase; color:${t.accent}; padding-bottom:10px; border-bottom:1px solid ${t.ruleStrong}; align-self:flex-start;">
            <span style="display:inline-block; width:6px; height:6px; background:${t.accent};"></span>
            Just Funded
          </div>

          <!-- Editorial headline: italic accents on amount + "N days" -->
          <div style="font-family:'Fraunces',serif; font-size:50px; font-weight:400; letter-spacing:-0.035em; line-height:0.96; color:${t.ink}; max-width:560px;">
            A <span style="font-style:italic; font-weight:300; color:${t.accent};">${esc(loanAmt)}</span><br/>
            ${esc(propType)}, closed in
            <span style="font-style:italic; font-weight:300; color:${t.accent};">${esc(closeDays)} days</span>.
          </div>

          <!-- Lede -->
          <p style="font-size:11.5px; line-height:1.7; color:${t.muted}; max-width:560px; margin:0;">
            ${esc(f.fNarrative || `A repeat investor needed cash-out to acquire a fourth ${location.split(',')[0]} rental. Two banks declined on documentation. We underwrote on rent — DSCR ${f.fDSCR || '1.42×'} — and closed in under three weeks.`)}
          </p>

          <!-- Two-col: image + ledger -->
          <div style="display:grid; grid-template-columns:1fr 1.1fr; gap:18px; align-items:start; padding-top:8px;">
            ${photoBlock}
            <div style="border:1px solid ${t.ruleStrong}; padding:18px 18px 14px; background:rgba(0,0,0,0.16);">
              <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
                <span style="font-family:'JetBrains Mono',monospace; font-size:8.5px; letter-spacing:0.22em; text-transform:uppercase; color:${t.muted};">Deal Ledger</span>
                <span style="display:inline-flex; align-items:center; gap:6px; font-family:'JetBrains Mono',monospace; font-size:8.5px; letter-spacing:0.18em; text-transform:uppercase; color:${t.emerald ? '#5fb89a' : t.accent};">
                  <span style="display:inline-block; width:7px; height:7px; border-radius:50%; background:#5fb89a;"></span>Funded
                </span>
              </div>
              ${ledger.map((r, i) => `
                <div style="display:flex; justify-content:space-between; padding:7px 0; ${i > 0 ? `border-top:1px solid ${t.rule};` : ''} font-size:11px;">
                  <span style="color:${t.muted};">${esc(r.k)}</span>
                  <span style="font-family:${(r.k === 'Loan Amount' || r.k === 'Property Value' || r.k === 'DSCR' || r.k === 'Rate') ? "'Fraunces',serif" : "'Inter',sans-serif"}; font-variant-numeric:tabular-nums; color:${(r.k === 'Loan Amount' || r.k === 'DSCR' || r.k === 'Rate') ? t.accent : t.ink}; font-weight:500;">${esc(r.v)}</span>
                </div>
              `).join('')}
            </div>
          </div>
        </div>

        <!-- Footer -->
        <footer style="position:relative; padding:18px 28px; border-top:1px solid ${t.ruleStrong}; display:grid; grid-template-columns:1.5fr 1.2fr 1fr; gap:18px; align-items:start;">
          <div>
            <div style="font-family:'JetBrains Mono',monospace; font-size:8px; letter-spacing:0.22em; text-transform:uppercase; color:${t.muted};">Have a scenario?</div>
            <div style="font-family:'Fraunces',serif; font-size:18px; line-height:1.18; color:${t.ink}; margin-top:6px;">
              We close the deals others <span style="font-style:italic; font-weight:300; color:${t.accent};">can't.</span>
            </div>
          </div>
          <div>
            <div style="font-family:'JetBrains Mono',monospace; font-size:8px; letter-spacing:0.22em; text-transform:uppercase; color:${t.muted};">Submit</div>
            <div style="font-size:11px; margin-top:6px; color:${t.ink}; word-break:break-word;">${esc(email)}</div>
            <div style="font-size:11px; color:${t.ink}; margin-top:2px;">${esc(phone)}</div>
          </div>
          <div style="text-align:right;">
            <div style="font-family:'JetBrains Mono',monospace; font-size:8px; letter-spacing:0.22em; text-transform:uppercase; color:${t.muted};">Apply</div>
            <div style="font-size:11px; margin-top:6px; color:${t.accent}; word-break:break-word;">myunitedtrust.com/apply</div>
            ${STATE.brand === 'co' ? `<div style="font-family:'JetBrains Mono',monospace; font-size:7.5px; letter-spacing:0.2em; text-transform:uppercase; color:${t.muted}; margin-top:6px;">w/ Arin · NMLS #1220456</div>` : (partnerName !== 'Your Name' ? `<div style="font-family:'JetBrains Mono',monospace; font-size:7.5px; letter-spacing:0.2em; text-transform:uppercase; color:${t.muted}; margin-top:6px;">${esc(partnerName)}</div>` : '')}
          </div>
        </footer>

        <!-- NMLS strip -->
        <div style="position:relative; padding:9px 28px; background:${t.stripBg}; display:flex; justify-content:space-between; font-family:'JetBrains Mono',monospace; font-size:7.5px; letter-spacing:0.22em; text-transform:uppercase; color:${t.muted};">
          <span>NMLS #2591548 · Equal Housing Lender</span>
          <span>UTM · ${('0' + (new Date().getMonth()+1)).slice(-2)} · ${String(new Date().getFullYear()).slice(-2)}</span>
        </div>
      </div>`;
  }

  function renderJustFundedDealTape(t) {
    const f = STATE.fields;
    const p = STATE.partner;

    // Split loan amount into prefix (number) + suffix (M/K) for italic emphasis
    const loanRaw = (f.fLoanAmt || '$1,275,000').trim();
    let loanMain = loanRaw, loanItalic = '';
    const mMatch = loanRaw.match(/^(.*?)([MKBmkb])\s*$/);
    if (mMatch) { loanMain = mMatch[1].trim(); loanItalic = mMatch[2].toUpperCase(); }

    const isLight = true;
    const ruleColor = t.rule;

    const propCaption = [f.fBeds && `${esc(f.fBeds)} BD`, f.fBaths && `${esc(f.fBaths)} BA`, f.fSqft && `${esc(f.fSqft)} SQFT`].filter(Boolean).join(' · ');
    const photoBlock = STATE.propertyPhoto
      ? `<div style="aspect-ratio:4/3; background-image:url('${STATE.propertyPhoto}'); background-size:cover; background-position:center;"></div>`
      : `<div style="aspect-ratio:4/3; background-color:#0B1410; background-image:repeating-linear-gradient(135deg, transparent 0 22px, rgba(244,241,232,0.05) 22px 23px); display:flex; align-items:center; justify-content:center; color:rgba(244,241,232,0.62); padding:20px;">
           <div style="text-align:center;">
             <div style="font-family:'Fraunces',serif; font-style:italic; font-size:16px;">[ property image ]</div>
             ${propCaption ? `<div style="font-family:'JetBrains Mono',monospace; font-size:8px; letter-spacing:0.2em; text-transform:uppercase; margin-top:8px; opacity:0.7;">${propCaption}</div>` : ''}
             <div style="font-family:'JetBrains Mono',monospace; font-size:7px; letter-spacing:0.2em; text-transform:uppercase; margin-top:18px; opacity:0.55;">SUBJECT PROPERTY</div>
           </div>
         </div>`;

    const partnerName = partnerNameLine();
    const phone   = p.pPhone   || '(305) 555-0142';
    const email   = p.pEmail   || 'scenarios@unitedtrust.com';

    const programText  = shortProgram(f.fProgram) || 'DSCR';
    const loanTypeText = f.fLoanType || 'Cash-Out Refinance';

    // Stat row — filter out unfilled metrics (no "—" placeholders)
    const stats = metricRows(t, [
      { k: 'PROGRAM', v: programText },
      { k: 'LTV',     v: f.fLTV },
      { k: 'DSCR',    v: f.fDSCR },
      { k: 'FICO',    v: f.fFICO },
      { k: 'RATE',    v: f.fRate },
      { k: 'TERM',    v: f.fTerm },
    ]);
    // Long values ("12 Mo Bank Statement", "30 Year Fixed") step the type
    // size down instead of clipping mid-word.
    const statFont = (v) => {
      const len = String(v || '').length;
      return len <= 10 ? 18 : len <= 16 ? 16 : len <= 22 ? 14 : 12.5;
    };

    canvas.innerHTML = `
      <div style="background:${t.bg}; color:${t.ink}; min-height:780px; display:flex; flex-direction:column; font-family:'Inter',sans-serif;">

        <!-- Top bar — logo only -->
        <header style="padding:22px 36px; border-bottom:1px solid ${ruleColor};">
          <div style="font-family:'Fraunces',serif; font-size:24px; font-weight:500; letter-spacing:-0.02em; color:${t.ink};">
            United Trust <span style="font-style:italic; font-weight:300; color:${t.accent};">Mortgage</span>
          </div>
        </header>

        <!-- Body -->
        <div style="padding:32px 28px 28px; flex:1; display:flex; flex-direction:column; gap:22px;">

          <!-- Eyebrow -->
          <div style="display:flex; align-items:center; gap:12px; font-family:'JetBrains Mono',monospace; font-size:9.5px; letter-spacing:0.22em; text-transform:uppercase; color:${t.muted};">
            <span style="display:inline-block; width:24px; height:1px; background:${t.ink};"></span>
            Just Funded · Deal No. ${esc(f.fDealNo || '2419')}
          </div>

          <!-- Headline + property -->
          <div style="display:flex; flex-direction:column; gap:6px;">
            <div style="font-family:'Fraunces',serif; font-size:64px; font-weight:500; letter-spacing:-0.04em; line-height:0.92; color:${t.ink};">
              ${esc(loanMain)}${loanItalic ? `<span style="font-style:italic; font-weight:300; color:${t.accent};">${esc(loanItalic)}</span>` : ''}
            </div>
            <div style="font-family:'Fraunces',serif; font-style:italic; font-weight:300; font-size:22px; line-height:1.2; color:${t.ink}; margin-top:8px;">
              ${esc(f.fPropType || 'Investment property')},<br/>${esc(f.fLocation || 'Miami Beach, FL')}.
            </div>
          </div>

          <!-- Mono detail row -->
          <div style="flex-shrink:0; font-family:'JetBrains Mono',monospace; font-size:9.5px; letter-spacing:0.2em; text-transform:uppercase; color:${t.muted};">
            ${esc(programText)} · ${esc(loanTypeText)} · ${esc(f.fCloseDays || '18')} Days to Close
          </div>

          <!-- Stat row — columns size to their content (a long PROGRAM gets the
               room it needs); flex-shrink:0 so a tall flyer can never crush the
               row and slice the values vertically. -->
          <div style="flex-shrink:0; display:grid; grid-template-columns:repeat(${Math.max(stats.length, 1)}, minmax(0, auto)); justify-content:space-between; gap:10px 18px; padding:14px 0; border-top:1px solid ${ruleColor}; border-bottom:1px solid ${ruleColor};">
            ${stats.map(s => `
              <div style="min-width:0;">
                <div style="font-family:'JetBrains Mono',monospace; font-size:8px; letter-spacing:0.2em; text-transform:uppercase; color:${t.muted};">${esc(s.k)}</div>
                <div style="font-family:'Fraunces',serif; font-size:${statFont(s.v)}px; font-weight:500; margin-top:4px; letter-spacing:-0.015em; color:${t.ink}; white-space:nowrap;">${esc(s.v)}</div>
              </div>
            `).join('')}
          </div>

          <!-- Image + narrative -->
          <div style="display:grid; grid-template-columns:1.05fr 1fr; gap:20px; align-items:start;">
            ${photoBlock}
            <div>
              <div style="font-family:'JetBrains Mono',monospace; font-size:9px; letter-spacing:0.22em; text-transform:uppercase; color:${t.muted};">The Deal</div>
              <div style="font-family:'Fraunces',serif; font-size:22px; line-height:1.16; letter-spacing:-0.02em; margin-top:8px; color:${t.ink};">
                Two banks declined on docs.<br/>
                <span style="font-style:italic; font-weight:300; color:${t.accent};">We underwrote on rent.</span>
              </div>
              <div style="font-size:11.5px; line-height:1.6; color:${t.muted}; margin-top:14px;">
                ${esc(f.fNarrative || 'A repeat investor needed cash-out for a fourth Miami-area rental. Two banks declined on documentation. We underwrote on rent — DSCR 1.42× — and closed in under three weeks.')}
              </div>
            </div>
          </div>
        </div>

        <!-- Footer -->
        <footer style="padding:18px 28px; border-top:1px solid ${ruleColor}; display:grid; grid-template-columns:1.5fr 1.2fr 1fr; gap:18px; align-items:start;">
          <div>
            <div style="font-family:'Fraunces',serif; font-size:18px; line-height:1.18; color:${t.ink};">
              Have a scenario?
              <span style="font-style:italic; font-weight:300; color:${t.accent};">Send it.</span>
            </div>
            <div style="font-family:'JetBrains Mono',monospace; font-size:7.5px; letter-spacing:0.22em; text-transform:uppercase; color:${t.muted}; margin-top:8px; line-height:1.7;">
              DSCR · Bank Statement · Asset Depletion · Foreign National
            </div>
          </div>
          <div>
            <div style="font-family:'JetBrains Mono',monospace; font-size:8px; letter-spacing:0.22em; text-transform:uppercase; color:${t.muted};">Submit</div>
            <div style="font-size:11px; margin-top:6px; color:${t.ink}; word-break:break-word;">${esc(email)}</div>
            <div style="font-size:11px; color:${t.ink}; margin-top:2px;">${esc(phone)}</div>
          </div>
          <div style="text-align:right;">
            <div style="font-family:'JetBrains Mono',monospace; font-size:8px; letter-spacing:0.22em; text-transform:uppercase; color:${t.muted};">Apply</div>
            <div style="font-size:11px; margin-top:6px; color:${t.accent}; word-break:break-word;">myunitedtrust.com/apply</div>
            ${STATE.brand === 'co' ? `<div style="font-family:'JetBrains Mono',monospace; font-size:7.5px; letter-spacing:0.2em; text-transform:uppercase; color:${t.muted}; margin-top:6px;">w/ Arin · NMLS #1220456</div>` : (partnerName !== 'Your Name' ? `<div style="font-family:'JetBrains Mono',monospace; font-size:7.5px; letter-spacing:0.2em; text-transform:uppercase; color:${t.muted}; margin-top:6px;">${esc(partnerName)}</div>` : '')}
          </div>
        </footer>

        <!-- NMLS strip -->
        <div style="padding:10px 28px; background:${isLight ? 'rgba(11,30,63,0.05)' : 'rgba(0,0,0,0.30)'}; display:flex; justify-content:space-between; font-family:'JetBrains Mono',monospace; font-size:7.5px; letter-spacing:0.22em; text-transform:uppercase; color:${t.muted};">
          <span>NMLS #2591548 · Equal Housing Lender</span>
          <span>UTM · ${('0' + (new Date().getMonth()+1)).slice(-2)} · ${String(new Date().getFullYear()).slice(-2)}</span>
        </div>
      </div>`;
  }

  function renderFlyer() {
    if (!canvas) return;
    const pal = TEMPLATES_PAL[STATE.template] || TEMPLATES_PAL.editorial;
    const tpl = FLYER_TEMPLATES[STATE.flyer];

    // Just-Funded — dispatch to the right template
    if (STATE.flyer === 'just-funded') {
      return STATE.template === 'editorial'
        ? renderJustFundedEditorial(pal)
        : renderJustFundedDealTape(pal);
    }

    // Other flyer types still use the legacy renderer
    const t = pal;

    const head = (STATE.tagline || '').trim() || tpl.defaultHeadline;
    const f = STATE.fields;
    const p = STATE.partner;

    let body = '';
    const photoBlock = (STATE.propertyPhoto && tpl.photo)
      ? `<div style="aspect-ratio:4/3; background-image:url('${STATE.propertyPhoto}'); background-size:cover; background-position:center; margin:0 -28px 24px;"></div>`
      : (tpl.photo
          ? `<div style="aspect-ratio:4/3; background:rgba(255,255,255,0.06); border:1px dashed ${t.muted}; margin:0 -28px 24px; display:flex; align-items:center; justify-content:center; color:${t.muted}; font-size:11px; letter-spacing:0.16em; text-transform:uppercase;">Property Photo</div>`
          : '');

    if (STATE.flyer === 'open-house') {
      body = photoBlock + `
        <div style="font-family:'JetBrains Mono',monospace; font-size:9px; letter-spacing:0.22em; color:${t.accent}; text-transform:uppercase; margin-bottom:10px;">${esc(f.fDate || 'Date · Time')}</div>
        <div style="font-family:'Fraunces',serif; font-size:24px; line-height:1.1; letter-spacing:-0.02em; margin-bottom:8px;">${esc(f.fAddr || '1234 Sunset Blvd')}</div>
        <div style="font-family:'Fraunces',serif; font-style:italic; font-weight:300; font-size:24px; color:${t.accent}; margin-bottom:18px;">${esc(f.fPrice || '$1,250,000')}</div>
        <div style="display:flex; gap:18px; padding:12px 0; border-top:1px solid ${t.muted}; border-bottom:1px solid ${t.muted}; font-size:11px;">
          <div><span style="color:${t.muted}; font-family:'JetBrains Mono',monospace; font-size:9px; letter-spacing:0.16em; text-transform:uppercase;">Beds</span><div style="font-family:'Fraunces',serif; font-size:18px; margin-top:2px;">${esc(f.fBeds || '—')}</div></div>
          <div><span style="color:${t.muted}; font-family:'JetBrains Mono',monospace; font-size:9px; letter-spacing:0.16em; text-transform:uppercase;">Baths</span><div style="font-family:'Fraunces',serif; font-size:18px; margin-top:2px;">${esc(f.fBaths || '—')}</div></div>
          <div><span style="color:${t.muted}; font-family:'JetBrains Mono',monospace; font-size:9px; letter-spacing:0.16em; text-transform:uppercase;">Sq Ft</span><div style="font-family:'Fraunces',serif; font-size:18px; margin-top:2px;">${esc(f.fSqft || '—')}</div></div>
        </div>`;
    } else if (STATE.flyer === 'loan-programs') {
      const bullets = [f.fBullet1, f.fBullet2, f.fBullet3, f.fBullet4].filter(Boolean);
      body = `
        <div style="font-family:'JetBrains Mono',monospace; font-size:9px; letter-spacing:0.22em; color:${t.accent}; text-transform:uppercase; margin-bottom:10px;">Loan Program</div>
        <div style="font-family:'Fraunces',serif; font-size:30px; line-height:1.05; letter-spacing:-0.025em; margin-bottom:8px;">${esc(f.fProgram || 'Program Name')}</div>
        <div style="font-family:'Fraunces',serif; font-style:italic; font-weight:300; font-size:16px; color:${t.accent}; margin-bottom:18px; line-height:1.3;">${esc(f.fHook || 'One-line hook.')}</div>
        <ul style="list-style:none; padding:0; margin:0; font-size:12px; line-height:1.6;">
          ${bullets.map(b => `<li style="padding:6px 0; border-top:1px solid ${t.muted};">— ${esc(b)}</li>`).join('') || '<li style="color:'+t.muted+'">Add bullets to the right.</li>'}
        </ul>`;
    }

    // Co-brand block
    const coBlock = (STATE.brand === 'co') ? `
      <div style="margin-top:14px; padding-top:14px; border-top:1px dashed ${t.muted}; display:flex; gap:10px; align-items:center;">
        <img src="assets/arin-headshot.jpg" alt="" style="width:36px; height:36px; border-radius:50%; object-fit:cover;"/>
        <div style="font-size:10px; line-height:1.35;">
          <div style="font-family:'Fraunces',serif; font-size:13px;">Arin Baghermian</div>
          <div style="color:${t.muted}; font-family:'JetBrains Mono',monospace; font-size:9px; letter-spacing:0.1em;">UTM · NMLS #1220456 · 818.447.7035</div>
        </div>
      </div>` : '';

    canvas.innerHTML = `
      <div style="background:${t.bg}; color:${t.ink}; padding:28px; min-height:520px; display:flex; flex-direction:column;">
        <header style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:22px;">
          <div>
            <div style="font-family:'JetBrains Mono',monospace; font-size:9px; letter-spacing:0.22em; color:${t.accent}; text-transform:uppercase;">${esc(head)}</div>
            <div style="font-family:'Fraunces',serif; font-size:13px; margin-top:6px; letter-spacing:-0.01em;">${esc(p.pCompany || 'Premier Realty')}</div>
          </div>
          <div style="font-family:'JetBrains Mono',monospace; font-size:8px; letter-spacing:0.18em; color:${t.muted}; text-transform:uppercase; text-align:right;">UTM<br/>Mortgage</div>
        </header>

        <div style="flex:1;">
          ${body}
        </div>

        <footer style="margin-top:22px; padding-top:14px; border-top:1px solid ${t.muted}; display:flex; gap:10px; align-items:center;">
          ${STATE.headshot ? `<img src="${STATE.headshot}" alt="" style="width:42px; height:42px; border-radius:50%; object-fit:cover;"/>` : `<div style="width:42px; height:42px; border-radius:50%; background:rgba(255,255,255,0.08); border:1px solid ${t.muted};"></div>`}
          <div style="flex:1; font-size:10px; line-height:1.4;">
            <div style="font-family:'Fraunces',serif; font-size:14px;">${esc(partnerNameLine())}</div>
            <div style="color:${t.muted}; font-family:'JetBrains Mono',monospace; font-size:9px; letter-spacing:0.08em;">${esc(p.pLicense || 'License #')}</div>
            <div style="color:${t.muted}; font-family:'JetBrains Mono',monospace; font-size:9px; letter-spacing:0.08em; margin-top:2px;">${esc(p.pPhone || '—')} · ${esc(p.pEmail || '—')}</div>
          </div>
        </footer>

        ${coBlock}
      </div>`;
  }

  // ── Export PNG / PDF ────────────────────────────────────────
  async function snapshot() {
    if (!canvas) return null;
    if (typeof html2canvas !== 'function') {
      flash('Renderer loading… try again');
      return null;
    }
    // Capture at native 816×1056 ignoring any preview-only CSS transform
    const prevTransform = canvas.style.transform;
    canvas.style.transform = 'none';
    try {
      return await html2canvas(canvas, {
        backgroundColor: null,
        scale: 3,
        useCORS: true,
        allowTaint: true,
        width: 816,
        height: 1056,
        windowWidth: 816,
        windowHeight: 1056,
      });
    } finally {
      canvas.style.transform = prevTransform;
    }
  }

  async function downloadPng() {
    flash('Rendering PNG…');
    const c = await snapshot();
    if (!c) return;
    const a = document.createElement('a');
    a.download = `utm-flyer-${STATE.flyer}.png`;
    a.href = c.toDataURL('image/png');
    document.body.appendChild(a);
    a.click();
    a.remove();
    flash('PNG downloaded');
  }

  async function downloadPdf() {
    flash('Rendering PDF…');
    const c = await snapshot();
    if (!c) return;
    if (!window.jspdf) { flash('PDF library not loaded'); return; }
    const { jsPDF } = window.jspdf;
    // True US Letter, portrait
    const pdf = new jsPDF({ unit: 'pt', format: 'letter', orientation: 'portrait' });
    const pageW = pdf.internal.pageSize.getWidth();   // 612
    const pageH = pdf.internal.pageSize.getHeight();  // 792
    // Fit captured canvas to the letter page while preserving aspect ratio
    const ratio = Math.min(pageW / c.width, pageH / c.height);
    const w = c.width  * ratio;
    const h = c.height * ratio;
    const x = (pageW - w) / 2;
    const y = (pageH - h) / 2;
    pdf.addImage(c.toDataURL('image/png'), 'PNG', x, y, w, h);
    pdf.save(`utm-flyer-${STATE.flyer}.pdf`);
    flash('PDF downloaded');
  }

  ['#dlPngBtn', '#dlPngBtn2'].forEach(sel => {
    const el = $(sel); if (el) el.addEventListener('click', e => { e.preventDefault(); downloadPng(); });
  });
  ['#dlPdfBtn', '#dlPdfBtn2'].forEach(sel => {
    const el = $(sel); if (el) el.addEventListener('click', e => { e.preventDefault(); downloadPdf(); });
  });

  const resetBtn = $('#resetBtn');
  if (resetBtn) {
    resetBtn.addEventListener('click', () => {
      if (!confirm('Reset all flyer fields?')) return;
      ['utm.partners.fields','utm.partners.tagline','utm.partners.propertyPhoto','utm.partners.headshot']
        .forEach(k => { try { localStorage.removeItem(k); } catch (_) {} });
      STATE.fields = {}; STATE.tagline = ''; STATE.propertyPhoto = null; STATE.headshot = null;
      if (tagInput) tagInput.value = '';
      // Restore base UI
      const drop = $('#pHeadshotDrop');
      if (drop) {
        const empty   = drop.querySelector('.upload-drop-empty');
        const preview = drop.querySelector('.upload-preview');
        const input   = drop.querySelector('input[type="file"]');
        if (input)   input.value = '';
        if (empty)   empty.style.display = '';
        if (preview) preview.style.display = 'none';
      }
      renderFields();
      renderFlyer();
      flash('Reset');
    });
  }

  // ── Initial mount ───────────────────────────────────────────
  bindPartnerInfo();
  // Apply restored brand/flyer/theme without re-saving
  brandOpts.forEach(b => {
    const active = b.dataset.brand === STATE.brand;
    b.classList.toggle('active', active);
    b.setAttribute('aria-checked', active ? 'true' : 'false');
  });
  if (cobrandRev) cobrandRev.style.display = STATE.brand === 'co' ? 'block' : 'none';
  if (brandPill)  brandPill.textContent     = STATE.brand === 'co' ? 'Co-brand' : 'Solo';
  flyerBtns.forEach(b => b.classList.toggle('active', b.dataset.flyer === STATE.flyer));
  renderFields();
  restoreHeadshotPreview();
  renderFlyer();
})();
