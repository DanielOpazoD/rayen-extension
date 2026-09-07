/**
 * Fechas sin zona horaria: la aplicación piensa en «YYYYMMDD» (fecha8), como
 * Rayen, y sólo pasa por `Date` para sumar, restar o mostrar. Antes había cuatro
 * copias de «Date → YYYYMMDD», ocho de «YYYYMMDD → Date» y tres formateadores con
 * el mismo nombre; ésta es la única implementación de cada una.
 */
const pad2 = n => String(n).padStart(2, '0');
const DAY_MS = 86_400_000;

/** Date local → «YYYYMMDD» (sin pasar por UTC, que cambiaría el día por la noche). */
export const toDate8 = d => `${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}`;

/** «YYYYMMDD…» → Date local a medianoche; null si no son ocho dígitos. */
export function fromDate8(d8) {
  const s = String(d8 ?? '');
  if (!/^\d{8}/.test(s) || s.startsWith('00010101')) return null;
  return new Date(+s.slice(0, 4), +s.slice(4, 6) - 1, +s.slice(6, 8));
}

/** Días de `a` a `b` (positivo si `b` es posterior); null si alguna fecha no es válida. */
export function diasEntre(d8a, d8b) {
  const a = fromDate8(d8a), b = fromDate8(d8b);
  return a && b ? Math.round((b.getTime() - a.getTime()) / DAY_MS) : null;
}

/** «DD-MM-YYYY» o «DD-MM-YYYY HH:mm» → «YYYYMMDD»; '' si no tiene esa forma. */
export function date8FromDMY(s = '') {
  const m = String(s).match(/^(\d{2})-(\d{2})-(\d{4})/);
  return m ? `${m[3]}${m[2]}${m[1]}` : '';
}

/** Primer día conservado con `months` meses de retención hacia atrás desde `today`, como «YYYYMMDD». */
export function minusMonths8(months, today = new Date()) {
  const d = new Date(today);
  d.setMonth(d.getMonth() - months);
  return toDate8(d);
}

/**
 * Años cumplidos entre una fecha8 de nacimiento y `hoy`; null si no es una fecha.
 * Cumplir años hoy ya cuenta.
 */
export function edadAnios(fecha8, hoy = new Date()) {
  const nac = fromDate8(fecha8);
  if (!nac) return null;
  const anios = hoy.getFullYear() - nac.getFullYear();
  return hoy < new Date(hoy.getFullYear(), nac.getMonth(), nac.getDate()) ? anios - 1 : anios;
}

/** Date → «YYYY-MM-DD» (parámetros de los laboratorios). */
export const fmtIso = d => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

/** Date → «DD/MM/YYYY» (listados de laboratorio). */
export const fmtDMY = d => `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${d.getFullYear()}`;
