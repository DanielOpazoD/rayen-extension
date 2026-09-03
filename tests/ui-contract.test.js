import { test } from 'node:test';
import assert from 'node:assert/strict';
import { prioridadInfo } from '../src/config.js';
import { stateTone, sicTone } from '../src/dom.js';

test('prioridadInfo never invents a severity label', () => {
  for (const n of [1, 2, 3]) {
    const { code, hint } = prioridadInfo(n);
    assert.equal(code, `P${n}`, 'shows the raw code Rayen sends');
    assert.match(hint, /Rayen no envía|no visto/, 'the hover text says the label is not from the API');
    assert.doesNotMatch(code, /Alta|Media|Baja/, 'no guessed label leaks into the visible text');
  }
});

test('prioridadInfo degrades for an unseen code instead of throwing', () => {
  const { code, hint } = prioridadInfo(9);
  assert.equal(code, 'P9');
  assert.match(hint, /no visto/);
});

test('stateTone maps appointment states to semantic tones', () => {
  assert.equal(stateTone('Completado'), 'ok');
  assert.equal(stateTone('No se presentó a la cita'), 'bad');
  assert.equal(stateTone('Iniciado'), 'warn');
  assert.equal(stateTone('Espontánea'), 'info');
  assert.equal(stateTone('Sin cita'), 'info');
  assert.equal(stateTone('Otro'), 'neutral');
  assert.equal(stateTone(''), 'neutral');
});

test('sicTone maps every SIC lifecycle group, with a safe default', () => {
  assert.deepEqual(
    ['pendiente', 'enviada', 'atendida', 'cerrada', 'fallida'].map(sicTone),
    ['warn', 'info', 'ok', 'neutral', 'bad'],
  );
  assert.equal(sicTone('otro'), 'neutral');
  assert.equal(sicTone(), 'neutral');
});
