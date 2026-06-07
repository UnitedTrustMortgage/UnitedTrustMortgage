/* ============================================
   UNITED TRUST MORTGAGE — Interactions
   ============================================ */

(function () {
  'use strict';

  // ── Navigation scroll effect ──
  const nav = document.getElementById('nav');
  const stickyCta = document.getElementById('stickyCta');

  function onScroll() {
    const y = window.scrollY;
    if (nav) nav.classList.toggle('scrolled', y > 60);
    if (stickyCta) stickyCta.classList.toggle('visible', y > 600);
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  // ── Mobile menu ──
  const mobileToggle = document.getElementById('mobileToggle');
  const mobileMenu = document.getElementById('mobileMenu');

  if (mobileToggle && mobileMenu) {
    mobileToggle.addEventListener('click', () => {
      mobileMenu.classList.toggle('active');
    });
    mobileMenu.querySelectorAll('a').forEach(link => {
      link.addEventListener('click', () => mobileMenu.classList.remove('active'));
    });
  }

  // ── Lead modal (only for the in-page Quick Scenario tool) ──
  const leadModal = document.getElementById('leadModal');
  const leadModalClose = document.getElementById('leadModalClose');

  function openModal(e) {
    if (e) e.preventDefault();
    if (!leadModal) return;
    leadModal.classList.add('active');
    document.body.style.overflow = 'hidden';
  }

  function closeModal() {
    if (!leadModal) return;
    leadModal.classList.remove('active');
    document.body.style.overflow = '';
  }

  const scenarioBtn = document.getElementById('scenarioBtn');
  if (scenarioBtn) scenarioBtn.addEventListener('click', openModal);

  if (leadModal) {
    if (leadModalClose) leadModalClose.addEventListener('click', closeModal);
    leadModal.addEventListener('click', (e) => {
      if (e.target === leadModal) closeModal();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closeModal();
    });
  }

  const leadForm = document.getElementById('leadForm');
  if (leadForm) {
    leadForm.addEventListener('submit', (e) => {
      e.preventDefault();
      alert('Thank you! A loan officer will contact you within 2 hours.');
      closeModal();
      leadForm.reset();
    });
  }

  // ── Scroll reveal (Intersection Observer) ──
  const revealEls = document.querySelectorAll('.reveal');

  const revealObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('revealed');
        revealObserver.unobserve(entry.target);
      }
    });
  }, {
    threshold: 0.12,
    rootMargin: '0px 0px -40px 0px'
  });

  revealEls.forEach(el => revealObserver.observe(el));

  // ── Counter animation ──
  const counters = document.querySelectorAll('.counter');
  let countersAnimated = new Set();

  const counterObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting && !countersAnimated.has(entry.target)) {
        countersAnimated.add(entry.target);
        animateCounter(entry.target);
      }
    });
  }, { threshold: 0.5 });

  counters.forEach(c => counterObserver.observe(c));

  function animateCounter(el) {
    const target = parseFloat(el.dataset.target);
    const decimals = parseInt(el.dataset.decimals) || 0;
    const duration = 2000;
    const start = performance.now();

    function update(now) {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      // Ease out quart
      const eased = 1 - Math.pow(1 - progress, 4);
      const current = eased * target;

      if (decimals > 0) {
        el.textContent = current.toFixed(decimals);
      } else {
        el.textContent = Math.floor(current).toLocaleString();
      }

      if (progress < 1) {
        requestAnimationFrame(update);
      } else {
        if (decimals > 0) {
          el.textContent = target.toFixed(decimals);
        } else {
          el.textContent = target.toLocaleString();
        }
      }
    }

    requestAnimationFrame(update);
  }

  // ── Why section progress bars ──
  const barFills = document.querySelectorAll('.why-card-bar-fill');

  const barObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const width = entry.target.dataset.width;
        entry.target.style.width = width + '%';
        barObserver.unobserve(entry.target);
      }
    });
  }, { threshold: 0.5 });

  barFills.forEach(bar => barObserver.observe(bar));

  // ── Smooth scroll for anchor links ──
  document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function (e) {
      const href = this.getAttribute('href');
      if (href === '#') return; // Modal CTAs handled separately
      e.preventDefault();
      const target = document.querySelector(href);
      if (target) {
        const offset = 80;
        const top = target.getBoundingClientRect().top + window.scrollY - offset;
        window.scrollTo({ top, behavior: 'smooth' });
      }
    });
  });

  // ── FAQ accordion ──
  document.querySelectorAll('.faq-q').forEach(btn => {
    btn.addEventListener('click', () => {
      const item = btn.closest('.faq-item');
      if (!item) return;
      const wasOpen = item.classList.contains('open');
      item.classList.toggle('open');
      btn.setAttribute('aria-expanded', wasOpen ? 'false' : 'true');
    });
  });

  // ── Parallax on hero cards (desktop only) ──
  if (window.matchMedia('(min-width: 1025px)').matches) {
    const heroVisual = document.querySelector('.hero-visual');
    if (heroVisual) {
      const cards = heroVisual.querySelectorAll('.hero-card');
      document.addEventListener('mousemove', (e) => {
        const x = (e.clientX / window.innerWidth - 0.5) * 2;
        const y = (e.clientY / window.innerHeight - 0.5) * 2;

        cards.forEach((card, i) => {
          const factor = (i + 1) * 4;
          card.style.transform = `translate(${x * factor}px, ${y * factor}px)`;
        });
      });
    }
  }

  // ── Hero lead-intake form ("See If You Qualify", 2-step) ──
  const qualifyForm = document.getElementById('qualify-form');
  if (qualifyForm) {
    const $ = (id) => document.getElementById(id);

    function submitLead() {
      const submitBtn = $('submit-btn');
      if (submitBtn) {
        submitBtn.textContent = 'Submitting...';
        submitBtn.disabled = true;
        submitBtn.style.background = '#1f5b4a';
      }

      const action = qualifyForm.getAttribute('action') || '';
      if (action.indexOf('YOUR_FORM_ID') !== -1) {
        // Endpoint not yet configured — leads will not be delivered until
        // YOUR_FORM_ID in the form action is replaced with a Formspree form ID.
        console.warn('[lead-form] Formspree endpoint not configured: replace YOUR_FORM_ID in the #qualify-form action with your Formspree form ID.');
      } else {
        fetch(action, {
          method: 'POST',
          headers: { Accept: 'application/json' },
          body: new FormData(qualifyForm)
        }).catch(function () {});
      }

      // Notify the owner by SMS and push the lead to the Benji CRM via the
      // Netlify function (email + submission archive are handled by Formspree
      // above). Fire-and-forget — never blocks the success UX.
      try {
        const leadData = {};
        new FormData(qualifyForm).forEach(function (v, k) { leadData[k] = v; });
        fetch('/.netlify/functions/submit-lead', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(leadData)
        }).catch(function () {});
      } catch (e) {}

      setTimeout(function () {
        if (submitBtn) {
          submitBtn.textContent = '✓ Application Received';
          submitBtn.disabled = true;
        }
        if (!document.getElementById('lead-success')) {
          const panel = document.createElement('div');
          panel.id = 'lead-success';
          panel.setAttribute('role', 'status');
          panel.style.cssText = 'margin-top:18px;padding:18px 20px;background:rgba(31,91,74,0.07);border:1px solid #1f5b4a;border-radius:2px;font-size:14px;line-height:1.6;color:#14211b;';
          panel.innerHTML = '<strong style="display:block;font-size:15px;color:#0f3d31;margin-bottom:6px;">What happens next</strong>' +
            'A licensed loan officer from <strong>United Trust Mortgage</strong> (NMLS #2591548) will reach out within <strong>24 hours</strong> by phone, email, or text.<br><br>' +
            '<span style="color:rgba(11,20,16,0.62);font-size:13px;">📞 Need to reach us first? Call <a href="tel:8184477035" style="color:#1f5b4a;font-weight:600;text-decoration:underline;text-underline-offset:2px;">(818) 447-7035</a>.</span>';
          const anchor = $('submit-btn');
          if (anchor && anchor.parentNode) anchor.parentNode.insertBefore(panel, anchor.nextSibling);
        }
        const card = $('lead-form');
        if (card) card.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 1000);
    }

    // Step 1 → Step 2
    const nextBtn = $('next-btn');
    if (nextBtn) {
      nextBtn.addEventListener('click', function () {
        let valid = true;
        document.querySelectorAll('#step1 select').forEach(function (f) {
          if (!f.value) { f.style.borderColor = '#c0392b'; valid = false; }
          else f.style.borderColor = '';
        });
        if (!valid) return;

        const pt = $('property_type').value;
        if (pt === 'MixedUse' || pt === 'Co-op') {
          alert('Unfortunately, ' + (pt === 'MixedUse' ? 'mixed-use' : 'co-op') + ' properties are not an eligible property type with United Trust Mortgage. Please select a different property type to continue.');
          $('property_type').style.borderColor = '#c0392b';
          return;
        }

        $('step1').style.display = 'none';
        $('step2').style.display = 'block';
        $('dot1').classList.remove('active');
        $('dot1').classList.add('completed');
        $('dot2').classList.add('active');
        $('step-line').classList.add('active');
        $('label1').style.color = '#1f5b4a';
        $('label2').style.color = '#0b1410';
      });
    }

    // Step 2 → submit
    const submitBtn = $('submit-btn');
    if (submitBtn) {
      submitBtn.addEventListener('click', function () {
        let valid = true;
        ['first_name', 'last_name', 'email', 'phone'].forEach(function (id) {
          const field = $(id);
          if (!field.value.trim()) { field.style.borderColor = '#c0392b'; valid = false; }
          else field.style.borderColor = '';
        });
        if (!valid) { alert('Please fill in all fields.'); return; }
        submitLead();
      });
    }

    qualifyForm.addEventListener('submit', function (e) { e.preventDefault(); });
  }

})();
