/**
 * Agenda futura: los pacientes ya citados a mi nombre en los próximos días.
 *
 * Vive aparte del período cargado a propósito. Una cita futura no es una
 * atención: si entrara en `state.allData` contaría en la tabla, en las
 * estadísticas y en el recuento de visitas por paciente como si ya hubiera
 * ocurrido. El calendario y la vista del día la leen de aquí.
 */
import { CONFIG } from '../core/config.js';
import { chunk, session, run } from './http.js';
import { storageGet, storageSet } from './cache.js';
import { parseCita } from '../core/parser.js';
import { toDate8 } from '../core/dates.js';
import { fetchCitasDia } from './agenda.js';

/** Los `dias` siguientes a `hoy`, sin incluir hoy: hoy ya viene en el período cargado. */
export function diasFuturos(dias, hoy = new Date()) {
  const out = [];
  for (let i = 1; i <= dias; i += 1) {
    const d = new Date(hoy);
    d.setDate(d.getDate() + i);
    out.push(toDate8(d));
  }
  return out;
}

/**
 * @param {string} token
 * @param {object} [opts]
 * @param {number} [opts.dias]   días hacia adelante; 0 no consulta nada
 * @param {Date} [opts.hoy]
 * @param {boolean} [opts.force] ignora la caché aunque esté fresca
 * @returns {Promise<{ citas: object[], dias: number, desde8: string, hasta8: string,
 *   failed: number, fromCache: boolean, savedAt: number, cancelado: boolean }>}
 */
export async function loadAgendaFutura(token, { dias = CONFIG.futurasDias, hoy = new Date(), force = false } = {}) {
  const vacio = { citas: [], dias: 0, desde8: '', hasta8: '', failed: 0, fromCache: true, savedAt: 0, cancelado: false };
  if (!dias || dias < 1) return vacio;

  const fechas = diasFuturos(dias, hoy);
  const desde8 = fechas[0], hasta8 = fechas[fechas.length - 1];
  const cached = await storageGet(CONFIG.futurasKey);
  // La ventana se desplaza cada día: una caché que empieza en otro día ya no sirve.
  if (!force && cached?.desde8 === desde8 && cached?.dias === dias && Date.now() - (cached.savedAt ?? 0) < CONFIG.futurasTtlMs) {
    return { citas: cached.citas ?? [], dias, desde8, hasta8, failed: 0, fromCache: true, savedAt: cached.savedAt, cancelado: false };
  }

  const citas = [];
  let failed = 0, cancelado = false;
  for (const lote of chunk(fechas, CONFIG.batchSize)) {
    if (session.expired || run.cancelled) { cancelado = true; break; }
    const respuestas = await Promise.all(lote.map(d => fetchCitasDia(token, d)));
    for (const dia of respuestas) {
      if (dia === undefined) { cancelado = true; continue; }
      if (dia === null) { failed += 1; continue; }
      for (const c of dia) {
        const r = parseCita(c);
        if (r) citas.push(r);
      }
    }
  }
  citas.sort((a, b) => (a.fecha8 + a.hora).localeCompare(b.fecha8 + b.hora));
  const savedAt = Date.now();
  // Una tanda incompleta no se guarda: media agenda futura en caché se leería como la agenda futura entera.
  if (!failed && !cancelado) await storageSet(CONFIG.futurasKey, { citas, dias, desde8, savedAt });
  return { citas, dias, desde8, hasta8, failed, fromCache: false, savedAt, cancelado };
}
