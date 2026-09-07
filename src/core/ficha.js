import { cleanText, nameOf } from './text.js';
import { parseAtencion, fmtDate, formatRun } from './parser.js';
import { date8FromDMY, edadAnios } from './dates.js';

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

/** @type {Array<[string, string, string[], (item: any) => any]>} */
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
/** Etiqueta legible de cada sección de la ficha, por id. */
export const SECTION_LABELS = Object.fromEntries(SECTIONS.map(([id, label]) => [id, label]));
const SECTION_KEYS = new Set(SECTIONS.flatMap(([, , keys]) => keys));

// ── Textos libres que la ficha no modela todavía ──
// Las atenciones de urgencia traen la evolución médica, el examen físico o la
// categorización en campos que HistorialAtencion no anuncia en ninguna lista
// conocida. En vez de perderlos en silencio, se recoge todo texto libre (con
// espacios, ≥ 20 caracteres) de la anamnesis, del episodio y del nivel superior
// que no esté ya en una sección, con su nombre de campo legible.
const TEXT_LABELS = {
  Evolucion: 'Evolución', EvolucionMedica: 'Evolución médica', ExamenFisico: 'Examen físico', Diagnostico: 'Diagnóstico',
  Hipotesis: 'Hipótesis diagnóstica', HipotesisDiagnostica: 'Hipótesis diagnóstica', Plan: 'Plan', Indicacion: 'Indicación',
  Observacion: 'Observación', Observaciones: 'Observaciones', Epicrisis: 'Epicrisis', Categorizacion: 'Categorización',
  Triage: 'Triage', MotivoIngreso: 'Motivo de ingreso', Anamnesis: 'Anamnesis', Comentario: 'Comentario', Comentarios: 'Comentarios',
};
const SKIP_TEXT_KEY = /^(Id|Codigo|Rut|Fecha|Hora|Nombre|Apellido|Usuario|Funcionario|Token|Url|Path|Guid|Estado)$|Id$|Rut$|Fecha|Nombre|Apellido/i;
const USED_ANAMNESIS = new Set(['MotivoConsulta', 'HistoriaEnfermedadActual']);
const humanKey = k => TEXT_LABELS[k] ?? k.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, c => c.toUpperCase());
const isFreeText = v => typeof v === 'string' && v.trim().length >= 20 && /\s/.test(v.trim()) && !isRayenDate(v);

/**
 * Textos libres de una atención que ninguna sección modela (evolución de urgencia, categorización…).
 * @returns {Array<{key:string, label:string, text:string}>}
 */
export function textosLibres(a) {
  const out = [];
  const seen = new Set();
  const take = (obj, skip = new Set()) => {
    if (!obj || typeof obj !== 'object') return;
    for (const [k, v] of Object.entries(obj)) {
      if (skip.has(k) || SKIP_TEXT_KEY.test(k) || !isFreeText(v)) continue;
      const text = cleanText(v);
      if (seen.has(text)) continue;
      seen.add(text);
      out.push({ key: k, label: humanKey(k), text });
    }
  };
  for (const an of a.Anamnesis ?? []) take(an, USED_ANAMNESIS);
  const ep = a.EpisodioAtencion;
  for (const e of Array.isArray(ep) ? ep : ep ? [ep] : []) take(e);
  take(a, new Set([...SECTION_KEYS, 'Anamnesis', 'EpisodioAtencion', 'Motivo']));
  return out;
}

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
    extras: textosLibres(a),
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

/** Ficha administrativa (Inscripcion/UsuarioApsRut) → datos de identificación, contacto e inscripción; null si no hay usuario. */
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
 * Ficha administrativa (parseMaster) → registro con la forma que consume el
 * panel del paciente. Lo usa la búsqueda manual por RUN: un paciente que no
 * está en mi agenda no tiene fila de la que salir, así que se arma una desde
 * su inscripción, con las listas vacías que el panel espera encontrar.
 * @param {object|null} master
 * @returns {object|null}
 */
export function recordDesdeMaster(master) {
  if (!master) return null;
  // `master.run` viene ya formateado («25.106.217-K»); el panel, las notas y las
  // interconsultas comparan por el canónico, así que se recupera aquí.
  const { run, runStr } = formatRun(master.run);
  return {
    id: `run_${run ?? master.idUsp ?? 0}`,
    origen: 'busqueda',
    idUsp: master.idUsp ?? 0,
    run, runStr: runStr || master.run || '',
    nombre: master.nombre ?? '', nombres: '', ap: '', am: '',
    dob: master.dob ?? '',
    edad: edadAnios(date8FromDMY(master.dob ?? '')),
    edadLabel: '',
    sexo: master.sexo ?? '',
    prevision: master.prevision ?? '',
    telefono: master.telefonos ?? '',
    direccion: master.direccion ?? '',
    sector: '',
    razon: '', estado: '', tipoAtencion: '',
    fecha8: '', fechaAtencion: '', hora: '', diaSemana: '',
    diagnosticos: [], actividades: [], prestadores: [], adjuntos: [], proximoControl: [],
    esIC: false, icCitadoPor: '', icSIC: '', esUrgencia: false, esEspontanea: false,
    note: '', notas: [],
  };
}
