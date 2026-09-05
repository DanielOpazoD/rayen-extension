import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mergeHistorial, aggregateTeam } from '../src/io/historial.js';
import { parseAtencion } from '../src/core/parser.js';

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

test('mergeHistorial prefers the atención where the officer is a prestador over an earlier one by another professional', () => {
  const kine   = atencion({ Id: 10, Fecha: '20260902 083000', FuncionariosPrestadores: [{ Id: 5, NombreCompleto: 'Kine Uno', NombreInstrumento: 'Kinesiólogo(a)' }],
    Diagnosticos: [{ DescripcionClasificacion: 'Bronquitis- (Confirmada)', DescripcionDiagnostico: 'Kine dx' }] });
  const mine   = atencion({ Id: 11, Fecha: '20260902 113000',
    Diagnosticos: [{ DescripcionClasificacion: 'HTA- (Confirmada)', DescripcionDiagnostico: 'Mi dx' }] });
  const out = mergeHistorial([cita({ id: 100, hora: '11:00' })], [kine, mine]);
  assert.equal(out.length, 1, 'the kine atención is not appended as an extra row (not the officer\'s)');
  assert.equal(out[0].atencionId, 11);
  assert.equal(out[0].diagnosticos[0].nombre, 'Mi dx');
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

// Regresión del balance 2: /present/ aceptaba «No se presentó», y una cita a la
// que el paciente no fue heredaba la atención de la matrona del mismo día.
test('una cita «No se presentó» no hereda la atención de otro prestador ese día', () => {
  const matrona = atencion({
    Id: 901,
    FuncionariosPrestadores: [{ Id: 777, NombreCompleto: 'Matrona X', NombreInstrumento: 'Matrona' }],
    Diagnosticos: [{ DescripcionClasificacion: 'Embarazo- (Confirmada)', DescripcionDiagnostico: 'Embarazo' }],
  });
  const out = mergeHistorial([cita({ estado: 'No se presentó' })], [matrona]);
  assert.equal(out.length, 1);
  assert.equal(out[0].atencionId, null, 'la atención ajena no se cruza');
  assert.deepEqual(out[0].diagnosticos, []);
  // La atención del propio oficial sí se cruza: la agenda puede estar mal marcada.
  const mine = mergeHistorial([cita({ estado: 'No se presentó' })], [atencion()]);
  assert.equal(mine[0].atencionId, 1);
});

// Decisión de Daniel (03-09-2026): sólo sus diagnósticos. Una cita atendida
// sin registro propio no hereda la atención de otro profesional; queda la
// pista de quién atendió ese día.
test('una cita «Atendido» sin atención propia no hereda la de otro prestador', () => {
  const matrona = atencion({
    Id: 902,
    FuncionariosPrestadores: [{ Id: 777, NombreCompleto: 'Matrona X', NombreInstrumento: 'Matrona' }],
    Diagnosticos: [{ DescripcionClasificacion: 'Embarazo- (Confirmada)', DescripcionDiagnostico: 'Embarazo' }],
  });
  const out = mergeHistorial([cita({ estado: 'Atendido' })], [matrona]);
  assert.equal(out.length, 1, 'la atención ajena tampoco se añade como fila extra');
  assert.equal(out[0].atencionId, null);
  assert.deepEqual(out[0].diagnosticos, []);
  assert.equal(out[0].prestador, '');
  assert.equal(out[0].otrosEseDia, 'Matrona X', 'la pista de quién atendió ese día se conserva');
});

test('mergeHistorial: una ficha cerrada días después se cruza con la cita atendida más cercana y toma su fecha', () => {
  // Cita del 02-09 «Completado» sin atención ese día; la ficha se guardó el 04-09.
  const out = mergeHistorial([cita()], [atencion({ Id: 9, Fecha: '20260904 174500' })]);
  assert.equal(out.length, 1, 'no se añade una fila extra el 04-09');
  assert.equal(out[0].atencionId, 9);
  assert.equal(out[0].fecha8, '20260902', 'manda la fecha de la cita');
  assert.equal(out[0].fechaRegistro, '04-09-2026');
  assert.equal(out[0].diagnosticos[0].nombre, 'Bronquitis');
});

test('mergeHistorial: el cruce tardío exige cita atendida, ≤ 14 días y sin atención; elige la más cercana', () => {
  const noAtendida = mergeHistorial([cita({ estado: 'No Atendido' })], [atencion({ Id: 9, Fecha: '20260904 174500' })]);
  assert.equal(noAtendida.length, 2, 'una cita no atendida no se rellena');
  const lejana = mergeHistorial([cita({ fecha8: '20260801', fechaAtencion: '01-08-2026' })], [atencion({ Id: 9, Fecha: '20260904 174500' })]);
  assert.equal(lejana.length, 2);
  const ocupada = mergeHistorial([cita()], [atencion({ Id: 1 }), atencion({ Id: 9, Fecha: '20260904 174500' })]);
  assert.equal(ocupada.length, 2, 'la cita ya tiene su atención del día; la tardía queda como fila extra');
  assert.equal(ocupada[0].atencionId, 1);
  const dos = mergeHistorial([cita({ id: 1, fecha8: '20260825', fechaAtencion: '25-08-2026' }), cita({ id: 2 })], [atencion({ Id: 9, Fecha: '20260904 174500' })]);
  assert.equal(dos.find(c => c.id === 2).atencionId, 9, 'la más cercana');
  assert.equal(dos.find(c => c.id === 1).atencionId, null);
  const urg = mergeHistorial([cita()], [atencion({ Id: 9, Fecha: '20260904 174500', EsUrgencia: true })]);
  assert.equal(urg.length, 2, 'una urgencia no se cuelga de una cita anterior');
});

test('mergeHistorial: la ficha abierta la víspera (jueves) se cruza con la cita del día siguiente (viernes)', () => {
  // Cita del viernes 04-09 «Confirmado» (aún no marcada atendida); la ficha se abrió y guardó el jueves 03-09.
  const out = mergeHistorial([cita({ fecha8: '20260904', fechaAtencion: '04-09-2026', estado: 'Confirmado' })], [atencion({ Id: 9, Fecha: '20260903 213000' })]);
  assert.equal(out.length, 1, 'el jueves no aparece ninguna fila');
  assert.equal(out[0].fecha8, '20260904');
  assert.equal(out[0].atencionId, 9);
  assert.equal(out[0].fechaRegistro, '03-09-2026');
  // Más de 7 días antes de la cita no es «la víspera»: queda como fila suelta.
  const lejos = mergeHistorial([cita({ fecha8: '20260915', fechaAtencion: '15-09-2026', estado: 'Confirmado' })], [atencion({ Id: 9, Fecha: '20260903 213000' })]);
  assert.equal(lejos.length, 2);
  // Con una cita antes y otra después, gana la más cercana.
  const dos = mergeHistorial([cita({ id: 1, fecha8: '20260901', fechaAtencion: '01-09-2026' }), cita({ id: 2, fecha8: '20260904', fechaAtencion: '04-09-2026', estado: 'Confirmado' })], [atencion({ Id: 9, Fecha: '20260903 213000' })]);
  assert.equal(dos.find(c => c.id === 2).atencionId, 9);
  assert.equal(dos.find(c => c.id === 1).atencionId, null);
  // Una cita anulada no recibe ficha.
  assert.equal(mergeHistorial([cita({ fecha8: '20260904', fechaAtencion: '04-09-2026', estado: 'Anulada' })], [atencion({ Id: 9, Fecha: '20260903 213000' })]).length, 2);
});
