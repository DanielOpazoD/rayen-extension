import { beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { parseSIC, isMine, contactsFromSICs, loadSICs } from '../src/sic.js';
import { CONFIG, sicGrupo } from '../src/config.js';
import { installFakeChrome } from './helpers/fake-chrome.js';
import { resetRun, resetSession } from '../src/http.js';

let fake;
beforeEach(() => {
  fake = installFakeChrome();
  resetRun();
  resetSession();
});

/** Shape of one SolicitudInterconsultaDerivacionPorIds item (synthetic values). */
const RAW = {
  NumeroSolicitud: '21450486', FechaHora: '02-09-2026', FechaHoraCreacion: '02-09-2026 20:10:35',
  AntiguedadDias: 12, FechaHoraCita: '', Prioridad: 2,
  FundamentosClinicos: 'Dolor lumbar de dos meses. ', ExamenesRealizados: 'TAC: abombamiento discal.',
  ObservacionesInterconsulta: '', Observaciones: '',
  Especialidad: 'Traumatología y Ortopedia', MotivoInterconsulta: 'Confirmación Diagnostica', ProblemaSalud: 'No Aplica',
  Estado: 'Nueva', DescripcionEstado: 'Nueva', EsAuge: 'No', Diagnostico: 'Dolor en articulación',
  ArrDiagnosticos: [{ EsPrincipal: true, CodigoCIE10: 'M25.5', HipotesisDiagnostica: 'Sindrome dolor lumbar', ClasificacionDiagnostica: 'Dolor en articulación' }],
  EstablecimientoOrigen: 'Hospital Hanga Roa', EstablecimientoDestinoSIC: 'Hospital Hanga Roa',
  FuncionarioPrestadorRegistrador: { NombreFormateado: 'Ana Prueba Registradora' },
  UsuarioApsDerivacion: {
    Id: 14155092, Rut: '270493793', FechaNacimiento: '20191015 000000', NombreFormateado: 'Paciente Prueba Sic',
    Sexo: { Nombre: 'Hombre' }, Edad: '6 años 10 meses 18 días', ConvenioPrevisional: 'Fonasa D',
    TipoUsuario: 'Usuario Normal, Adscrito, Inscrito en el establecimiento',
    Telefonos: [{ TelefonoDescripcion: '81869731', Eliminado: false }, { TelefonoDescripcion: '00000000', Eliminado: true }],
    Georeferencias: [{ DireccionFormateada: 'Calle IPC 1' }],
  },
  SolicitudInterconsulta: {
    Estado: 13, FechaHora: '20260902 201035', IdNodoOrigen: 5576, IdNodoDestino: 5576,
    IdFuncionarioRegistrador: 439717, IdFuncionarioPrestadorEjecutor: 439554,
    FuncionarioPrestadorEjecutor: { NombreFormateado: 'Daniel Prueba Ejecutor' },
    EspecialidadNodoOrigen: { NombreEspecialidad: 'Medicina Familiar' }, EsGES: false,
  },
};

test('parseSIC compacts the request and pulls CIE-10 from ArrDiagnosticos', () => {
  const s = parseSIC(RAW);
  assert.equal(s.id, 21450486);
  assert.equal(s.fecha8, '20260902');
  assert.equal(s.estadoId, 13);
  assert.equal(s.estado, 'Nueva');
  assert.equal(s.grupo, 'pendiente');
  assert.equal(s.cie10, 'M25.5');
  assert.equal(s.fundamentos, 'Dolor lumbar de dos meses.');
  assert.equal(s.esAuge, false);
  assert.equal(s.especialidadOrigen, 'Medicina Familiar');
  assert.equal(s.paciente.runStr, '27.049.379-3');
  assert.equal(s.paciente.telefono, '81869731', 'deleted phones are skipped');
  assert.equal(s.paciente.direccion, 'Calle IPC 1');
  assert.equal(s.registrador.id, 439717);
  assert.equal(s.ejecutor.nombre, 'Daniel Prueba Ejecutor');
  assert.equal('contrarreferencias' in s, false, 'administrative metadata is not exposed as a clinical field');
});

test('parseSIC: EsAuge is a string "Si"/"No" in the API', () => {
  assert.equal(parseSIC({ ...RAW, EsAuge: 'Si' }).esAuge, true);
  assert.equal(parseSIC({ ...RAW, EsAuge: 'No' }).esAuge, false);
});

test('sicGrupo maps every known state into a lifecycle bucket', () => {
  assert.equal(sicGrupo(13), 'pendiente');
  assert.equal(sicGrupo(2),  'enviada');
  assert.equal(sicGrupo(15), 'enviada');
  assert.equal(sicGrupo(5),  'atendida');
  assert.equal(sicGrupo(20), 'cerrada');
  assert.equal(sicGrupo(7),  'fallida');
  assert.equal(sicGrupo(999), 'otro');
});

test('isMine matches registrador or ejecutor against the officer id', () => {
  assert.equal(isMine(parseSIC(RAW)), false);
  const mine = parseSIC({ ...RAW, SolicitudInterconsulta: { ...RAW.SolicitudInterconsulta, IdFuncionarioRegistrador: 439550 } });
  assert.equal(isMine(mine), true);
});

test('contactsFromSICs builds a RUN → contact map without overwriting with blanks', () => {
  const a = parseSIC(RAW);
  const b = parseSIC({ ...RAW, UsuarioApsDerivacion: { ...RAW.UsuarioApsDerivacion, Telefonos: [], Georeferencias: [] } });
  const m = contactsFromSICs([b, a]);
  assert.equal(m.get('270493793').telefono, '81869731');
  assert.equal(m.get('270493793').direccion, 'Calle IPC 1');
});

test('loadSICs counts every failed listing and preserves the previous complete snapshot', async () => {
  const cached = { records: [{ id: 99, paciente: { run: '' } }], savedAt: 123, months: 6 };
  fake.local.set(CONFIG.sicKey, cached);
  globalThis.fetch = async () => new Response('falló', { status: 500 });

  const result = await loadSICs('token', 6, () => {}, { force: true });

  assert.equal(result.failed, 3);
  assert.equal(result.staleFallback, true);
  assert.equal(result.fromCache, true);
  assert.deepEqual(result.sics, cached.records);
  assert.deepEqual(fake.local.get(CONFIG.sicKey), cached, 'a partial response never replaces the complete cache');
});

test('loadSICs reports no usable records when every listing fails without a cache', async () => {
  globalThis.fetch = async () => new Response('falló', { status: 500 });
  const result = await loadSICs('token', 6, () => {}, { force: true });
  assert.equal(result.failed, 3);
  assert.equal(result.staleFallback, undefined);
  assert.deepEqual(result.sics, []);
  assert.equal(fake.local.has(CONFIG.sicKey), false);
});
