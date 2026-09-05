import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toDate8, fromDate8, diasEntre, date8FromDMY, minusMonths8, fmtIso, fmtDMY } from '../src/core/dates.js';
import { localDateStr } from '../src/core/parser.js';
import { retentionMin8 } from '../src/core/sync-plan.js';

/**
 * Única implementación de cada utilidad de fecha. Antes había cuatro copias de
 * «Date → YYYYMMDD» y ocho de «YYYYMMDD → Date» repartidas por core, io y ui;
 * estas tablas fijan el contrato que todas compartían sin saberlo.
 */
test('toDate8 y fromDate8 son inversas y trabajan en hora local (sin saltos por UTC)', () => {
  for (const [y, m, d] of [[2026, 0, 1], [2026, 8, 5], [2024, 1, 29], [2026, 11, 31]]) {
    const date = new Date(y, m, d, 23, 30); // tarde en el día: en UTC ya sería «mañana» en Chile
    const d8 = toDate8(date);
    assert.equal(d8.length, 8);
    assert.deepEqual([fromDate8(d8).getFullYear(), fromDate8(d8).getMonth(), fromDate8(d8).getDate()], [y, m, d]);
  }
  assert.equal(toDate8(new Date(2026, 8, 5)), '20260905');
  assert.equal(localDateStr(new Date(2026, 8, 5)), '20260905', 'el alias histórico de parser.js sigue valiendo');
});

test('fromDate8 acepta la fecha-hora de Rayen y rechaza lo que no es fecha', () => {
  assert.equal(fromDate8('20260905 104013').getDate(), 5);
  assert.equal(fromDate8('00010101 000000'), null, 'el centinela de Rayen no es una fecha');
  assert.equal(fromDate8(''), null);
  assert.equal(fromDate8(null), null);
  assert.equal(fromDate8('05-09-2026'), null, 'DD-MM-YYYY no es fecha8');
});

test('diasEntre: signo por orden, null si falta una fecha', () => {
  assert.equal(diasEntre('20260902', '20260904'), 2);
  assert.equal(diasEntre('20260904', '20260902'), -2);
  assert.equal(diasEntre('20260904', '20260904'), 0);
  assert.equal(diasEntre('20261031', '20261101'), 1, 'cruza el cambio de mes');
  assert.equal(diasEntre('', '20260904'), null);
});

test('date8FromDMY lee «DD-MM-YYYY» con o sin hora', () => {
  assert.equal(date8FromDMY('04-09-2026'), '20260904');
  assert.equal(date8FromDMY('04-09-2026 10:30'), '20260904');
  assert.equal(date8FromDMY('2026-09-04'), '');
  assert.equal(date8FromDMY(''), '');
});

test('minusMonths8 es la retención canónica y retentionMin8 la reutiliza', () => {
  const hoy = new Date(2026, 8, 5);
  assert.equal(minusMonths8(3, hoy), '20260605');
  assert.equal(minusMonths8(12, hoy), '20250905');
  assert.equal(minusMonths8(0, hoy), '20260905');
  assert.equal(retentionMin8(3, hoy), minusMonths8(3, hoy));
  // Fin de mes: JavaScript desborda al mes siguiente (31-05 → «31-04» = 01-05); documentado, no corregido.
  assert.equal(minusMonths8(1, new Date(2026, 4, 31)), '20260501');
});

test('fmtIso y fmtDMY formatean con ceros a la izquierda', () => {
  const d = new Date(2026, 0, 7);
  assert.equal(fmtIso(d), '2026-01-07');
  assert.equal(fmtDMY(d), '07/01/2026');
});
