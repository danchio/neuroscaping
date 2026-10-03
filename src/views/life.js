// Life counter (#/life): Mainframe and Bioframe health for 2 to 4 players, built for a phone on the table.
// Keeps the screen awake while it is open (src/ui/wakelock.js). State persists in localStorage.
import { LIFE_KEY, METERS, MIN_PLAYERS, MAX_PLAYERS, newLife, normalizeLife, adjust, rename, setFlip, setPlayers, resetLife, atZero } from '../lib/life.js';
import { getPref, setPref } from '../store.js';
import { $, $$, esc, onAct } from '../ui/dom.js';
import { plusIcon, minusIcon } from '../ui/glyphs.js';
import { wakeLock } from '../ui/wakelock.js';

let cur = null; // the mounted counter, if any

function readSaved() {
  try { return normalizeLife(JSON.parse(localStorage.getItem(LIFE_KEY) || 'null')); } catch { return newLife(2); }
}
function persist(s) { try { localStorage.setItem(LIFE_KEY, JSON.stringify(s)); } catch { /* ignore */ } }

const meterHtml = (i, p, m) => `
  <div class="lm ${m.id}" data-m="${m.id}">
    <span class="lm-l">${m.label}</span>
    <output class="lm-v" data-v="${i}-${m.id}">${p[m.id]}</output>
    <span class="lm-delta" data-delta="${i}-${m.id}" aria-hidden="true"></span>
    <div class="lm-b">
      <button class="lm-btn" data-act="life" data-i="${i}" data-m="${m.id}" data-d="-1" aria-label="${esc(p.name)} ${m.label}, minus 1">${minusIcon}</button>
      <button class="lm-btn" data-act="life" data-i="${i}" data-m="${m.id}" data-d="1" aria-label="${esc(p.name)} ${m.label}, plus 1">${plusIcon}</button>
    </div>
    <div class="lm-b5">
      <button data-act="life" data-i="${i}" data-m="${m.id}" data-d="-5" aria-label="${esc(p.name)} ${m.label}, minus 5">&minus;5</button>
      <button data-act="life" data-i="${i}" data-m="${m.id}" data-d="5" aria-label="${esc(p.name)} ${m.label}, plus 5">+5</button>
    </div>
  </div>`;

const playerHtml = (p, i) => `
  <article class="lp" data-i="${i}">
    <input class="lp-name" type="text" maxlength="16" value="${esc(p.name)}" aria-label="Name for player ${i + 1}" data-i="${i}" autocomplete="off" spellcheck="false">
    <div class="lp-m">${METERS.map((m) => meterHtml(i, p, m)).join('')}</div>
  </article>`;

const AWAKE_TEXT = { on: 'Screen stays on', off: 'Screen may sleep', unsupported: 'Can’t hold screen on' };

