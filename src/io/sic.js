import { state } from './state.js';
import { CONFIG, SIC_ESTADOS_ORIGEN, SIC_ESTADOS_DESTINO } from '../core/config.js';
import { apiGet, rayenParams, chunk, session, run, AuthError } from './http.js';
import { parseSIC } from '../core/sic-parse.js';
import { localDateStr } from '../core/parser.js';
import { storageGet, storageSet } from './cache.js';

const BASE = '/API/api/rayen/ReferenciaYContrarreferencia';

// ── Fetching ───────────────────────────────────────────────────

async function listIds(token, origen, from8, to8, estados, nodeKey) {
  const q = rayenParams([
    ['ORIGEN', origen],
    ['BUSQUEDAINICIAL', false],
    ['TIPOSOLICITUD', 1],
    ['FECHAINICIO',  `${from8} 000000`],
    ['FECHATERMINO', `${to8} 235900`],
    ['CAMPOORDEN', 2],
    ['ESTADOSSOLICITUDES', estados.join(',')],
    [nodeKey, CONFIG.nodeId],
  ]);
  try {
    const ids = await apiGet(token, `${BASE}/IdsSolicitudesInterconsultasGet?paramsFiltro=${q}`);
    return Array.isArray(ids) ? ids : [];
  } catch {
    return null;
  }
}

async function fetchDetails(token, ids) {
  // Mirrors the exact call Eloisa's SIC view makes (verified in the HAR)
  const path = `${BASE}/SolicitudInterconsultaDerivacionPorIds/Ids=${ids.join('%2C')};TIPOSOLICITUD=1;TraerDocumentos=true`;
  try {
    const data = await apiGet(token, path);
    return Array.isArray(data) ? data : [];
  } catch {
    return null;
  }
}

/**
 * Loads every SIC where Hospital Hanga Roa is origin or destination within the
 * window. Cached for CONFIG.sicTtlMs unless `force`.
 *
 * @returns {Promise<{ sics: object[], fromCache: boolean, savedAt: number, failed: number,
 *   staleFallback?: boolean, cancelled?: boolean }>}
 */
/**
 * Las interconsultas guardadas llevan teléfono y dirección del paciente. La
 * retención elegida en Preferencias (3/6/13 meses) también las poda: antes
 * sólo se podaban agenda y ficha y este almacén crecía sin límite.
 */
export function pruneByRetention(records, now = new Date()) {
  const months = state.prefs?.retentionMonths ?? CONFIG.retentionMonths;
  const min = new Date(now.getFullYear(), now.getMonth() - months, now.getDate());
  const min8 = `${min.getFullYear()}${String(min.getMonth() + 1).padStart(2, '0')}${String(min.getDate()).padStart(2, '0')}`;
  return records.filter(r => !r.fecha8 || r.fecha8 >= min8);
}

export async function loadSICs(token, months, onProgress = () => {}, { force = false } = {}) {
  const cached = (await storageGet(CONFIG.sicKey)) ?? null;
  if (cached?.records) cached.records = pruneByRetention(cached.records);
  if (!force && cached && cached.months >= months && Date.now() - cached.savedAt < CONFIG.sicTtlMs) {
    onProgress(100);
    return { sics: cached.records, fromCache: true, savedAt: cached.savedAt, failed: 0 };
  }

  const to = new Date();
  const from = new Date(to);
  from.setMonth(from.getMonth() - months);
  const from8 = localDateStr(from), to8 = localDateStr(to);

  // (a) and (b) are the two listings Eloisa's UI performs (verified in the HAR).
  // (c) is speculative: SICs emitted by HHR but received elsewhere — if the API
  // rejects the state list for that origin the call is simply counted as failed.
  const [a, b, c] = await Promise.all([
    listIds(token, 'SOLICITUD_INTERCONSULTA', from8, to8, SIC_ESTADOS_ORIGEN,  'IDNODOORIGEN'),
    listIds(token, 'RECEPCION_CONTRALOR',     from8, to8, SIC_ESTADOS_DESTINO, 'IDNODODESTINO'),
    listIds(token, 'SOLICITUD_INTERCONSULTA', from8, to8, SIC_ESTADOS_DESTINO, 'IDNODOORIGEN'),
  ]);
  if (session.expired) throw new AuthError(401);
  let failed = (a === null) + (b === null) + (c === null);
  const ids = [...new Set([...(a ?? []), ...(b ?? []), ...(c ?? [])])];
  onProgress(5);

  const groups  = chunk(ids, CONFIG.sicIdsPerCall);
  const details = [];
  let done = 0;
  for (const batch of chunk(groups, CONFIG.sicBatch)) {
    const res = await Promise.all(batch.map(g => fetchDetails(token, g)));
    res.forEach(r => r === null ? failed++ : details.push(...r));
    done += batch.length;
    onProgress(5 + Math.round((done / Math.max(groups.length, 1)) * 95));
    if (session.expired) throw new AuthError(401);
    if (run.cancelled) break;
  }
  if (run.cancelled) failed += Math.max(0, groups.length - done);

  const sics = details.map(parseSIC);
  sics.sort((x, y) => (y.fecha8 || '').localeCompare(x.fecha8 || '') || y.id - x.id);

  const completedAt = Date.now();
  if (failed || run.cancelled) {
    // A partial list must not replace a previously complete snapshot. Keep it
    // visible, mark the source partial and retry the whole source next time.
    if (cached) return {
      sics: cached.records, fromCache: true, savedAt: cached.savedAt, failed,
      staleFallback: true, cancelled: run.cancelled,
    };
    return { sics, fromCache: false, savedAt: completedAt, failed, cancelled: run.cancelled };
  }
  await storageSet(CONFIG.sicKey, { records: pruneByRetention(sics), savedAt: completedAt, months });
  return { sics, fromCache: false, savedAt: completedAt, failed: 0 };
}

