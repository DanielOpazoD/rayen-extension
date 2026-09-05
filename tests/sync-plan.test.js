import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planSync, retentionMin8, isMutableAppointmentStatus } from '../src/io/sync-plan.js';
import { localDateStr } from '../src/core/parser.js';

const HOY = new Date(2026, 8, 4);
const d8 = d => localDateStr(d);
const hace = n => { const x = new Date(HOY); x.setDate(x.getDate() - n); return d8(x); };
const salud = (agenda = [], historial = []) => ({ agenda: { failedItems: agenda }, historial: { failedItems: historial } });

test('cache-first: con todo en caché sólo hoy sale a la red', () => {
  const fetched = new Set(); for (let i = 0; i <= 31; i++) fetched.add(hace(i));
  const p = planSync({ months: 1, retentionMonths: 13, records: [], fetchedDates: fetched, previousSync: salud(), today: HOY });
  assert.deepEqual(p.toFetch, [d8(HOY)]); assert.equal(p.todayStr, d8(HOY)); assert.equal(p.coupledHistoryDates.length, 0);
});

test('una cita histórica en estado mutable vuelve a pedirse y acopla su historial', () => {
  const fetched = new Set(); for (let i = 0; i <= 31; i++) fetched.add(hace(i));
  const p = planSync({ months: 1, retentionMonths: 13, records: [{ fecha8: hace(3), estado: 'Iniciada' }, { fecha8: hace(5), estado: 'Completado' }], fetchedDates: fetched, previousSync: salud(), today: HOY });
  assert.deepEqual(p.toFetch, [hace(3), d8(HOY)]); assert.deepEqual(p.coupledHistoryDates, [hace(3)]);
  assert.ok(p.refreshDates.has(hace(3)) && !p.refreshDates.has(hace(5)));
});

test('reintento: sólo lo pendiente dentro de la ventana; el historial acoplado se limita a lo pendiente', () => {
  const p = planSync({ months: 1, retentionMonths: 3, retryOnly: true, records: [{ fecha8: hace(2), estado: 'Iniciada' }, { fecha8: hace(4), estado: 'Iniciada' }],
    fetchedDates: new Set(), previousSync: salud([hace(2), hace(200), 'basura', '20990101'], [hace(1), hace(400)]), today: HOY });
  assert.deepEqual(p.toFetch, [hace(2)], 'fuera de retención, inválidas y futuras se descartan');
  assert.deepEqual(p.coupledHistoryDates, [hace(2)]);
  assert.deepEqual(p.priorHistoryDates, [hace(1)]);
  assert.equal(p.historyRefreshDates.has(hace(1)), false, 'en reintento el historial previo no se mezcla con el refresco');
});

test('sin reintento, el historial pendiente de antes se suma al refresco', () => {
  const p = planSync({ months: 1, retentionMonths: 13, records: [], fetchedDates: new Set(), previousSync: salud([], [hace(9)]), today: HOY });
  assert.ok(p.historyRefreshDates.has(hace(9)) && p.historyRefreshDates.has(d8(HOY)));
  assert.equal(p.toFetch.length, p.allDates.length, 'caché vacía: todo el período');
});

test('retentionMin8 e isMutableAppointmentStatus', () => {
  assert.equal(retentionMin8(3, HOY), '20260604');
  assert.equal(isMutableAppointmentStatus('Confirmada'), true); assert.equal(isMutableAppointmentStatus('Completado'), false);
});
