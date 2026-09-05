import { localDateStr } from './parser.js';

/** Quick periods. Keys are what the chips carry in data-per. */
export const PERIODS = Object.freeze({
  todo:   'Todo',
  hoy:    'Hoy',
  semana: 'Esta semana',
  mes:    'Este mes',
  d30:    '30 días',
  d90:    '90 días',
  anio:   'Este año',
});

function shift(d, days) { const x = new Date(d); x.setDate(x.getDate() + days); return x; }

/**
 * @param {keyof PERIODS} key
 * @param {Date} [hoy]
 * @returns {{ from8: string, to8: string }}  '' means open-ended
 */
export function periodRange(key, hoy = new Date()) {
  const to8 = localDateStr(hoy);
  switch (key) {
    case 'hoy':    return { from8: to8, to8 };
    case 'semana': { const dow = (hoy.getDay() + 6) % 7; return { from8: localDateStr(shift(hoy, -dow)), to8 }; } // lunes
    case 'mes':    return { from8: localDateStr(new Date(hoy.getFullYear(), hoy.getMonth(), 1)), to8 };
    case 'd30':    return { from8: localDateStr(shift(hoy, -29)), to8 };
    case 'd90':    return { from8: localDateStr(shift(hoy, -89)), to8 };
    case 'anio':   return { from8: localDateStr(new Date(hoy.getFullYear(), 0, 1)), to8 };
    default:       return { from8: '', to8: '' };
  }
}

/** "2026-09-03" (input[type=date]) → "20260903"; anything else → '' */
export function isoToDate8(iso = '') {
  const m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? `${m[1]}${m[2]}${m[3]}` : '';
}

/** "20260903" → "2026-09-03" for input[type=date] */
export function date8ToIso(d8 = '') {
  return /^\d{8}$/.test(d8) ? `${d8.slice(0, 4)}-${d8.slice(4, 6)}-${d8.slice(6, 8)}` : '';
}

/** Explicit dates win over the quick period; an empty bound is open. */
export function resolveRange({ periodo = 'todo', desde = '', hasta = '' }, hoy = new Date()) {
  const d = isoToDate8(desde), h = isoToDate8(hasta);
  if (d || h) return { from8: d, to8: h };
  return periodRange(periodo, hoy);
}

/** Una fecha8 cae en [from8, to8]; sin fecha legible no se oculta. */
/**
 * Fecha de inicio del selector de período del laboratorio: `years` años hacia
 * atrás (fracciones en meses); null cuando no hay período elegido.
 */
export function periodoDesde(years, hoy = new Date()) {
  if (!years) return null;
  const desde = new Date(hoy);
  if (years < 1) desde.setMonth(desde.getMonth() - Math.round(years * 12));
  else desde.setFullYear(desde.getFullYear() - years);
  return desde;
}

export function inRange(fecha8, from8, to8) {
  if (!fecha8) return !from8 && !to8;
  return (!from8 || fecha8 >= from8) && (!to8 || fecha8 <= to8);
}
