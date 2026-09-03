import { test } from 'node:test';
import assert from 'node:assert/strict';
import { summarizeLoad } from '../src/load-summary.js';

test('el estado de una carga terminada muestra sólo el total útil', () => {
  assert.deepEqual(summarizeLoad(134, { failedDays: 0, historialFailed: 0 }), {
    text: '134 atenciones', cls: 'ok',
  });
  assert.deepEqual(summarizeLoad(1, { failedDays: 2, historialFailed: 0 }), {
    text: '1 atención', cls: 'warn',
  });
});
