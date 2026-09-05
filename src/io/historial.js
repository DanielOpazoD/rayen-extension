import { state } from './state.js';
import { CONFIG } from '../core/config.js';
import { apiPost, chunk, session, run } from './http.js';
import { parseAtencion, matchKey, localDateStr, fmtDate } from '../core/parser.js';
import { aggregateTeam } from '../core/historial-merge.js';
import { esMiaAtencion } from '../core/sic-rules.js';
import { retentionMin8 } from '../core/sync-plan.js';
import { loadStore, saveStore, pruneStore, dropDay } from './cache.js';

const PATH = '/API/api/rayen/FichaClinica/HistorialAtencion';

/** Same flag set Eloisa's "Ficha Clínica" view uses. Others are available (see MAPA_API). */
const FLAGS = Object.freeze({
  TraerActividades: true,
  TraerDiagnosticos: true,
  TraerFuncionariosPrestadores: true,
  TraerPrescripciones: false,
  TraerExamenesSolicitados: false,
  TraerEspecialidadesDerivadas: false,
  TraerExamenesFisicos: false,
  TraerItemsExamenesSegmentarios: false,
  TraerIndicaciones: false,
  TraerPrescripcionesExtraConsultorio: false,
  TraerOrdenesAtencionInterna: true,  // próximo control sugerido — alimenta pendientes
  TraerAnamnesis: false,
  TraerRecetas: false,
  TraerOrdenAtencionPruebaDiagnostica: false,
  TraerEpisodioAtencion: false,
  TraerEnmendaciones: false,
  TraerLicenciasMedicasElectronicasOtorgadas: false,
});

/** @returns {Promise<object[]|null>} raw atenciones for the whole node, or null on failure */
async function fetchHistorialDay(token, date8) {
  try {
    const data = await apiPost(token, PATH, {
      IdNodo: CONFIG.nodeId,
      FechaInicio:  `${date8} 000000`,
      FechaTermino: `${date8} 235959`,
      ...FLAGS,
    }, { signal: run.controller.signal });
    return Array.isArray(data) ? data : null;
  } catch (err) {
    return err?.name === 'CancelledError' ? undefined : null; // cancelado: pendiente, no fallido
  }
}

/**
 * La consulta por nodo trae `IdCita` en 0 y sin `FechaCita`; la consulta por
 * paciente sí los trae. Para cada atención mía sin cita ese mismo día (ficha
 * abierta la víspera o cerrada tarde) se pide ese único día del paciente y se
 * copia la cita exacta. Si la red falla, la atención sigue sin cita y el cruce
 * con la agenda recurre a la heurística por cercanía, marcada como estimada.
 * @returns {Promise<number>} cuántas atenciones quedaron resueltas
 */
async function resolverCitas(token, parsed, citaKeys, { signal = run.controller.signal } = {}) {
  const pendientes = parsed.filter(a => esMiaAtencion(a) && !a.esUrgencia && !a.idCita && !a.fechaCita8 && a.idUsp && a.fecha8 && !citaKeys.has(matchKey(a)));
  let resueltas = 0;
  await Promise.all(pendientes.map(async a => {
    try {
      const data = await apiPost(token, PATH, {
        IdUsuario: a.idUsp, IdFuncionarioPrestador: null,
        FechaInicio: `${a.fecha8} 000000`, FechaTermino: `${a.fecha8} 235959`,
      }, { signal });
      const raw = (Array.isArray(data) ? data : []).find(x => x?.Id === a.id);
      const cita = String(raw?.FechaCita ?? '');
      if (!raw) return;
      a.idCita = raw.IdCita || 0;
      if (/^\d{8} \d{4,6}$/.test(cita) && !cita.startsWith('00010101')) { a.fechaCita8 = cita.slice(0, 8); a.fechaCita = fmtDate(cita); }
      if (a.idCita || a.fechaCita8) resueltas += 1;
    } catch { /* sin red o cancelado: queda para la heurística */ }
  }));
  return resueltas;
}

