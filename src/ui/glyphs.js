// Faction glyphs, drawn by hand on a 24px grid. Stroke only, so they inherit colour.
const P = {
  Hacker: '<path d="M5 7l5 5-5 5M12 18h7"/>',
  Cybernetic: '<path d="M12 3l7.8 4.5v9L12 21l-7.8-4.5v-9z"/><circle cx="12" cy="12" r="2.6"/>',
  Corpo: '<path d="M3 10l9-6 9 6zM6 10v9M10 10v9M14 10v9M18 10v9M3 20h18"/>',
  Dustrunner: '<path d="M2 19l7-11 4 6 3-4 6 9z"/>',
  Mystic: '<path d="M15 4a8 8 0 1 0 5 12 7 7 0 0 1-5-12z"/><circle cx="19" cy="6" r="1.2"/>',
  Thrasher: '<path d="M13 3L5 13h6l-1 8 8-11h-6z"/>',
  Nanobot: '<circle cx="7.5" cy="8" r="2.2"/><circle cx="16.5" cy="8" r="2.2"/><circle cx="12" cy="16" r="2.6"/><path d="M9.7 8h4.6M8.6 10l2.2 4M15.4 10l-2.2 4"/>',
  Wonderland: '<path d="M4 17h16M7 17l1.2-9h7.6L17 17M7.4 13.5h9.2"/>',
  Null: '<circle cx="12" cy="12" r="8"/><path d="M6.3 17.7L17.7 6.3"/>',
  Neutral: '<rect x="6" y="6" width="12" height="12"/>',
};
export const glyph = (f, size = 16) =>
  `<svg class="glyph" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[f] || P.Neutral}</svg>`;

export const runIcon = '<svg class="runi" viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="square" aria-hidden="true"><path d="M6 21V8h11M13 3.5l4.5 4.5-4.5 4.5"/></svg>';
export const chevrons = '<svg class="chev" viewBox="0 0 18 10" width="18" height="10" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M1 1l4 4-4 4M7 1l4 4-4 4M13 1l4 4-4 4"/></svg>';
export const checkIcon = '<svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="square" aria-hidden="true"><path d="M2.5 8.5l3.5 3.5 7.5-8"/></svg>';
export const plusIcon = '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="square" aria-hidden="true"><path d="M8 2v12M2 8h12"/></svg>';
export const minusIcon = '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="square" aria-hidden="true"><path d="M2 8h12"/></svg>';
export const closeIcon = '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="square" aria-hidden="true"><path d="M3 3l10 10M13 3L3 13"/></svg>';

export const markSvg = `<svg class="mark" viewBox="0 0 32 32" aria-hidden="true"><path d="M8 2h22v22l-6 6H2V8z" fill="#0D131A" stroke="#19E3B1" stroke-width="1.5" stroke-linejoin="round"/><path d="M9 22V10h3.5l7 7.5V10H23v12h-3.5l-7-7.5V22z" fill="#E6EDF3"/><circle cx="25.5" cy="6.5" r="2" fill="#5B7CFF"/></svg>`;
