import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rankProblems, prescripcionEstado } from '../src/ficha-rank.js';

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
  assert.equal(r[2].n, 2); assert.equal(r[2].cronico, false, 'dos episodios de lumbago no lo hacen crónico');
  assert.equal(r[3].cronico, false);
});

test('rankProblems marca lo mío y usa el nombre más reciente del mismo código', () => {
  const visits = [
    visita('01-09-2026', [dx('DM2', { codigo: 'E11' })], [{ id: 439550, nombre: 'Yo' }]),
    visita('01-07-2026', [dx('Diabetes mellitus tipo 2', { codigo: 'E11' })], [{ id: 7, nombre: 'Otro' }]),
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
