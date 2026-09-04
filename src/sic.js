import { CONFIG, SIC_ESTADOS, SIC_ESTADOS_ORIGEN, SIC_ESTADOS_DESTINO, sicGrupo } from './config.js';
import { apiGet, apiPost, rayenParams, chunk, session, run, AuthError } from './http.js';
import { formatRun, fmtDate, localDateStr } from './parser.js';
import { storageGet, storageSet } from './cache.js';

const BASE = '/API/api/rayen/ReferenciaYContrarreferencia';

// ── Parsing ────────────────────────────────────────────────────

function nameOf(v) {
  return typeof v === 'string' ? v : (v?.Nombre ?? '');
}

/**
 * Compacts one item of SolicitudInterconsultaDerivacionPorIds (~5 KB) into the
 * fields the app shows. `contrarrefs` = matching rows of
 * ObtenerHistorialContrarreferenciasPorSicIds.
 */
export function parseSIC(raw, contrarrefs = []) {
  const si  = raw.SolicitudInterconsulta ?? {};
  const u   = raw.UsuarioApsDerivacion ?? {};
  const dx0 = raw.ArrDiagnosticos?.find(d => d.EsPrincipal) ?? raw.ArrDiagnosticos?.[0];
  const { run, runStr } = formatRun(u.Rut);
  const estadoId = si.Estado ?? 0;
  const ejecutor = si.FuncionarioPrestadorEjecutor ?? raw.FuncionarioPrestadorEjecutor ?? {};

  return {
    id:             Number(raw.NumeroSolicitud ?? raw.Id),
    fecha:          raw.FechaHora ?? fmtDate(si.FechaHora ?? ''),
    fecha8:         (si.FechaHora ?? '').slice(0, 8),
    fechaCreacion:  raw.FechaHoraCreacion ?? '',
    fechaEnvio:     raw.FechaHoraEnvioFormateado ?? '',
    fechaCita:      raw.FechaHoraCita ?? '',
    // null cuando la API no lo trae: con `?? 0` las reglas de pendientes nunca
    // llegaban a calcular los días por su cuenta y una SIC de ocho meses sin
    // contrarreferencia no aparecía.
    antiguedadDias: Number.isFinite(raw.AntiguedadDias) ? raw.AntiguedadDias : null,
    prioridad:      raw.Prioridad ?? si.Prioridad ?? 0,

    estadoId,
    estado:  raw.Estado || raw.DescripcionEstado || SIC_ESTADOS[estadoId] || `Estado ${estadoId}`,
    grupo:   sicGrupo(estadoId),

    especialidad:       raw.Especialidad ?? '',
    especialidadOrigen: si.EspecialidadNodoOrigen?.NombreEspecialidad ?? '',
    motivo:             raw.MotivoInterconsulta ?? '',
    problemaSalud:      raw.ProblemaSalud ?? '',
    esAuge:             /^s/i.test(String(raw.EsAuge ?? '')) || !!si.EsGES,

    diagnostico: raw.Diagnostico || dx0?.ClasificacionDiagnostica || '',
    cie10:       dx0?.CodigoCIE10 ?? '',
    hipotesis:   (dx0?.HipotesisDiagnostica ?? '').trim(),
    fundamentos: (raw.FundamentosClinicos ?? '').trim(),
    examenes:    (raw.ExamenesRealizados ?? '').trim(),
    observaciones: (raw.ObservacionesInterconsulta || raw.Observaciones || si.ObservacionContralor || '').trim(),
    motivoCancelacion: raw.MotivoCancelacionSolicitud ?? '',

    origen:      raw.EstablecimientoOrigen ?? '',
    destino:     raw.EstablecimientoDestinoSIC ?? '',
    nodoOrigen:  si.IdNodoOrigen ?? 0,
    nodoDestino: si.IdNodoDestino ?? 0,

    paciente: {
      idUsp:       u.Id ?? si.IdUsuarioAps ?? 0,
      run, runStr,
      nombre:      u.NombreFormateado ?? '',
      dob:         fmtDate(u.FechaNacimiento ?? ''),
      edad:        u.Edad ?? '',
      sexo:        nameOf(u.Sexo),
      prevision:   nameOf(u.ConvenioPrevisional),
      telefono:    (u.Telefonos ?? []).filter(t => !t.Eliminado).map(t => t.TelefonoDescripcion).filter(Boolean).join(' / '),
      direccion:   u.Georeferencias?.[0]?.DireccionFormateada ?? '',
      tipoUsuario: u.TipoUsuario ?? '',
    },
    registrador: {
      id:     si.IdFuncionarioRegistrador ?? 0,
      nombre: raw.FuncionarioPrestadorRegistrador?.NombreFormateado ?? '',
    },
    ejecutor: {
      id:     si.IdFuncionarioPrestadorEjecutor ?? 0,
      nombre: ejecutor.NombreFormateado ?? '',
    },
    contrarreferencias: contrarrefs.map(c => ({
      fecha:           fmtDate(c.FechaRegistro ?? ''),
      especialidad:    c.Especialidad ?? '',
      profesional:     [c.NombreProfesional, c.ApellidoPaternoProfesional, c.ApellidoMaternoProfesional].filter(Boolean).join(' '),
      establecimiento: c.EstablecimientoContrarrefiere ?? '',
    })),
  };
}

