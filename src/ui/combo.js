// Accessible combobox: text input + listbox with arrow-key navigation.
import { esc } from './dom.js';

export function attachCombo({ input, list, items, render, pick, openOnFocus = false }) {
  let shown = [], active = -1;
  const uid = `${list.id || 'combo'}`;
  input.setAttribute('role', 'combobox');
  input.setAttribute('aria-autocomplete', 'list');
  input.setAttribute('aria-expanded', 'false');
  input.setAttribute('aria-controls', list.id);
  list.setAttribute('role', 'listbox');

  const close = () => { list.hidden = true; input.setAttribute('aria-expanded', 'false'); input.removeAttribute('aria-activedescendant'); active = -1; };
  const setActive = (i) => {
    active = i;
    [...list.children].forEach((li, n) => li.setAttribute('aria-selected', String(n === i)));
    if (i >= 0) { input.setAttribute('aria-activedescendant', `${uid}-${i}`); list.children[i]?.scrollIntoView({ block: 'nearest' }); }
    else input.removeAttribute('aria-activedescendant');
  };
  const paint = () => {
    shown = items(input.value);
    if (!shown.length) {
      if (input.value.trim()) { list.innerHTML = `<li class="combo-empty" role="presentation">No card matches “${esc(input.value.trim())}”.</li>`; list.hidden = false; input.setAttribute('aria-expanded', 'true'); }
      else close();
      active = -1; return;
    }
    list.innerHTML = shown.map((it, i) => `<li role="option" id="${uid}-${i}" data-i="${i}" aria-selected="false">${render(it)}</li>`).join('');
    list.hidden = false; input.setAttribute('aria-expanded', 'true');
    setActive(0);
  };
  input.addEventListener('input', paint);
  if (openOnFocus) input.addEventListener('focus', () => { if (input.value.trim()) paint(); });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); if (list.hidden) paint(); else setActive(Math.min(shown.length - 1, active + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(Math.max(0, active - 1)); }
    else if (e.key === 'Enter') {
      if (!list.hidden && shown[active >= 0 ? active : 0]) { e.preventDefault(); pick(shown[active >= 0 ? active : 0], e); }
    } else if (e.key === 'Escape') { if (!list.hidden) { e.preventDefault(); e.stopPropagation(); close(); } else if (input.value) { input.value = ''; } }
  });
  list.addEventListener('mousedown', (e) => {
    const li = e.target.closest('li[data-i]');
    if (!li) return;
    e.preventDefault();
    pick(shown[Number(li.dataset.i)], e);
  });
  input.addEventListener('blur', () => setTimeout(close, 120));
  close();
  return { close, repaint: paint };
}
