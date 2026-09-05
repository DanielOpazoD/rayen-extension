import { test } from 'node:test';
import assert from 'node:assert/strict';
import { state, setData, setNote, on } from '../src/io/state.js';
import { esc } from '../src/core/text.js';

test('setNote deja la misma nota en todas las filas del paciente y avisa una sola vez', () => {
  const a = { id: 1, run: '6543210-2', nombre: 'Rosa', note: '' }, b = { id: 2, run: '6543210-2', nombre: 'Rosa', note: '' }, c = { id: 3, run: '1-9', nombre: 'Otro', note: '' };
  setData({ allData: [a, b, c] });
  let avisos = 0; on('notes', () => avisos++);
  setNote(a, 'Vive sola', [{ at: null, text: 'Vive sola' }]);
  assert.equal(b.note, 'Vive sola'); assert.deepEqual(b.notas, [{ at: null, text: 'Vive sola' }]); assert.equal(c.note, '');
  assert.equal(avisos, 1); assert.equal(state.allData.filter(r => r.note === 'Vive sola').length, 2);
});

test('esc escapa comillas: un valor dentro de un atributo no puede cerrarlo', () => {
  assert.equal(esc(`a"b'c<d>&`), 'a&quot;b&#39;c&lt;d&gt;&amp;');
  assert.equal(esc(null), ''); assert.equal(esc(0), '0');
});
