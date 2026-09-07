/**
 * Calendario mensual de atenciones para la vista Hoy, sin DOM.
 * Semanas de lunes a domingo; cada celda sabe si pertenece al mes, cuántas
 * atenciones tiene, y si es hoy o el día elegido.
 */
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
/** Iniciales de lunes a domingo para la cabecera del calendario. */
export const DIAS_CORTOS = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];

import { toDate8 } from './dates.js';

/** «septiembre 2026» */
export function monthLabel(year, month) {
  return `${MESES[month]} ${year}`;
}

/** Recuento de registros por día (fecha8) a partir de la lista de atenciones. */
export function countsByDay(records) {
  const out = new Map();
  for (const r of records ?? []) if (r?.fecha8) out.set(r.fecha8, (out.get(r.fecha8) ?? 0) + 1);
  return out;
}

/**
 * @param {number} year
 * @param {number} month  0–11
 * @param {Map<string, number>} counts  fecha8 → atenciones
 * @param {{ today8?: string, selected8?: string, futuras?: Map<string, number> }} [marks]
 *   `futuras`: citas ya agendadas por día, que no son atenciones y se cuentan aparte.
 * @returns {Array<Array<{date8, day, inMonth, count, futuras, isToday, isSelected, weekend}>>} 5 o 6 semanas
 */
export function monthGrid(year, month, counts = new Map(), { today8 = '', selected8 = '', futuras = new Map() } = {}) {
  const first = new Date(year, month, 1);
  const offset = (first.getDay() + 6) % 7; // lunes = 0
  const start = new Date(year, month, 1 - offset);
  const weeks = [];
  const cursor = new Date(start);
  do {
    const week = [];
    for (let i = 0; i < 7; i += 1) {
      const date8 = toDate8(cursor);
      week.push({
        date8, day: cursor.getDate(), inMonth: cursor.getMonth() === month,
        count: counts.get(date8) ?? 0, futuras: futuras.get(date8) ?? 0,
        isToday: date8 === today8, isSelected: date8 === selected8,
        weekend: i >= 5,
      });
      cursor.setDate(cursor.getDate() + 1);
    }
    weeks.push(week);
  } while (cursor.getMonth() === month && cursor.getFullYear() === year);
  return weeks;
}

/** Mes anterior o siguiente: {year, month}. */
export function shiftMonth(year, month, delta) {
  const d = new Date(year, month + delta, 1);
  return { year: d.getFullYear(), month: d.getMonth() };
}
