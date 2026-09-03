import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  formatRun, computeDv, decodeEdadExacta, fmtDate, fmtHora, dateToInt,
  parseCita, parseAtencion, parseDiagnostico, matchKey, dateRange,
} from '../src/parser.js';

// ── RUN ───────────────────────────────────────────────────────

test('formatRun: Rayen glues the DV to the number, K may be lowercase', () => {
  assert.deepEqual(formatRun('25106217k'), { run: '25106217K', runStr: '25.106.217-K', dvOk: true });
  assert.deepEqual(formatRun('292421311'), { run: '292421311', runStr: '29.242.131-1', dvOk: true });
  assert.deepEqual(formatRun('89068444'),  { run: '89068444',  runStr: '8.906.844-4',  dvOk: true });
});

test('formatRun: the user-provided example 17.752.753-K round-trips', () => {
  const r = formatRun('17752753K');
  assert.equal(r.runStr, '17.752.753-K');
  assert.equal(computeDv('17752753'), 'K');
  assert.equal(r.dvOk, true);
  assert.equal(formatRun('17.752.753-K').run, '17752753K');
});

test('formatRun: rejects non-RUN identifiers without throwing', () => {
  assert.equal(formatRun('admin5576').run, null);
  assert.equal(formatRun('').run, null);
  assert.equal(formatRun(null).run, null);
  assert.equal(formatRun(undefined).run, null);
});

test('formatRun: flags a wrong check digit but still formats it', () => {
  const r = formatRun('177527530');
  assert.equal(r.runStr, '17.752.753-0');
  assert.equal(r.dvOk, false);
});

// ── EdadExacta ────────────────────────────────────────────────

test('decodeEdadExacta unpacks YY…MMDDHH', () => {
  assert.deepEqual(decodeEdadExacta(54010817), { years: 54, months: 1, days: 8, hours: 17, label: '54 a' });
  assert.deepEqual(decodeEdadExacta(51118),    { years: 0,  months: 5, days: 11, hours: 18, label: '5 m 11 d' });
  assert.deepEqual(decodeEdadExacta(5032617),  { years: 5,  months: 3, days: 26, hours: 17, label: '5 a' });
  assert.equal(decodeEdadExacta(1090022).label, '1 a 9 m');
  assert.equal(decodeEdadExacta('x'), null);
});

// ── Dates ─────────────────────────────────────────────────────

test('date helpers handle Rayen formats and sentinel 0001-01-01', () => {
  assert.equal(fmtDate('20260902 202818'), '02-09-2026');
  assert.equal(fmtDate('00010101 000000'), '');
  assert.equal(fmtHora('20260902 202818'), '20:28');
  assert.equal(dateToInt('02-09-2026'), 20260902);
  assert.deepEqual(dateRange(new Date(2026, 0, 30), new Date(2026, 1, 1)), ['20260130', '20260131', '20260201']);
});

// ── Diagnósticos ──────────────────────────────────────────────

test('parseDiagnostico splits classification and certainty', () => {
  const d = parseDiagnostico({
    DescripcionClasificacion: 'Bronquitis aguda- (Confirmada) (AUGE)',
    DescripcionDiagnostico: 'Bronquitis aguda', EsAuge: true, EsENO: false,
  });
  assert.equal(d.clasificacion, 'Bronquitis aguda');
  assert.equal(d.certeza, 'Confirmada');
  assert.equal(d.esAuge, true);

  const e = parseDiagnostico({ DescripcionClasificacion: 'Trastornos específicos mixtos del desarrollo- (Sospecha)', DescripcionDiagnostico: '' });
  assert.equal(e.nombre, 'Trastornos específicos mixtos del desarrollo');
  assert.equal(e.certeza, 'Sospecha');
});

// ── Atención (HistorialAtencion) ──────────────────────────────

