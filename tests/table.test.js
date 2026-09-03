import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sexLetter, sicRole, whenLabel, sortRecords } from '../src/table.js';
import { CONFIG } from '../src/config.js';

test('sexLetter reduces Rayen sex labels to one letter', () => {
  assert.equal(sexLetter('Mujer'), 'M');
  assert.equal(sexLetter('Hombre'), 'H');
  assert.equal(sexLetter('Indeterminado'), 'I');
  assert.equal(sexLetter(''), '');
});

test('whenLabel gives the weekday in words plus the hour', () => {
  assert.equal(whenLabel({ fecha8: '20260901', hora: '09:55' }), 'Martes · 09:55');
  assert.equal(whenLabel({ fecha8: '20260905', hora: '' }), 'Sábado');
  assert.equal(whenLabel({ fecha8: '', hora: '10:00' }), '10:00');
});

test('sicRole: Emití when I registered it, Recibí when I execute it or it opened my cita, Otra otherwise', () => {
  const me = CONFIG.officerId;
  const base = { registrador: { id: 1 }, ejecutor: { id: 2 } };
  assert.equal(sicRole({ ...base, registrador: { id: me } }), 'out');
  assert.equal(sicRole({ ...base, ejecutor: { id: me } }), 'in');
  assert.equal(sicRole(base, true), 'in', 'the SIC that generated my appointment counts as received');
  assert.equal(sicRole(base), 'other');
  assert.equal(sicRole({ registrador: { id: me }, ejecutor: { id: me } }), 'out', 'author wins over executor');
});

test('sortRecords sorts by date+hour and falls back to hour for ties', () => {
  const rows = [
    { id: 1, fechaAtencion: '01-09-2026', hora: '16:00' },
    { id: 2, fechaAtencion: '02-09-2026', hora: '09:00' },
    { id: 3, fechaAtencion: '01-09-2026', hora: '09:00' },
  ];
  assert.deepEqual(sortRecords(rows, 'fechaAtencion', -1).map(r => r.id), [2, 1, 3]);
  assert.deepEqual(sortRecords(rows, 'fechaAtencion', 1).map(r => r.id), [3, 1, 2]);
  const byAge = sortRecords([{ edad: 5, hora: '' }, { edad: null, hora: '' }, { edad: 40, hora: '' }], 'edad', 1);
  assert.deepEqual(byAge.map(r => r.edad), [null, 5, 40]);
});