/**
 * Loads (cache-first) the node's HistorialAtencion for `dates8`, keeping only the
 * atenciones that belong to the officer or that match one of `citaKeys`
 * (matchKey of the citas already loaded). Everything else is reduced to a
 * per-day team aggregate.
 *
 * @param {string} token
 * @param {string[]} dates8
 * @param {Set<string>} citaKeys
 * @param {(pct: number) => void} [onProgress]
 * @param {object} [opts]
 * @param {Set<string>} [opts.refreshDates]  dates whose appointment state was still mutable
 * @param {Set<string>|null} [opts.onlyDates]  a restricted set requested by the synchronization retry
 * @returns {Promise<{ atenciones: object[], team: Record<string, object>, failed: number,
 *   failedDates: string[], pendingDates: string[], attemptedCount: number, fromCache: boolean }>}
 */
export async function loadHistorial(token, dates8, citaKeys, onProgress = (/** @type {number} */ _pct) => {}, {
  refreshDates = new Set(), onlyDates = null,
} = {}) {
  const store = await loadStore(CONFIG.historialKey);
  store.extra.team ??= {};

  const min8 = retentionMin8(state.prefs?.retentionMonths ?? CONFIG.retentionMonths);
  pruneStore(store, min8);

  const todayStr = localDateStr(new Date());
  const toFetch  = onlyDates
    ? [...onlyDates].filter(d => /^\d{8}$/.test(d) && d >= min8 && d <= todayStr)
    : dates8.filter(d => !store.fetchedDates.has(d) || d === todayStr || refreshDates.has(d));
  let done = 0, failed = 0;
  const failedDates = [], cancelledDates = [];
  onProgress(toFetch.length ? 0 : 100);

  for (const batch of chunk(toFetch, CONFIG.historialBatch)) {
    const responses = await Promise.all(batch.map(d => fetchHistorialDay(token, d)));
    const okDates = [];
    const keep    = [];
    let retryMarkerChanged = false;

    for (const [i, raw] of responses.entries()) {
      const d8 = batch[i];
      if (raw === undefined) { cancelledDates.push(d8); continue; }
      if (raw === null) {
        failed++;
        failedDates.push(d8);
        // If the agenda just moved from a mutable to a terminal state, this is
        // our last automatic forced refresh. Leave the history date incomplete
        // so the next load retries it even though the agenda is now closed.
        if (refreshDates.has(d8)) {
          retryMarkerChanged = store.fetchedDates.delete(d8) || retryMarkerChanged;
        }
        continue;
      }
      okDates.push(d8);
      dropDay(store, d8);
      const parsed = raw.map(parseAtencion).filter(a => a.fecha8 === d8 || !a.fecha8);
      store.extra.team[d8] = aggregateTeam(parsed);
      await resolverCitas(token, parsed, citaKeys);
      keep.push(...parsed.filter(a => esMiaAtencion(a) || citaKeys.has(matchKey(a))));
    }

    if (okDates.length || retryMarkerChanged) await saveStore(store, okDates, keep);
    done += batch.length;
    onProgress(Math.round((done / toFetch.length) * 100));
    if (session.expired || run.cancelled) break;
  }

  const wanted = new Set(dates8);
  const pendingDates = [...new Set([...failedDates, ...cancelledDates, ...toFetch.slice(done)])];
  return {
    atenciones: [...store.records.values()].filter(a => wanted.has(a.fecha8)),
    team:       Object.fromEntries(Object.entries(store.extra.team).filter(([d]) => wanted.has(d))),
    failed,
    failedDates,
    pendingDates,
    attemptedCount: done,
    fromCache: toFetch.length === 0,
  };
}

/**
 * Enriches citas with their atención (matched by RUN + day, since IdCita is 0 in
 * HistorialAtencion) and appends the officer's atenciones that have no cita
 * (espontáneas) as extra rows.
 */
