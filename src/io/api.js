import { state } from './state.js';
import { CONFIG } from '../core/config.js';
import { getToken } from './auth.js';
import { apiGet, rayenParams, chunk, session, resetSession, run, resetRun } from './http.js';
import { parseCita, matchKey } from '../core/parser.js';
import { loadStore, saveStore, pruneStore, dropDay } from './cache.js';
import { loadHistorial, mergeHistorial } from './historial.js';
import { beginSyncSource, finishSyncSource, loadSyncHealth, pendingSyncItems } from './sync-health.js';
import { planSync, retentionMin8, isMutableAppointmentStatus } from './sync-plan.js';

export { isMutableAppointmentStatus };

/** Raw citas from the last network fetches (for the API explorer's field discovery). */
const rawSamples = [];
export function getRawSamples() { return rawSamples; }

/**
 * Fetches all appointments for a single YYYYMMDD date.
 * @returns {Promise<object[]|null|undefined>} null on failure (never an empty
 *   array, so a failed day is not mistaken for a day without appointments);
 *   undefined when the person cancelled: it is not a failure and is not counted as one.
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
    const data = await apiGet(token, `/API/api/rayen/Citas/ListaPacientesCitados/${CONFIG.nodeId}/${params}`, { signal: run.controller.signal });
    return Array.isArray(data) ? data : null;
  } catch (err) {
    return err?.name === 'CancelledError' ? undefined : null; // AuthError already flagged session.expired
  }
}

/**
 * Una carga completa. `SyncRun` es el único objeto que viaja entre los pasos:
 * se construye aquí, se documenta aquí y no crece por el camino.
 *
 * @typedef {object} SyncRun
 * @property {string} token
 * @property {boolean} historial        si se concilia la ficha del período
 * @property {boolean} retryOnly        sólo lo pendiente de una carga anterior
 * @property {string|null} operationId
 * @property {(pct:number, phase:string) => void} onProgress
 * @property {import('./sync-plan.js').SyncPlan} plan
 * @property {object} store             caché de agenda (loadStore)
 * @property {object} previousSync      salud de sincronización previa
 * @property {{ records: object[], succeededDates: string[], failedDays: number, attemptedAt: number }|null} agenda  resultado del paso de agenda
 */

/**
 * Loads appointment data for the last `months`, cache-first, then (optionally)
 * enriches it with the ficha clínica (diagnósticos, actividades, prestadores).
 *
 * @param {number} months
 * @param {(pct:number, phase:string) => void} onProgress
 * @param {{ historial?: boolean, retryOnly?: boolean, operationId?: string|null }} opts
 * @returns {Promise<null | {
 *   records: object[], fromCache: number, fromNetwork: number,
 *   failedDays: number, historialFailed: number, team: Record<string, object>,
 *   sessionExpired: boolean
 * }>} null = no active session token
 */
export async function loadData(months, onProgress = () => {}, {
  historial = true, retryOnly = false, operationId = null,
} = {}) {
  resetSession(); // antes del token: una carga nueva vuelve a dar una oportunidad al token de la pestaña
  resetRun();
  const token = await getToken();
  if (!token) return null;

  const store = await loadStore(CONFIG.cacheKey);
  const previousSync = await loadSyncHealth();
  const retentionMonths = state.prefs?.retentionMonths ?? CONFIG.retentionMonths;
  pruneStore(store, retentionMin8(retentionMonths));
  const plan = planSync({ months, retentionMonths, retryOnly, records: store.records.values(), fetchedDates: store.fetchedDates, previousSync });

  // Persist the need for a matching history refresh before the agenda request
  // can turn the appointment terminal. This survives cancellation, expiry and
  // runs made with the Ficha clínica option temporarily disabled.
  if (plan.coupledHistoryDates.length) {
    const historyStore = await loadStore(CONFIG.historialKey);
    let changed = false;
    for (const date of plan.coupledHistoryDates) changed = historyStore.fetchedDates.delete(date) || changed;
    if (changed) await saveStore(historyStore);
  }

  /** @type {SyncRun} */
  const sync = { token, historial, retryOnly, operationId, onProgress, plan, store, previousSync, agenda: null };
  try {
    sync.agenda = await syncAgenda(sync);
    const hist = await syncHistorial(sync);
    return {
      records: hist.records,
      fromCache:   Math.max(0, plan.allDates.length - plan.toFetch.length),
      fromNetwork: plan.toFetch.length,
      failedDays: sync.agenda.failedDays,
      historialFailed: hist.historialFailed,
      team: hist.team,
      sessionExpired: session.expired,
      cancelled: run.cancelled,
      sync: await loadSyncHealth(),
    };
  } finally {
    // «Cancelar» sólo afecta a esta carga: la bandera no se queda puesta para
    // las interconsultas ni para nada que se cargue después.
    if (run.cancelled) resetRun();
  }
}

/**
 * Descarga la agenda por lotes, guardando cada lote en la caché al llegar.
 * Se detiene si la sesión murió o la persona canceló; lo que ya llegó, queda.
 * Un día cancelado no es un día fallido: queda pendiente, sin contar como error.
 */
