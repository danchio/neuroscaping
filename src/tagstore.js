// Your tags: a repo file (data/my_tags.json, read-only here) plus local edits in localStorage layered on top.
import { notify } from './store.js';
import { emptyTags, normalizeTags, mergeLayers, addTag, editTag, removeTag, setCardTag } from './lib/tags.js';

export const TAGS_KEY = 'neuroscape-deck-lab:tags:v1';
export const REPO_TAGS_FILE = 'data/my_tags.json';

const S = { repo: emptyTags(), local: emptyTags(), eff: null };
const recompute = () => { S.eff = mergeLayers(S.repo, S.local); };

/** Repo tags with your edits on top. Each tag has source 'repo' or 'local'. */
export const effective = () => { if (!S.eff) recompute(); return S.eff; };
export const localTags = () => S.local;

export function loadTags() {
  try { S.local = normalizeTags(JSON.parse(localStorage.getItem(TAGS_KEY) || 'null'), { lenient: true }); } catch { S.local = emptyTags(); }
  recompute();
}
/** The optional repo file. A missing file, a bad file or no network is simply ignored. */
export async function loadRepoTags() {
  try {
    const r = await fetch(REPO_TAGS_FILE, { cache: 'no-cache' });
    if (!r.ok) return;
    S.repo = normalizeTags(await r.json());
    recompute(); notify();
  } catch { /* optional file */ }
}

const commit = (local) => {
  S.local = local;
  try { localStorage.setItem(TAGS_KEY, JSON.stringify(local)); } catch { /* storage unavailable: tags last for this visit only */ }
  recompute(); notify();
};

export function createTag(name, color) {
  const hit = effective().tags.find((t) => t.name.toLowerCase() === String(name).trim().toLowerCase());
  if (hit) return hit;
  const { data, tag } = addTag(S.local, name, color);
  if (tag) commit(data);
  return tag;
}
export function patchTag(id, patch) {
  const cur = effective().tags.find((t) => t.id === id);
  if (!cur) return;
  let local = S.local;
  if (!local.tags.some((t) => t.id === id)) local = { ...local, tags: [...local.tags, { id, name: cur.name, ...(cur.color ? { color: cur.color } : {}) }] };
  commit(editTag(local, id, patch));
}
/** Only tags you made can be deleted here; repo tags are removed in data/my_tags.json. */
export function deleteTag(id) {
  const cur = effective().tags.find((t) => t.id === id);
  if (!cur || cur.source === 'repo') return false;
  commit(removeTag(S.local, id));
  return true;
}
export function toggleCardTag(cardId, tagId) {
  const cur = effective().cards[cardId] || [];
  const seeded = cardId in S.local.cards ? S.local : { ...S.local, cards: { ...S.local.cards, [cardId]: cur } };
  // an emptied list must stay as an explicit local override, so it can hide repo tags
  const next = setCardTag(seeded, cardId, tagId, !cur.includes(tagId));
  if (!(cardId in next.cards)) next.cards = { ...next.cards, [cardId]: [] };
  commit(next);
}
export function replaceLocalTags(data) { commit(normalizeTags(data, { lenient: true })); }
