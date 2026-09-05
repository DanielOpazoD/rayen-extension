import { state } from './state.js';
import { CONFIG } from '../core/config.js';
import { apiPost, chunk, session, run } from './http.js';
import { parseAtencion, matchKey, localDateStr, fmtDate } from '../core/parser.js';
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
  const pendientes = parsed.filter(a => isOfficer(a) && !a.esUrgencia && !a.idCita && !a.fechaCita8 && a.idUsp && a.fecha8 && !citaKeys.has(matchKey(a)));
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
 * @param {{ refreshDates?: Set<string>, onlyDates?: Set<string>|null }} opts dates whose appointment state was
 *   still mutable, or a restricted set requested by the synchronization retry
 * @returns {Promise<{ atenciones: object[], team: Record<string, object>, failed: number,
 *   failedDates: string[], pendingDates: string[], attemptedCount: number, fromCache: boolean }>}
 */
export async function loadHistorial(token, dates8, citaKeys, onProgress = () => {}, {
  refreshDates = new Set(), onlyDates = null,
} = {}) {
  const store = await loadStore(CONFIG.historialKey);
  store.extra.team ??= {};

  const min = new Date();
  min.setMonth(min.getMonth() - (state.prefs?.retentionMonths ?? CONFIG.retentionMonths));
  pruneStore(store, localDateStr(min));

  const todayStr = localDateStr(new Date());
  const toFetch  = onlyDates
    ? [...onlyDates].filter(d => /^\d{8}$/.test(d) && d >= localDateStr(min) && d <= todayStr)
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
      keep.push(...parsed.filter(a => isOfficer(a) || citaKeys.has(matchKey(a))));
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
/** Estado de agenda que descarta la cita: no vino, se anuló o se suspendió. Cualquier otro puede recibir una ficha. */
const citaDescartada = estado => /\bno\s+(atendid|se\s+present)|anulad|cancelad|suspendid/i.test(String(estado));
const ANTES_DIAS = 14, DESPUES_DIAS = 7;
const aDate = d8 => new Date(+d8.slice(0, 4), +d8.slice(4, 6) - 1, +d8.slice(6, 8));
const diasEntre = (d8a, d8b) => Math.round((aDate(d8b) - aDate(d8a)) / 86_400_000);

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
    // sólo se cruza la que registró el propio oficial. Decisión de Daniel
    // (03-09-2026): «quiero ver sólo mis diagnósticos». Antes, una cita
    // atendida sin registro propio heredaba la atención de la matrona y ese
    // diagnóstico ajeno seguía a Pacientes, a Hoy, a las estadísticas y a las
    // exportaciones como si fuera suyo. Quién más atendió ese día queda como
    // pista (`otrosEseDia`), sin heredar nada.
    const cands = (idx.get(matchKey(c)) ?? []).filter(x => !used.has(x.id));
    const a = cands.find(isOfficer);
    if (!a) {
      const otros = [...new Set(cands.flatMap(x => x.prestadores.map(p => p.nombre)).filter(Boolean))];
      return otros.length ? { ...c, otrosEseDia: otros.join(', ') } : c;
    }
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

  // Ficha guardada otro día: la consulta por nodo no trae FechaCita, así que una
  // atención mía sin cita ese día se cruza con la cita más cercana del mismo
  // paciente, hasta 14 días antes (ficha cerrada tarde) o 7 después (ficha
  // abierta la víspera, como los jueves para las citas del viernes). La fecha
  // que manda es la de la cita (decisión de Daniel, 04-09-2026); el guardado
  // queda en `fechaRegistro`.
  const enlazar = (i, a, estimado) => {
    used.add(a.id);
    out[i] = {
      ...out[i],
      atencionId: a.id, diagnosticos: a.diagnosticos, actividades: a.actividades, prestadores: a.prestadores, adjuntos: a.adjuntos,
      prestador: a.prestadores.map(p => p.nombre).join(', '), esUrgencia: a.esUrgencia, esEspontanea: a.esEspontanea,
      tipoAtencion: out[i].tipoAtencion || a.tipoAtencion, edadLabel: a.edadLabel, sexo: out[i].sexo || a.sexo,
      proximoControl: a.proximoControl ?? [], fechaRegistro: a.fechaAtencion, ...(estimado ? { cruceEstimado: true } : {}),
    };
  };
  // Cruce exacto: la cita que Rayen mismo declara (resolverCitas), por id o por su fecha.
  const porId = new Map(), porRunDia = new Map();
  out.forEach((c, i) => { if (c.origen === 'cita' && !c.atencionId) { porId.set(c.id, i); porRunDia.set(matchKey(c), i); } });
  for (const a of atenciones) {
    if (used.has(a.id) || !isOfficer(a)) continue;
    let i = a.idCita ? porId.get(a.idCita) : undefined;
    if (i === undefined && a.fechaCita8) i = porRunDia.get(matchKey({ ...a, fecha8: a.fechaCita8 }));
    if (i !== undefined && !out[i].atencionId) enlazar(i, a, false);
  }
  // Heurística, sólo para lo que no pudo resolverse: la cita más cercana, marcada como estimada.
  const porRun = new Map();
  out.forEach((c, i) => { if (c.origen === 'cita' && !c.atencionId && !citaDescartada(c.estado)) { const k = matchKey({ ...c, fecha8: '' }); (porRun.get(k) ?? porRun.set(k, []).get(k)).push(i); } });
  for (const a of atenciones) {
    if (used.has(a.id) || !isOfficer(a) || a.esUrgencia || a.idCita || a.fechaCita8) continue;
    const dist = i => diasEntre(out[i].fecha8, a.fecha8); // > 0: cita antes del guardado; < 0: después
    const cands = (porRun.get(matchKey({ ...a, fecha8: '' })) ?? []).filter(i => !out[i].atencionId && dist(i) !== 0 && dist(i) <= ANTES_DIAS && -dist(i) <= DESPUES_DIAS);
    if (!cands.length) continue;
    enlazar(cands.sort((x, y) => Math.abs(dist(x)) - Math.abs(dist(y)) || dist(y) - dist(x))[0], a, true);
  }

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
