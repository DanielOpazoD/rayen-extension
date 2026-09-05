import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rankProblems, prescripcionEstado, proximoControlSugerido } from '../src/core/ficha-rank.js';

const dx = (nombre, over = {}) => ({ nombre, clasificacion: nombre, codigo: '', certeza: 'Confirmada', esAuge: false, ...over });
const visita = (fechaAtencion, diagnosticos, prestadores = []) => ({ fechaAtencion, fecha8: fechaAtencion.split('-').reverse().join(''), diagnosticos, prestadores });

test('rankProblems agrupa por problema y ordena por peso: GES, crónicos, recurrentes, recientes', () => {
  const visits = [
    visita('01-09-2026', [dx('Resfrío común', { codigo: 'J00' })]),
    visita('20-08-2026', [dx('Diabetes mellitus tipo 2', { codigo: 'E11', esAuge: true })]),
    visita('10-08-2026', [dx('Lumbago', { codigo: 'M54.5' }), dx('Diabetes mellitus tipo 2', { codigo: 'E11', esAuge: true })]),
    visita('01-08-2026', [dx('Lumbago', { codigo: 'M54.5' })]),
    visita('15-07-2026', [dx('Hipertensión arterial', { codigo: 'I10' })]),
  ];
  const r = rankProblems(visits);
  assert.deepEqual(r.map(p => p.nombre), ['Diabetes mellitus tipo 2', 'Hipertensión arterial', 'Lumbago', 'Resfrío común']);
  const dm = r[0];
  assert.equal(dm.n, 2); assert.equal(dm.ultima, '20-08-2026'); assert.equal(dm.primera, '10-08-2026'); assert.equal(dm.cronico, true);
  assert.equal(r[2].n, 2); assert.equal(r[2].cronico, false, 'dos episodios de lumbago no lo hacen crónico'); assert.equal(r[2].recurrente, false);
  assert.equal(r[3].cronico, false);
});

test('rankProblems marca lo mío y usa el nombre más reciente del mismo código', () => {
  const visits = [
    visita('01-09-2026', [dx('DM2', { codigo: 'E11' })], [{ id: 439550, nombre: 'Opazo Damiani Daniel' }]),
    visita('01-07-2026', [dx('Diabetes mellitus tipo 2', { codigo: 'E11' })], [{ id: 7, nombre: 'Pérez Tuki Ana María' }]),
  ];
  const [p] = rankProblems(visits, { officerId: 439550 });
  assert.equal(p.n, 2); assert.equal(p.nombre, 'DM2'); assert.equal(p.mio, true);
  const [ajena] = rankProblems([visits[1]], { officerId: 439550 });
  assert.equal(ajena.mio, false);
});

test('prescripcionEstado lee la duración escrita y asume 30 días si no la hay', () => {
  const hoy = new Date(2026, 8, 4); // 04-09-2026
  assert.equal(prescripcionEstado('Losartan 50 mg : 1 comprimido cada 12 horas por 6 meses', '20260601', { hoy }), 'activa');
  assert.equal(prescripcionEstado('Losartan 50 mg : 1 comprimido cada 12 horas por 6 meses', '20260101', { hoy }), 'vencida');
  assert.equal(prescripcionEstado('Amoxicilina 500 mg cada 8 horas por 7 días', '20260901', { hoy }), 'activa');
  assert.equal(prescripcionEstado('Amoxicilina 500 mg cada 8 horas por 7 días', '20260801', { hoy }), 'vencida');
  assert.equal(prescripcionEstado('Paracetamol 500 mg', '20260820', { hoy }), 'activa', 'sin duración, 30 días');
  assert.equal(prescripcionEstado('Paracetamol 500 mg', '20260701', { hoy }), 'vencida');
  assert.equal(prescripcionEstado('Metformina por 12 meses', '20260101', { hoy, suspendido: true }), 'suspendida');
  assert.equal(prescripcionEstado('X', '', { hoy }), 'activa', 'sin fecha no se da por vencida');
});

test('la frecuencia rotula «recurrente», no «crónico»: siete bronquitis agudas siguen siendo agudas', () => {
  const v = n => ({ fechaAtencion: `0${n}-08-2026`, diagnosticos: [{ nombre: 'Bronquitis aguda', codigo: 'J20.9' }] });
  const [b] = rankProblems([v(1), v(2), v(3)], {});
  assert.equal(b.n, 3); assert.equal(b.cronico, false); assert.equal(b.recurrente, true);
});

