(() => {
  const root = document.documentElement;
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- Theme toggle ---------- */
  const toggle = document.querySelector('.theme-toggle');
  toggle?.addEventListener('click', () => {
    const next = root.dataset.theme === 'light' ? 'dark' : 'light';
    root.dataset.theme = next;
    try { localStorage.setItem('theme', next); } catch (e) {}
  });

  /* ---------- Cursor spotlight ---------- */
  const spot = document.querySelector('.spotlight');
  if (spot && window.matchMedia('(pointer: fine)').matches) {
    window.addEventListener('pointermove', (e) => {
      spot.style.setProperty('--mx', e.clientX + 'px');
      spot.style.setProperty('--my', e.clientY + 'px');
    }, { passive: true });
  }

  /* ---------- Graph background (nodes + edges, a nod to LangGraph) ---------- */
  const canvas = document.getElementById('graph-bg');
  if (canvas) {
    const ctx = canvas.getContext('2d');
    let w, h, dpr, nodes = [];
    const mouse = { x: -9999, y: -9999 };
    const LINK = 140;

    const resize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = canvas.width = innerWidth * dpr;
      h = canvas.height = innerHeight * dpr;
      const count = Math.round(Math.min(70, (innerWidth * innerHeight) / 22000));
      nodes = Array.from({ length: count }, () => ({
        x: Math.random() * w, y: Math.random() * h,
        vx: (Math.random() - .5) * .18 * dpr, vy: (Math.random() - .5) * .18 * dpr,
      }));
    };
    const rgb = () => getComputedStyle(root).getPropertyValue('--node').trim() || '61, 220, 151';

    const draw = () => {
      const c = rgb();
      ctx.clearRect(0, 0, w, h);
      const link = LINK * dpr;
      for (const n of nodes) {
        if (!reduceMotion) {
          n.x += n.vx; n.y += n.vy;
          if (n.x < 0 || n.x > w) n.vx *= -1;
          if (n.y < 0 || n.y > h) n.vy *= -1;
        }
      }
      for (let i = 0; i < nodes.length; i++) {
        const a = nodes[i];
        for (let j = i + 1; j < nodes.length; j++) {
          const b = nodes[j];
          const d = Math.hypot(a.x - b.x, a.y - b.y);
          if (d < link) {
            ctx.strokeStyle = `rgba(${c}, ${0.10 * (1 - d / link)})`;
            ctx.lineWidth = dpr;
            ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
          }
        }
        const md = Math.hypot(a.x - mouse.x * dpr, a.y - mouse.y * dpr);
        const glow = md < 180 * dpr ? 1 - md / (180 * dpr) : 0;
        ctx.fillStyle = `rgba(${c}, ${0.18 + glow * 0.6})`;
        ctx.beginPath(); ctx.arc(a.x, a.y, (1.6 + glow * 1.8) * dpr, 0, Math.PI * 2); ctx.fill();
      }
      if (!reduceMotion && !document.hidden) requestAnimationFrame(draw);
    };

    resize();
    addEventListener('resize', () => { resize(); if (reduceMotion) draw(); });
    addEventListener('pointermove', (e) => { mouse.x = e.clientX; mouse.y = e.clientY; }, { passive: true });
    document.addEventListener('visibilitychange', () => { if (!document.hidden && !reduceMotion) requestAnimationFrame(draw); });
    draw();
  }

  /* ---------- Reveal on scroll ---------- */
  const reveals = document.querySelectorAll('.reveal');
  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) if (e.isIntersecting) { e.target.classList.add('is-visible'); io.unobserve(e.target); }
    }, { rootMargin: '0px 0px -8% 0px' });
    reveals.forEach((el) => io.observe(el));
  } else {
    reveals.forEach((el) => el.classList.add('is-visible'));
  }

  /* ---------- Active section in nav ---------- */
  const navLinks = document.querySelectorAll('[data-nav]');
  if (navLinks.length && 'IntersectionObserver' in window) {
    const byId = Object.fromEntries([...navLinks].map((a) => [a.dataset.nav, a]));
    const so = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (e.isIntersecting) {
          navLinks.forEach((a) => a.classList.remove('active'));
          byId[e.target.id]?.classList.add('active');
        }
      }
    }, { rootMargin: '-40% 0px -55% 0px' });
    Object.keys(byId).forEach((id) => { const s = document.getElementById(id); if (s) so.observe(s); });
  }

  /* ---------- Project filters ---------- */
  const chips = document.querySelectorAll('.chip[data-filter]');
  const cards = document.querySelectorAll('.project[data-tags]');
  chips.forEach((chip) => chip.addEventListener('click', () => {
    const f = chip.dataset.filter;
    chips.forEach((c) => { c.classList.toggle('is-active', c === chip); c.setAttribute('aria-pressed', c === chip); });
    cards.forEach((card) => {
      const show = f === '*' || card.dataset.tags.split('|').includes(f);
      card.classList.toggle('is-hidden', !show);
      if (show) card.classList.add('is-visible');
    });
  }));

  /* ---------- Contact form (Web3Forms, no backend) ---------- */
  const form = document.getElementById('contact-form');
  if (form) {
    const status = document.getElementById('cf-status');
    const topic = document.getElementById('cf-topic');
    const say = (msg, kind = '') => { status.textContent = msg; status.className = `form-status ${kind}`; };

    // "Let's talk" on a service card pre-selects that service.
    document.querySelectorAll('[data-topic]').forEach((a) => a.addEventListener('click', () => {
      topic.value = a.dataset.topic;
      setTimeout(() => document.getElementById('cf-name').focus({ preventScroll: true }), 500);
    }));

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const data = Object.fromEntries(new FormData(form));
      if (!data.name.trim() || !data.message.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) {
        return say('Please fill in your name, a valid email and a message.', 'error');
      }
      const subject = `Portfolio: ${data.topic} — ${data.name.trim()}`;

      if (!form.dataset.key) { // no access key configured: fall back to the visitor's email app
        location.href = `mailto:${form.dataset.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(`${data.message}\n\n${data.name} <${data.email}>`)}`;
        return;
      }

      const btn = form.querySelector('[type=submit]');
      btn.disabled = true;
      say('Sending…');
      try {
        // Send as plain form data: a JSON body triggers a CORS preflight that Web3Forms rejects.
        const body = new FormData();
        Object.entries({
          access_key: form.dataset.key, subject, from_name: 'Portfolio contact form',
          name: data.name.trim(), email: data.email.trim(), topic: data.topic, message: data.message.trim(),
        }).forEach(([k, v]) => body.append(k, v));
        if (data.botcheck) body.append('botcheck', 'on');
        const res = await fetch('https://api.web3forms.com/submit', { method: 'POST', body });
        const out = await res.json().catch(() => ({}));
        if (!res.ok || !out.success) throw new Error(out.message || res.status);
        form.reset();
        say('Thanks! Your message is on its way — I\'ll reply by email.', 'ok');
      } catch (err) {
        say(`Couldn't send right now. Please email ${form.dataset.email} instead.`, 'error');
      } finally {
        btn.disabled = false;
      }
    });
  }

  /* ---------- Copy email ---------- */
  document.querySelectorAll('[data-copy]').forEach((btn) => btn.addEventListener('click', async () => {
    const label = btn.textContent;
    try { await navigator.clipboard.writeText(btn.dataset.copy); btn.textContent = 'Copied ✓'; }
    catch (e) { btn.textContent = btn.dataset.copy; }
    setTimeout(() => { btn.textContent = label; }, 1800);
  }));

  /* ---------- Wrap tables in case studies for horizontal scroll on mobile ---------- */
  document.querySelectorAll('.prose table').forEach((t) => {
    const wrap = document.createElement('div');
    wrap.className = 'table-wrap';
    t.parentNode.insertBefore(wrap, t);
    wrap.appendChild(t);
  });
})();
