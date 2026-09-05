import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadHistorial } from '../src/io/historial.js';
import { mergeHistorial, aggregateTeam } from '../src/core/historial-merge.js';
import { installFakeChrome } from './helpers/fake-chrome.js';
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
  const other = atencion({ Id: 9, RutPaciente: '292421311', FuncionariosPrestadores: [{ Id: 1, NombreCompleto: 'Pérez Tuki Ana María', NombreInstrumento: 'Kinesiólogo(a)' }] });
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

test('mergeHistorial: la cita exacta que declara Rayen (IdCita / FechaCita) manda sobre la más cercana', () => {
  // Guardado el 03-09; una cita el 02-09 (más cercana) y otra el 08-09 que es la verdadera según IdCita.
  const citas = [cita({ id: 1, fecha8: '20260902', fechaAtencion: '02-09-2026' }), cita({ id: 555, fecha8: '20260908', fechaAtencion: '08-09-2026', estado: 'Confirmado' })];
  const porId = mergeHistorial(citas, [{ ...atencion({ Id: 9, Fecha: '20260903 213000' }), idCita: 555 }]);
  assert.equal(porId.find(c => c.id === 555).atencionId, 9);
  assert.equal(porId.find(c => c.id === 555).cruceEstimado, undefined, 'cruce exacto, no estimado');
  assert.equal(porId.find(c => c.id === 1).atencionId, null);
  // Sin IdCita útil pero con FechaCita: mismo resultado por RUN + día de la cita.
  const porFecha = mergeHistorial(citas, [{ ...atencion({ Id: 9, Fecha: '20260903 213000' }), fechaCita8: '20260908' }]);
  assert.equal(porFecha.find(c => c.id === 555).atencionId, 9);
  // Si la cita declarada no está en la agenda cargada, no se adivina: fila suelta.
  const ajena = mergeHistorial(citas, [{ ...atencion({ Id: 9, Fecha: '20260903 213000' }), idCita: 999 }]);
  assert.equal(ajena.length, 3);
  // Sin dato exacto, la heurística queda marcada como estimada.
  const est = mergeHistorial(citas, [atencion({ Id: 9, Fecha: '20260903 213000' })]);
  assert.equal(est.find(c => c.id === 1).cruceEstimado, true);
});

