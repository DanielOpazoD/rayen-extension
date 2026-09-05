/**
 * Etiquetas puras de la tabla y del panel: día de la semana con hora, letra del
 * sexo, rol del oficial en una interconsulta y «tipo · razón» de una atención.
 * Sin DOM: la tabla, Pacientes, Hoy y la historia imprimible las comparten.
 */
import { CONFIG } from './config.js';
import { fromDate8 } from './dates.js';

const DOW_LONG = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

/** "Martes · 09:30" from fecha8 + hora */
export function whenLabel(p) {
  const d = fromDate8(p.fecha8 ?? '');
  const dow = d ? DOW_LONG[d.getDay()] : '';
  return [dow, p.hora].filter(Boolean).join(' · ');
}

/** "Mujer" → "M", "Hombre" → "H" */
export function sexLetter(s = '') {
  if (/^m/i.test(s)) return 'M';
  if (/^h/i.test(s)) return 'H';
  return s ? s[0].toUpperCase() : '';
}

/**
 * The officer's role in a SIC:
 *   out   – he wrote it (registrador)           → "Emití"
 *   in    – he is the executor / it generated a cita in his agenda → "Recibí"
 *   other – another professional's SIC on the same patient → "Otra"
 */
export function sicRole(s, isOrigin = false) {
  if (s.registrador.id === CONFIG.officerId) return 'out';
  if (s.ejecutor.id === CONFIG.officerId || isOrigin) return 'in';
  return 'other';
}
/** Texto del rol para la persona: un único mapa (antes había tres copias). */
export const ROLE_LABEL = Object.freeze({ out: 'Emití', in: 'Recibí', other: 'Otra' });

/** «Consulta Médica · Morbilidad»; si la razón ya está dentro del tipo («Control Crónico» / «Control»), sólo el tipo. */
export function atencionLabel(p) {
  const tipo = String(p.tipoAtencion || '').trim(), razon = String(p.razon || '').trim();
  if (!tipo) return razon;
  if (!razon || tipo.toLowerCase().includes(razon.toLowerCase())) return tipo;
  return `${tipo} · ${razon}`;
}