test('crónico pesa más que recurrente aunque tenga menos registros', () => {
  const v = (d, n) => ({ fechaAtencion: `0${n}-08-2026`, diagnosticos: [{ nombre: 'Bronquitis aguda', codigo: 'J20.9' }] });
  const visits = [v(0, 1), v(0, 2), v(0, 3), v(0, 4), v(0, 5), { fechaAtencion: '01-01-2026', diagnosticos: [{ nombre: 'Diabetes mellitus tipo 2', codigo: 'E11' }] }];
  const r = rankProblems(visits, {});
  assert.equal(r[0].nombre, 'Diabetes mellitus tipo 2'); assert.equal(r[0].cronico, true);
  assert.equal(r[1].recurrente, true);
});

test('un nombre que niega el problema no lo vuelve crónico; «crónica» en el nombre sí', () => {
  const visits = [{ fechaAtencion: '01-08-2026', diagnosticos: [{ nombre: 'Sin diabetes', codigo: '' }, { nombre: 'Descarta hipertensión arterial', codigo: '' }, { nombre: 'Gastritis crónica', codigo: 'K29.5' }] }];
  const by = Object.fromEntries(rankProblems(visits, {}).map(p => [p.nombre, p.cronico]));
  assert.equal(by['Sin diabetes'], false); assert.equal(by['Descarta hipertensión arterial'], false); assert.equal(by['Gastritis crónica'], true);
});

test('proximoControlSugerido ignora órdenes descartadas y fechas pasadas', () => {
  const visits = [
    { fechaAtencion: '05-08-2026', proximoControl: [{ fecha: '04-09-2026', fecha8: '20260904', descartada: true }] },
    { fechaAtencion: '20-08-2026', proximoControl: [{ fecha: '01-09-2026', fecha8: '20260901' }, { fecha: '20-10-2026', fecha8: '20261020' }] },
  ];
  const p = proximoControlSugerido(visits, '20260904');
  assert.equal(p.fecha, '20-10-2026'); assert.equal(p.desde, '20-08-2026');
  assert.equal(proximoControlSugerido([visits[0]], '20260904'), null);
});

// ── Bordes que la mutación mostró sin defender (Stryker, 05-09-2026: ficha-rank.js 63 %) ──
const solo = (nombre, codigo = '', extra = {}) => rankProblems([{ fechaAtencion: '01-09-2026', fecha8: '20260901', prestadores: [], diagnosticos: [{ nombre, clasificacion: nombre, codigo, ...extra }] }])[0];

test('crónico por código CIE-10: cada prefijo del catálogo, y los vecinos que no lo son', () => {
  for (const c of ['E10', 'E11', 'E14', 'E78', 'E66', 'I10', 'I15', 'I20', 'I25', 'I48', 'I50', 'J44', 'J45', 'N18', 'M05', 'M06', 'M15', 'M19', 'F20', 'F29', 'F31', 'F33', 'F41', 'G40', 'G20', 'K21', 'E03', 'E05', 'D50', 'B20', 'B24', 'C34', 'c50', 'E11.9']) {
    assert.equal(solo('Problema en estudio', c).cronico, true, `${c} es crónico`);
  }
  for (const c of ['E15', 'E77', 'E67', 'I16', 'I26', 'I47', 'I51', 'J43', 'J46', 'N17', 'M04', 'M07', 'M14', 'M20', 'F30', 'F34', 'F42', 'G41', 'G21', 'K22', 'E04', 'E06', 'D51', 'B25', 'XE10', 'A01']) {
    assert.equal(solo('Problema en estudio', c).cronico, false, `${c} no es crónico`);
  }
});

test('crónico por palabra: cada término del catálogo, y la negación al inicio lo anula', () => {
  for (const w of ['Diabetes tipo 2', 'Hipertensión arterial', 'EPOC', 'Asma bronquial', 'Hipotiroidismo', 'Dislipidemia', 'Obesidad', 'Artritis', 'Artrosis', 'Insuficiencia renal', 'Insuficiencia  cardiaca', 'Epilepsia', 'Depresión', 'Ansiedad', 'Esquizofrenia', 'Trastorno bipolar', 'Parkinson', 'Reflujo', 'Esófago de Barrett', 'Anemia', 'Dolor crónico', 'Gastritis cronica']) {
    assert.equal(solo(w).cronico, true, `«${w}» es crónico`);
  }
  for (const w of ['Sin diabetes', ' Sin diabetes', 'No diabetes', 'Descarta diabetes', 'Descartada diabetes', 'Descartado diabetes', 'Niega diabetes', 'Sospecha de diabetes', 'Sin diabetes', 'NO hipertensión']) {
    assert.equal(solo(w).cronico, false, `«${w}» está negado`);
  }
  for (const w of ['Sinusitis con asma', 'Sospecha diabetes', 'Nódulo con anemia']) assert.equal(solo(w).cronico, true, `«${w}» no está negado`);
  assert.equal(solo('Bronquitis aguda').cronico, false);
});

