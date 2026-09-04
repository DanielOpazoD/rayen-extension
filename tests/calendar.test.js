import { test } from 'node:test';
import assert from 'node:assert/strict';
import { monthGrid, monthLabel, countsByDay, shiftMonth, toDate8 } from '../src/core/calendar.js';

test('monthGrid empieza en lunes, cubre el mes entero y marca hoy y el día elegido', () => {
  // Septiembre de 2026 empieza en martes.
  const counts = countsByDay([{ fecha8: '20260903' }, { fecha8: '20260903' }, { fecha8: '20260915' }]);
  const g = monthGrid(2026, 8, counts, { today8: '20260904', selected8: '20260903' });
  assert.equal(g[0][0].date8, '20260831', 'la primera celda es el lunes anterior');
  assert.equal(g[0][0].inMonth, false);
  assert.equal(g[0][1].date8, '20260901');
  const all = g.flat();
  assert.ok(all.some(c => c.date8 === '20260930' && c.inMonth), 'llega al último día');
  assert.equal(all.find(c => c.date8 === '20260903').count, 2);
  assert.equal(all.find(c => c.date8 === '20260903').isSelected, true);
  assert.equal(all.find(c => c.date8 === '20260904').isToday, true);
  assert.equal(all.find(c => c.date8 === '20260915').count, 1);
  assert.ok(g.every(w => w.length === 7));
  assert.ok(g.length === 5 || g.length === 6);
});

test('monthLabel, shiftMonth y toDate8', () => {
  assert.equal(monthLabel(2026, 8), 'septiembre 2026');
  assert.deepEqual(shiftMonth(2026, 11, 1), { year: 2027, month: 0 });
  assert.deepEqual(shiftMonth(2026, 0, -1), { year: 2025, month: 11 });
  assert.equal(toDate8(new Date(2026, 8, 4)), '20260904');
});
