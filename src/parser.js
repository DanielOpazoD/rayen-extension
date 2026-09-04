import { nameOf } from './text.js';
import { DOW_LABEL, SEXO_BY_ID } from './config.js';

// ── Date helpers ──────────────────────────────────────────────

/** Formats a Rayen date string "YYYYMMDD HHmmss" → "DD-MM-YYYY" */
export function fmtDate(raw = '') {
  const d = String(raw).replace(/\s.*/, '');
  if (d.length < 8 || d === '00010101') return '';
  return `${d.slice(6, 8)}-${d.slice(4, 6)}-${d.slice(0, 4)}`;
}

/** Extracts "HH:MM" from "YYYYMMDD HHmmss" */
export function fmtHora(raw = '') {
  if (raw.length < 13) return '';
  return `${raw.slice(9, 11)}:${raw.slice(11, 13)}`;
}

/** "YYYYMMDD" from a local Date (avoids UTC offset issues) */
export function localDateStr(d) {
  return [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, '0'),
    String(d.getDate()).padStart(2, '0'),
  ].join('');
}

/** Builds an array of YYYYMMDD strings from `from` to `to` (inclusive) */
export function dateRange(from, to) {
  const dates = [];
  const cur = new Date(from);
  while (cur <= to) {
    dates.push(localDateStr(new Date(cur)));
    cur.setDate(cur.getDate() + 1);
  }
  return dates;
}

/** Calculates age in years from a Rayen DOB string */
function calcAge(dob = '') {
  const d = String(dob).replace(/\s.*/, '');
  if (d.length < 8 || d === '00010101') return null;
  const bd = new Date(+d.slice(0, 4), +d.slice(4, 6) - 1, +d.slice(6, 8));
  const now = new Date();
  let age = now.getFullYear() - bd.getFullYear();
  if (now < new Date(now.getFullYear(), bd.getMonth(), bd.getDate())) age--;
  return age;
}

/** "DD-MM-YYYY" → sortable integer YYYYMMDD */
export function dateToInt(d = '') {
  const p = d.split('-');
  return p.length < 3 ? 0 : parseInt(p[2] + p[1] + p[0]);
}

/** "YYYYMMDD…" → weekday label */
function dowFromRaw(raw = '') {
  if (raw.length < 8) return '';
  return DOW_LABEL[new Date(+raw.slice(0, 4), +raw.slice(4, 6) - 1, +raw.slice(6, 8)).getDay()];
}

// ── RUN helpers ───────────────────────────────────────────────

function withDots(digits) {
  const parts = [];
  let r = digits;
  while (r.length > 3) { parts.unshift(r.slice(-3)); r = r.slice(0, -3); }
  parts.unshift(r);
  return parts.join('.');
}

/** Módulo 11 check digit for a RUN body (digits only). Returns '0'-'9' or 'K'. */
export function computeDv(body) {
  let sum = 0, mul = 2;
  for (let i = body.length - 1; i >= 0; i--) {
    sum += +body[i] * mul;
    mul = mul === 7 ? 2 : mul + 1;
  }
  const rest = 11 - (sum % 11);
  return rest === 11 ? '0' : rest === 10 ? 'K' : String(rest);
}

/**
 * Normalises a RUN as Rayen returns it: digits with the check digit glued on
 * and no separators ("25106217k", "292421311"). Also accepts already-formatted
 * input ("17.752.753-K"). The last character is ALWAYS the DV.
 *
 * @returns {{ run: string|null, runStr: string, dvOk: boolean }}
 *   run    = "25106217K" (canonical key), runStr = "25.106.217-K"
 */
/**
 * Los laboratorios entregan todo en mayúsculas («PEREZ SOTO, JUAN», «PERFIL
 * LIPIDICO»). En pantalla se lee mejor en caja de oración. Sólo actúa sobre
 * texto que venga íntegramente en mayúsculas; lo ya mixto se respeta. Con
 * `siglas` las palabras de hasta tres letras se conservan en mayúscula (VHS,
 * TSH, PCR), útil para exámenes pero no para nombres (Ana, Luz).
 */
export function humanCase(s = '', { siglas = false } = {}) {
  const t = String(s).trim();
  if (!t || t !== t.toUpperCase() || !/[A-ZÁÉÍÓÚÑ]/.test(t)) return t;
  const minusculas = new Set(['de', 'del', 'la', 'las', 'el', 'los', 'y', 'e', 'con', 'por', 'en', 'a']);
  return t.toLowerCase().replace(/\p{L}[\p{L}\p{M}]*/gu, (w, i) => {
    if (i > 0 && minusculas.has(w)) return w;
    if (siglas && w.length <= 3) return w.toUpperCase();
    return w[0].toUpperCase() + w.slice(1);
  });
}

