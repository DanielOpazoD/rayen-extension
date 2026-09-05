import { test } from 'node:test';
import assert from 'node:assert/strict';
import { periodRange, resolveRange, inRange, isoToDate8, date8ToIso, PERIODS } from '../src/core/period.js';

const HOY = new Date(2026, 8, 3); // miércoles 3 de septiembre de 2026

test('periodRange: quick periods relative to a Wednesday', () => {
  assert.deepEqual(periodRange('hoy', HOY),    { from8: '20260903', to8: '20260903' });
  assert.deepEqual(periodRange('semana', HOY), { from8: '20260831', to8: '20260903' }, 'week starts on Monday');
  assert.deepEqual(periodRange('mes', HOY),    { from8: '20260901', to8: '20260903' });
  assert.deepEqual(periodRange('d30', HOY),    { from8: '20260805', to8: '20260903' });
  assert.deepEqual(periodRange('d90', HOY),    { from8: '20260606', to8: '20260903' });
  assert.deepEqual(periodRange('anio', HOY),   { from8: '20260101', to8: '20260903' });
  assert.deepEqual(periodRange('todo', HOY),   { from8: '', to8: '' });
  assert.deepEqual(periodRange('nope', HOY),   { from8: '', to8: '' });
});

test('resolveRange: explicit dates beat the chip; one bound may be open', () => {
  assert.deepEqual(resolveRange({ periodo: 'hoy', desde: '2026-08-01', hasta: '2026-08-15' }, HOY), { from8: '20260801', to8: '20260815' });
  assert.deepEqual(resolveRange({ periodo: 'hoy', desde: '2026-08-01' }, HOY), { from8: '20260801', to8: '' });
  assert.deepEqual(resolveRange({ periodo: 'd30' }, HOY), { from8: '20260805', to8: '20260903' });
});

test('inRange handles open bounds and missing dates', () => {
  assert.equal(inRange('20260810', '20260801', '20260815'), true);
  assert.equal(inRange('20260820', '20260801', '20260815'), false);
  assert.equal(inRange('20260820', '20260801', ''), true);
  assert.equal(inRange('20260720', '20260801', ''), false);
  assert.equal(inRange('', '', ''), true, 'no filter: keep rows without a date');
  assert.equal(inRange('', '20260801', ''), false, 'a filter drops rows without a date');
});

test('iso <-> date8 round-trips and rejects junk', () => {
  assert.equal(isoToDate8('2026-09-03'), '20260903');
  assert.equal(date8ToIso('20260903'), '2026-09-03');
  assert.equal(isoToDate8(''), '');
  assert.equal(isoToDate8('03-09-2026'), '');
  assert.equal(date8ToIso('x'), '');
});

test('every chip key has a label', () => {
  for (const k of Object.keys(PERIODS)) assert.ok(PERIODS[k].length > 0, k);
});

test('inRange incluye ambos extremos y sólo acepta sin fecha cuando no hay rango', () => {
  assert.equal(inRange('20260901', '20260901', '20260930'), true); assert.equal(inRange('20260930', '20260901', '20260930'), true);
  assert.equal(inRange('20261001', '20260901', '20260930'), false); assert.equal(inRange('20260831', '20260901', '20260930'), false);
  assert.equal(inRange('', '', ''), true); assert.equal(inRange('', '20260901', ''), false);
});
