import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decodeMultiValue } from '../src/multi-select.js';

test('decodeMultiValue conserva selecciones múltiples únicas', () => {
  assert.deepEqual(decodeMultiValue('["Control","Morbilidad","Control"]'), ['Control', 'Morbilidad']);
  assert.deepEqual(decodeMultiValue('Control'), ['Control']);
  assert.deepEqual(decodeMultiValue(''), []);
});
