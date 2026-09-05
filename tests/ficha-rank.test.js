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
