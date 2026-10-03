// Modal dialogs: share, import, mainframe picker, delete confirmation.
import { mainframes, titleCase } from '../lib/cards.js';
import { exportText, parseText, encodeShare, decodeShare, aiPrompt } from '../lib/share.js';
import { emptyDeck } from '../lib/deck.js';
import { $, esc, onAct, toast, copyText, keepFocus } from './dom.js';
import { glyph, closeIcon } from './glyphs.js';
import { fvar, factionsStyle } from './card.js';
import { mfFactionOrder } from './parts.js';
import { getDeck, addDeck, removeDeck, pickMainframe, setMainframeExact, activeDeck, state, replaceDecks } from '../store.js';
import { effective, localTags, createTag, patchTag, deleteTag, replaceLocalTags } from '../tagstore.js';
import { TAG_COLORS, usage } from '../lib/tags.js';
import { buildBackup, parseBackup, mergeBackup } from '../lib/backup.js';
import { go, href } from '../router.js';

const dlg = () => $('#dlg');
export function openDialog(html, cls = '') {
  const d = dlg();
  d.className = cls;
  d.innerHTML = `<div class="dlg"><button class="dlg-x" data-act="close-dlg" aria-label="Close">${closeIcon}</button>${html}</div>`;
  if (!d.open) d.showModal();
}
export const closeDialog = () => { const d = dlg(); if (d.open) d.close(); };
document.addEventListener('close', (e) => { if (e.target && e.target.id === 'dlg') delete e.target.dataset.my; }, true);

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

// ---- My data: your tags and the backup file ----
let pending = null; // a parsed backup waiting for "Merge"
const dayStamp = () => new Date().toISOString().slice(0, 10);

function tagRows() {
  const eff = effective(), use = usage(eff);
  if (!eff.tags.length) return '<p class="dim">No tags yet. Add one below, then attach it to cards from their details.</p>';
  return `<ul class="tagman">${eff.tags.map((t) => `<li>
    <input class="tm-name" value="${esc(t.name)}" maxlength="28" data-tag="${esc(t.id)}" aria-label="Tag name">
    <span class="swatches" role="group" aria-label="Colour for ${esc(t.name)}">${TAG_COLORS.map((c) => `<button class="sw${t.color === c.hex ? ' on' : ''}" style="--c:${c.hex}" data-act="tag-color" data-val="${esc(t.id)}" data-color="${c.hex}" aria-pressed="${t.color === c.hex}" aria-label="${c.id}"></button>`).join('')}<button class="sw none${t.color ? '' : ' on'}" data-act="tag-color" data-val="${esc(t.id)}" data-color="" aria-pressed="${!t.color}" aria-label="No colour">&times;</button></span>
    <span class="tm-n">${use.get(t.id) || 0} ${use.get(t.id) === 1 ? 'card' : 'cards'}</span>
    ${t.source === 'repo' ? '<span class="tm-src" title="Defined in data/my_tags.json. Delete it there.">In repo file</span>' : `<button class="linkbtn" data-act="tag-del" data-val="${esc(t.id)}">Delete</button>`}</li>`).join('')}</ul>`;
}

function previewHtml() {
  if (!pending) return '';
  const { summary: m } = mergeBackup({ decks: state.decks, tags: localTags() }, pending);
  const adds = [];
  if (m.decksAdded) adds.push(`${m.decksAdded} ${m.decksAdded === 1 ? 'deck' : 'decks'}${m.decksRenamed ? ` (${m.decksRenamed} share an id with a deck here but have different cards, so they come in as “imported” copies)` : ''}`);
  if (m.tagsAdded) adds.push(`${m.tagsAdded} new ${m.tagsAdded === 1 ? 'tag' : 'tags'}`);
  if (m.cardTagsAdded) adds.push(`${m.cardTagsAdded} card ${m.cardTagsAdded === 1 ? 'tag' : 'tags'}`);
  const same = m.decksSame ? `${m.decksSame} ${m.decksSame === 1 ? 'deck is' : 'decks are'} already here and identical.` : '';
  return `<div class="bk-prev"><p>${adds.length ? `<b>This file would add:</b> ${esc(adds.join('; '))}. ${same}` : `<b>Nothing new in this file.</b> ${same}`}</p><p class="dim small">Decks and tags you already have are never changed or removed.</p>
    <div class="row left"><button class="btn primary" data-act="backup-merge"${adds.length ? '' : ' disabled'}>Merge into this browser</button><button class="btn" data-act="backup-cancel">${adds.length ? 'Cancel' : 'Close'}</button></div></div>`;
}

