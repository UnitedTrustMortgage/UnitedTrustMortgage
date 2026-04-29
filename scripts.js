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

})();
