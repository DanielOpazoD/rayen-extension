/** Pestaña Atenciones: tarjetas de la ficha (Medicina / Otros) o, sin ficha, la agenda. */
import { isMedicalVisit } from '../../core/patient-report.js';
import { SECTION_LABELS } from '../../core/ficha.js';
import { CONFIG } from '../../core/config.js';
import { esc, stateDot, $ } from '../dom.js';
import { certificadoPath, recetaPdfPath } from '../../io/pdf.js';

const PRINTER = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9V3h12v6"/><rect x="4" y="9" width="16" height="8" rx="2"/><path d="M6 14h12v7H6z"/></svg>';
import { whenLabel } from '../../core/labels.js';
import { segGroup, empty, setTabCount } from './helpers.js';
import { esMiaAtencion } from '../../core/sic-rules.js';

function sectionHTML(id, items, v) {
  // Cada receta lleva su impresora: el PDF de Eloisa, para imprimirlo desde la atención.
  const prest = v.prestadores?.[0]?.id ?? CONFIG.officerId;
  const printer = it => id === 'recetas' && it.raw?.Id
    ? `<button class="btn-mini pp-print" data-pdf="${esc(recetaPdfPath(v.id, it.raw.Id, prest))}" data-tip="Imprimir la receta (PDF de Eloisa)" aria-label="Imprimir receta">${PRINTER}</button>` : '';
  return `<div class="pp-sec"><span class="pp-sec-l">${esc(SECTION_LABELS[id] ?? id)}</span>` +
    items.map(it => `<div class="pp-item ${it.suspendido ? 'susp' : ''}"><span>${esc(it.label)}</span>${it.details.length ? `<small>${esc(it.details.join(' · '))}</small>` : ''}${printer(it)}</div>`).join('') +
    `</div>`;
}

