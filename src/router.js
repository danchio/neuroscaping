// Hash routing: #/decks, #/deck/<id>, #/mainframes, #/mainframe/<id>, #/cards, #/card/<id>.
export function parse(hash = location.hash) {
  const h = hash.replace(/^#\/?/, '');
  const [name = '', id = ''] = h.split('/');
  switch (name) {
    case '': case 'decks': return { name: 'decks' };
    case 'deck': return id ? { name: 'deck', id } : { name: 'decks' };
    case 'mainframes': return { name: 'mainframes' };
    case 'mainframe': return Number(id) ? { name: 'mainframe', id: Number(id) } : { name: 'mainframes' };
    case 'cards': return { name: 'cards' };
    case 'card': return Number(id) ? { name: 'card', id: Number(id) } : { name: 'cards' };
    default: return { name: 'decks' };
  }
}
export const href = {
  decks: () => '#/decks',
  deck: (id) => `#/deck/${id}`,
  mainframes: () => '#/mainframes',
  mainframe: (id) => `#/mainframe/${id}`,
  cards: () => '#/cards',
  card: (id) => `#/card/${id}`,
};
export const go = (h) => { if (location.hash === h) dispatchEvent(new HashChangeEvent('hashchange')); else location.hash = h; };
