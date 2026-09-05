/** Pestaña Atenciones: tarjetas de la ficha (Medicina / Otros) o, sin ficha, la agenda. */
import { isMedicalVisit } from '../patient-report.js';
import { SECTION_LABELS } from '../../core/ficha.js';
import { CONFIG } from '../../core/config.js';
import { esc, stateDot, $ } from '../dom.js';
import { certificadoPath } from '../../io/pdf.js';
import { whenLabel } from '../table.js';
import { isMineVisit, segGroup, empty, setTabCount } from './helpers.js';

function sectionHTML(id, items) {
  return `<div class="pp-sec"><span class="pp-sec-l">${esc(SECTION_LABELS[id] ?? id)}</span>` +
    items.map(it => `<div class="pp-item ${it.suspendido ? 'susp' : ''}"><span>${esc(it.label)}</span>${it.details.length ? `<small>${esc(it.details.join(' · '))}</small>` : ''}</div>`).join('') +
    `</div>`;
}

function fichaVisitHTML(v, agendaByAtencion) {
  const mine = isMineVisit(v);
  const cita = agendaByAtencion.get(v.id);
  const who  = v.prestadores.map(p => p.id === CONFIG.officerId ? 'Tú' : `${p.nombre}${p.instrumento ? ` (${p.instrumento})` : ''}`).join(', ');
  const secs = Object.entries(v.sections);
  const hasBody = v.anamnesis.motivo || v.anamnesis.historia || v.extras?.length || secs.length || v.actividades.length || v.adjuntos.length;
  return `
    <div class="pp-visit ${mine ? 'mine' : ''} ${hasBody ? 'has-body' : ''}">
      <div class="pp-vhead" ${hasBody ? 'role="button" tabindex="0" aria-expanded="false"' : ''}>
        <strong class="pp-date">${v.fechaAtencion}</strong>
        <span class="pp-hora">${esc(whenLabel(v))}</span>
        <span class="pp-tipo">${esc(v.tipoAtencion)}</span>
        ${v.esUrgencia ? `<span class="flag flag-urg" data-tip="Urgencia">U</span>` : ''}
        ${v.esEspontanea ? `<span class="flag flag-esp" data-tip="Espontánea">E</span>` : ''}
        <span class="spacer"></span>
        ${cita ? `<button class="btn-mini" data-pdf="${esc(certificadoPath(cita.id))}" data-tip="Certificado de atención">Cert.</button>` : ''}
        ${hasBody ? `<span class="caret">▾</span>` : ''}
      </div>
      <div class="pp-who ${mine ? 'me' : ''}">${esc(who)}</div>
      ${(v.diagnosticos ?? []).map(d =>
        `<span class="pp-dx">${esc(d.nombre)}${d.esAuge ? ' <span class="bges">GES</span>' : ''}</span>`
      ).join('')}
      <div class="pp-body">
        ${v.anamnesis.motivo   ? `<div class="pp-sec"><span class="pp-sec-l">Motivo de consulta</span><p>${esc(v.anamnesis.motivo)}</p></div>` : ''}
        ${v.anamnesis.historia ? `<div class="pp-sec"><span class="pp-sec-l">Historia / evolución</span><p>${esc(v.anamnesis.historia)}</p></div>` : ''}
        ${(v.extras ?? []).map(x => `<div class="pp-sec"><span class="pp-sec-l">${esc(x.label)}</span><p>${esc(x.text)}</p></div>`).join('')}
        ${secs.map(([id, items]) => sectionHTML(id, items)).join('')}
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
      (ficha ? `<div class="pp-empty">La ficha electrónica no tiene atenciones registradas; se muestra la agenda.</div>` : '') +
      (atFilter === 'otros' ? empty('Sin atenciones de otros profesionales')
        : (visits.length ? visits.map(agendaVisitHTML).join('') : empty('Sin atenciones')));
    setTabCount('at', visits.length);
  }
  $('ppPaneAt').innerHTML = html;
}
