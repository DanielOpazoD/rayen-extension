import { test } from 'node:test';
import assert from 'node:assert/strict';
import { monthGrid, monthLabel, countsByDay, shiftMonth } from '../src/core/calendar.js';
import { toDate8 } from '../src/core/dates.js';

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

test('monthGrid cuenta las citas futuras aparte de las atenciones', () => {
  const counts = new Map([['20260904', 3]]);
  const futuras = new Map([['20260908', 5], ['20260904', 1]]);
  const semanas = monthGrid(2026, 8, counts, { today8: '20260905', selected8: '20260908', futuras });
  const dia = d8 => semanas.flat().find(c => c.date8 === d8);
  assert.deepEqual([dia('20260904').count, dia('20260904').futuras], [3, 1], 'un día puede tener ambas cosas');
  assert.deepEqual([dia('20260908').count, dia('20260908').futuras], [0, 5]);
  assert.deepEqual([dia('20260907').count, dia('20260907').futuras], [0, 0]);
  assert.equal(dia('20260905').isToday, true);
  assert.equal(dia('20260908').isSelected, true);
  // Sin mapa de futuras, todo queda en cero: la rejilla no inventa citas.
  assert.equal(monthGrid(2026, 8, counts, { today8: '20260905' }).flat().every(c => c.futuras === 0), true);
});
