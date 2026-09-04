import { cleanText, nameOf } from './text.js';
import { CONFIG } from './config.js';
import { apiGet, apiPost, session } from './http.js';
import { parseAtencion, fmtDate, localDateStr, formatRun } from './parser.js';

/**
 * Per-patient ficha clínica, loaded on demand when the patient panel opens.
 * Sources (verified in the "acceso a ficha clínica" and "FICHA 2 SEPT" HARs):
 *   GET  Inscripcion/UsuarioApsRut/{rut}/{nodo}                 → master record (IdUsp, familia, dirección…)
 *   POST FichaClinica/HistorialAtencion {IdUsuario,…}           → 12 months, every section, all professionals
 *   GET  FichaClinica/RecuperarAntecedentes/{idUsp}             → fármacos en uso, antecedentes mórbidos, alergias
 *   GET  inscripcion/HistorialUsuarioApsEnProgramaSalud/IdUsuarioAps={idUsp} → programas de salud
 *   GET  fichaclinica/VigenciaExamenesUsuario/{idUsp}           → EMP / PAP / VPH vigencia alerts
 *   GET  FichaClinica/RiesgoMultiMorbilidad/IdUsuarioAPS={idUsp} → estratificación (G0–G3)
 *   GET  FichaClinica/EventoAdverso/AlertaRAM/{idUsp}           → reacciones adversas a medicamentos
 */

const FLAGS_ALL = Object.freeze({
  TraerActividades: true, TraerDiagnosticos: true, TraerPrescripciones: true,
  TraerExamenesSolicitados: true, TraerEspecialidadesDerivadas: true, TraerExamenesFisicos: true,
  TraerItemsExamenesSegmentarios: true, TraerIndicaciones: true, TraerPrescripcionesExtraConsultorio: true,
  TraerOrdenesAtencionInterna: true, TraerAnamnesis: true, TraerFuncionariosPrestadores: true,
  TraerRecetas: true, TraerOrdenAtencionPruebaDiagnostica: true, TraerEpisodioAtencion: true,
  TraerEnmendaciones: true, TraerLicenciasMedicasElectronicasOtorgadas: true,
});

const memo = new Map(); // key → { savedAt, ficha }
const TTL = 30 * 60 * 1000;

const isRayenDate = v => /^\d{8} \d{4,6}$/.test(String(v));

// ── Generic item description (fallback for sections whose shape is not captured yet) ──

const LABEL_KEYS = ['Descripcion','Nombre','Glosa','NombreArticulo','Articulo','NombreExamen','Examen','NombrePrestacion','Prestacion','Indicacion','Texto','Detalle','Titulo','Especialidad','Medicamento','Motivo'];
const DETAIL_KEYS = ['Posologia','Dosis','Frecuencia','Duracion','DuracionTratamiento','Cantidad','ViaAdministracion','Via','Observacion','Observaciones','Indicaciones','Estado','DescripcionEstado','Tipo','NombreTipo','Laboratorio','Resultado','Urgente','DiasReposo','FechaInicio','FechaTermino','FechaHora','Fecha'];
const SKIP = /^(Id|Es|Time|Tiene)/;

function isPlain(v) { return v !== null && v !== undefined && v !== '' && v !== 0 && v !== false && typeof v !== 'object'; }

/** Best-effort one-line label + details for an arbitrary Rayen list item. */
export function describe(item) {
  if (typeof item !== 'object' || item === null) return { label: String(item), details: [] };
  let label = '';
  for (const k of LABEL_KEYS) {
    const v = item[k];
    if (typeof v === 'string' && v.trim()) { label = cleanText(v); break; }
    if (v && typeof v === 'object' && typeof v.Nombre === 'string' && v.Nombre.trim()) { label = cleanText(v.Nombre); break; }
  }
  const details = [];
  for (const k of DETAIL_KEYS) {
    const v = item[k];
    if (isPlain(v)) details.push(`${k}: ${isRayenDate(v) ? fmtDate(String(v)) : v}`);
    else if (v && typeof v === 'object' && typeof v.Nombre === 'string' && v.Nombre) details.push(`${k}: ${v.Nombre}`);
  }
  if (!label) {
    for (const [k, v] of Object.entries(item)) {
      if (SKIP.test(k)) continue;
      if (typeof v === 'string' && v.trim().length > 1) { label = cleanText(v); break; }
      if (v && typeof v === 'object' && typeof v.Nombre === 'string' && v.Nombre.trim()) { label = cleanText(v.Nombre); break; }
    }
  }
  return { label: label || '(sin descripción)', details, raw: item };
}

// ── Exact mappers for the sections captured in the HARs ──

