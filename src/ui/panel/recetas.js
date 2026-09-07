/**
 * Pestaña Recetas. «Activa» lo dice Rayen (fármacos en uso, con número de
 * receta); la duración escrita queda de respaldo para lo que no aparece ahí.
 * Al desplegar una receta se consulta su detalle: vigencia, despacho y
 * suspensiones por prescripción.
 */
import { identidad } from '../../core/identidad.js';
import { humanError } from '../../core/errors.js';
import { mapaFarmacosEnUso, estadoPrescripcion, etiquetaEstado } from '../../core/receta.js';
import { esc, $ } from '../dom.js';
import { recetaPdfPath } from '../../io/pdf.js';
import { fetchRecetaDetalle } from '../../io/receta.js';
import { getToken } from '../../io/auth.js';
import { segGroup, h4, empty, setTabCount } from './helpers.js';

const PRINTER = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9V3h12v6"/><rect x="4" y="9" width="16" height="8" rx="2"/><path d="M6 14h12v7H6z"/></svg>';
const CHEVRON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>';

/** Recetas y prescripciones por atención, cada una con su estado y quién lo dice. */
function clasificar(ficha, hoy = new Date()) {
  const enUso = mapaFarmacosEnUso(ficha.antecedentes?.farmacos);
  const conRx = ficha.visits.filter(v => v.sections.prescripciones || v.sections.recetas || v.sections.prescExtra);
  return conRx.map(v => {
    const recetas = (v.sections.recetas ?? []).map(r => ({
      kind: 'receta', r,
      ...estadoPrescripcion({ texto: r.details.join(' '), fecha8: v.fecha8, receta: r.raw?.Id }, enUso, { hoy }),
    }));
    const presc = [...(v.sections.prescripciones ?? []), ...(v.sections.prescExtra ?? [])].map(p => ({
      kind: 'presc', p,
      ...estadoPrescripcion({ texto: `${p.label} ${p.details.join(' ')}`, fecha8: v.fecha8, receta: p.raw?.IdReceta, suspendido: p.suspendido }, enUso, { hoy }),
    }));
    return { v, items: [...recetas, ...presc] };
  });
}

const esActiva = it => it.estado === 'activa';

function recetaHTML(it, v) {
  const prest = v.prestadores[0]?.id ?? identidad.officerId;
  const id = it.r.raw?.Id ?? 0;
  const info = [...it.r.details, etiquetaEstado(it)].filter(Boolean).join(' · ');
  return `<div class="pp-rx-r" data-rx="${esc(String(id))}">` +
    `<button type="button" class="pp-expand" data-receta="${esc(String(id))}" aria-expanded="false" aria-label="Ver vigencia y despacho de la receta" data-tip="Vigencia, despacho y suspensiones (consulta a Eloisa)">${CHEVRON}</button>` +
    `<span>${esc(it.r.label)}</span><small>${esc(info)}</small>` +
    `<button class="btn-mini pp-print" data-pdf="${esc(recetaPdfPath(v.id, id, prest))}" data-tip="Imprimir la receta (PDF de Eloisa)" aria-label="Imprimir receta">${PRINTER}</button></div>` +
    `<div class="pp-rx-det" hidden></div>`;
}

function prescHTML(it) {
  const info = [...it.p.details, it.estado === 'suspendida' ? '' : etiquetaEstado(it)].filter(Boolean).join(' · ');
  return `<div class="pp-item ${it.p.suspendido ? 'susp' : ''}"><span>${esc(it.p.label)}</span><small>${esc(info)}</small></div>`;
}

