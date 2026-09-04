/**
 * Orden clínico para el panel del paciente, sin DOM.
 *
 * Los diagnósticos se agrupan por problema (código CIE-10 o clasificación) y
 * se ordenan por peso: GES, crónicos, recurrentes y recientes primero. Las
 * prescripciones se clasifican en activas o vencidas por la duración escrita
 * en la receta («cada 12 horas por 6 meses») y la fecha de la atención.
 */
import { cleanText } from './text.js';

// Prefijos CIE-10 de condiciones crónicas frecuentes en atención primaria.
const CHRONIC_CIE = /^(E1[0-4]|E78|E66|I1[0-5]|I2[0-5]|I48|I50|J4[4-5]|N18|M0[5-6]|M1[5-9]|F2\d|F3[1-3]|F41|G40|G20|K21|E03|E05|D50|B2[0-4]|C\d\d)/i;
const CHRONIC_WORDS = /diabetes|hipertensi|epoc|asma|hipotiroid|dislipid|obesidad|artritis|artrosis|insuficiencia\s+(renal|card)|epilepsia|depresi|ansiedad|esquizo|bipolar|parkinson|reflujo|barrett|anemia/i;

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
    cronico: CHRONIC_CIE.test(p.codigo) || CHRONIC_WORDS.test(`${p.clasificacion} ${p.nombre}`),
    recurrente: p.n >= 3,
  }));
  out.sort((a, b) => (b.esAuge - a.esAuge) || ((b.cronico || b.recurrente) - (a.cronico || a.recurrente)) || (b.n - a.n) || b.stampUltima.localeCompare(a.stampUltima));
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
  const start = new Date(+fecha8.slice(0, 4), +fecha8.slice(4, 6) - 1, +fecha8.slice(6, 8));
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