/** "Losartan 50 mg : 1 comprimido cada 12 horas por 12 meses de la Receta Nº 593522430" */
function mapPrescripcion(p) {
  const txt = cleanText(p.Descripcion);
  const m = txt.match(/^(.*?)\s*de la Receta N[º°]\s*(\d+)/i);
  const details = [];
  if (p.IdReceta || m?.[2]) details.push(`Receta Nº ${p.IdReceta || m[2]}`);
  if (p.Suspendido) details.push('SUSPENDIDO');
  if (p.EsExterna)  details.push('externa');
  if (cleanText(p.Observacion)) details.push(cleanText(p.Observacion));
  return { label: m?.[1] ?? txt, details, suspendido: !!p.Suspendido, raw: p };
}

function mapReceta(r) {
  const details = [];
  if (r.EstadoReceta) details.push(r.EstadoReceta);
  if (r.FechaGeneracion && r.FechaGeneracion !== '00010101 000000') details.push(`emitida ${fmtDate(r.FechaGeneracion)}`);
  if (r.FechaProximoDespacho && r.FechaProximoDespacho !== '00010101 000000') details.push(`próx. despacho ${fmtDate(r.FechaProximoDespacho)}`);
  if (r.EsIniciativaHearts) details.push('HEARTS');
  if (r.EsExterna) details.push('externa');
  return { label: `Receta Nº ${r.Id}${r.TipoReceta ? ` · ${r.TipoReceta}` : ''}`, details, raw: r };
}

/** Orden de atención interna = próximo control sugerido por el profesional. */
function mapOrdenInterna(o) {
  const details = [];
  if (o.FechaSugerida && o.FechaSugerida !== '00010101 000000') details.push(`sugerido ${fmtDate(o.FechaSugerida)}${o.CuantosDiasMas ? ` (+${o.CuantosDiasMas} d)` : ''}`);
  if (o.PrioridadAlta) details.push('prioridad alta');
  if (o.FechaDescarte && o.FechaDescarte !== '00010101 000000') details.push(`descartada ${fmtDate(o.FechaDescarte)}`);
  return { label: cleanText(o.Motivo) || 'Control', details, raw: o };
}

function mapPrueba(p) {
  return { label: cleanText(p.Descripcion), details: [p.Estado].filter(Boolean), raw: p };
}

function mapDerivacion(d) {
  return { label: cleanText(d.Descripcion), details: [], raw: d };
}

const SECTIONS = [
  ['prescripciones', 'Prescripciones',                 ['Prescripciones'],                       mapPrescripcion],
  ['recetas',        'Recetas',                        ['Recetas'],                              mapReceta],
  ['prescExtra',     'Prescripciones extra-consultorio', ['PrescripcionesExtraConsultorio'],     describe],
  ['examenes',       'Exámenes solicitados',           ['ExamenesSolicitados', 'OrdenesExamenes'], describe],
  ['pruebas',        'Pruebas diagnósticas',           ['OrdenAtencionPruebaDiagnostica'],       mapPrueba],
  ['indicaciones',   'Indicaciones',                   ['Indicaciones'],                         describe],
  ['proximoControl', 'Próximo control (orden interna)', ['OrdenAtencionInterna', 'OrdenesAtencionInterna'], mapOrdenInterna],
  ['derivaciones',   'Derivaciones',                   ['EspecialidadesDerivadas'],              mapDerivacion],
  ['ic',             'Solicitudes de interconsulta',   ['SolicitudesInterconsulta'],             describe],
  ['ordenes',        'Órdenes de atención',            ['OrdenesAtencion'],                      describe],
  ['licencias',      'Licencias médicas',              ['LicenciasMedicasElectronicasOtorgadas', 'LicenciasMedicas'], describe],
  ['examenFisico',   'Examen físico',                  ['ExamenesFisicos', 'ItemsExamenesSegmentarios'], describe],
  ['alergias',       'Alergias',                       ['Alergias'],                             describe],
  ['habitos',        'Hábitos / factores de riesgo',   ['Habitos', 'FactoresRiesgos'],           describe],
  ['morbidos',       'Antecedentes mórbidos',          ['MorbidosPersonalesMedicos', 'MorbidosPersonalesQuirurgicos', 'MorbidosFamiliares'], describe],
  ['enmendaciones',  'Enmendaciones',                  ['Enmendaciones'],                        describe],
];
export const SECTION_LABELS = Object.fromEntries(SECTIONS.map(([id, label]) => [id, label]));

