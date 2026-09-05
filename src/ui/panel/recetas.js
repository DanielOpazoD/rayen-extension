/** Pestaña Recetas: activas o vencidas por la duración escrita y la fecha de la atención. */
import { prescripcionEstado } from '../../core/ficha-rank.js';
import { CONFIG } from '../../core/config.js';
import { esc, $ } from '../dom.js';
import { recetaPdfPath } from '../../io/pdf.js';
import { segGroup, h4, empty, setTabCount } from './helpers.js';

export function renderRx(cur, rxFilter) {
  const { ficha } = cur;
  if (!ficha) { $('ppPaneRx').innerHTML = empty(cur.fichaFailed ? 'La ficha clínica no está disponible' : 'Consultando ficha…'); return; }
  // Activas o vencidas por la duración escrita en la receta y la fecha de la atención.
  const estadoDe = (texto, v, suspendido) => prescripcionEstado(texto, v.fecha8, { suspendido });
  const conRx = ficha.visits.filter(v => v.sections.prescripciones || v.sections.recetas || v.sections.prescExtra);
  const clasificar = v => {
    const items = [...(v.sections.recetas ?? []).map(r => ({ kind: 'receta', r })), ...[...(v.sections.prescripciones ?? []), ...(v.sections.prescExtra ?? [])].map(p => ({ kind: 'presc', p }))];
    return items.map(it => ({ ...it, estado: it.kind === 'receta' ? estadoDe(it.r.details.join(' '), v, false) : estadoDe(`${it.p.label} ${it.p.details.join(' ')}`, v, it.p.suspendido) }));
  };
  const porVisita = conRx.map(v => ({ v, items: clasificar(v) }));
  const cuenta = estado => porVisita.reduce((n, { items }) => n + items.filter(i => (estado === 'activas' ? i.estado === 'activa' : i.estado !== 'activa')).length, 0);
  let html = segGroup('rx', 'Recetas', [['activas', 'Activas', cuenta('activas')], ['vencidas', 'Vencidas', cuenta('vencidas')]], rxFilter);
  // «Fármacos en uso» (RecuperarAntecedentes) repetía lo que ya dicen las recetas por atención.

  let total = 0;
  const visibles = porVisita.map(({ v, items }) => ({ v, items: items.filter(i => (rxFilter === 'activas' ? i.estado === 'activa' : i.estado !== 'activa')) })).filter(x => x.items.length);
  for (const { items } of porVisita) total += items.filter(i => i.kind === 'receta').length;
  if (visibles.length) {
    html += h4('Recetas por atención');
    for (const { v, items } of visibles) {
      const prest = v.prestadores[0]?.id ?? CONFIG.officerId;
      const who = v.prestadores.map(p => p.id === CONFIG.officerId ? 'Tú' : p.nombre).join(', ');
      html += `<div class="pp-rx"><div class="pp-rx-h"><strong>${esc(v.fechaAtencion)}</strong><span class="muted">${esc(who)}</span></div>`;
      for (const it of items) {
        if (it.kind === 'receta') {
          html += `<div class="pp-rx-r"><span>${esc(it.r.label)}</span><small>${esc(it.r.details.join(' · '))}</small>` +
            `<button class="btn-mini" data-pdf="${esc(recetaPdfPath(v.id, it.r.raw.Id, prest))}" data-tip="Receta emitida (PDF)">PDF</button></div>`;
        } else {
          html += `<div class="pp-item ${it.p.suspendido ? 'susp' : ''}"><span>${esc(it.p.label)}</span><small>${esc([...it.p.details, it.estado === 'suspendida' ? '' : it.estado].filter(Boolean).join(' · '))}</small></div>`;
        }
      }
      html += `</div>`;
    }
  } else {
    html += empty(rxFilter === 'activas' ? 'Sin recetas ni prescripciones activas' : 'Sin recetas vencidas');
  }
  $('ppPaneRx').innerHTML = html;
  setTabCount('rx', total);
}