export function formatRun(raw) {
  if (raw == null) return { run: null, runStr: '', dvOk: false };
  const s = String(raw).replace(/[.\-\s]/g, '').toUpperCase();
  if (!/^\d{2,8}[\dK]$/.test(s)) return { run: null, runStr: '', dvOk: false };
  const dv = s.slice(-1), body = s.slice(0, -1);
  return { run: body + dv, runStr: `${withDots(body)}-${dv}`, dvOk: computeDv(body) === dv };
}

/**
 * Decodes HistorialAtencion.EdadExacta: an integer packed as YY…MMDDHH
 * (54010817 → 54 años, 1 mes, 8 días, 17 horas; 51118 → 5 meses 11 días).
 */
export function decodeEdadExacta(n) {
  const s = String(n ?? '');
  if (!/^\d+$/.test(s)) return null;
  const p = s.padStart(6, '0');
  const hours = +p.slice(-2), days = +p.slice(-4, -2), months = +p.slice(-6, -4);
  const years = +(p.slice(0, -6) || 0);
  const label = years >= 2 ? `${years} a`
    : years >= 1 ? `${years} a ${months} m`
    : months >= 1 ? `${months} m ${days} d`
    : `${days} d`;
  return { years, months, days, hours, label };
}

/** Key used to match a cita with the atención of the same patient on the same day. */
export function matchKey(r) {
  const who = r.run ?? String(r.nombre ?? '').toLowerCase().replace(/\s+/g, ' ').trim();
  return `${who}|${r.fecha8}`;
}

// ── Cita parser (Citas/ListaPacientesCitados) ─────────────────

function parseDesc(desc = '') {
  const citadoPor = (desc.match(/Citado por:\s*([^\r\n<]+)/) ?? [])[1]?.trim() ?? '';
  const sicNum    = (desc.match(/N°\s*Solicitud[^:]*:\s*(\d+)/) ?? [])[1]?.trim() ?? '';
  return { citadoPor, sicNum };
}


/** Fields of a cita already mapped by parseCita (used by the API explorer). */
export const CITA_KNOWN_FIELDS = new Set([
  'Id','FechaHoraInicio','FechaHoraTermino','EsCitaInterconsulta',
  'UsuarioAps','Cupos','Razon','Tag','TipoDeAtencion',
]);

/**
 * Transforms a raw Rayen cita object into a clean app record.
 * Returns null if the cita has no usable patient data.
 */
export function parseCita(cita) {
  const aps = cita.UsuarioAps;
  if (!aps?.NombreFormateado) return null;

  const fh   = cita.FechaHoraInicio ?? '';
  const esIC = cita.EsCitaInterconsulta === 1;
  const { citadoPor, sicNum } = esIC
    ? parseDesc(cita.Cupos?.[0]?.Descripcion ?? '')
    : { citadoPor: '', sicNum: '' };
  const { run, runStr } = formatRun(aps.Rut ?? aps.Run ?? aps.NumeroDocumento ?? null);

  return {
    id:     cita.Id,
    origen: 'cita',

    // Patient
    idUsp:     aps.Id ?? 0,
    run,
    runStr,
    nombre:    aps.NombreFormateado,
    nombres:   aps.Nombres ?? '',
    ap:        aps.ApellidoPaterno ?? '',
    am:        aps.ApellidoMaterno ?? '',
    dob:       fmtDate(aps.FechaDeNacimiento ?? aps.FechaNacimiento ?? ''),
    edad:      calcAge(aps.FechaDeNacimiento ?? aps.FechaNacimiento ?? ''),
    sexo:      nameOf(aps.Sexo),
    prevision: nameOf(aps.ConvenioPrevisional) || nameOf(aps.InstitucionPrevisional),
    sector:    nameOf(aps.Sector),
    telefono:  (aps.Telefonos ?? []).filter(t => !t.Eliminado).map(t => t.TelefonoDescripcion).filter(Boolean).join(' / '),
    direccion: aps.Georeferencias?.[0]?.DireccionFormateada ?? '',

    // Appointment
    fecha8:        fh.slice(0, 8),
    fechaAtencion: fmtDate(fh),
    hora:          fmtHora(fh),
    diaSemana:     dowFromRaw(fh),
    razon:         cita.Razon ?? '',
    estado:        cita.Tag?.Nombre ?? '',
    tipoAtencion:  nameOf(cita.TipoDeAtencion) || cita.Cupos?.[0]?.TipoAtencion || '',

    // Interconsulta (as seen from the agenda)
    esIC,
    icCitadoPor: citadoPor,
    icSIC:       sicNum,

    // Clinical data — filled by mergeHistorial()
    atencionId:   null,
    diagnosticos: [],
    actividades:  [],
    prestadores:  [],
    adjuntos:     [],
    prestador:    '',
    esUrgencia:   false,
    esEspontanea: false,
  };
}

