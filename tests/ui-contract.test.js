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

// ── Command palette ────────────────────────────────────────────
import { searchPatients } from '../src/palette.js';

const pac = (nombre, runStr, extra = {}) => ({ nombre, runStr, edad: 40, fechaAtencion: '01-09-2026', ...extra });
const PACS = [
  pac('Gabriela Keisy Torres Haoa', '13.754.664-7'),
  pac('Gabriel Pakarati Araki',     '17.616.600-2'),
  pac('Luis Oyaneder Lagos',        '17.752.753-K'),
  pac('María Tuki Pakomio',         '9.876.543-2'),
];

test('searchPatients: sin consulta devuelve el principio de la lista', () => {
  assert.equal(searchPatients(PACS, '', 2).length, 2);
  assert.equal(searchPatients(PACS, '   ')[0].nombre, PACS[0].nombre);
});

test('searchPatients: prefijo de RUN gana sobre coincidencia parcial', () => {
  const r = searchPatients(PACS, '17.752');
  assert.equal(r[0].runStr, '17.752.753-K');
  assert.equal(searchPatients(PACS, '17752753')[0].runStr, '17.752.753-K', 'sin puntos ni guion también');
});

test('searchPatients: exige todos los términos y prioriza inicio de palabra', () => {
  assert.deepEqual(searchPatients(PACS, 'torres haoa').map(p => p.nombre), ['Gabriela Keisy Torres Haoa']);
  assert.equal(searchPatients(PACS, 'gabri').length, 2, 'ambos Gabriel/Gabriela');
  assert.deepEqual(searchPatients(PACS, 'zzz'), []);
});

test('searchPatients ignora acentos', () => {
  assert.deepEqual(searchPatients(PACS, 'maria').map(p => p.nombre), ['María Tuki Pakomio']);
});