function fichaVisitHTML(v, agendaByAtencion) {
  const mine = esMiaAtencion(v);
  const cita = agendaByAtencion.get(v.id);
  const who  = v.prestadores.map(p => p.id === CONFIG.officerId ? 'Tú' : `${p.nombre}${p.instrumento ? ` (${p.instrumento})` : ''}`).join(', ');
  const secs = Object.entries(v.sections);
  const hasBody = v.anamnesis.motivo || v.anamnesis.historia || v.extras?.length || secs.length || v.actividades.length || v.adjuntos.length;
  return `
    <div class="pp-visit ${mine ? 'mine' : ''} ${hasBody ? 'has-body' : ''}">
      <div class="pp-vhead" ${hasBody ? 'role="button" tabindex="0" aria-expanded="false"' : ''}>
        <strong class="pp-date">${v.fechaAtencion}</strong>
        <span class="pp-hora">${esc(whenLabel(v))}</span>
        ${v.fechaRegistro ? `<span class="pp-info" role="img" tabindex="0" aria-label="Ficha registrada el ${esc(v.fechaRegistro)}" data-tip="Ficha registrada el ${esc(v.fechaRegistro)}; la fecha mostrada es la de la cita.">i</span>` : ''}
        <span class="pp-tipo">${esc(v.tipoAtencion)}</span>
        ${v.esUrgencia ? `<span class="flag flag-urg" data-tip="Urgencia">U</span>` : ''}
        ${v.esEspontanea ? `<span class="flag flag-esp" data-tip="Espontánea">E</span>` : ''}
        <span class="spacer"></span>
        ${cita ? `<button class="btn-mini" data-pdf="${esc(certificadoPath(cita.id))}" data-tip="Certificado de atención">Cert.</button>` : ''}
        ${hasBody ? `<span class="pp-expand" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M6 9l6 6 6-6"/></svg></span>` : ''}
      </div>
      <div class="pp-who ${mine ? 'me' : ''}">${esc(who)}</div>
      ${(v.diagnosticos ?? []).map(d =>
        `<span class="pp-dx">${esc(d.nombre)}${d.esAuge ? ' <span class="bges">GES</span>' : ''}</span>`
      ).join('')}
      <div class="pp-body">
        ${v.anamnesis.motivo   ? `<div class="pp-sec"><span class="pp-sec-l">Motivo de consulta</span><p>${esc(v.anamnesis.motivo)}</p></div>` : ''}
        ${v.anamnesis.historia ? `<div class="pp-sec"><span class="pp-sec-l">Historia / evolución</span><p>${esc(v.anamnesis.historia)}</p></div>` : ''}
        ${(v.extras ?? []).map(x => `<div class="pp-sec"><span class="pp-sec-l">${esc(x.label)}</span><p>${esc(x.text)}</p></div>`).join('')}
        ${secs.map(([id, items]) => sectionHTML(id, items, v)).join('')}
        ${v.actividades.length ? `<div class="pp-sec"><span class="pp-sec-l">Actividades</span><p>${v.actividades.map(a => esc(a.descripcion || a.codigo)).join(' · ')}</p></div>` : ''}
        ${v.adjuntos.length ? `<div class="pp-sec"><span class="pp-sec-l">Adjuntos</span><p>📎 ${v.adjuntos.map(a => esc(a.nombre)).join(', ')}</p></div>` : ''}
      </div>
    </div>`;
}

function agendaVisitHTML(v) {
  return `
    <div class="pp-visit ${v.origen === 'cita' ? '' : 'mine'}">
      <div class="pp-vhead">
        <strong class="pp-date">${v.fechaAtencion}</strong>
        <span class="pp-hora">${esc(whenLabel(v))}</span>
        <span class="pp-tipo">${esc(v.tipoAtencion)}</span>
        <span class="spacer"></span>
        ${stateDot(v.estado)}
        ${v.origen === 'cita' && v.estado === 'Completado' ? `<button class="btn-mini" data-pdf="${esc(certificadoPath(v.id))}" data-tip="Certificado de atención">Cert.</button>` : ''}
      </div>
      ${v.razon ? `<span class="pp-razon">${esc(v.razon)}</span>` : ''}
      ${(v.diagnosticos ?? []).map(d => `<span class="pp-dx">${esc(d.nombre)}</span>`).join('')}
    </div>`;
}

export function renderAt(cur, atFilter) {
  const { visits, ficha } = cur;
  let html;
  if (ficha?.visits?.length) {
    const agendaByAtencion = new Map(visits.filter(v => v.atencionId && v.origen === 'cita').map(v => [v.atencionId, v]));
    const medicina = ficha.visits.filter(isMedicalVisit);
    const otros = ficha.visits.filter(v => !isMedicalVisit(v));
    const shown = atFilter === 'otros' ? otros : medicina;
    html = segGroup('at', 'Tipo de atención', [['medicina', 'Medicina', medicina.length], ['otros', 'Otros', otros.length]], atFilter) +
      (shown.length ? shown.map(v => fichaVisitHTML(v, agendaByAtencion)).join('')
        : empty(atFilter === 'otros' ? 'Sin atenciones de otros profesionales' : 'Sin atenciones médicas'));
    setTabCount('at', ficha.visits.length);
  } else {
    // Sólo agenda: todas son atenciones propias, es decir, de Medicina. Las
    // pestañas internas se muestran igual para que la vista no cambie de forma.
    html = segGroup('at', 'Tipo de atención', [['medicina', 'Medicina', visits.length], ['otros', 'Otros', 0]], atFilter) +
      (ficha ? `<div class="pp-empty">${ficha.errors?.length ? `Ficha no disponible (${ficha.errors.length} ${ficha.errors.length === 1 ? 'fuente falló' : 'fuentes fallaron'}); se muestra la agenda.` : 'La ficha electrónica no tiene atenciones registradas; se muestra la agenda.'}</div>` : '') +
      (atFilter === 'otros' ? empty('Sin atenciones de otros profesionales')
        : (visits.length ? visits.map(agendaVisitHTML).join('') : empty('Sin atenciones')));
    setTabCount('at', visits.length);
  }
  $('ppPaneAt').innerHTML = html;
}
