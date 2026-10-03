// Tiny DOM helpers: selectors, escaping, toast, clipboard.
export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];
export const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const plural = (n, one, many = one + 's') => `${n} ${n === 1 ? one : many}`;

let toastTimer;
export function toast(msg) {
  const el = $('#toast');
  el.textContent = msg;
  el.classList.add('on');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('on'), 2600);
}

export async function copyText(text, msg) {
  try { await navigator.clipboard.writeText(text); toast(msg); }
  catch {
    const ta = document.createElement('textarea');
    ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); toast(msg); } catch { toast('Copy failed. Select the text and copy it yourself.'); }
    ta.remove();
  }
}

/** Delegated click handling: elements carry data-act="name". */
const handlers = new Map();
export const onAct = (name, fn) => handlers.set(name, fn);
document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-act]');
  if (!el || el.tagName === 'INPUT') return;
  const fn = handlers.get(el.dataset.act);
  if (fn) fn(el, e);
});

/** Run a repaint and put keyboard focus back on the same control (found by data-act, data-id, data-key, data-val). */
export function keepFocus(fn) {
  const a = document.activeElement;
  const sel = a && a.dataset && a.dataset.act ? ['act', 'id', 'key', 'val', 'zone'].filter((k) => a.dataset[k] != null).map((k) => `[data-${k}="${CSS.escape(a.dataset[k])}"]`).join('') : '';
  const scopeId = a && a.closest ? (a.closest('[id]') || {}).id : '';
  fn();
  if (sel) {
    const scope = scopeId ? document.getElementById(scopeId) : document;
    const el = (scope || document).querySelector(sel);
    if (el && el !== document.activeElement && !el.disabled) el.focus({ preventScroll: true });
  }
}