export function mountLife(root) {
  const view = { s: readSaved(), awake: getPref('lifeAwake', true), wake: null, status: 'off', resetArmed: false, timers: new Set(), deltas: new Map() };
  cur = view;

  const later = (fn, ms) => { const t = setTimeout(() => { view.timers.delete(t); fn(); }, ms); view.timers.add(t); return t; };

  function paintStatus() {
    const b = $('#life-awake', root);
    if (!b) return;
    b.dataset.state = view.status;
    b.setAttribute('aria-pressed', String(view.awake && view.status !== 'unsupported'));
    $('span', b).textContent = AWAKE_TEXT[view.status === 'unsupported' ? 'unsupported' : view.awake ? (view.status === 'on' ? 'on' : 'off') : 'off'] || '';
    if (!view.awake && view.status !== 'unsupported') $('span', b).textContent = 'Screen may sleep';
    b.title = view.status === 'unsupported' ? 'This browser can’t keep the screen on. Raise Auto-Lock in your phone settings instead.' : 'Keep the screen on while the life counter is open';
  }

  function render() {
    const n = view.s.players.length;
    root.innerHTML = `
      <section class="life" data-n="${n}" data-flip="${view.s.flip}" aria-label="Life counter">
        <div class="life-grid">${view.s.players.map(playerHtml).join('')}</div>
        <div class="life-bar" role="toolbar" aria-label="Life counter options">
          <div class="seg-ctl" role="group" aria-label="Number of players">${Array.from({ length: MAX_PLAYERS - MIN_PLAYERS + 1 }, (_, k) => k + MIN_PLAYERS).map((k) => `<button data-act="life-n" data-val="${k}" aria-pressed="${k === n}">${k} players</button>`).join('')}</div>
          <button class="chip" data-act="life-flip" aria-pressed="${view.s.flip}" title="Turn the top players’ panels around so they read from across the table">Face to face</button>
          <button class="chip life-awake" id="life-awake" data-act="life-awake" aria-pressed="true"><i aria-hidden="true"></i><span></span></button>
          <button class="btn small ${view.resetArmed ? 'danger' : ''}" data-act="life-reset">${view.resetArmed ? 'Tap again to reset' : 'Reset'}</button>
        </div>
      </section>`;
    paintStatus();
    paintZero();
  }

  function paintZero() {
    $$('.lp', root).forEach((el, i) => {
      const z = atZero(view.s.players[i]);
      el.classList.toggle('has-zero', z.length > 0);
      $$('.lm', el).forEach((m) => m.classList.toggle('zero', z.includes(m.dataset.m)));
    });
  }

  function bump(i, meter, d) {
    const key = `${i}-${meter}`;
    const prev = view.deltas.get(key) || { sum: 0, t: 0 };
    clearTimeout(prev.t);
    const sum = prev.sum + d;
    const el = $(`[data-delta="${key}"]`, root);
    if (el) { el.textContent = sum > 0 ? `+${sum}` : sum < 0 ? `−${-sum}` : ''; el.dataset.sign = sum > 0 ? 'up' : 'down'; }
    view.deltas.set(key, { sum, t: later(() => { view.deltas.delete(key); const e = $(`[data-delta="${key}"]`, root); if (e) e.textContent = ''; }, 1600) });
  }

  function change(i, meter, d) {
    const before = view.s.players[i][meter];
    view.s = adjust(view.s, i, meter, d);
    const real = view.s.players[i][meter] - before;
    if (!real) return;
    persist(view.s);
    const out = $(`[data-v="${i}-${meter}"]`, root);
    if (out) out.textContent = view.s.players[i][meter];
    bump(i, meter, real);
    paintZero();
    if (navigator.vibrate) { try { navigator.vibrate(6); } catch { /* ignore */ } }
  }

  view.act = {
    life: (el) => change(Number(el.dataset.i), el.dataset.m, Number(el.dataset.d)),
    'life-n': (el) => { view.s = setPlayers(view.s, Number(el.dataset.val)); persist(view.s); view.resetArmed = false; render(); },
    'life-flip': () => { view.s = setFlip(view.s, !view.s.flip); persist(view.s); render(); },
    'life-awake': () => {
      if (view.status === 'unsupported') return;
      view.awake = !view.awake; setPref('lifeAwake', view.awake); view.wake.set(view.awake); paintStatus();
    },
    'life-reset': () => {
      if (!view.resetArmed) { view.resetArmed = true; render(); later(() => { if (view.resetArmed) { view.resetArmed = false; if (cur === view) render(); } }, 3000); return; }
      view.resetArmed = false; view.s = resetLife(view.s); persist(view.s); render();
    },
  };
  root.addEventListener('change', (e) => {
    const inp = e.target.closest('.lp-name');
    if (!inp) return;
    view.s = rename(view.s, Number(inp.dataset.i), inp.value);
    inp.value = view.s.players[Number(inp.dataset.i)].name;
    persist(view.s);
  });
  // Enter closes the keyboard on the name field.
  root.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.matches('.lp-name')) e.target.blur(); });

  view.wake = wakeLock((st) => { view.status = st; paintStatus(); });
  render();
  view.wake.set(view.awake);

  return {
    refresh() {},
    destroy() { view.wake.destroy(); view.timers.forEach(clearTimeout); view.timers.clear(); if (cur === view) cur = null; },
  };
}

for (const name of ['life', 'life-n', 'life-flip', 'life-awake', 'life-reset']) onAct(name, (el, e) => cur && cur.act[name](el, e));
