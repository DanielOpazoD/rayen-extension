/**
 * Orden clínico para el panel del paciente, sin DOM.
 *
 * Los diagnósticos se agrupan por problema (código CIE-10 o clasificación) y
 * se ordenan por peso: GES, crónicos, recurrentes y recientes primero. Las
 * prescripciones se clasifican en activas o vencidas por la duración escrita
 * en la receta («cada 12 horas por 6 meses») y la fecha de la atención.
 */
import { cleanText } from './text.js';
import { fromDate8 } from './dates.js';

// Prefijos CIE-10 de condiciones crónicas frecuentes en atención primaria.
const CHRONIC_CIE = /^(E1[0-4]|E78|E66|I1[0-5]|I2[0-5]|I48|I50|J4[4-5]|N18|M0[5-6]|M1[5-9]|F2\d|F3[1-3]|F41|G40|G20|K21|E03|E05|D50|B2[0-4]|C\d\d)/i;
const CHRONIC_WORDS = /diabetes|hipertensi|epoc|asma|hipotiroid|dislipid|obesidad|artritis|artrosis|insuficiencia\s+(renal|card)|epilepsia|depresi|ansiedad|esquizo|bipolar|parkinson|reflujo|barrett|anemia|cr[oó]nic/i;
// «Sin diabetes», «Descarta hipertensión»: el nombre niega el problema, no lo afirma.
const NEGATED = /^\s*(sin|no|descarta(?:d[oa])?|niega|sospecha\s+de)\b/i;

const problemKey = d => cleanText(d.codigo || d.clasificacion || d.nombre).toLowerCase();

/**
 * @param {Array<{fechaAtencion:string, fecha8?:string, diagnosticos?:object[], prestadores?:object[]}>} visits
 * @param {{officerId?: number}} [opts]
 * @returns {Array<{nombre, clasificacion, codigo, esAuge, cronico, recurrente, n, primera, ultima, mio}>}
 * `cronico` sale del código CIE o del nombre; `recurrente` (≥3 registros) pesa
 * casi igual pero se rotula aparte: una bronquitis aguda siete veces no es crónica.
 */
export function rankProblems(visits, { officerId = null } = {}) {
  const seen = new Map();
  for (const v of visits ?? []) {
    const mio = officerId != null && (v.prestadores ?? []).some(p => p.id === officerId);
    for (const d of v.diagnosticos ?? []) {
      const key = problemKey(d);
      if (!key || /no informado/i.test(key)) continue;
      const stamp = v.fecha8 || toStamp(v.fechaAtencion);
      const cur = seen.get(key);
      if (!cur) {
        seen.set(key, {
          nombre: d.nombre, clasificacion: d.clasificacion, codigo: d.codigo || '', esAuge: !!d.esAuge,
          n: 1, primera: v.fechaAtencion, ultima: v.fechaAtencion, stampUltima: stamp, stampPrimera: stamp, mio,
        });
        continue;
      }
      cur.n += 1;
      cur.esAuge = cur.esAuge || !!d.esAuge;
      cur.mio = cur.mio || mio;
      if (stamp > cur.stampUltima) { cur.stampUltima = stamp; cur.ultima = v.fechaAtencion; cur.nombre = d.nombre || cur.nombre; }
      if (stamp < cur.stampPrimera) { cur.stampPrimera = stamp; cur.primera = v.fechaAtencion; }
    }
  }
  const out = [...seen.values()].map(p => ({
    ...p,
    cronico: !NEGATED.test(p.nombre) && (CHRONIC_CIE.test(p.codigo) || CHRONIC_WORDS.test(`${p.clasificacion} ${p.nombre}`)),
    recurrente: p.n >= 3,
  }));
  // El orden que promete la cabecera: GES, crónicos, recurrentes, y dentro de cada nivel los más registrados y recientes.
  out.sort((a, b) => (b.esAuge - a.esAuge) || (b.cronico - a.cronico) || (b.recurrente - a.recurrente) || (b.n - a.n) || b.stampUltima.localeCompare(a.stampUltima));
  for (const p of out) { delete p.stampUltima; delete p.stampPrimera; }
  return out;
}

/** «dd-mm-yyyy» → «yyyymmdd», para comparar. */
function toStamp(fechaDdMmAaaa) {
  const m = String(fechaDdMmAaaa || '').match(/^(\d{2})-(\d{2})-(\d{4})$/);
  return m ? `${m[3]}${m[2]}${m[1]}` : '';
}

const DURATION = /por\s+(\d+)\s*(d[ií]as?|semanas?|mes(?:es)?|a[ñn]os?)/i;

/**
 * Estado de una prescripción a la fecha `hoy`: 'activa', 'vencida' o
 * 'suspendida'. Sin duración escrita se asumen 30 días.
 * @param {string} texto     línea de la prescripción («… cada 12 horas por 6 meses»)
 * @param {string} fecha8    fecha de la atención, yyyymmdd
 */
export function prescripcionEstado(texto, fecha8, { suspendido = false, hoy = new Date() } = {}) {
  if (suspendido) return 'suspendida';
  if (!/^\d{8}$/.test(String(fecha8 || ''))) return 'activa';
  const start = fromDate8(fecha8);
  const m = String(texto || '').match(DURATION);
  const end = new Date(start);
  if (!m) end.setDate(end.getDate() + 30);
  else {
    const n = Number(m[1]);
    const unit = m[2].toLowerCase();
    if (unit.startsWith('d')) end.setDate(end.getDate() + n);
    else if (unit.startsWith('s')) end.setDate(end.getDate() + 7 * n);
    else if (unit.startsWith('m')) end.setMonth(end.getMonth() + n);
    else end.setFullYear(end.getFullYear() + n);
  }
  return end >= hoy ? 'activa' : 'vencida';
}

/**
 * Próximo control sugerido para la portada: la orden más cercana con fecha
 * igual o posterior a hoy, ignorando las descartadas en Eloisa (una orden con
 * FechaDescarte no es un control pendiente, como ya hace pendientes.js).
 * @returns {{fecha, fecha8, desde}|null}
 */
export function proximoControlSugerido(visits, hoy8) {
  return visits.flatMap(v => (v.proximoControl ?? []).map(c => ({ ...c, desde: v.fechaAtencion })))
    .filter(c => c.fecha8 && !c.descartada && c.fecha8 >= hoy8)
    .sort((a, b) => a.fecha8.localeCompare(b.fecha8))[0] ?? null;
}
