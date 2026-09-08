/**
 * Bloque de atenciones del HIS de Hanga Roa dentro de la pestaña Atenciones del
 * panel. Se muestra arriba de las atenciones de Eloisa, con un icono que marca
 * su origen, para que la historia del paciente reúna las dos fichas sin
 * confundir de dónde viene cada una.
 */
import { esc } from '../dom.js';
import { HIS_LABEL, ordenarAtenciones } from '../../core/his-parse.js';

// Icono de origen: un edificio (el HIS), distinto de todo lo de Eloisa.
const ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 21h18"/><path d="M5 21V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16"/><path d="M9 7h2M9 11h2M9 15h2M13 7h2M13 11h2M13 15h2"/></svg>';

const badge = `<span class="his-origen" data-tip="${esc(HIS_LABEL)}">${ICON}HIS</span>`;
const envoltura = inner => `<div class="his-block"><div class="his-head">${badge}${inner}</div></div>`;

/**
 * @typedef {object} EstadoHis
 * @property {'cargando'|'sin-sesion'|'error'|'ok'} estado
 * @property {import('../../core/his-parse.js').AtencionHis[]} [atenciones]
 * @property {string} [error]
 */

/**
 * HTML del bloque del HIS para la pestaña Atenciones.
 * @param {EstadoHis|null} his
 * @returns {string} vacío si no hay que mostrar nada (paciente sin HIS configurado)
 */
export function hisBlockHTML(his) {
  if (!his) return '';
  if (his.estado === 'cargando') return envoltura('<small>cargando atenciones del HIS…</small>');
  if (his.estado === 'sin-sesion') return envoltura('<small>Conéctate al HIS en Preferencias para ver estas atenciones.</small>');
  if (his.estado === 'error') return envoltura(`<small class="his-err">HIS no disponible: ${esc(his.error ?? '')}</small>`);

  const rows = ordenarAtenciones(his.atenciones ?? []);
  if (!rows.length) return envoltura('<small>sin atenciones en el HIS</small>');
  const head = `<small>${rows.length} ${rows.length === 1 ? 'atención' : 'atenciones'} en el HIS</small>`;
  const item = a => `<div class="his-visit">
      <strong class="pp-date">${esc(a.fecha)}</strong>
      <span class="his-tipo">${esc(a.tipoAtencion)}</span>
      <span class="his-serv">${esc(a.servicio)}</span>
      <span class="spacer"></span>
      <span class="his-mark his-${a.tipoFicha === 'urgencia' ? 'urg' : 'amb'}">${a.tipoFicha === 'urgencia' ? 'Urgencia' : 'Ambulatorio'}</span>
      <button class="btn-mini his-open" data-his-id="${esc(a.idCuenta)}" data-his-tipo="${esc(a.tipoFicha)}" data-tip="Abrir la ficha imprimible en el HIS">Abrir</button>
    </div>`;
  return `<div class="his-block"><div class="his-head">${badge}${head}</div>${rows.map(item).join('')}</div>`;
}
