/**
 * Synthetic dataset that goes through the real parsers, so the shapes on disk
 * are exactly what the extension writes. Deterministic: same data every load.
 * Every name, RUN and phone here is invented.
 */
import { parseCita, parseAtencion, dateRange, localDateStr, computeDv } from '../src/core/parser.js';
import { parseSIC } from '../src/core/sic-parse.js';
import { aggregateTeam } from '../src/core/historial-merge.js';
import { CONFIG } from '../src/core/config.js';

const MONTHS = 6;
export const OFFICER = { Id: CONFIG.officerId, NombreCompleto: 'Daniel Opazo Damiani', NombreInstrumento: 'Consulta Médica' };
export const KINE    = { Id: 439554, NombreCompleto: 'Carla Ejemplo Riroroko', NombreInstrumento: 'Kinesiología' };
export const MATRONA = { Id: 439560, NombreCompleto: 'Paula Ejemplo Tepano',   NombreInstrumento: 'Control Matrona' };

export const PATIENTS = [
  ['Gabriela', 'Ejemplo', 'Haoa',     '13754664', '19710305', 'Mujer',  'Fonasa B'],
  ['Luis',     'Ejemplo', 'Lagos',    '17752753', '19900812', 'Hombre', 'Fonasa D'],
  ['María',    'Ejemplo', 'Pakomio',  '9876543',  '19560120', 'Mujer',  'Fonasa A'],
  ['Pedro',    'Ejemplo', 'Araki',    '17616600', '19881102', 'Hombre', 'Fonasa C'],
  ['Rosa',     'Ejemplo', 'Tuki',     '6543210',  '19470630', 'Mujer',  'Fonasa A'],
  ['Tomás',    'Ejemplo', 'Hey',      '21345678', '20030214', 'Hombre', 'Isapre'],
  ['Ana',      'Ejemplo', 'Rapu',     '15111222', '19821225', 'Mujer',  'Fonasa B'],
  ['Hugo',     'Ejemplo', 'Teao',     '8765432',  '19521009', 'Hombre', 'Fonasa A'],
  ['Vaitiare', 'Ejemplo', 'Pate',     '25106217', '20190415', 'Mujer',  'Fonasa D'],
  ['Marcelo',  'Ejemplo', 'Icka',     '12345678', '19680707', 'Hombre', 'Fonasa B'],
  ['Carmen',   'Ejemplo', 'Hotus',    '11223344', '19631118', 'Mujer',  'Fonasa C'],
  ['Nicolás',  'Ejemplo', 'Atan',     '19876543', '19970923', 'Hombre', 'Fonasa D'],
].map(([nom, ap, am, run, dob, sexo, prev], i) => ({
  idUsp: 14000000 + i, nom, ap, am, run, rut: run + computeDv(run), dob, sexo, prev,
  nombre: `${nom} ${ap} ${am}`,
}));

export const DX = [
  ['Hipertensión esencial - (Confirmada)',        'Hipertensión arterial',      'I10',   true],
  ['Diabetes mellitus tipo 2 - (Confirmada)',     'Diabetes mellitus tipo 2',   'E11',   true],
  ['Lumbago - (Confirmada)',                      'Lumbago no especificado',    'M54.5', false],
  ['Infección respiratoria - (Confirmada)',       'Bronquitis aguda',           'J20',   false],
  ['Gastritis - (Sospecha)',                      'Gastritis crónica',          'K29.5', false],
  ['Artritis reumatoide - (Sospecha)',            'Artritis reumatoide',        'M06.9', true],
  ['Ansiedad - (Confirmada)',                     'Trastorno de ansiedad',      'F41.1', false],
  ['Dermatitis - (Confirmada)',                   'Dermatitis atópica',         'L20',   false],
];
const TIPOS   = ['Consulta Médica', 'Control Crónico', 'Consulta Morbilidad', 'Control Salud'];
const ESTADOS = ['Completado', 'Completado', 'Completado', 'Completado', 'No se presentó a la cita', 'Confirmado'];

