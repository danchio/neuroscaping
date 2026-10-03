// Hash routing: #/decks, #/deck/<id>[/synergy|/playtest], #/mainframes, #/mainframe/<id>, #/cards[?filters], #/card/<id>, #/life.
export const DECK_TABS = ['cards', 'synergy', 'playtest'];

/** Split "#/cards?fac=Hacker" into the path part and a URLSearchParams. */
export function split(hash = location.hash) {
  const h = hash.replace(/^#\/?/, '');
  const i = h.indexOf('?');
  return { path: i < 0 ? h : h.slice(0, i), query: new URLSearchParams(i < 0 ? '' : h.slice(i + 1)) };
}

export function parse(hash = location.hash) {
  const { path } = split(hash);
  const [name = '', id = '', tab = ''] = path.split('/');
  switch (name) {
    case '': case 'decks': return { name: 'decks' };
    case 'deck': return id ? { name: 'deck', id, tab: DECK_TABS.includes(tab) ? tab : 'cards' } : { name: 'decks' };
    case 'mainframes': return { name: 'mainframes' };
    case 'mainframe': return Number(id) ? { name: 'mainframe', id: Number(id) } : { name: 'mainframes' };
    case 'life': return { name: 'life' };
    case 'cards': return { name: 'cards' };
    case 'card': return Number(id) ? { name: 'card', id: Number(id) } : { name: 'cards' };
    default: return { name: 'decks' };
  }
}
export const href = {
  decks: () => '#/decks',
  deck: (id, tab = 'cards') => (tab === 'cards' ? `#/deck/${id}` : `#/deck/${id}/${tab}`),
  mainframes: () => '#/mainframes',
  mainframe: (id) => `#/mainframe/${id}`,
  life: () => '#/life',
  cards: (query = '') => `#/cards${query ? '?' + query : ''}`,
  card: (id) => `#/card/${id}`,
};
export const go = (h) => { if (location.hash === h) dispatchEvent(new HashChangeEvent('hashchange')); else location.hash = h; };