/** Full per-visit ficha record: parseAtencion() + every clinical section. */
export function parseFichaAtencion(a) {
  const base = parseAtencion(a);
  const anam = (a.Anamnesis ?? [])[0] ?? {};
  const sections = {};
  for (const [id, , keys, map] of SECTIONS) {
    const items = keys.flatMap(k => Array.isArray(a[k]) ? a[k] : []);
    if (items.length) sections[id] = items.map(map);
  }
  return {
    ...base,
    anamnesis: {
      motivo:   (anam.MotivoConsulta ?? '').trim(),
      historia: (anam.HistoriaEnfermedadActual ?? '').trim(),
    },
    sections,
  };
}

// ── Antecedentes (RecuperarAntecedentes) ──

/** "Losartan … por 12 meses \n Nº Receta: 593522430. Estado Receta: Pendiente" */
export function parseAntecedentes(d) {
  if (!d || typeof d !== 'object') return { farmacos: [], morbidos: [], alergias: [], eventosAdversos: [] };
  const farmacos = (d.farmacoEnUsos?.medications ?? []).map(m => {
    const txt = cleanText(m.Descripcion);
    const estado = (txt.match(/Estado Receta:\s*([^.]+)/i) ?? [])[1]?.trim() ?? '';
    return {
      label:   cleanText(m.DescripcionArticulo) || txt.split(/N[º°] Receta/i)[0].trim(),
      posologia: (txt.split(/N[º°] Receta/i)[0].split(':').slice(1).join(':')).trim(),
      receta:  m.IdReceta ?? 0,
      fecha:   fmtDate(m.FechaReceta ?? ''),
      estado,
      hearts:  !!m.EsHearts,
    };
  });
  const morbidos = (d.antecedenteMedicoPersonal ?? [])
    .filter(x => x.Seleccionado !== false && !x.EsBorrado)
    .map(x => ({ label: cleanText(x.Diagnostico), fecha: fmtDate(x.Fecha ?? ''), morbido: !!x.EsMorbido }));

  // `alergia` / `eventoAdverso` mix catalogs (reaccionAdversa, categories…) with the
  // patient's own entries; keep only lists whose items reference the patient.
  const own = obj => Object.values(obj ?? {}).filter(Array.isArray).flat()
    .filter(x => x && typeof x === 'object' && ('IdUsuarioAps' in x || 'IdUsuarioAPS' in x) && !x.EsBorrado)
    .map(describe);
  return { farmacos, morbidos, alergias: own(d.alergia), eventosAdversos: own(d.eventoAdverso) };
}

/** Latest event per programa de salud. Estado 1 = ingreso (verified); other codes shown as-is. */
export function parseProgramas(list) {
  const by = new Map();
  for (const p of Array.isArray(list) ? list : []) {
    if (p.EsBorrado) continue;
    const cur = by.get(p.IdPrograma);
    if (!cur || (p.FechaHora ?? '') > cur.fechaRaw) {
      by.set(p.IdPrograma, {
        nombre: p.NombrePrograma ?? '', estado: p.Estado, fechaRaw: p.FechaHora ?? '',
        fecha: fmtDate(p.FechaHora ?? ''), profesional: p.NombreFuncionarioPrestador ?? '',
        vigente: p.Estado === 1,
      });
    }
  }
  return [...by.values()].sort((a, b) => b.fechaRaw.localeCompare(a.fechaRaw));
}

export function parseMaster(u) {
  if (!u) return null;
  const tel = (u.Telefonos ?? []).filter(t => !t.Eliminado && !t.EsBorrado).map(t => t.TelefonoDescripcion).filter(Boolean);
  const fam = u.Familia ?? {};
  return {
    idUsp:        u.Id,
    ficha:        u.NumeroDeFicha ?? '',
    nombre:       u.NombreFormateado ?? '',
    nombreSocial: u.NombreSocial ?? '',
    apodo:        u.NombreAlQueResponde ?? '',
    run:          formatRun(u.Rut).runStr,
    dob:          fmtDate(u.FechaDeNacimiento ?? ''),
    sexo:         nameOf(u.Sexo),
    genero:       nameOf(u.Genero),
    prevision:    nameOf(u.ConvenioPrevisional) || nameOf(u.InstitucionPrevisional),
    telefonos:    tel.join(' / '),
    email:        u.EMail ?? '',
    direccion:    u.Georeferencias?.[0]?.DireccionFormateada || u.Direccion || '',
    familia:      fam.CodigoDeFamiliaCompleto ?? '',
    parentesco:   nameOf(u.ParentescoConJefeDeFamilia),
    ocupacion:    nameOf(u.Ocupacion),
    escolaridad:  nameOf(u.Escolaridad) || nameOf(u.UltimoCursoAprobado),
    nacionalidad: nameOf(u.Nacionalidad),
    etnia:        nameOf(u.GrupoEtnico),
    grupoSang:    [nameOf(u.GrupoSanguineo), nameOf(u.FactorRH)].filter(Boolean).join(' '),
    inscripcion:  fmtDate(u.FechaInscripcion ?? ''),
    activo:       u.EstaActivo !== false,
    pasivacion:   nameOf(u.MotivoDePasivacion),
    fallecido:    fmtDate(u.FechaDeFallecimiento ?? ''),
    cuidador:     !!u.EsCuidador,
    movilidadReducida: !!u.MovilidadReducida,
    nodoInscripcion: u.IdNodo ?? 0,
  };
}

