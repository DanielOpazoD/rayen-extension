/** Pestaña Problemas: diagnósticos con peso, antecedentes, alergias y programas. */
import { rankProblems } from '../../core/ficha-rank.js';
import { CONFIG } from '../../core/config.js';
import { esc, $ } from '../dom.js';
import { h4, empty, setTabCount } from './helpers.js';

export function renderDx(cur) {
  const { visits, ficha } = cur;
  const src = ficha?.visits?.length ? ficha.visits : visits;
  // Con peso, no en orden de aparición: GES y crónicos primero, luego los
  // recurrentes, luego los recientes; el mismo problema en dos redacciones es
  // una sola fila con su recuento.
  const probs = rankProblems(src, { officerId: CONFIG.officerId });
  const a = ficha?.antecedentes;
  let html = '';

  html += h4(ficha?.visits?.length ? 'Problemas (historial completo, todos los profesionales)' : 'Problemas (mis atenciones)');
  html += probs.length ? probs.map(d => {
    const meta = [d.codigo, d.ultima].filter(Boolean).join(' · ');
    return `<div class="pp-row"><span class="pp-row-t">${esc(d.nombre)}${d.clasificacion && d.clasificacion !== d.nombre ? ` <em>${esc(d.clasificacion)}</em>` : ''}${d.esAuge ? ' <span class="bges">GES</span>' : ''}</span>` +
      `<span class="pp-row-m">${esc(meta)}</span></div>`;
  }).join('') : empty('Sin diagnósticos registrados');

  if (a?.morbidos.length) html += h4('Antecedentes mórbidos') + a.morbidos.map(m =>
    `<div class="pp-row"><span class="pp-row-t">${esc(m.label)}</span><span class="pp-row-m">${esc(m.fecha)}</span></div>`).join('');
  if (a?.alergias.length || ficha?.ram.length) html += h4('Alergias / RAM') + [...a.alergias, ...ficha.ram].map(x =>
    `<div class="pp-row"><span class="pp-row-t">${esc(x.label)}</span><span class="pp-row-m">${esc(x.details.join(' · '))}</span></div>`).join('');
  if (ficha?.programas.length) html += h4('Programas de salud') + ficha.programas.map(p =>
    `<div class="pp-row"><span class="pp-row-t">${esc(p.nombre)}</span><span class="pp-row-m">${p.vigente ? 'ingreso' : `estado ${esc(p.estado)}`} · ${esc(p.fecha)}</span></div>`).join('');

  $('ppPaneDx').innerHTML = html;
  setTabCount('dx', probs.length);
}
