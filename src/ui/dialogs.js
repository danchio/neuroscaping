// Modal dialogs: share, import, mainframe picker, delete confirmation.
import { mainframes, titleCase } from '../lib/cards.js';
import { exportText, parseText, encodeShare, decodeShare, aiPrompt } from '../lib/share.js';
import { emptyDeck } from '../lib/deck.js';
import { $, esc, onAct, toast, copyText } from './dom.js';
import { glyph, closeIcon } from './glyphs.js';
import { fvar, factionsStyle } from './card.js';
import { mfFactionOrder } from './parts.js';
import { getDeck, addDeck, removeDeck, pickMainframe, setMainframeExact, activeDeck } from '../store.js';
import { go, href } from '../router.js';

const dlg = () => $('#dlg');
export function openDialog(html, cls = '') {
  const d = dlg();
  d.className = cls;
  d.innerHTML = `<div class="dlg"><button class="dlg-x" data-act="close-dlg" aria-label="Close">${closeIcon}</button>${html}</div>`;
  if (!d.open) d.showModal();
}
export const closeDialog = () => { const d = dlg(); if (d.open) d.close(); };

export function shareDialog(deckId) {
  const d = getDeck(deckId);
  if (!d) return;
  openDialog(`<h2>Share “${esc(d.name)}”</h2>
    <p class="dlg-lead">Your playgroup needs no account and no AI tool. Pick how to send it.</p>
    <div class="sharegrid">
      <button data-act="copy-link" data-deck="${d.id}"><b>Copy link</b><span>Opens this deck in the app for whoever you send it to.</span></button>
      <button data-act="copy-text" data-deck="${d.id}"><b>Copy deck list</b><span>Plain text for chat or a doc. You can import it back.</span></button>
      <button data-act="copy-ai" data-deck="${d.id}"><b>Copy for AI</b><span>Deck, card text and rules, ready to paste into any AI chat.</span></button>
      <button data-act="download" data-deck="${d.id}"><b>Download .txt</b><span>Keep a file copy of the deck list.</span></button>
    </div>`);
}

export function importDialog() {
  openDialog(`<h2>Import a deck</h2>
    <p class="dlg-lead">Paste a deck list or a share link. Lines look like “3 Admin”. Use “Sideboard:” and “Mainframe: Name” lines for those parts.</p>
    <textarea id="import-text" placeholder="Deck: Hacker rush&#10;Mainframe: Firestarter&#10;4 Admin&#10;4 Coder" spellcheck="false" aria-label="Deck list or share link"></textarea>
    <p class="dlg-err" id="import-err" role="alert" hidden></p>
    <div class="row"><button class="btn" data-act="close-dlg">Cancel</button><button class="btn primary" data-act="do-import">Import as new deck</button></div>`);
  $('#import-text').focus();
}

export function mainframePicker(deckId, slot = 'mainframe') {
  const d = getDeck(deckId);
  if (!d) return;
  const cur = d[slot];
  openDialog(`<h2>${slot === 'sideMainframe' ? 'Sideboard mainframe' : 'Choose a mainframe'}</h2>
    <p class="dlg-lead">${slot === 'sideMainframe' ? 'A second mainframe you can swap in between games.' : 'It decides which factions your deck wants. You can change it any time.'}</p>
    <div class="pick-grid">${mainframes.map((m) => {
      const fs = mfFactionOrder(m);
      return `<button class="pick${cur === m.id ? ' on' : ''}" data-act="set-mf" data-deck="${d.id}" data-slot="${slot}" data-id="${m.id}" style="${factionsStyle(fs)}" aria-pressed="${cur === m.id}">
        <span class="pk-g">${fs.map((f) => `<span style="color:${fvar(f)}">${glyph(f, 18)}</span>`).join('')}</span><span class="pk-n">${esc(titleCase(m.name))}</span></button>`;
    }).join('')}</div>
    <div class="row">${cur ? `<button class="btn" data-act="clear-mf" data-deck="${d.id}" data-slot="${slot}">Remove mainframe</button>` : ''}<button class="btn" data-act="close-dlg">Close</button></div>`, 'wide');
}

export function confirmDelete(deckId) {
  const d = getDeck(deckId);
  if (!d) return;
  openDialog(`<h2>Delete “${esc(d.name)}”?</h2><p class="dlg-lead">This removes it from this browser. Share or download it first if you want a copy.</p>
    <div class="row"><button class="btn" data-act="close-dlg">Keep deck</button><button class="btn danger" data-act="do-delete" data-deck="${d.id}">Delete deck</button></div>`);
}

const shareUrl = (d) => `${location.origin === 'null' ? '' : location.origin}${location.pathname}#d=${encodeShare(d)}`;

onAct('close-dlg', closeDialog);
onAct('copy-link', (el) => copyText(shareUrl(getDeck(el.dataset.deck)), 'Link copied'));
onAct('copy-text', (el) => copyText(exportText(getDeck(el.dataset.deck)), 'Deck list copied'));
onAct('copy-ai', (el) => copyText(aiPrompt(getDeck(el.dataset.deck)), 'Copied. Paste it into your AI chat.'));
onAct('download', (el) => {
  const d = getDeck(el.dataset.deck);
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([exportText(d)], { type: 'text/plain' }));
  a.download = `${d.name.replace(/[^a-z0-9]+/gi, '-').toLowerCase() || 'deck'}.txt`;
  a.click(); URL.revokeObjectURL(a.href);
});
onAct('set-mf', (el) => { setMainframeExact(el.dataset.deck, Number(el.dataset.id), el.dataset.slot); closeDialog(); });
onAct('clear-mf', (el) => { const d = getDeck(el.dataset.deck); if (d) pickMainframe(d.id, d[el.dataset.slot], el.dataset.slot); closeDialog(); });
onAct('do-delete', (el) => { removeDeck(el.dataset.deck); closeDialog(); toast('Deck deleted'); go(href.decks()); });
onAct('do-import', () => {
  const text = $('#import-text').value.trim();
  const err = $('#import-err');
  if (!text) { err.textContent = 'Paste a deck list or a share link first.'; err.hidden = false; return; }
  let nd, unknown = [];
  const m = text.match(/#d=([A-Za-z0-9_-]+)/);
  try { if (m) nd = decodeShare(m[1]); else ({ deck: nd, unknown } = parseText(text)); }
  catch { err.textContent = 'That link could not be read. Copy the whole link and try again.'; err.hidden = false; return; }
  if (!m && !Object.keys(nd.main).length && !Object.keys(nd.side).length && !nd.mainframe) {
    err.textContent = 'No cards found. Each line should look like “3 Admin”.'; err.hidden = false; return;
  }
  closeDialog(); addDeck(nd); go(href.deck(nd.id));
  toast(unknown.length ? `Imported. Not recognised: ${unknown.slice(0, 4).join(', ')}${unknown.length > 4 ? ' and more' : ''}` : `Imported “${nd.name}”`);
});
export { emptyDeck, activeDeck };
