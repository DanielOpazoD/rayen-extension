import { CONFIG } from './config.js';
import { getToken } from './auth.js';
import { apiGet, rayenParams, chunk, session, resetSession } from './http.js';
import { parseCita, dateRange, localDateStr, matchKey } from './parser.js';
import { loadStore, saveStore, pruneStore, dropDay } from './cache.js';
import { loadHistorial, mergeHistorial } from './historial.js';

/** Raw citas from the last network fetches (for the API explorer's field discovery). */
const rawSamples = [];
export function getRawSamples() { return rawSamples; }

/**
 * Fetches all appointments for a single YYYYMMDD date.
 * @returns {Promise<object[]|null>} null on failure — never an empty array,
 *   so a failed day is not mistaken for a day without appointments.
 */
async function fetchDay(token, dateStr) {
  const params = rayenParams([
    ['FechaHoraInicio',  `${dateStr} 000000`],
    ['FechaHoraTermino', `${dateStr} 235959`],
    ['IdsDeRecursos',    CONFIG.officerId],
    ['EsAnulado', 2],
    ['EsGrupal',  2],
    ['TraerLlamadosPaciente', true],
    ['TraerTeleconsulta',     true],
  ]);
  try {
    const data = await apiGet(token, `/API/api/rayen/Citas/ListaPacientesCitados/${CONFIG.nodeId}/${params}`);
    return Array.isArray(data) ? data : null;
  } catch {
    return null; // AuthError already flagged session.expired
  }
}

/**
 * Loads appointment data for the last `months`, cache-first, then (optionally)
 * enriches it with the ficha clínica (diagnósticos, actividades, prestadores).
 *
 * @param {number} months
 * @param {(pct:number, phase:string) => void} onProgress
 * @param {{ historial?: boolean }} opts
 * @returns {Promise<null | {
 *   records: object[], fromCache: number, fromNetwork: number,
 *   failedDays: number, historialFailed: number, team: Record<string, object>,
 *   sessionExpired: boolean
 * }>} null = no active session token
 */
export async function loadData(months, onProgress = () => {}, { historial = true } = {}) {
  const token = await getToken();
  if (!token) return null;
  resetSession();

  const today = new Date();
  const from  = new Date(today);
  from.setMonth(from.getMonth() - months);

  const allDates = dateRange(from, today);
  const todayStr = localDateStr(today);
  const store    = await loadStore(CONFIG.cacheKey);

  const min = new Date(today);
  min.setMonth(min.getMonth() - CONFIG.retentionMonths);
  pruneStore(store, localDateStr(min));

  // Always re-fetch today — it changes during the day
  const toFetch = allDates.filter(d => !store.fetchedDates.has(d) || d === todayStr);
  const citasShare = historial ? 50 : 100;

  let done = 0, failedDays = 0;
  onProgress(toFetch.length ? 0 : citasShare, 'citas');

  for (const batch of chunk(toFetch, CONFIG.batchSize)) {
    const responses = await Promise.all(batch.map(d => fetchDay(token, d)));
    const okDates = [], newRecords = [];

    responses.forEach((day, i) => {
      if (day === null) { failedDays++; return; }
      okDates.push(batch[i]);
      dropDay(store, batch[i]);
      for (const c of day) {
        if (rawSamples.length < 30) rawSamples.push(c);
        const r = parseCita(c);
        if (r) newRecords.push(r);
      }
    });

    if (okDates.length) await saveStore(store, okDates, newRecords);
    done += batch.length;
    onProgress(Math.round((done / toFetch.length) * citasShare), 'citas');
    if (session.expired) break; // no point hammering a dead session
  }

  const wanted = new Set(allDates);
  let records  = [...store.records.values()].filter(r => wanted.has(r.fecha8));
  let team = {}, historialFailed = 0;

  if (historial && !session.expired) {
    const citaKeys = new Set(records.map(matchKey));
    const res = await loadHistorial(token, allDates, citaKeys,
      pct => onProgress(50 + Math.round(pct / 2), 'ficha'));
    records = mergeHistorial(records, res.atenciones);
    team = res.team;
    historialFailed = res.failed;
  }

  return {
    records,
    fromCache:   allDates.length - toFetch.length,
    fromNetwork: toFetch.length,
    failedDays,
    historialFailed,
    team,
    sessionExpired: session.expired,
  };
}
