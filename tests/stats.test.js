import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyFilters } from '../src/stats.js';

const ME = 439550;
const NONE = { q: '', fecha: '', dia: '', sexo: '', estado: '', prev: '', tipo: '', prest: '', ic: '', dx: '' };

const rows = [
  { id: 1, nombre: 'Ana Pérez',  run: '1K',  runStr: '1-K', fechaAtencion: '01-09-2026', diaSemana: 'Mar', sexo: 'Mujer',  estado: 'Completado', prevision: 'Fonasa A', tipoAtencion: 'Morbilidad', prestadores: [{ nombre: 'Opazo' }], esIC: true,  esUrgencia: false, diagnosticos: [{ nombre: 'HTA', esAuge: true }] },
  { id: 2, nombre: 'Luis Soto',  run: '2K',  runStr: '2-K', fechaAtencion: '02-09-2026', diaSemana: 'Mié', sexo: 'Hombre', estado: 'Iniciado',   prevision: 'Fonasa B', tipoAtencion: 'Control',    prestadores: [{ nombre: 'Kine' }],  esIC: false, esUrgencia: true,  diagnosticos: [] },
  { id: 3, nombre: 'Eva Ruiz',   run: null,  runStr: '',    fechaAtencion: '02-09-2026', diaSemana: 'Mié', sexo: 'Mujer',  estado: 'No se presentó', prevision: '', tipoAtencion: 'Control', prestadores: [], esIC: false, esUrgencia: false, diagnosticos: [{ nombre: 'Asma', esAuge: false }] },
];
const sicsByRun = new Map([
  ['1K', [{ registrador: { id: 7 },  ejecutor: { id: ME } }]],   // received by me
  ['2K', [{ registrador: { id: ME }, ejecutor: { id: 9 } }]],    // emitted by me
]);
const ctx = { sicsByRun, officerId: ME };
const ids = out => out.map(r => r.id);

test('applyFilters with no filters returns everything', () => {
  assert.deepEqual(ids(applyFilters(rows, NONE, ctx)), [1, 2, 3]);
});

test('applyFilters: free text matches name, RUN and diagnosis, case-insensitively', () => {
  assert.deepEqual(ids(applyFilters(rows, { ...NONE, q: 'pérez' }, ctx)), [1]);
  assert.deepEqual(ids(applyFilters(rows, { ...NONE, q: '2-k' }, ctx)), [2]);
  assert.deepEqual(ids(applyFilters(rows, { ...NONE, q: 'asma' }, ctx)), [3]);
});

test('applyFilters: simple equality filters', () => {
  assert.deepEqual(ids(applyFilters(rows, { ...NONE, fecha: '02-09-2026' }, ctx)), [2, 3]);
  assert.deepEqual(ids(applyFilters(rows, { ...NONE, sexo: 'Mujer', estado: 'Completado' }, ctx)), [1]);
  assert.deepEqual(ids(applyFilters(rows, { ...NONE, prest: 'Kine' }, ctx)), [2]);
  assert.deepEqual(ids(applyFilters(rows, { ...NONE, tipo: 'Control', dia: 'Mié' }, ctx)), [2, 3]);
});

test('applyFilters: tipo de atención acepta selección múltiple', () => {
  assert.deepEqual(ids(applyFilters(rows, { ...NONE, tipo: ['Morbilidad', 'Control'] }, ctx)), [1, 2, 3]);
  assert.deepEqual(ids(applyFilters(rows, { ...NONE, tipo: ['Morbilidad'] }, ctx)), [1]);
  assert.deepEqual(ids(applyFilters(rows, { ...NONE, tipo: [] }, ctx)), [1, 2, 3]);
});

test('applyFilters: IC role filters use the loaded SICs and the officer id', () => {
  assert.deepEqual(ids(applyFilters(rows, { ...NONE, ic: 'cita' }, ctx)),     [1]);
  assert.deepEqual(ids(applyFilters(rows, { ...NONE, ic: 'recibi' }, ctx)),   [1]);
  assert.deepEqual(ids(applyFilters(rows, { ...NONE, ic: 'emiti' }, ctx)),    [2]);
  assert.deepEqual(ids(applyFilters(rows, { ...NONE, ic: 'paciente' }, ctx)), [1, 2]);
  assert.deepEqual(ids(applyFilters(rows, { ...NONE, ic: 'no' }, ctx)),       [3]);
});

test('applyFilters: diagnosis filters', () => {
  assert.deepEqual(ids(applyFilters(rows, { ...NONE, dx: 'con' }, ctx)), [1, 3]);
  assert.deepEqual(ids(applyFilters(rows, { ...NONE, dx: 'sin' }, ctx)), [2]);
  assert.deepEqual(ids(applyFilters(rows, { ...NONE, dx: 'ges' }, ctx)), [1]);
  assert.deepEqual(ids(applyFilters(rows, { ...NONE, dx: 'urg' }, ctx)), [2]);
});

test('applyFilters works without SIC context (before interconsultas are loaded)', () => {
  assert.deepEqual(ids(applyFilters(rows, { ...NONE, ic: 'paciente' })), []);
  assert.deepEqual(ids(applyFilters(rows, { ...NONE, ic: 'recibi' })), [1], 'IC citas still count as received');
});