/** True when the officer registered or is the executor of the SIC. */
export function isMine(sic) {
  return sic.registrador.id === CONFIG.officerId || sic.ejecutor.id === CONFIG.officerId;
}

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

async function fetchContrarrefs(token, ids) {
  try {
    const data = await apiPost(token, `${BASE}/ObtenerHistorialContrarreferenciasPorSicIds`, { ids });
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
export async function loadSICs(token, months, onProgress = () => {}, { force = false } = {}) {
  const cached = (await storageGet(CONFIG.sicKey)) ?? null;
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
    onProgress(5 + Math.round((done / Math.max(groups.length, 1)) * 75));
    if (session.expired) throw new AuthError(401);
    if (run.cancelled) break;
  }
  if (run.cancelled) failed += Math.max(0, groups.length - done);

  // Contrarreferencias, grouped by SIC id
  const byId = new Map();
  const detailIds = details.map(d => Number(d.NumeroSolicitud ?? d.Id));
  let cdone = 0;
  const cgroups = chunk(detailIds, CONFIG.sicIdsPerCall);
  for (const batch of chunk(cgroups, CONFIG.sicBatch)) {
    const res = await Promise.all(batch.map(g => fetchContrarrefs(token, g)));
    for (const rows of res) {
      if (rows === null) { failed++; continue; }
      for (const c of rows) {
        // Misma clave que la búsqueda de abajo: Number(). Si el endpoint devuelve
        // el id como texto —como ya hace su hermano con NumeroSolicitud— un Map
        // indexado por el tipo crudo no cruza nada y toda SIC atendida pasa a
        // «sin contrarreferencia» sin ningún error.
        const key = Number(c.IdSolicitud);
        if (!byId.has(key)) byId.set(key, []);
        byId.get(key).push(c);
      }
    }
    cdone += batch.length;
    onProgress(80 + Math.round((cdone / Math.max(cgroups.length, 1)) * 20));
  }

  const sics = details.map(d => parseSIC(d, byId.get(Number(d.NumeroSolicitud ?? d.Id)) ?? []));
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
  await storageSet(CONFIG.sicKey, { records: sics, savedAt: completedAt, months });
  return { sics, fromCache: false, savedAt: completedAt, failed: 0 };
}

/** Contact/demographic info per RUN, harvested from SIC patient payloads. */
export function contactsFromSICs(sics) {
  const map = new Map();
  for (const s of sics) {
    const p = s.paciente;
    if (!p.run) continue;
    const cur = map.get(p.run) ?? {};
    map.set(p.run, {
      telefono:    p.telefono    || cur.telefono    || '',
      direccion:   p.direccion   || cur.direccion   || '',
      prevision:   p.prevision   || cur.prevision   || '',
      tipoUsuario: p.tipoUsuario || cur.tipoUsuario || '',
      edad:        p.edad        || cur.edad        || '',
    });
  }
  return map;
}
