/** Piezas de HTML y de DOM que comparten las pestañas del panel del paciente. */
import { esc } from '../dom.js';
import { CONFIG } from '../../core/config.js';

/** Una atención es mía si estoy entre sus prestadores. */
export const isMineVisit = v => (v.prestadores ?? []).some(p => p.id === CONFIG.officerId);
export const kv = (label, value) => value ? `<div class="kv"><span class="k">${esc(label)}</span><span class="v">${esc(value)}</span></div>` : '';
export const h4 = t => `<h4>${esc(t)}</h4>`;
const segButton = (scope, key, label, n, active) => `<button type="button" data-scope="${scope}" data-seg="${key}" aria-pressed="${active}">${label} <span class="cnt">${n}</span></button>`;
export const segGroup = (scope, label, items, active) => `<div class="pp-seg" role="group" aria-label="${esc(label)}">${items.map(([k, l, n]) => segButton(scope, k, l, n, active === k)).join('')}</div>`;
export const empty = t => `<div class="pp-empty">${esc(t)}</div>`;

export function setTabCount(id, n) {
  const b = document.querySelector(`.pp-tab[data-pt="${id}"] .cnt`);
  if (b) b.textContent = n ? String(n) : '';
}