// ── Atención parser (FichaClinica/HistorialAtencion) ──────────

/** "Bronquitis aguda- (Confirmada) (AUGE)" → { clasificacion, certeza } */
function splitClasificacion(text = '') {
  const m = text.match(/^(.*?)-\s*\(([^)]+)\)/);
  return { clasificacion: (m?.[1] ?? text).trim(), certeza: m?.[2]?.trim() ?? '' };
}

export function parseDiagnostico(d) {
  const { clasificacion, certeza } = splitClasificacion(d.DescripcionClasificacion ?? '');
  const nombre = (d.DescripcionDiagnostico ?? '').replace(/\s+/g, ' ').trim();
  return {
    nombre:        nombre || clasificacion,
    clasificacion,
    certeza,
    codigo:        d.CodigoCIE10 ?? '',
    esAuge:        !!d.EsAuge,
    esENO:         !!d.EsENO,
  };
}

/**
 * Transforms one HistorialAtencion item into a compact atención record.
 * Only the fields the app uses are kept (the raw item is ~4 KB of mostly empty arrays).
 */
export function parseAtencion(a) {
  const fecha = a.Fecha ?? '';
  const { run, runStr } = formatRun(a.RutPaciente);
  const edadX = decodeEdadExacta(a.EdadExacta);
  const nac   = a.FechaNacimiento ?? '';

  return {
    id:      a.Id,
    idCita:  a.IdCita || 0,
    idUsp:   a.IdUsp ?? 0,
    origen:  'ficha',

    fecha8:        fecha.slice(0, 8),
    fechaAtencion: fmtDate(fecha),
    hora:          fmtHora(fecha),
    diaSemana:     dowFromRaw(fecha),

    run,
    runStr,
    nombre:    (a.NombreCompleto ?? '').replace(/\s+/g, ' ').trim(),
    dob:       fmtDate(nac),
    edad:      edadX?.years ?? calcAge(nac),
    edadLabel: edadX?.label ?? '',
    sexo:      SEXO_BY_ID[a.IdSexo] ?? '',

    tipoAtencion:  a.TipoDeAtencion ?? '',
    esUrgencia:    !!a.EsUrgencia,
    esEspontanea:  !!a.EsEspontanea,
    esDiada:       !!a.EsDiada,
    esOdontologica:!!a.EsOdontologica,
    esVacuna:      !!a.EsVacuna,

    diagnosticos: (a.Diagnosticos ?? []).map(parseDiagnostico),
    actividades:  (a.Actividades ?? []).map(x => ({
      codigo:         x.CodigoActividad ?? '',
      descripcion:    (x.Descripcion ?? '').replace(/^\d+\s+/, ''),
      instrumento:    x.Instrumento ?? '',
      esProcedimiento:!!x.EsProcedimiento,
      esVacuna:       !!x.EsVacuna,
    })),
    prestadores: (a.FuncionariosPrestadores ?? []).map(f => ({
      id:          f.Id,
      nombre:      f.NombreCompleto ?? '',
      instrumento: f.NombreInstrumento ?? '',
    })),
    adjuntos: (a.ArchivosAdjunto ?? []).map(x => ({ nombre: x.NombreArchivo ?? '', path: x.PathAzure ?? '' })),
    // "Orden de atención interna" = the next control the professional asked for.
    // Comes free with the day-level ficha and feeds the pendientes rules.
    proximoControl: (a.OrdenAtencionInterna ?? a.OrdenesAtencionInterna ?? [])
      .filter(o => !o.EsBorrado)
      .map(o => ({
        id:        o.Id,
        motivo:    String(o.Motivo ?? '').replace(/\s+/g, ' ').trim(),
        fecha8:    String(o.FechaSugerida ?? '').slice(0, 8).replace(/^00010101$/, ''),
        fecha:     fmtDate(o.FechaSugerida ?? ''),
        dias:      o.CuantosDiasMas ?? 0,
        prioritario: !!o.PrioridadAlta,
        descartada: !!(o.FechaDescarte && !String(o.FechaDescarte).startsWith('00010101')),
      })),
  };
}
