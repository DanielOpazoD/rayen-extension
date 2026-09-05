/** Pestaña Antecedentes: diagnósticos con peso y antecedentes mórbidos en una lista, alergias y programas. */
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

  // Una sola lista: los diagnósticos de las atenciones (con peso) y los
  // antecedentes mórbidos de la ficha, unidos por nombre. Antes iban en dos
  // listas y el mismo problema aparecía dos veces.
  const norm = t => String(t ?? '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const filas = probs.map(d => ({ ...d, key: norm(d.nombre) }));
  const vistos = new Set(filas.map(f => f.key));
  for (const m of a?.morbidos ?? []) {
    const k = norm(m.label);
    if (!k || vistos.has(k)) continue;
    vistos.add(k);
    filas.push({ nombre: m.label, clasificacion: '', codigo: '', esAuge: false, ultima: m.fecha, key: k, antecedente: true });
  }
  html += h4(ficha?.visits?.length ? 'Antecedentes y diagnósticos (todos los profesionales)' : 'Antecedentes y diagnósticos (mis atenciones)');
  html += filas.length ? filas.map(d => {
    const meta = [d.codigo, d.antecedente ? 'antecedente' : '', d.ultima].filter(Boolean).join(' · ');
    return `<div class="pp-row"><span class="pp-row-t">${esc(d.nombre)}${d.clasificacion && d.clasificacion !== d.nombre ? ` <em>${esc(d.clasificacion)}</em>` : ''}${d.esAuge ? ' <span class="bges">GES</span>' : ''}</span>` +
      `<span class="pp-row-m">${esc(meta)}</span></div>`;
  }).join('') : empty('Sin diagnósticos ni antecedentes registrados');
  if (a?.alergias.length || ficha?.ram.length) html += h4('Alergias / RAM') + [...a.alergias, ...ficha.ram].map(x =>
    `<div class="pp-row"><span class="pp-row-t">${esc(x.label)}</span><span class="pp-row-m">${esc(x.details.join(' · '))}</span></div>`).join('');
  if (ficha?.programas.length) html += h4('Programas de salud') + ficha.programas.map(p =>
    `<div class="pp-row"><span class="pp-row-t">${esc(p.nombre)}</span><span class="pp-row-m">${p.vigente ? 'ingreso' : `estado ${esc(p.estado)}`} · ${esc(p.fecha)}</span></div>`).join('');

  $('ppPaneDx').innerHTML = html;
  setTabCount('dx', filas.length);
}
