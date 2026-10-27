(() => {
  const panel = document.getElementById('chat-panel');
  if (!panel) return;
  const fab = document.querySelector('.chat-fab');
  const log = document.getElementById('chat-log');
  const form = document.getElementById('chat-form');
  const input = document.getElementById('chat-input');
  const history = [];
  let busy = false;

  const open = () => {
    panel.hidden = false;
    fab.setAttribute('aria-expanded', 'true');
    fab.classList.add('is-hidden');
    setTimeout(() => input.focus(), 50);
  };
  const close = () => {
    panel.hidden = true;
    fab.setAttribute('aria-expanded', 'false');
    fab.classList.remove('is-hidden');
    fab.focus();
  };
  document.querySelectorAll('[data-chat-open]').forEach((b) => b.addEventListener('click', open));
  panel.querySelector('[data-chat-close]').addEventListener('click', close);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !panel.hidden) close(); });

  // Minimal, safe markdown: escape everything, then allow **bold**, [text](link) and "- " lists.
  const esc = (s) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const inline = (s) => esc(s)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\[([^\]]+)\]\(((?:\/|https:\/\/|mailto:)[^)\s]*)\)/g, (_, t, href) =>
      `<a href="${href}"${href.startsWith('http') ? ' target="_blank" rel="noopener"' : ''}>${t}</a>`)
    .replace(/(^|\s)(\/(?:work\/[\w-]+\/|resume\/|#\w+))/g, '$1<a href="$2">$2</a>');
  const render = (text) => {
    const out = []; let list = null;
    for (const line of text.split('\n')) {
      const m = line.match(/^\s*(?:[-*•]|\d+\.)\s+(.*)/);
      if (m) { (list ||= []).push(`<li>${inline(m[1])}</li>`); continue; }
      if (list) { out.push(`<ul>${list.join('')}</ul>`); list = null; }
      if (line.trim()) out.push(`<p>${inline(line)}</p>`);
    }
    if (list) out.push(`<ul>${list.join('')}</ul>`);
    return out.join('');
  };

  const add = (role, html) => {
    const div = document.createElement('div');
    div.className = `msg ${role}`;
    div.innerHTML = html;
    log.appendChild(div);
    log.scrollTop = log.scrollHeight;
    return div;
  };

  const ask = async (q) => {
    if (busy || !q.trim()) return;
    busy = true;
    log.querySelector('.chat-suggest')?.remove();
    add('user', `<p>${esc(q)}</p>`);
    const pending = add('bot', '<p class="thinking"><span></span><span></span><span></span></p>');
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: q, history: history.slice(-6) }),
      });
      const data = await res.json().catch(() => ({}));
      const answer = data.answer || 'Something went wrong. Please email Wajahat directly.';
      const trace = (data.trace || []).map((t) => `<li>${esc(t)}</li>`).join('');
      pending.innerHTML = render(answer) + (trace ? `<details class="trace"><summary>How I answered</summary><ol>${trace}</ol></details>` : '');
      if (res.ok) history.push({ role: 'user', content: q }, { role: 'assistant', content: answer });
    } catch (e) {
      pending.innerHTML = '<p>The agent is offline right now. Please email Wajahat directly.</p>';
    } finally {
      busy = false;
      log.scrollTop = log.scrollHeight;
    }
  };

  log.addEventListener('click', (e) => { const b = e.target.closest('[data-ask]'); if (b) ask(b.dataset.ask); });
  document.querySelectorAll('[data-ask-open]').forEach((b) => b.addEventListener('click', () => { open(); ask(b.dataset.askOpen); }));
  form.addEventListener('submit', (e) => { e.preventDefault(); const q = input.value; input.value = ''; ask(q); });
})();