const ATENCION = {
  Id: 737937908, IdCita: 0, IdUsp: 18707541, Fecha: '20260902 202818',
  RutPaciente: '25106217k', NombreCompleto: 'Nombre   Prueba Paciente', EdadExacta: 10113019,
  FechaNacimiento: '20150903 000000', IdSexo: 2, TipoDeAtencion: 'MORBILIDAD IRA-ERA',
  EsUrgencia: false, EsEspontanea: true, EsDiada: false,
  Diagnosticos: [{ DescripcionClasificacion: 'Bronquitis aguda- (Confirmada) (AUGE)', DescripcionDiagnostico: 'Bronquitis aguda', EsAuge: true }],
  Actividades: [{ CodigoActividad: 'SEKIRES', Descripcion: '1 Sesiones de Kinesioterapia Respiratoria', Instrumento: 'Kinesiólogo(a)', EsProcedimiento: true }],
  FuncionariosPrestadores: [{ Id: 439550, NombreCompleto: 'Opazo Damiani Daniel', NombreInstrumento: 'Médico' }],
  ArchivosAdjunto: [{ NombreArchivo: 'informe.pdf', PathAzure: '1788392829663.pdf' }],
};

test('parseAtencion compacts a HistorialAtencion item', () => {
  const a = parseAtencion(ATENCION);
  assert.equal(a.id, 737937908);
  assert.equal(a.fecha8, '20260902');
  assert.equal(a.fechaAtencion, '02-09-2026');
  assert.equal(a.hora, '20:28');
  assert.equal(a.runStr, '25.106.217-K');
  assert.equal(a.nombre, 'Nombre Prueba Paciente');
  assert.equal(a.edad, 10);
  assert.equal(a.sexo, 'Mujer');
  assert.equal(a.esEspontanea, true);
  assert.equal(a.diagnosticos[0].certeza, 'Confirmada');
  assert.equal(a.actividades[0].descripcion, 'Sesiones de Kinesioterapia Respiratoria');
  assert.equal(a.prestadores[0].id, 439550);
  assert.equal(a.adjuntos[0].nombre, 'informe.pdf');
});

// ── Cita (ListaPacientesCitados) ──────────────────────────────

const CITA = {
  Id: 805645254, FechaHoraInicio: '20260902 093000', EsCitaInterconsulta: 1,
  Razon: 'Control', Tag: { Nombre: 'Completado' }, TipoDeAtencion: { Nombre: 'Morbilidad Medica' },
  Cupos: [{ Descripcion: 'Citado por: Dr. Referidor\nN° Solicitud Interconsulta: 21437887' }],
  UsuarioAps: {
    Rut: '25106217k', NombreFormateado: 'Nombre Prueba Paciente', Nombres: 'Nombre', ApellidoPaterno: 'Prueba', ApellidoMaterno: 'Paciente',
    FechaDeNacimiento: '20150903 000000', Sexo: { Nombre: 'Mujer' }, ConvenioPrevisional: 'Fonasa D',
    Telefonos: [{ TelefonoDescripcion: '81869731', Eliminado: false }], Georeferencias: [{ DireccionFormateada: 'Calle 1' }],
  },
};

test('parseCita maps agenda fields and IC description', () => {
  const c = parseCita(CITA);
  assert.equal(c.runStr, '25.106.217-K');
  assert.equal(c.esIC, true);
  assert.equal(c.icCitadoPor, 'Dr. Referidor');
  assert.equal(c.icSIC, '21437887');
  assert.equal(c.prevision, 'Fonasa D');
  assert.equal(c.telefono, '81869731');
  assert.equal(c.fecha8, '20260902');
  assert.equal(c.hora, '09:30');
  assert.equal(parseCita({ UsuarioAps: null }), null);
});

test('matchKey links a cita and an atención by RUN + day, name as fallback', () => {
  assert.equal(matchKey(parseCita(CITA)), matchKey(parseAtencion(ATENCION)));
  const noRun = { run: null, nombre: 'Ana   Pérez ', fecha8: '20260902' };
  assert.equal(matchKey(noRun), 'ana pérez|20260902');
});