// Deterministic PRNG (mulberry32) so the harness renders the same every time
export function rng(seed) {
  return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
export const pick = (r, arr) => arr[Math.floor(r() * arr.length)];

export function edadExacta(dob8, d8) {
  const y = +d8.slice(0, 4) - +dob8.slice(0, 4) - (d8.slice(4) < dob8.slice(4) ? 1 : 0);
  return y * 1_000_000 + 3 * 10_000 + 12 * 100 + 10;
}
const fmtDMY = d8 => `${d8.slice(6, 8)}-${d8.slice(4, 6)}-${d8.slice(0, 4)}`;

export function buildFixture(today = new Date()) {
  const r = rng(20260903);
  const from = new Date(today); from.setMonth(from.getMonth() - MONTHS);
  const dates = dateRange(from, today);
  const workdays = dates.filter(d8 => { const wd = new Date(+d8.slice(0, 4), +d8.slice(4, 6) - 1, +d8.slice(6, 8)).getDay(); return wd > 0 && wd < 6; });
  const today8 = localDateStr(today);

  const citas = [], atenciones = [], team = {};
  let id = 500000;

  for (const d8 of workdays) {
    const n = d8 === today8 ? 8 : Math.floor(r() * 5);          // today is full so Hoy has content
    const dayAt = [];
    for (let k = 0; k < n; k++) {
      const p = pick(r, PATIENTS);
      const hh = String(8 + k).padStart(2, '0');
      const estado = d8 === today8 && k > 4 ? 'Confirmado' : pick(r, ESTADOS);
      const esIC = r() < 0.15;
      citas.push({
        Id: ++id, FechaHoraInicio: `${d8} ${hh}0000`, Razon: esIC ? 'Interconsulta' : pick(r, ['Control', 'Morbilidad', 'Resultado de exámenes', '']),
        Tag: { Nombre: estado }, TipoDeAtencion: { Nombre: pick(r, TIPOS) }, EsCitaInterconsulta: esIC ? 1 : 0,
        Cupos: [{ Descripcion: esIC ? `Citado por: Secretaria SOME\nN° Solicitud de Interconsulta: ${21450480 + (id % 7)}` : '', TipoAtencion: 'Consulta Médica' }],
        UsuarioAps: {
          Id: p.idUsp, Rut: p.rut, NombreFormateado: p.nombre, Nombres: p.nom, ApellidoPaterno: p.ap, ApellidoMaterno: p.am,
          FechaDeNacimiento: `${p.dob} 000000`, Sexo: { Nombre: p.sexo }, ConvenioPrevisional: { Nombre: p.prev },
          Sector: { Nombre: 'Sector Único' }, Telefonos: [{ TelefonoDescripcion: '9 0000 0000', Eliminado: false }],
        },
      });
      if (estado !== 'Completado') continue;
      const dx = pick(r, DX), dx2 = r() < 0.3 ? pick(r, DX) : null;
      const urg = r() < 0.08;
      const control = r() < 0.25;
      const sug = new Date(+d8.slice(0, 4), +d8.slice(4, 6) - 1, +d8.slice(6, 8) + 30);
      // Cada séptima ficha se cierra dos días después de la cita, como pasa en la práctica;
      // la consulta por nodo no trae FechaCita, así que llega como atención de otro día.
      const tardia = !urg && id % 7 === 0;
      const guardado = tardia ? localDateStr(new Date(+d8.slice(0, 4), +d8.slice(4, 6) - 1, +d8.slice(6, 8) + 2)) : d8;
      dayAt.push({
        Id: 900000 + id, IdCita: 0, IdUsp: p.idUsp, Fecha: `${guardado} ${hh}1500`, RutPaciente: p.rut, NombreCompleto: p.nombre,
        FechaNacimiento: `${p.dob} 000000`, EdadExacta: edadExacta(p.dob, d8), IdSexo: p.sexo === 'Mujer' ? 2 : 3,
        TipoDeAtencion: urg ? 'Atención de Urgencia' : 'Consulta Médica', EsUrgencia: urg, EsEspontanea: false,
        Diagnosticos: [{ DescripcionDiagnostico: dx[1], DescripcionClasificacion: dx[0], CodigoCIE10: dx[2], EsAuge: dx[3] },
                       ...(dx2 ? [{ DescripcionDiagnostico: dx2[1], DescripcionClasificacion: dx2[0], CodigoCIE10: dx2[2], EsAuge: dx2[3] }] : [])],
        Actividades: [{ CodigoActividad: '0101', Descripcion: '0101 Consulta médica', Instrumento: 'Consulta Médica' }],
        FuncionariosPrestadores: [OFFICER],
        OrdenAtencionInterna: control ? [{ Id: id, Motivo: 'Control en 30 días', FechaSugerida: `${localDateStr(sug)} 000000`, CuantosDiasMas: 30, PrioridadAlta: false, FechaDescarte: '00010101 000000', EsBorrado: false }] : [],
      });
    }
    // A few atenciones by other professionals, so the team aggregate has texture
    for (let k = 0; k < Math.floor(r() * 4); k++) {
      const p = pick(r, PATIENTS);
      dayAt.push({ Id: 950000 + (++id), IdCita: 0, IdUsp: p.idUsp, Fecha: `${d8} 110000`, RutPaciente: p.rut, NombreCompleto: p.nombre,
        FechaNacimiento: `${p.dob} 000000`, EdadExacta: edadExacta(p.dob, d8), IdSexo: p.sexo === 'Mujer' ? 2 : 3,
        TipoDeAtencion: 'Kinesiología', Diagnosticos: [], Actividades: [], FuncionariosPrestadores: [r() < 0.5 ? KINE : MATRONA] });
    }
    const parsed = dayAt.map(parseAtencion);
    team[d8] = aggregateTeam(parsed);
    atenciones.push(...parsed.filter(a => a.prestadores.some(f => f.id === CONFIG.officerId)));
  }

  // ── Interconsultas: every lifecycle state, both roles, watched specialties ──
  const ESP = ['Gastroenterología Adulto', 'Reumatología', 'Traumatología y Ortopedia', 'Dermatología', 'Cardiología', 'Psiquiatría Adulto'];
  const STATES = [[13, 'Nueva'], [13, 'Nueva'], [2, 'Enviada'], [5, 'Atendida'], [5, 'Atendida'], [5, 'Atendida'], [20, 'Egresada'], [7, 'Rechazada']];
  const sics = [];
  for (let k = 0; k < 28; k++) {
    const p = pick(r, PATIENTS);
    const [estadoId, estado] = pick(r, STATES);
    const age = Math.floor(r() * 150);
    const d = new Date(today); d.setDate(d.getDate() - age);
    const d8 = localDateStr(d);
    const emitida = r() < 0.6;
    const raw = {
      NumeroSolicitud: String(21450400 + k), FechaHora: fmtDMY(d8), FechaHoraCreacion: `${fmtDMY(d8)} 10:00:00`, AntiguedadDias: age, Prioridad: 1 + Math.floor(r() * 3),
      FundamentosClinicos: 'Cuadro de evolución subaguda, sin respuesta a manejo inicial. Se solicita evaluación por especialidad.',
      ExamenesRealizados: r() < 0.5 ? 'Hemograma y PCR dentro de rangos.' : '', Especialidad: pick(r, ESP), MotivoInterconsulta: 'Confirmación Diagnóstica',
      ProblemaSalud: 'No Aplica', Estado: estado, DescripcionEstado: estado, EsAuge: r() < 0.2 ? 'Si' : 'No', Diagnostico: pick(r, DX)[1],
      ArrDiagnosticos: [{ EsPrincipal: true, CodigoCIE10: pick(r, DX)[2], HipotesisDiagnostica: 'Hipótesis de ejemplo', ClasificacionDiagnostica: pick(r, DX)[1] }],
      EstablecimientoOrigen: 'Hospital Hanga Roa', EstablecimientoDestinoSIC: 'Hospital Hanga Roa',
      FuncionarioPrestadorRegistrador: { NombreFormateado: emitida ? OFFICER.NombreCompleto : 'Ana Ejemplo Registradora' },
      UsuarioApsDerivacion: { Id: p.idUsp, Rut: p.rut, FechaNacimiento: `${p.dob} 000000`, NombreFormateado: p.nombre, Sexo: { Nombre: p.sexo }, Edad: '', ConvenioPrevisional: p.prev, Telefonos: [], Georeferencias: [] },
      SolicitudInterconsulta: { Estado: estadoId, FechaHora: `${d8} 100000`, IdNodoOrigen: 5576, IdNodoDestino: 5576,
        IdFuncionarioRegistrador: emitida ? CONFIG.officerId : 439717, IdFuncionarioPrestadorEjecutor: emitida ? 439554 : CONFIG.officerId,
        FuncionarioPrestadorEjecutor: { NombreFormateado: emitida ? 'Especialista Ejemplo' : OFFICER.NombreCompleto }, EspecialidadNodoOrigen: { NombreEspecialidad: 'Medicina General' }, EsGES: false },
    };
    sics.push(parseSIC(raw));
  }

  const now = Date.now();
  const syncOk = source => ({
    source, status: 'ok', attemptedAt: now - 15 * 60_000, completedAt: now - 15 * 60_000,
    lastSuccessAt: now - 15 * 60_000, failedItems: [], networkCount: 1, cacheCount: 0, hasData: true,
  });
  return {
    [CONFIG.cacheKey]:     { fetchedDates: dates, records: citas.map(parseCita).filter(Boolean), extra: {}, savedAt: now },
    [CONFIG.historialKey]: { fetchedDates: dates, records: atenciones, extra: { team }, savedAt: now },
    [CONFIG.sicKey]:       { records: sics, savedAt: now, months: MONTHS },
    [CONFIG.prefsKey]:     { months: MONTHS, historial: true },
    [CONFIG.notesKey]:     { [`run_${PATIENTS[0].rut}`]: 'Pendiente resultado de eco abdominal.', [`run_${PATIENTS[4].rut}`]: 'Vive sola; coordinar con hija.' },
    [CONFIG.syncKeys.agenda]:    syncOk('agenda'),
    [CONFIG.syncKeys.historial]: syncOk('historial'),
    [CONFIG.syncKeys.sics]:      syncOk('sics'),
  };
}