export function myDataDialog() {
  const inner = `<h2>My data</h2>
    <p class="dlg-lead">Everything here lives in this browser. Tags and decks are not sent anywhere.</p>
    <h3 class="plain">Your tags</h3>
    ${tagRows()}
    <form class="tag-add" id="tag-add" autocomplete="off"><label class="sr" for="tm-new">New tag name</label><input id="tm-new" autofocus type="text" maxlength="28" placeholder="New tag, like “ramp” or “burst”"><button class="btn" type="submit">Add tag</button></form>
    <p class="dim small">Tags from <code>data/my_tags.json</code> (if the repo has one) show up here too. Your edits sit on top of that file.</p>
    <h3 class="plain bk-h">Back up and restore</h3>
    <p class="dlg-lead">One file with all your decks and tags. Importing merges it in and never overwrites a deck you already have.</p>
    <div class="row left"><button class="btn primary" data-act="backup-download">Download backup</button><label class="btn" for="backup-file">Choose a backup to import</label><input id="backup-file" type="file" accept="application/json,.json" class="sr"></div>
    <p class="dlg-err" id="backup-err" role="alert" hidden></p>
    <div id="backup-prev">${previewHtml()}</div>`;
  const d = dlg();
  if (d.open && d.dataset.my) { // repaint in place
    const scroll = d.scrollTop;
    keepFocus(() => { d.querySelector('.dlg').innerHTML = `<button class="dlg-x" data-act="close-dlg" aria-label="Close">${closeIcon}</button>${inner}`; });
    d.scrollTop = scroll;
    return;
  }
  pending = null;
  openDialog(inner, 'wide');
  dlg().dataset.my = '1';
}

export function confirmDelete(deckId) {
  const d = getDeck(deckId);
  if (!d) return;
  openDialog(`<h2>Delete “${esc(d.name)}”?</h2><p class="dlg-lead">This removes it from this browser. Share or download it first if you want a copy.</p>
    <div class="row"><button class="btn" data-act="close-dlg">Keep deck</button><button class="btn danger" data-act="do-delete" data-deck="${d.id}">Delete deck</button></div>`);
}

const shareUrl = (d) => `${location.origin === 'null' ? '' : location.origin}${location.pathname}#d=${encodeShare(d)}`;

onAct('close-dlg', closeDialog);
onAct('open-mydata', () => myDataDialog());
onAct('tag-color', (el) => { patchTag(el.dataset.val, { color: el.dataset.color || null }); myDataDialog(); });
onAct('tag-del', (el) => { if (deleteTag(el.dataset.val)) { toast('Tag deleted'); myDataDialog(); } });
onAct('backup-download', () => {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify(buildBackup(state.decks, localTags()), null, 2)], { type: 'application/json' }));
  a.download = `neuroscaping-backup-${dayStamp()}.json`;
  a.click(); URL.revokeObjectURL(a.href);
  toast('Backup downloaded');
});
onAct('backup-cancel', () => { pending = null; myDataDialog(); });
onAct('backup-merge', () => {
  if (!pending) return;
  const m = mergeBackup({ decks: state.decks, tags: localTags() }, pending);
  pending = null;
  replaceDecks(m.decks); replaceLocalTags(m.tags);
  myDataDialog();
  toast(`Merged: ${m.summary.decksAdded} ${m.summary.decksAdded === 1 ? 'deck' : 'decks'}, ${m.summary.tagsAdded} new ${m.summary.tagsAdded === 1 ? 'tag' : 'tags'}`);
});
document.addEventListener('submit', (e) => {
  if (e.target.id !== 'tag-add') return;
  e.preventDefault();
  const inp = e.target.querySelector('input');
  if (inp.value.trim()) { createTag(inp.value); myDataDialog(); const again = $('#tm-new'); again && again.focus(); }
});
document.addEventListener('change', async (e) => {
  if (e.target.classList && e.target.classList.contains('tm-name')) { patchTag(e.target.dataset.tag, { name: e.target.value }); myDataDialog(); return; }
  if (e.target.id !== 'backup-file') return;
  const f = e.target.files && e.target.files[0];
  const err = $('#backup-err');
  if (!f) return;
  try { pending = parseBackup(await f.text()); err.hidden = true; }
  catch (x) { pending = null; err.textContent = x.message; err.hidden = false; $('#backup-prev').innerHTML = ''; return; }
  $('#backup-prev').innerHTML = previewHtml();
});
onAct('copy-link', (el) => copyText(shareUrl(getDeck(el.dataset.deck)), 'Link copied'));
onAct('copy-text', (el) => copyText(exportText(getDeck(el.dataset.deck)), 'Deck list copied'));
onAct('copy-ai', (el) => copyText(aiPrompt(getDeck(el.dataset.deck), effective()), 'Copied. Paste it into your AI chat.'));
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