export function renderRx(cur, rxFilter) {
  const { ficha } = cur;
  if (!ficha) { $('ppPaneRx').innerHTML = empty(cur.fichaFailed ? 'La ficha clínica no está disponible' : 'Consultando ficha…'); return; }
  if (!ficha.visits.length && ficha.errors?.length) { $('ppPaneRx').innerHTML = empty('Ficha no disponible: no se pudieron consultar las recetas'); setTabCount('rx', 0); return; }
  const porVisita = clasificar(ficha);
  const cuenta = activas => porVisita.reduce((n, { items }) => n + items.filter(i => esActiva(i) === activas).length, 0);
  let html = segGroup('rx', 'Recetas', [['activas', 'Activas', cuenta(true)], ['vencidas', 'Vencidas', cuenta(false)]], rxFilter);
  const sinAutoridad = !ficha.antecedentes?.farmacos?.length && ficha.errors?.some(e => /^Antecedentes/.test(e));
  if (sinAutoridad) html += `<div class="pp-empty">Sin la lista de fármacos en uso de Rayen: «activa» y «vencida» salen sólo de la duración escrita.</div>`;

  const visibles = porVisita.map(({ v, items }) => ({ v, items: items.filter(i => esActiva(i) === (rxFilter === 'activas')) })).filter(x => x.items.length);
  const total = porVisita.reduce((n, { items }) => n + items.filter(i => i.kind === 'receta').length, 0);
  if (visibles.length) {
    html += h4('Recetas por atención');
    for (const { v, items } of visibles) {
      const who = v.prestadores.map(p => p.id === identidad.officerId ? 'Tú' : p.nombre).join(', ');
      html += `<div class="pp-rx"><div class="pp-rx-h"><strong>${esc(v.fechaAtencion)}</strong><span class="muted">${esc(who)}</span></div>`;
      for (const it of items) html += it.kind === 'receta' ? recetaHTML(it, v) : prescHTML(it);
      html += `</div>`;
    }
  } else {
    html += empty(rxFilter === 'activas' ? 'Sin recetas ni prescripciones activas' : 'Sin recetas vencidas');
  }
  $('ppPaneRx').innerHTML = html;
  setTabCount('rx', total);
}

// ── Detalle de una receta (vigencia, despacho, suspensiones) ──

function detalleHTML(d) {
  const cab = [
    d.vencida ? `vencida el ${d.vigenteHasta}` : d.vigenteHasta ? `vigente hasta ${d.vigenteHasta}` : '',
    d.cerrada ? 'cerrada' : '',
    d.proximoDespacho ? `próx. despacho ${d.proximoDespacho}` : '',
    d.periodicidad ? `cada ${d.periodicidad} días` : '',
    d.externa ? 'externa' : '',
  ].filter(Boolean).join(' · ');
  let html = `<div class="pp-rx-cab ${d.vencida ? 'vencida' : ''}">${esc(cab || 'Sin datos de vigencia')}</div>`;
  if (!d.prescripciones.length) return html + empty('Sin prescripciones en esta receta');
  for (const p of d.prescripciones) {
    const info = [
      p.posologia,
      p.suspendida ? `suspendida${p.fechaSuspension ? ` el ${p.fechaSuspension}` : ''}` : '',
      p.total ? `despachado ${p.despachado} de ${p.total}` : '',
      p.observacion ? `obs.: ${p.observacion}` : '',
      p.controlado ? 'controlado' : '', p.psicotropico ? 'psicotrópico' : '',
    ].filter(Boolean).join(' · ');
    html += `<div class="pp-item ${p.suspendida ? 'susp' : ''}"><span>${esc(p.label)}</span><small>${esc(info)}</small></div>`;
  }
  return html;
}

/** Despliega o pliega el detalle de una receta; lo consulta a Eloisa la primera vez. */
export async function toggleRecetaDetalle(btn) {
  const row = btn.closest('.pp-rx-r');
  const det = row?.nextElementSibling;
  if (!det?.classList.contains('pp-rx-det')) return;
  const abrir = det.hidden;
  det.hidden = !abrir;
  row.classList.toggle('expanded', abrir);
  btn.setAttribute('aria-expanded', String(abrir));
  if (!abrir || det.dataset.loaded) return;
  det.innerHTML = `<div class="muted">Consultando receta…</div>`;
  try {
    const token = await getToken();
    if (!token) { det.innerHTML = empty('Sin sesión en Eloisa'); return; }
    const d = await fetchRecetaDetalle(token, Number(btn.dataset.receta));
    det.innerHTML = d ? detalleHTML(d) : empty('Eloisa no tiene el detalle de esta receta');
    det.dataset.loaded = '1';
  } catch (err) {
    det.innerHTML = empty(`No se pudo consultar la receta: ${humanError(err, 'Eloisa')}`);
  }
}