/**
 * @param {string} token
 * @param {{ run: string|null, idUsp?: number }} who
 * @param {{ force?: boolean }} opts
 */
export async function loadFicha(token, { run, idUsp = 0 }, { force = false } = {}) {
  const key = run ?? `usp_${idUsp}`;
  const hit = memo.get(key);
  if (!force && hit && Date.now() - hit.savedAt < TTL) return hit.ficha;

  const errors = [];
  let master = null;
  if (run) {
    try {
      const d = await apiGet(token, `/API/api/rayen/Inscripcion/UsuarioApsRut/${run.toLowerCase()}/${CONFIG.nodeId}`);
      master = parseMaster(Array.isArray(d) ? d[0] : d);
    } catch (e) { errors.push(`Ficha administrativa: ${e.message}`); }
  }
  const id = master?.idUsp || idUsp;
  const empty = { master, visits: [], antecedentes: parseAntecedentes(null), programas: [], vigencia: [], riesgo: [], ram: [], errors, savedAt: Date.now() };
  if (!id) return { ...empty, errors: [...errors, 'No se pudo identificar al paciente (sin IdUsuario).'] };

  // Whole electronic record: Rayen at HHR started in 2026, but the API accepts any
  // window; 10 years covers everything without a noticeable size difference.
  const to = new Date(), from = new Date(to);
  from.setFullYear(from.getFullYear() - CONFIG.fichaYears);
  const soft = (p, label) => p.catch(e => { errors.push(`${label}: ${e.message}`); return null; });

  const [hist, ant, prog, vig, riesgo, ram] = await Promise.all([
    soft(apiPost(token, '/API/api/rayen/FichaClinica/HistorialAtencion', {
      IdUsuario: id, IdFuncionarioPrestador: null,
      FechaInicio: `${localDateStr(from)} 000000`, FechaTermino: `${localDateStr(to)} 235900`,
      ...FLAGS_ALL,
    }), 'Historial'),
    soft(apiGet(token, `/API/api/rayen/FichaClinica/RecuperarAntecedentes/${id}`), 'Antecedentes'),
    soft(apiGet(token, `/API/api/rayen/inscripcion/HistorialUsuarioApsEnProgramaSalud/IdUsuarioAps=${id}`), 'Programas'),
    // Estas tres también pasan por soft(): antes devolvían [] en silencio, y un
    // paciente con RAM registrada se veía idéntico a uno sin ella cuando el
    // endpoint fallaba, sin que el contador de errores del panel lo supiera.
    soft(apiGet(token, `/API/api/rayen/fichaclinica/VigenciaExamenesUsuario/${id}`), 'Vigencias PAP/EMP'),
    soft(apiGet(token, `/API/api/rayen/FichaClinica/RiesgoMultiMorbilidad/IdUsuarioAPS=${id}`), 'Riesgo multimorbilidad'),
    soft(apiGet(token, `/API/api/rayen/FichaClinica/EventoAdverso/AlertaRAM/${id}`), 'Alergias y RAM'),
  ]);

  if (session.expired) errors.push('Sesión de Eloisa vencida — vuelve a iniciar sesión');
  const visits = (Array.isArray(hist) ? hist : []).map(parseFichaAtencion)
    .sort((a, b) => (b.fecha8 + b.hora).localeCompare(a.fecha8 + a.hora));

  const ficha = {
    ...empty,
    visits,
    antecedentes: parseAntecedentes(ant),
    programas:    parseProgramas(prog),
    vigencia: (Array.isArray(vig) ? vig : []).map(v => ({ ok: !!v.Ok, mensaje: v.Mensaje ?? '', alerta: v.Alert ?? 0 })),
    riesgo:   (Array.isArray(riesgo) ? riesgo : []).filter(r => r.Activo !== false)
                .map(r => ({ estrato: r.Estratificacion ?? '', fecha: fmtDate(r.FechaHoraIngreso ?? '') })),
    ram:      (Array.isArray(ram) ? ram : []).map(describe),
    errors,
    savedAt: Date.now(),
  };
  memo.set(key, { savedAt: ficha.savedAt, ficha });
  return ficha;
}
