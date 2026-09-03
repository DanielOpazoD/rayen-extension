import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mergeHistorial, aggregateTeam } from '../src/historial.js';
import { parseAtencion } from '../src/parser.js';

const OFFICER = 439550;

function atencion(over = {}) {
  return parseAtencion({
    Id: 1, IdCita: 0, Fecha: '20260902 100000', RutPaciente: '25106217k', NombreCompleto: 'Paciente Uno',
    EdadExacta: 10113019, FechaNacimiento: '20150903 000000', IdSexo: 2, TipoDeAtencion: 'Morbilidad Medica',
    EsEspontanea: false,
    Diagnosticos: [{ DescripcionClasificacion: 'Bronquitis aguda- (Confirmada)', DescripcionDiagnostico: 'Bronquitis' }],
    Actividades: [], FuncionariosPrestadores: [{ Id: OFFICER, NombreCompleto: 'Opazo Damiani Daniel', NombreInstrumento: 'Médico' }],
    ...over,
  });
}

function cita(over = {}) {
  return {
    id: 100, origen: 'cita', run: '25106217K', runStr: '25.106.217-K', nombre: 'Paciente Uno', fecha8: '20260902',
    fechaAtencion: '02-09-2026', hora: '09:30', estado: 'Completado', tipoAtencion: 'Morbilidad Medica',
    atencionId: null, diagnosticos: [], actividades: [], prestadores: [], adjuntos: [], prestador: '', sexo: 'Mujer',
    ...over,
  };
}

test('mergeHistorial enriches a cita with the same-day atención of the same RUN', () => {
  const out = mergeHistorial([cita()], [atencion()]);
  assert.equal(out.length, 1);
  assert.equal(out[0].atencionId, 1);
  assert.equal(out[0].diagnosticos[0].nombre, 'Bronquitis');
  assert.equal(out[0].prestador, 'Opazo Damiani Daniel');
  assert.equal(out[0].estado, 'Completado', 'agenda state is kept');
});

test('mergeHistorial appends the officer\'s atenciones without a cita as extra rows', () => {
  const out = mergeHistorial([], [atencion({ Id: 7, EsEspontanea: true })]);
  assert.equal(out.length, 1);
  assert.equal(out[0].id, 'att_7');
  assert.equal(out[0].origen, 'ficha');
  assert.equal(out[0].estado, 'Espontánea');
});

test('mergeHistorial ignores other prestadores\' unmatched atenciones', () => {
  const other = atencion({ Id: 9, RutPaciente: '292421311', FuncionariosPrestadores: [{ Id: 1, NombreCompleto: 'Otro', NombreInstrumento: 'Kinesiólogo(a)' }] });
  assert.equal(mergeHistorial([], [other]).length, 0);
});

test('mergeHistorial does not reuse one atención for two citas of the same patient', () => {
  const a1 = atencion({ Id: 1, Fecha: '20260902 090000' });
  const a2 = atencion({ Id: 2, Fecha: '20260902 160000' });
  const out = mergeHistorial([cita({ id: 100, hora: '09:00' }), cita({ id: 101, hora: '16:00' })], [a2, a1]);
  assert.deepEqual(out.map(r => r.atencionId).sort(), [1, 2]);
});

test('mergeHistorial keeps a cita untouched when the ficha does not know that day', () => {
  const [c] = mergeHistorial([cita()], []);
  assert.equal(c.atencionId, null);
  assert.deepEqual(c.diagnosticos, []);
});

test('aggregateTeam counts atenciones per instrument, prestador and tipo', () => {
  const agg = aggregateTeam([
    atencion({ Id: 1 }),
    atencion({ Id: 2, EsUrgencia: true, TipoDeAtencion: 'Poli Choque',
      FuncionariosPrestadores: [{ Id: 5, NombreCompleto: 'Kine Uno', NombreInstrumento: 'Kinesiólogo(a)' }, { Id: 5, NombreCompleto: 'Kine Uno', NombreInstrumento: 'Kinesiólogo(a)' }] }),
  ]);
  assert.equal(agg.total, 2);
  assert.equal(agg.urgencias, 1);
  assert.deepEqual(agg.byInstrumento, { 'Médico': 1, 'Kinesiólogo(a)': 1 });
  assert.deepEqual(agg.byTipo, { 'Morbilidad Medica': 1, 'Poli Choque': 1 });
  assert.equal(agg.byPrestador['Kine Uno'], 1, 'duplicate prestador entries count once');
});