test('rankProblems agrupa por código, luego por clasificación, luego por nombre; salta los vacíos y «no informado»', () => {
  const v = (fecha8, dx, prestadores = []) => ({ fechaAtencion: `${fecha8.slice(6)}-${fecha8.slice(4, 6)}-${fecha8.slice(0, 4)}`, fecha8, prestadores, diagnosticos: dx });
  const porCodigo = rankProblems([v('20260901', [{ nombre: 'DM2', codigo: 'E11' }]), v('20260902', [{ nombre: 'Diabetes mellitus tipo 2', codigo: 'E11' }])]);
  assert.equal(porCodigo.length, 1);
  assert.deepEqual([porCodigo[0].n, porCodigo[0].nombre, porCodigo[0].primera, porCodigo[0].ultima], [2, 'Diabetes mellitus tipo 2', '01-09-2026', '02-09-2026'], 'el nombre es el de la última visita');
  const porClas = rankProblems([v('20260901', [{ nombre: 'A', clasificacion: 'HTA' }]), v('20260902', [{ nombre: 'B', clasificacion: 'HTA' }])]);
  assert.equal(porClas.length, 1);
  const porNombre = rankProblems([v('20260901', [{ nombre: 'Lumbago' }]), v('20260902', [{ nombre: 'Lumbago' }]), v('20260903', [{ nombre: 'Cefalea' }])]);
  assert.deepEqual(porNombre.map(p => [p.nombre, p.n]), [['Lumbago', 2], ['Cefalea', 1]]);
  assert.deepEqual(rankProblems([v('20260901', [{ nombre: '' }, { nombre: 'No informado' }, { nombre: 'Diagnóstico no informado' }])]), []);
  // Desordenadas en la lista: primera y última salen de las fechas, no del orden.
  const desorden = rankProblems([v('20260905', [{ nombre: 'X' }]), v('20260901', [{ nombre: 'X' }]), v('20260903', [{ nombre: 'X' }])]);
  assert.deepEqual([desorden[0].primera, desorden[0].ultima], ['01-09-2026', '05-09-2026']);
  // Misma fecha: se conserva el nombre de la primera encontrada.
  assert.equal(rankProblems([v('20260901', [{ nombre: 'Primero', clasificacion: 'K' }]), v('20260901', [{ nombre: 'Segundo', clasificacion: 'K' }])])[0].nombre, 'Primero');
  // Sólo fechaAtencion (sin fecha8): también ordena.
  const sinFecha8 = rankProblems([{ fechaAtencion: '05-09-2026', prestadores: [], diagnosticos: [{ nombre: 'Y' }] }, { fechaAtencion: '01-09-2026', prestadores: [], diagnosticos: [{ nombre: 'Y' }] }]);
  assert.deepEqual([sinFecha8[0].primera, sinFecha8[0].ultima], ['01-09-2026', '05-09-2026']);
  assert.equal('stampUltima' in sinFecha8[0], false, 'los sellos internos no salen');
});

