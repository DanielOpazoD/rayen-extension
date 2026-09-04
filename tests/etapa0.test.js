import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseSIC } from '../src/io/sic.js';
import { computePendientes } from '../src/core/pendientes.js';
import { applyFilters } from '../src/ui/stats.js';
import { mergeHistorial } from '../src/io/historial.js';
import { parseAtencion } from '../src/core/parser.js';
import { clearAllCaches, storageSet, storageGet } from '../src/io/cache.js';
import { installFakeChrome } from './helpers/fake-chrome.js';
import { CONFIG } from '../src/core/config.js';

// El cruce cita↔atención caía en cualquier atención del día, de cualquier
// prestador: una cita en «Citado» heredaba el diagnóstico de la matrona y lo
// arrastraba a Pacientes, a Hoy y a las estadísticas.
const atencionAjena = () => parseAtencion({
  Id: 9, IdCita: 0, Fecha: '20260902 100000', RutPaciente: '25106217k', NombreCompleto: 'Paciente Uno',
  EdadExacta: 10113019, FechaNacimiento: '20150903 000000', IdSexo: 2, TipoDeAtencion: 'Control',
  EsEspontanea: false,
  Diagnosticos: [{ DescripcionClasificacion: 'Embarazo de alto riesgo- (Confirmada)', DescripcionDiagnostico: 'EAR' }],
  Actividades: [], FuncionariosPrestadores: [{ Id: 5, NombreCompleto: 'Matrona X', NombreInstrumento: 'Matrona' }],
});
const cita = estado => ({
  id: 100, origen: 'cita', run: '25106217K', runStr: '25.106.217-K', nombre: 'Paciente Uno', fecha8: '20260902',
  fechaAtencion: '02-09-2026', hora: '09:30', estado, tipoAtencion: 'Morbilidad Medica',
  atencionId: null, diagnosticos: [], actividades: [], prestadores: [], adjuntos: [], prestador: '', sexo: 'Mujer',
});

test('una cita no atendida no hereda el diagnóstico de otro prestador', () => {
  const [c] = mergeHistorial([cita('Citado')], [atencionAjena()]);
  assert.equal(c.atencionId, null);
  assert.deepEqual(c.diagnosticos, []);
  assert.equal(c.estado, 'Citado');
});

// Decisión de Daniel (03-09-2026): sólo sus diagnósticos. Ni siquiera una cita
// atendida hereda la atención de otro prestador; queda la pista de quién fue.
test('una cita atendida tampoco hereda la atención de otro prestador', () => {
  const [c] = mergeHistorial([cita('Completado')], [atencionAjena()]);
  assert.equal(c.atencionId, null);
  assert.deepEqual(c.diagnosticos, []);
  assert.equal(c.otrosEseDia, 'Matrona X');
});

// El informe imprimible es una historia clínica completa guardada en disco;
// «Vaciar caché» no lo borraba y sólo desaparecía si la pestaña de impresión
// llegaba a renderizar.
test('«Vaciar caché» también elimina el informe pendiente de impresión', async () => {
  installFakeChrome();
  await storageSet('rayen_report', { fragment: '<b>Paciente</b>', at: 1 });
  await storageSet(CONFIG.notesKey, { k: 'nota' });
  await clearAllCaches();
  assert.equal(await storageGet('rayen_report'), undefined, 'el informe debe borrarse');
  assert.deepEqual(await storageGet(CONFIG.notesKey), { k: 'nota' }, 'las notas se conservan');
});

// Regresiones de la Etapa 0: cada prueba fija un defecto que hacía que la
// aplicación mostrara un dato falso o callara uno verdadero.

const ME = CONFIG.officerId;
const HOY = new Date(2026, 8, 3); // 03-09-2026

