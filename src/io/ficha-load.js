/**
 * Carga de la ficha clínica de un paciente desde Eloisa: seis fuentes en
 * paralelo, memoización por paciente y respuestas crudas del último paciente
 * para el Explorador API. El análisis de cada respuesta vive en core/ficha.js;
 * aquí sólo hay red, tiempo y memoria.
 */
import { identidad } from '../core/identidad.js';
import { apiGet, apiPost, session, net } from './http.js';
import { CONFIG } from '../core/config.js';
import { localDateStr, fmtDate } from '../core/parser.js';
import { describe, parseAntecedentes, parseFichaAtencion, parseMaster, parseProgramas } from '../core/ficha.js';

const FLAGS_ALL = Object.freeze({
  TraerActividades: true, TraerDiagnosticos: true, TraerPrescripciones: true,
  TraerExamenesSolicitados: true, TraerEspecialidadesDerivadas: true, TraerExamenesFisicos: true,
  TraerItemsExamenesSegmentarios: true, TraerIndicaciones: true, TraerPrescripcionesExtraConsultorio: true,
  TraerOrdenesAtencionInterna: true, TraerAnamnesis: true, TraerFuncionariosPrestadores: true,
  TraerRecetas: true, TraerOrdenAtencionPruebaDiagnostica: true, TraerEpisodioAtencion: true,
  TraerEnmendaciones: true, TraerLicenciasMedicasElectronicasOtorgadas: true,
});

const memo = new Map(); // key → { savedAt, ficha }

// Respuestas crudas del último paciente cargado, para el Explorador API
// (copia anonimizada). Se reemplazan en cada carga; nunca se persisten.
const rawCaptures = new Map();
export function getFichaCaptures() { return [...rawCaptures.values()]; }
const remember = (label, endpoint, data) => { if (data !== null && data !== undefined) rawCaptures.set(label, { label, endpoint, data }); };
const TTL = 30 * 60 * 1000;

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
  rawCaptures.clear();
  if (run) {
    try {
      const d = await apiGet(token, `/API/api/rayen/Inscripcion/UsuarioApsRut/${run.toLowerCase()}/${identidad.nodeId}`);
      remember('Ficha administrativa (UsuarioApsRut)', 'Inscripcion/UsuarioApsRut', d);
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
  const soft = (p, label, endpoint = label) => p.then(d => { remember(label, endpoint, d); return d; }).catch(e => { errors.push(`${label}: ${e.message}`); return null; });

  const [hist, ant, prog, vig, riesgo, ram] = await Promise.all([
    soft(apiPost(token, '/API/api/rayen/FichaClinica/HistorialAtencion', {
      IdUsuario: id, IdFuncionarioPrestador: null,
      FechaInicio: `${localDateStr(from)} 000000`, FechaTermino: `${localDateStr(to)} 235900`,
      ...FLAGS_ALL,
    }, { timeoutMs: net.longTimeoutMs }), 'Historial', 'FichaClinica/HistorialAtencion'),
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
  if (!ficha.errors.length) memo.set(key, { savedAt: ficha.savedAt, ficha }); // una ficha a medias no se recuerda 30 min
  return ficha;
}

/**
 * Busca un paciente por RUN sin cargar su ficha: una sola llamada a la
 * inscripción del nodo. `null` cuando Eloisa no devuelve a nadie.
 * @param {string} token
 * @param {string} run  canónico, sin puntos ni guion («25106217K»)
 * @returns {Promise<object|null>} el maestro de parseMaster, o null
 */
export async function buscarPacientePorRun(token, run) {
  const d = await apiGet(token, `/API/api/rayen/Inscripcion/UsuarioApsRut/${String(run).toLowerCase()}/${identidad.nodeId}`);
  return parseMaster(Array.isArray(d) ? d[0] : d);
}