test('loadHistorial resuelve la cita exacta de una atención mía sin cita ese día con la consulta por paciente', async () => {
  installFakeChrome();
  const calls = [];
  globalThis.fetch = async (url, init) => {
    const body = JSON.parse(init?.body ?? '{}');
    calls.push(body.IdUsuario ? `paciente:${body.IdUsuario}:${body.FechaInicio.slice(0, 8)}` : `nodo:${body.FechaInicio.slice(0, 8)}`);
    const item = { Id: 9, IdCita: 0, IdUsp: 4242, Fecha: '20260903 213000', RutPaciente: '25106217k', NombreCompleto: 'Paciente Uno',
      TipoDeAtencion: 'Morbilidad Medica', Diagnosticos: [], Actividades: [], FuncionariosPrestadores: [{ Id: OFFICER, NombreCompleto: 'Opazo Damiani Daniel' }] };
    const data = body.IdUsuario ? [{ ...item, IdCita: 555, FechaCita: '20260904 090000' }] : [item];
    return new Response(JSON.stringify(data), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
  const r = await loadHistorial('tok', ['20260903'], new Set());
  assert.deepEqual(calls, ['nodo:20260903', 'paciente:4242:20260903']);
  const a = r.atenciones.find(x => x.id === 9);
  assert.equal(a.idCita, 555);
  assert.equal(a.fechaCita8, '20260904');
  assert.equal(a.fecha8, '20260903', 'en el almacén sigue bajo su día de guardado');
});

// ── Bordes que la mutación mostró sin defender (Stryker, 05-09-2026: historial-merge.js 70 %) ──

test('aggregateTeam: espontáneas, urgencias y las etiquetas «sin tipo» / «sin instrumento»', () => {
  const agg = aggregateTeam([
    atencion({ Id: 1, EsEspontanea: true, TipoDeAtencion: '', FuncionariosPrestadores: [{ Id: 5, NombreCompleto: 'Pérez Tuki Ana María', NombreInstrumento: '' }] }),
    atencion({ Id: 2, EsEspontanea: false, EsUrgencia: true }),
  ]);
  assert.equal(agg.total, 2);
  assert.equal(agg.espontaneas, 1);
  assert.equal(agg.urgencias, 1);
  assert.equal(agg.byTipo['(sin tipo)'], 1);
  assert.equal(agg.byInstrumento['(sin instrumento)'], 1);
});

test('mergeHistorial: con dos atenciones mías el mismo día se cruza la más temprana; los otros profesionales quedan como pista sin repetirse', () => {
  const tarde = atencion({ Id: 2, Fecha: '20260902 160000' }), temprano = atencion({ Id: 1, Fecha: '20260902 090000' });
  const out = mergeHistorial([cita()], [tarde, temprano]);
  assert.equal(out[0].atencionId, 1, 'la primera del día');
  const otros = [1, 2].map(i => atencion({ Id: 10 + i, FuncionariosPrestadores: [{ Id: 7, NombreCompleto: 'Pakarati Hito Kine', NombreInstrumento: 'Kinesiología' }] }));
  const pista = mergeHistorial([cita()], [...otros, atencion({ Id: 13, FuncionariosPrestadores: [{ Id: 8, NombreCompleto: 'Riroroko Haoa Luis', NombreInstrumento: 'Matrona' }] })]);
  assert.equal(pista[0].otrosEseDia, 'Pakarati Hito Kine, Riroroko Haoa Luis', 'sin duplicados, separados por coma');
  assert.equal(pista[0].atencionId, null);
});

test('mergeHistorial: la fila cruzada toma de la atención lo que la cita no trae, y nunca al revés', () => {
  const dos = atencion({ Id: 1, FuncionariosPrestadores: [{ Id: OFFICER, NombreCompleto: 'Opazo Damiani Daniel' }, { Id: 9, NombreCompleto: 'Pérez Tuki Ana María' }] });
  const [sinTipo] = mergeHistorial([cita({ tipoAtencion: '', sexo: '' })], [dos]);
  assert.equal(sinTipo.prestador, 'Opazo Damiani Daniel, Pérez Tuki Ana María');
  assert.equal(sinTipo.tipoAtencion, 'Morbilidad Medica', 'la cita sin tipo toma el de la atención');
  assert.equal(sinTipo.sexo, 'Mujer');
  assert.deepEqual(sinTipo.proximoControl, [], 'sin órdenes internas, lista vacía y no undefined');
  const [conTipo] = mergeHistorial([cita({ tipoAtencion: 'Control Crónico', sexo: 'Hombre' })], [atencion({ Id: 1 })]);
  assert.deepEqual([conTipo.tipoAtencion, conTipo.sexo], ['Control Crónico', 'Hombre'], 'lo que la agenda dice, se conserva');
});

test('mergeHistorial: la fila suelta declara su origen y no arrastra datos de agenda inventados', () => {
  const [esp] = mergeHistorial([], [atencion({ Id: 7, EsEspontanea: true })]);
  assert.equal(esp.estado, 'Espontánea');
  assert.equal(esp.prestador, 'Opazo Damiani Daniel');
  assert.deepEqual([esp.nombres, esp.ap, esp.am, esp.prevision, esp.sector, esp.razon, esp.telefono, esp.direccion, esp.esIC, esp.icCitadoPor, esp.icSIC], ['', '', '', '', '', '', '', '', false, '', '']);
  assert.equal(mergeHistorial([], [atencion({ Id: 8, EsEspontanea: false })])[0].estado, 'Sin cita');
});

test('mergeHistorial: los estados que descartan una cita, con espacios dobles y acentos', () => {
  for (const estado of ['No Atendido', 'No  atendido', 'No se presentó', 'no  se  presentó', 'Anulada', 'Cancelada', 'Suspendida']) {
    assert.equal(mergeHistorial([cita({ estado })], [atencion({ Id: 9, Fecha: '20260904 174500' })]).length, 2, `«${estado}» no recibe ficha`);
  }
  for (const estado of ['Completado', 'Atendido', 'Confirmado', 'Agendado']) {
    assert.equal(mergeHistorial([cita({ estado })], [atencion({ Id: 9, Fecha: '20260904 174500' })]).length, 1, `«${estado}» sí recibe ficha`);
  }
});

test('mergeHistorial: los límites exactos de la ventana (14 días antes, 7 después) y el desempate hacia la cita anterior', () => {
  const guardado = '20260915 120000';
  const en = (d8, estado = 'Completado') => cita({ id: Number(d8), fecha8: d8, fechaAtencion: `${d8.slice(6)}-${d8.slice(4, 6)}-${d8.slice(0, 4)}`, estado });
  assert.equal(mergeHistorial([en('20260901')], [atencion({ Id: 9, Fecha: guardado })])[0].atencionId, 9, '14 días antes: dentro');
  assert.equal(mergeHistorial([en('20260831')], [atencion({ Id: 9, Fecha: guardado })])[0].atencionId, null, '15 días antes: fuera');
  assert.equal(mergeHistorial([en('20260922', 'Confirmado')], [atencion({ Id: 9, Fecha: guardado })])[0].atencionId, 9, '7 días después: dentro');
  assert.equal(mergeHistorial([en('20260923', 'Confirmado')], [atencion({ Id: 9, Fecha: guardado })])[0].atencionId, null, '8 días después: fuera');
  const empate = mergeHistorial([en('20260913'), en('20260917', 'Confirmado')], [atencion({ Id: 9, Fecha: guardado })]);
  assert.equal(empate.find(c => c.id === 20260913).atencionId, 9, 'a igual distancia gana la cita anterior: una ficha cerrada tarde es más frecuente que una abierta con dos días de anticipación');
  assert.equal(empate.find(c => c.id === 20260917).atencionId, null);
  assert.equal(empate.find(c => c.id === 20260913).cruceEstimado, true);
});

test('mergeHistorial: el cruce exacto cae a la fecha de la cita cuando el id no está, y nunca usa una atención ajena', () => {
  const citas = [cita({ id: 1, fecha8: '20260902', fechaAtencion: '02-09-2026' }), cita({ id: 2, fecha8: '20260908', fechaAtencion: '08-09-2026', estado: 'Confirmado' })];
  const porFecha = mergeHistorial(citas, [{ ...atencion({ Id: 9, Fecha: '20260903 213000' }), idCita: 999, fechaCita8: '20260908' }]);
  assert.equal(porFecha.find(c => c.id === 2).atencionId, 9, 'id desconocido pero fecha de cita conocida');
  const ajena = { ...atencion({ Id: 9, Fecha: '20260903 213000', FuncionariosPrestadores: [{ Id: 7, NombreCompleto: 'Pakarati Hito Kine' }] }), idCita: 2 };
  const out = mergeHistorial(citas, [ajena]);
  assert.equal(out.find(c => c.id === 2).atencionId, null, 'la atención de otro profesional no se cruza aunque declare la cita');
  assert.equal(out.length, 2, 'ni aparece como fila suelta');
});

test('aggregateTeam no crea claves vacías, y otrosEseDia omite al prestador sin nombre', () => {
  const agg = aggregateTeam([atencion({ Id: 1, FuncionariosPrestadores: [{ Id: 5, NombreCompleto: '', NombreInstrumento: 'Kinesiología' }] })]);
  assert.equal(Object.keys(agg.byPrestador).includes(''), false);
  const out = mergeHistorial([cita()], [atencion({ Id: 11, FuncionariosPrestadores: [{ Id: 7, NombreCompleto: '' }, { Id: 8, NombreCompleto: 'Riroroko Haoa Luis' }] })]);
  assert.equal(out[0].otrosEseDia, 'Riroroko Haoa Luis');
});

test('mergeHistorial: el cruce tardío también toma tipo, sexo, prestadores y órdenes internas de la atención', () => {
  const control = [{ id: 1, fecha8: '20261001', fecha: '01-10-2026', motivo: 'Control', descartada: false }];
  const a = { ...atencion({ Id: 9, Fecha: '20260904 174500', FuncionariosPrestadores: [{ Id: OFFICER, NombreCompleto: 'Opazo Damiani Daniel' }, { Id: 9, NombreCompleto: 'Pérez Tuki Ana María' }] }), proximoControl: control };
  const [fila] = mergeHistorial([cita({ tipoAtencion: '', sexo: '' })], [a]);
  assert.deepEqual([fila.tipoAtencion, fila.sexo, fila.prestador, fila.proximoControl], ['Morbilidad Medica', 'Mujer', 'Opazo Damiani Daniel, Pérez Tuki Ana María', control]);
  const [mismoDia] = mergeHistorial([cita()], [{ ...atencion({ Id: 1 }), proximoControl: control }]);
  assert.deepEqual(mismoDia.proximoControl, control, 'el cruce del mismo día conserva las órdenes internas');
  const [suelta] = mergeHistorial([], [atencion({ Id: 2, FuncionariosPrestadores: [{ Id: OFFICER, NombreCompleto: 'Opazo Damiani Daniel' }, { Id: 9, NombreCompleto: 'Pérez Tuki Ana María' }] })]);
  assert.equal(suelta.prestador, 'Opazo Damiani Daniel, Pérez Tuki Ana María');
});

test('mergeHistorial: una cita que ya tiene su atención no recibe otra, ni por id ni por cercanía; el id manda sobre la fecha', () => {
  const c = cita();
  const conId = mergeHistorial([c], [atencion({ Id: 1 }), { ...atencion({ Id: 9, Fecha: '20260904 174500' }), idCita: 100 }]);
  assert.equal(conId[0].atencionId, 1, 'la del mismo día se queda');
  assert.equal(conId.length, 2, 'la tardía queda suelta aunque declare esa cita');
  const cercana = mergeHistorial([c], [atencion({ Id: 1 }), atencion({ Id: 9, Fecha: '20260904 174500' })]);
  assert.equal(cercana[0].atencionId, 1);
  assert.equal(cercana.length, 2);
  const citas = [cita({ id: 1, fecha8: '20260902', fechaAtencion: '02-09-2026' }), cita({ id: 2, fecha8: '20260908', fechaAtencion: '08-09-2026', estado: 'Confirmado' })];
  const ambos = mergeHistorial(citas, [{ ...atencion({ Id: 9, Fecha: '20260903 213000' }), idCita: 1, fechaCita8: '20260908' }]);
  assert.equal(ambos.find(x => x.id === 1).atencionId, 9, 'con id y fecha en desacuerdo, el id de la cita manda');
  assert.equal(ambos.find(x => x.id === 2).atencionId, null);
});

test('mergeHistorial: el desempate hacia la cita anterior no depende del orden de la agenda', () => {
  const en = (d8, estado = 'Completado') => cita({ id: Number(d8), fecha8: d8, fechaAtencion: `${d8.slice(6)}-${d8.slice(4, 6)}-${d8.slice(0, 4)}`, estado });
  const out = mergeHistorial([en('20260917', 'Confirmado'), en('20260913')], [atencion({ Id: 9, Fecha: '20260915 120000' })]);
  assert.equal(out.find(c => c.id === 20260913).atencionId, 9);
  assert.equal(out.find(c => c.id === 20260917).atencionId, null);
});