const RAW_SIC = {
  NumeroSolicitud: 21450486, FechaHora: '01-01-2026', Prioridad: 2, Estado: 'Atendido', IdEstado: 5,
  SolicitudInterconsulta: {
    FechaHora: '20260101 090000', IdFuncionarioRegistrador: ME, IdFuncionarioEjecutor: 9,
    NombreFuncionarioRegistrador: 'Opazo', NombreFuncionarioEjecutor: 'Otro',
    UsuarioAps: { NombreCompletoPaciente: 'Paciente Uno', Rut: '1K' },
  },
};

test('parseSIC no inventa 0 días cuando la API no informa la antigüedad', () => {
  assert.equal(parseSIC({ ...RAW_SIC, AntiguedadDias: 12 }).antiguedadDias, 12);
  assert.equal(parseSIC(RAW_SIC).antiguedadDias, null, 'sin dato debe ser null, no 0');
  assert.equal(parseSIC({ ...RAW_SIC, AntiguedadDias: null }).antiguedadDias, null);
});

// Con `?? 0` la regla nunca llegaba a calcular los días por su cuenta: una SIC
// atendida hace ocho meses sin contrarreferencia no aparecía y el tablero se
// veía limpio.
test('una SIC sin antigüedad informada se evalúa por su fecha', () => {
  const sic = {
    id: 1, fecha: '01-01-2026', fecha8: '20260101', fechaCita: '', antiguedadDias: null,
    estado: 'Atendido', estadoId: 5, grupo: 'atendida', especialidad: 'Reumatología',
    contrarreferencias: [], prioridad: 2,
    paciente: { nombre: 'Paciente Uno', run: '1K', runStr: '1-K' },
    registrador: { id: ME, nombre: 'Opazo' }, ejecutor: { id: 9, nombre: 'Otro' },
  };
  // Una SIC atendida ya no genera pendiente: la regla «sin contrarreferencia»
  // se retiró con el PR #7 (metadato administrativo).
  assert.deepEqual(computePendientes([], [sic], { hoy: HOY }), []);

  const nueva = { ...sic, estadoId: 13, estado: 'Nueva', grupo: 'pendiente' };
  const p = computePendientes([], [nueva], { hoy: HOY });
  assert.deepEqual(p.map(x => x.tipo), ['sic-nueva']);
  assert.ok(p[0].dias > 200, `los días deben salir de la fecha: ${p[0].dias}`);
});

// Las barras de «Diagnósticos más frecuentes» se rotulan con la clasificación,
// y el filtro buscaba sólo en el nombre corto: clic en la barra → cero filas.
test('la búsqueda encuentra un diagnóstico por su clasificación', () => {
  const rows = [
    { id: 1, nombre: 'Ana Pérez', run: '1K', runStr: '1-K', fechaAtencion: '01-09-2026', diaSemana: 'Mar', sexo: 'Mujer', estado: 'Completado', prevision: '', tipoAtencion: 'Morbilidad', prestadores: [], esIC: false, esUrgencia: false,
      diagnosticos: [{ nombre: 'HTA', clasificacion: 'Hipertensión esencial (primaria)', esAuge: true }] },
    { id: 2, nombre: 'Luis Soto', run: '2K', runStr: '2-K', fechaAtencion: '02-09-2026', diaSemana: 'Mié', sexo: 'Hombre', estado: 'Completado', prevision: '', tipoAtencion: 'Control', prestadores: [], esIC: false, esUrgencia: false, diagnosticos: [] },
  ];
  const NONE = { q: '', fecha: '', dia: '', sexo: '', estado: '', prevision: '', tipos: [], prest: '', ic: '', dx: '', ges: '', urg: '' };
  const ids = xs => xs.map(x => x.id);
  assert.deepEqual(ids(applyFilters(rows, { ...NONE, q: 'hipertensión esencial (primaria)' }, {})), [1]);
  assert.deepEqual(ids(applyFilters(rows, { ...NONE, q: 'hta' }, {})), [1], 'el nombre corto sigue funcionando');
});
