// Image tiles shared by the card browser and the deck's visual view: the card image, an x N badge, and a stepper bar.
import { titleCase } from '../lib/cards.js';
import { esc } from './dom.js';
import { plusIcon, minusIcon } from './glyphs.js';
import { edgeStyle } from './card.js';
import { cardImageHtml } from './cardimg.js';
import { href } from '../router.js';

/** A -  N  + stepper. `acts` = { inc, dec }; `data` = extra data attributes such as zone. */
export function stepper(c, n, { inc, dec, data = '', atLimit = false, label = 'Copies of' } = {}) {
  const nm = esc(titleCase(c.name));
  return `<span class="stp" role="group" aria-label="${label} ${nm}"><button data-act="${dec}" data-id="${c.id}" ${data} aria-label="Remove one ${nm}" ${n ? '' : 'disabled'}>${minusIcon}</button><b aria-live="polite">${n}</b><button data-act="${inc}" data-id="${c.id}" ${data} aria-label="Add one ${nm}"${atLimit ? ' aria-disabled="true"' : ''}>${plusIcon}</button></span>`;
}

/** The tile. `bar` is the html of the control bar (a stepper, or a link). `n` shows the badge. */
export function imageTile(c, { n = 0, bar = '', cls = '', flag = '' } = {}) {
  return `<div class="itile${cls ? ' ' + cls : ''}" data-id="${c.id}" style="${edgeStyle(c)}">
    <a class="itile-open" href="${href.card(c.id)}" aria-label="${esc(titleCase(c.name))}, open details">${cardImageHtml(c, { size: 'tile' })}</a>
    ${flag ? `<span class="tflag">${esc(flag)}</span>` : ''}
    ${n ? `<span class="qb" title="${n} in the deck"><span class="sr">${n} in deck: </span>&times;${n}</span>` : ''}
    ${bar ? `<div class="itile-bar">${bar}</div>` : ''}
  </div>`;
}