async function fetchAgendaBatches(token, toFetch, store, citasShare, onProgress) {
  let done = 0, failedDays = 0, succeeded = 0;
  const failedDates = [], cancelledDates = [], succeededDates = [];
  for (const batch of chunk(toFetch, CONFIG.batchSize)) {
    if (session.expired || run.cancelled) break;
    const responses = await Promise.all(batch.map(d => fetchDay(token, d)));
    const okDates = [], newRecords = [];

    responses.forEach((day, i) => {
      if (day === undefined) { cancelledDates.push(batch[i]); return; }
      if (day === null) { failedDays++; failedDates.push(batch[i]); return; }
      okDates.push(batch[i]);
      succeeded++;
      succeededDates.push(batch[i]);
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
    if (session.expired || run.cancelled) break;
  }
  return { done, failedDays, succeeded, failedDates, cancelledDates, succeededDates };
}

/** Paso 1: la agenda. Escribe el estado de sincronización de «agenda». */
async function syncAgenda({ token, historial, retryOnly, operationId, onProgress, plan, store, previousSync }) {
  const citasShare = historial ? 50 : 100;
  const attemptedAt = Date.now();
  const track = !retryOnly || plan.retryAgendaDates.size > 0;
  if (track) await beginSyncSource('agenda', attemptedAt, plan.toFetch, operationId);
  onProgress(plan.toFetch.length ? 0 : citasShare, 'citas');

  const r = await fetchAgendaBatches(token, plan.toFetch, store, citasShare, onProgress);
  const records = [...store.records.values()].filter(x => plan.wanted.has(x.fecha8));
  const pending = [...new Set([...r.failedDates, ...r.cancelledDates, ...plan.toFetch.slice(r.done)])];
  for (const date of pendingSyncItems(previousSync, 'agenda')) {
    if (!plan.toFetch.includes(date) && plan.inWindow(date)) pending.push(date);
  }
  if (track) {
    await finishSyncSource('agenda', {
      attemptedAt, failedItems: pending, networkCount: r.succeeded,
      cacheCount: plan.allDates.length - plan.toFetch.length,
      hasData: records.length > 0, cancelled: run.cancelled,
      error: session.expired || r.failedDates.length > 0, // cancelar no es un error
      operationId,
    });
  }
  return { records, succeededDates: r.succeededDates, failedDays: r.failedDays, attemptedAt };
}

/**
 * Paso 2: la ficha clínica del período. Devuelve registros con la ficha
 * fusionada, el equipo y cuántas fechas fallaron, y deja el estado de
 * sincronización de «historial» escrito en todos los caminos.
 */
async function syncHistorial(sync) {
  const { token, historial, retryOnly, operationId, onProgress, plan, store, previousSync, agenda } = sync;
  let records = agenda.records;
  let team = {}, historialFailed = 0;

  if (historial && !session.expired && !run.cancelled) {
    const retryHistoryDates = retryOnly
      ? new Set([...pendingSyncItems(previousSync, 'historial'), ...plan.coupledHistoryDates, ...agenda.succeededDates])
      : null;
    const attemptedAt = Date.now();
    const track = !retryOnly || retryHistoryDates.size > 0;
    if (track) await beginSyncSource('historial', attemptedAt, retryHistoryDates ?? plan.allDates, operationId);
    const matchingRecords = retryOnly
      ? [...store.records.values()].filter(record => plan.wanted.has(record.fecha8) || retryHistoryDates.has(record.fecha8))
      : records;
    const citaKeys = new Set(matchingRecords.map(matchKey));
    const res = await loadHistorial(token, plan.allDates, citaKeys,
      pct => onProgress(50 + Math.round(pct / 2), 'ficha'), {
        refreshDates: plan.historyRefreshDates,
        onlyDates: retryHistoryDates,
      });
    records = mergeHistorial(records, res.atenciones);
    team = res.team;
    historialFailed = res.failed;
    if (track) {
      await finishSyncSource('historial', {
        attemptedAt,
        failedItems: [...new Set([
          ...res.pendingDates,
          ...[...pendingSyncItems(previousSync, 'historial')].filter(date => !retryOnly && !plan.allDates.includes(date) && plan.inWindow(date)),
        ])],
        networkCount: Math.max(0, res.attemptedCount - res.failedDates.length),
        cacheCount: plan.allDates.length - res.attemptedCount,
        hasData: res.atenciones.length > 0 || Object.keys(res.team).length > 0,
        cancelled: run.cancelled,
        error: session.expired || res.failedDates.length > 0,
        operationId,
      });
    }
  } else if (historial && (session.expired || run.cancelled)) {
    const historyStore = await loadStore(CONFIG.historialKey);
    const pendingDates = new Set([
      ...pendingSyncItems(previousSync, 'historial'),
      ...plan.allDates.filter(d => !historyStore.fetchedDates.has(d) || d === plan.todayStr || plan.refreshDates.has(d)),
    ]);
    await finishSyncSource('historial', {
      attemptedAt: agenda.attemptedAt,
      failedItems: [...pendingDates].filter(plan.inWindow),
      cacheCount: historyStore.fetchedDates.size,
      hasData: historyStore.records.size > 0 || Object.keys(historyStore.extra.team ?? {}).length > 0,
      cancelled: run.cancelled,
      error: session.expired, // cancelar deja pendientes, no un error
      operationId,
    });
  } else if (!historial && retryOnly && (plan.coupledHistoryDates.length || agenda.succeededDates.length)) {
    const historyStore = await loadStore(CONFIG.historialKey);
    await finishSyncSource('historial', {
      attemptedAt: agenda.attemptedAt,
      failedItems: [...new Set([...pendingSyncItems(previousSync, 'historial'), ...plan.coupledHistoryDates, ...agenda.succeededDates])],
      cacheCount: historyStore.fetchedDates.size,
      hasData: historyStore.records.size > 0 || Object.keys(historyStore.extra.team ?? {}).length > 0,
      error: true,
      operationId,
    });
  } else if (!historial && !retryOnly) {
    await finishSyncSource('historial', {
      disabled: true,
      failedItems: [...pendingSyncItems(previousSync, 'historial')].filter(plan.inWindow),
      operationId,
    });
  }
  return { records, team, historialFailed };
}