test('rankProblems: GES y «mío» se acumulan entre visitas; sin oficial nada es mío; el orden es GES, crónico, recurrente, n, reciente', () => {
  const v = (fecha8, dx, prestadores = []) => ({ fechaAtencion: `${fecha8.slice(6)}-${fecha8.slice(4, 6)}-${fecha8.slice(0, 4)}`, fecha8, prestadores, diagnosticos: dx });
  const yo = [{ id: 439550 }], otro = [{ id: 7 }];
  const acum = rankProblems([v('20260901', [{ nombre: 'X', esAuge: false }], otro), v('20260902', [{ nombre: 'X', esAuge: true }], yo)], { officerId: 439550 });
  assert.deepEqual([acum[0].esAuge, acum[0].mio], [true, true]);
  assert.equal(rankProblems([v('20260901', [{ nombre: 'X' }], yo)], { officerId: null })[0].mio, false);
  assert.equal(rankProblems([v('20260901', [{ nombre: 'X' }], yo)])[0].mio, false, 'por defecto no hay oficial');
  const orden = rankProblems([
    v('20260901', [{ nombre: 'Lumbago' }]), v('20260902', [{ nombre: 'Lumbago' }]), v('20260903', [{ nombre: 'Lumbago' }]), // recurrente (3)
    v('20260904', [{ nombre: 'Asma' }]),                                                                                  // crónico
    v('20260905', [{ nombre: 'Fractura', esAuge: true }]),                                                               // GES
    v('20260906', [{ nombre: 'Cefalea' }]), v('20260907', [{ nombre: 'Cefalea' }]),                                       // n = 2
    v('20260908', [{ nombre: 'Otitis' }]),                                                                                // n = 1, más reciente
    v('20260801', [{ nombre: 'Herida' }]),                                                                                // n = 1, más antigua
  ]);
  assert.deepEqual(orden.map(p => p.nombre), ['Fractura', 'Asma', 'Lumbago', 'Cefalea', 'Otitis', 'Herida']);
  assert.deepEqual([orden[2].recurrente, orden[3].recurrente], [true, false]);
});

test('prescripcionEstado: cada unidad de duración, con y sin espacio, y el último día sigue activa', () => {
  const desde = '20260901';
  const est = (texto, hoy) => prescripcionEstado(texto, desde, { hoy });
  assert.equal(est('por 10 días', new Date(2026, 8, 11)), 'activa');
  assert.equal(est('por 10 dias', new Date(2026, 8, 12)), 'vencida');
  assert.equal(est('por 1 día', new Date(2026, 8, 2)), 'activa');
  assert.equal(est('por 2 semanas', new Date(2026, 8, 15)), 'activa', 'catorce días después, último día');
  assert.equal(est('por 2 semanas', new Date(2026, 8, 16)), 'vencida');
  assert.equal(est('por 1 semana', new Date(2026, 8, 9)), 'vencida');
  assert.equal(est('por 1 mes', new Date(2026, 9, 1)), 'activa');
  assert.equal(est('por 1 mes', new Date(2026, 9, 2)), 'vencida');
  assert.equal(est('por  3 meses', new Date(2026, 11, 1)), 'activa', 'doble espacio');
  assert.equal(est('por 3meses', new Date(2026, 11, 2)), 'vencida', 'sin espacio antes de la unidad');
  assert.equal(est('por 1 año', new Date(2027, 8, 1)), 'activa');
  assert.equal(est('por 1 año', new Date(2027, 8, 2)), 'vencida');
  assert.equal(est('por 2 años', new Date(2028, 8, 1)), 'activa');
  assert.equal(est('por 2 anos', new Date(2028, 8, 1)), 'activa', 'sin eñe también');
  assert.equal(est('sin duración', new Date(2026, 9, 1)), 'activa', 'treinta días por defecto, último día');
  assert.equal(est('sin duración', new Date(2026, 9, 2)), 'vencida');
  assert.equal(prescripcionEstado('por 1 día', '2026090', { hoy: new Date(2030, 0, 1) }), 'activa', 'fecha malformada: no se da por vencida');
  assert.equal(prescripcionEstado('por 1 día', '20260901x', { hoy: new Date(2030, 0, 1) }), 'activa');
});

test('proximoControlSugerido: hoy cuenta, ayer no, descartadas fuera, la más próxima primero y con su atención de origen', () => {
  const visits = [
    { fechaAtencion: '01-08-2026', proximoControl: [{ fecha8: '20260920', fecha: '20-09-2026', descartada: false }, { fecha8: '20260910', fecha: '10-09-2026', descartada: true }] },
    { fechaAtencion: '15-08-2026', proximoControl: [{ fecha8: '20260905', fecha: '05-09-2026', descartada: false }, { fecha8: '20260904', fecha: '04-09-2026', descartada: false }, { fecha8: '', descartada: false }] },
    { fechaAtencion: '20-08-2026' },
  ];
  assert.deepEqual(proximoControlSugerido(visits, '20260905'), { fecha8: '20260905', fecha: '05-09-2026', descartada: false, desde: '15-08-2026' }, 'hoy mismo cuenta; el de ayer no');
  assert.equal(proximoControlSugerido(visits, '20260906').fecha8, '20260920', 'la descartada del 10 no cuenta');
  assert.equal(proximoControlSugerido(visits, '20260921'), null);
  assert.equal(proximoControlSugerido([], '20260901'), null);
});
