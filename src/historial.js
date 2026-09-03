import { CONFIG } from './config.js';
import { apiPost, chunk, session, run } from './http.js';
import { parseAtencion, matchKey, localDateStr } from './parser.js';
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
    });
    return Array.isArray(data) ? data : null;
  } catch {
    return null;
  }
}

/** Per-day aggregate for the whole node (team view) — small enough to keep for every day. */
export function aggregateTeam(atenciones) {
  const agg = { total: atenciones.length, byInstrumento: {}, byPrestador: {}, byTipo: {}, urgencias: 0, espontaneas: 0 };
  const inc = (obj, k) => { if (k) obj[k] = (obj[k] ?? 0) + 1; };
  for (const a of atenciones) {
    inc(agg.byTipo, a.tipoAtencion || '(sin tipo)');
    if (a.esUrgencia)   agg.urgencias++;
    if (a.esEspontanea) agg.espontaneas++;
    // One atención may have several prestadores (e.g. diada); count each
    const seen = new Set();
    for (const p of a.prestadores) {
      if (seen.has(p.id)) continue;
      seen.add(p.id);
      inc(agg.byPrestador, p.nombre);
      inc(agg.byInstrumento, p.instrumento || '(sin instrumento)');
    }
  }
  return agg;
}

function isOfficer(a) {
  return a.prestadores.some(p => p.id === CONFIG.officerId);
}

/**
 * Loads (cache-first) the node's HistorialAtencion for `dates8`, keeping only the
 * atenciones that belong to the officer or that match one of `citaKeys`
 * (matchKey of the citas already loaded). Everything else is reduced to a
 * per-day team aggregate.
 *
 * @param {{ refreshDates?: Set<string> }} opts dates whose appointment state was
 *   still mutable; their clinical detail must be refreshed along with the agenda
 * @returns {Promise<{ atenciones: object[], team: Record<string, object>, failed: number }>}
 */
export async function loadHistorial(token, dates8, citaKeys, onProgress = () => {}, { refreshDates = new Set() } = {}) {
  const store = await loadStore(CONFIG.historialKey);
  store.extra.team ??= {};

  const min = new Date();
  min.setMonth(min.getMonth() - CONFIG.retentionMonths);
  pruneStore(store, localDateStr(min));

  const todayStr = localDateStr(new Date());
  const toFetch  = dates8.filter(d => !store.fetchedDates.has(d) || d === todayStr || refreshDates.has(d));
  let done = 0, failed = 0;
  onProgress(toFetch.length ? 0 : 100);

  for (const batch of chunk(toFetch, CONFIG.historialBatch)) {
    const responses = await Promise.all(batch.map(d => fetchHistorialDay(token, d)));
    const okDates = [];
    const keep    = [];
    let retryMarkerChanged = false;

    responses.forEach((raw, i) => {
      const d8 = batch[i];
      if (raw === null) {
        failed++;
        // If the agenda just moved from a mutable to a terminal state, this is
        // our last automatic forced refresh. Leave the history date incomplete
        // so the next load retries it even though the agenda is now closed.
        if (refreshDates.has(d8)) {
          retryMarkerChanged = store.fetchedDates.delete(d8) || retryMarkerChanged;
        }
        return;
      }
      okDates.push(d8);
      dropDay(store, d8);
      const parsed = raw.map(parseAtencion).filter(a => a.fecha8 === d8 || !a.fecha8);
      store.extra.team[d8] = aggregateTeam(parsed);
      keep.push(...parsed.filter(a => isOfficer(a) || citaKeys.has(matchKey(a))));
    });

    if (okDates.length || retryMarkerChanged) await saveStore(store, okDates, keep);
    done += batch.length;
    onProgress(Math.round((done / toFetch.length) * 100));
    if (session.expired || run.cancelled) break;
  }

  const wanted = new Set(dates8);
  return {
    atenciones: [...store.records.values()].filter(a => wanted.has(a.fecha8)),
    team:       Object.fromEntries(Object.entries(store.extra.team).filter(([d]) => wanted.has(d))),
    failed,
  };
}

/**
 * Enriches citas with their atención (matched by RUN + day, since IdCita is 0 in
 * HistorialAtencion) and appends the officer's atenciones that have no cita
 * (espontáneas) as extra rows.
 */
export function mergeHistorial(citas, atenciones) {
  const idx = new Map();
  for (const a of atenciones) {
    const k = matchKey(a);
    if (!idx.has(k)) idx.set(k, []);
    idx.get(k).push(a);
  }
  for (const list of idx.values()) list.sort((x, y) => x.hora.localeCompare(y.hora));

  const used = new Set();
  const out  = citas.map(c => {
    // Same patient may have several atenciones that day (kinesiólogo, matrona…):
    // prefer the one where the officer is a prestador, then the earliest unused.
    const cands = (idx.get(matchKey(c)) ?? []).filter(x => !used.has(x.id));
    const a = cands.find(isOfficer) ?? cands[0];
    if (!a) return c;
    used.add(a.id);
    return {
      ...c,
      atencionId:   a.id,
      diagnosticos: a.diagnosticos,
      actividades:  a.actividades,
      prestadores:  a.prestadores,
      adjuntos:     a.adjuntos,
      prestador:    a.prestadores.map(p => p.nombre).join(', '),
      esUrgencia:   a.esUrgencia,
      esEspontanea: a.esEspontanea,
      tipoAtencion: c.tipoAtencion || a.tipoAtencion,
      edadLabel:    a.edadLabel,
      sexo:         c.sexo || a.sexo,
      proximoControl: a.proximoControl ?? [],
    };
  });

  for (const a of atenciones) {
    if (used.has(a.id) || !isOfficer(a)) continue;
    out.push({
      ...a,
      id:          `att_${a.id}`,
      atencionId:  a.id,
      nombres: '', ap: '', am: '',
      prevision: '', sector: '', razon: '', telefono: '', direccion: '',
      estado:      a.esEspontanea ? 'Espontánea' : 'Sin cita',
      esIC: false, icCitadoPor: '', icSIC: '',
      prestador:   a.prestadores.map(p => p.nombre).join(', '),
    });
  }
  return out;
}
