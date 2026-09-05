/** Portada clínica del panel. */
import { rankProblems, proximoControlSugerido } from '../../core/ficha-rank.js';
import { CONFIG, SIC_RECHAZADA_IDS } from '../../core/config.js';
import { esc, $ } from '../dom.js';
import { isMineVisit, empty, hoy8 } from './helpers.js';

export const OPEN_SIC = new Set(['pendiente', 'enviada']);
const seccion = (titulo, goto, cuerpo) =>
  `<h4>${esc(titulo)}${goto ? ` <button type="button" class="pp-link" data-goto="${goto}" aria-label="Ver todo: ${esc(titulo)}">Ver todo</button>` : ''}</h4>${cuerpo}`;

/**
 * Portada clínica: lo que conviene saber antes de entrar a la consulta, en una
 * pantalla. Problemas activos con peso, tus últimas atenciones, interconsultas
 * abiertas, próximo control sugerido y alertas. El detalle vive en las otras
 * pestañas; las notas, en el diario que queda siempre a la vista bajo ellas.
 */
export function renderResumen(cur) {
  const { visits, sics, ficha } = cur;
  const src = ficha?.visits?.length ? ficha.visits : visits;
  const probs = rankProblems(src, { officerId: CONFIG.officerId }).slice(0, 6);
  const mias = (ficha?.visits?.length ? ficha.visits.filter(isMineVisit) : visits.filter(v => v.atencionId || v.origen !== 'cita')).slice(0, 3);
  // Las rechazadas no están abiertas, pero piden una decisión: van con las abiertas, con su estado a la vista.
  const abiertas = sics.filter(s => OPEN_SIC.has(s.grupo) || SIC_RECHAZADA_IDS.has(s.estadoId));
  const proximo = proximoControlSugerido(src, hoy8());
  // Con la ficha caída (503, sesión vencida) no se afirma nada sobre el registro:
  // sólo se dice lo que se vio en tus atenciones.
  const sinFicha = cur.fichaFailed || (ficha && !ficha.visits?.length && ficha.errors?.length > 0);
  const vacioDx = ficha?.visits?.length ? 'Sin diagnósticos registrados'
    : sinFicha ? 'Ficha no disponible · sólo tus atenciones, sin diagnósticos'
    : ficha ? 'Sin diagnósticos en tus atenciones' : 'Consultando ficha…';

  // Sin chapas ni calificadores: el orden ya lleva el peso; la fecha basta como dato.
  let html = seccion('Problemas activos', 'dx', probs.length
    ? probs.map(d => `<div class="pp-row"><span class="pp-row-t">${esc(d.nombre)}${d.esAuge ? ' <span class="bges">GES</span>' : ''}</span><span class="pp-row-m">${esc(d.ultima)}</span></div>`).join('')
    : empty(vacioDx));
  html += seccion('Tus últimas atenciones', 'at', mias.length
    ? mias.map(v => `<div class="pp-row"><span class="pp-row-t">${esc(v.tipoAtencion || v.razon || 'Atención')}${(v.diagnosticos ?? [])[0] ? ` <em>${esc(v.diagnosticos[0].nombre)}</em>` : ''}</span><span class="pp-row-m">${esc(v.fechaAtencion)}</span></div>`).join('')
    : empty(sinFicha ? 'Ficha no disponible · ninguna atención tuya en la agenda cargada' : 'Todavía no lo has atendido'));
  html += seccion('Interconsultas abiertas o rechazadas', 'ic', abiertas.length
    ? abiertas.map(s => `<div class="pp-row"><span class="pp-row-t">${esc(s.especialidad)}</span><span class="pp-row-m">${esc([s.estado, s.antiguedadDias != null ? `${s.antiguedadDias} d` : ''].filter(Boolean).join(' · '))}</span></div>`).join('')
    : empty('Ninguna abierta ni rechazada'));
  if (proximo) html += seccion('Próximo control sugerido', null, `<div class="pp-row"><span class="pp-row-t">${esc(proximo.fecha)}</span><span class="pp-row-m">indicado el ${esc(proximo.desde)}</span></div>`);
  $('ppPaneRes').innerHTML = html;
}
