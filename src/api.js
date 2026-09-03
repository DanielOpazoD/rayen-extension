import { CONFIG } from './config.js';
import { getToken } from './auth.js';
import { apiGet, rayenParams, chunk, session, resetSession, run, resetRun } from './http.js';
import { parseCita, dateRange, localDateStr, matchKey } from './parser.js';
import { loadStore, saveStore, pruneStore, dropDay } from './cache.js';
import { loadHistorial, mergeHistorial } from './historial.js';
import { beginSyncSource, finishSyncSource, loadSyncHealth, pendingSyncItems } from './sync-health.js';

/** Raw citas from the last network fetches (for the API explorer's field discovery). */
const rawSamples = [];
export function getRawSamples() { return rawSamples; }

/**
 * A historical appointment is not immutable while Eloisa still shows it in an
 * open workflow state. Re-fetching these dates keeps later closures visible
 * without downloading the entire configured period on every refresh.
 */
export function isMutableAppointmentStatus(status = '') {
  return /(iniciad|agendad|confirmad|citad|espera|pendiente|en curso)/i.test(String(status));
}

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
  const token = await getToken();
  if (!token) return null;
  resetSession();
  resetRun();

  const today = new Date();
  const from  = new Date(today);
  from.setMonth(from.getMonth() - months);

  const allDates = dateRange(from, today);
  const wanted   = new Set(allDates);
  const todayStr = localDateStr(today);
  const store    = await loadStore(CONFIG.cacheKey);
  const previousSync = await loadSyncHealth();

  const min = new Date(today);
  min.setMonth(min.getMonth() - CONFIG.retentionMonths);
  const minDate8 = localDateStr(min);
  pruneStore(store, minDate8);

  // Today always changes. Historical dates must also be refreshed while they
  // contain an appointment that Eloisa can still close or otherwise update.
  const refreshDates = new Set([todayStr]);
  for (const record of store.records.values()) {
    if (wanted.has(record.fecha8) && isMutableAppointmentStatus(record.estado)) refreshDates.add(record.fecha8);
  }

  // Persist the need for a matching history refresh before the agenda request
  // can turn the appointment terminal. This survives cancellation, expiry and
  // runs made with the Ficha clínica option temporarily disabled.
  const historicalRefreshDates = [...refreshDates].filter(d => d !== todayStr);
  const coupledHistoryDates = retryOnly
    ? historicalRefreshDates.filter(date => pendingSyncItems(previousSync, 'agenda').has(date))
    : historicalRefreshDates;
  if (coupledHistoryDates.length) {
    const historyStore = await loadStore(CONFIG.historialKey);
    let changed = false;
    for (const date of coupledHistoryDates) {
      changed = historyStore.fetchedDates.delete(date) || changed;
    }
    if (changed) await saveStore(historyStore);
  }
  const retryAgendaDates = retryOnly ? pendingSyncItems(previousSync, 'agenda') : null;
  const toFetch = retryOnly
    ? [...retryAgendaDates].filter(d => /^\d{8}$/.test(d) && d >= minDate8 && d <= todayStr)
    : allDates.filter(d => !store.fetchedDates.has(d) || refreshDates.has(d));
  const citasShare = historial ? 50 : 100;

  const agendaAttemptedAt = Date.now();
  const trackAgenda = !retryOnly || retryAgendaDates.size > 0;
  if (trackAgenda) await beginSyncSource('agenda', agendaAttemptedAt, toFetch, operationId);
  let done = 0, failedDays = 0, agendaSucceeded = 0;
  const agendaFailedDates = [];
  const agendaSucceededDates = [];
  onProgress(toFetch.length ? 0 : citasShare, 'citas');

  for (const batch of chunk(toFetch, CONFIG.batchSize)) {
    const responses = await Promise.all(batch.map(d => fetchDay(token, d)));
    const okDates = [], newRecords = [];

    responses.forEach((day, i) => {
      if (day === null) { failedDays++; agendaFailedDates.push(batch[i]); return; }
      okDates.push(batch[i]);
      agendaSucceeded++;
      agendaSucceededDates.push(batch[i]);
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

  let records  = [...store.records.values()].filter(r => wanted.has(r.fecha8));
  let team = {}, historialFailed = 0;
  const agendaPendingDates = [...new Set([...agendaFailedDates, ...toFetch.slice(done)])];
  for (const date of pendingSyncItems(previousSync, 'agenda')) {
    if (!toFetch.includes(date) && /^\d{8}$/.test(date) && date >= minDate8 && date <= todayStr) agendaPendingDates.push(date);
  }
  if (trackAgenda) {
    await finishSyncSource('agenda', {
      attemptedAt: agendaAttemptedAt,
      failedItems: agendaPendingDates,
      networkCount: agendaSucceeded,
      cacheCount: allDates.length - toFetch.length,
      hasData: records.length > 0,
      cancelled: run.cancelled,
      error: session.expired || agendaPendingDates.length > 0,
      operationId,
    });
  }

  if (historial && !session.expired && !run.cancelled) {
    const retryHistoryDates = retryOnly
      ? new Set([...pendingSyncItems(previousSync, 'historial'), ...coupledHistoryDates, ...agendaSucceededDates])
      : null;
    const priorHistoryDates = [...pendingSyncItems(previousSync, 'historial')].filter(date =>
      /^\d{8}$/.test(date) && date >= minDate8 && date <= todayStr);
    const historyRefreshDates = retryOnly ? refreshDates : new Set([...refreshDates, ...priorHistoryDates]);
    const historialAttemptedAt = Date.now();
    const trackHistorial = !retryOnly || retryHistoryDates.size > 0;
    if (trackHistorial) await beginSyncSource('historial', historialAttemptedAt, retryHistoryDates ?? allDates, operationId);
    const matchingRecords = retryOnly
      ? [...store.records.values()].filter(record => wanted.has(record.fecha8) || retryHistoryDates.has(record.fecha8))
      : records;
    const citaKeys = new Set(matchingRecords.map(matchKey));
    const res = await loadHistorial(token, allDates, citaKeys,
      pct => onProgress(50 + Math.round(pct / 2), 'ficha'), {
        refreshDates: historyRefreshDates,
        onlyDates: retryHistoryDates,
      });
    records = mergeHistorial(records, res.atenciones);
    team = res.team;
    historialFailed = res.failed;
    if (trackHistorial) {
      await finishSyncSource('historial', {
        attemptedAt: historialAttemptedAt,
        failedItems: [...new Set([
          ...res.pendingDates,
          ...[...pendingSyncItems(previousSync, 'historial')].filter(date =>
            !retryOnly && !allDates.includes(date) && /^\d{8}$/.test(date) && date >= minDate8 && date <= todayStr),
        ])],
        networkCount: Math.max(0, res.attemptedCount - res.failedDates.length),
        cacheCount: allDates.length - res.attemptedCount,
        hasData: res.atenciones.length > 0 || Object.keys(res.team).length > 0,
        cancelled: run.cancelled,
        error: session.expired || res.pendingDates.length > 0,
        operationId,
      });
    }
  } else if (historial && (session.expired || run.cancelled)) {
    const historyStore = await loadStore(CONFIG.historialKey);
    const previousPending = pendingSyncItems(previousSync, 'historial');
    const pendingDates = new Set([
      ...previousPending,
      ...allDates.filter(d => !historyStore.fetchedDates.has(d) || d === todayStr || refreshDates.has(d)),
    ]);
    await finishSyncSource('historial', {
      attemptedAt: agendaAttemptedAt,
      failedItems: [...pendingDates].filter(d => /^\d{8}$/.test(d) && d >= minDate8 && d <= todayStr),
      cacheCount: historyStore.fetchedDates.size,
      hasData: historyStore.records.size > 0 || Object.keys(historyStore.extra.team ?? {}).length > 0,
      cancelled: run.cancelled,
      error: true,
      operationId,
    });
  } else if (!historial && retryOnly && (coupledHistoryDates.length || agendaSucceededDates.length)) {
    const historyStore = await loadStore(CONFIG.historialKey);
    await finishSyncSource('historial', {
      attemptedAt: agendaAttemptedAt,
      failedItems: [...new Set([...pendingSyncItems(previousSync, 'historial'), ...coupledHistoryDates, ...agendaSucceededDates])],
      cacheCount: historyStore.fetchedDates.size,
      hasData: historyStore.records.size > 0 || Object.keys(historyStore.extra.team ?? {}).length > 0,
      error: true,
      operationId,
    });
  } else if (!historial && !retryOnly) {
    await finishSyncSource('historial', {
      disabled: true,
      failedItems: [...pendingSyncItems(previousSync, 'historial')].filter(date =>
        /^\d{8}$/.test(date) && date >= minDate8 && date <= todayStr),
      operationId,
    });
  }

  return {
    records,
    fromCache:   Math.max(0, allDates.length - toFetch.length),
    fromNetwork: toFetch.length,
    failedDays,
    historialFailed,
    team,
    sessionExpired: session.expired,
    cancelled: run.cancelled,
    sync: await loadSyncHealth(),
  };
}
