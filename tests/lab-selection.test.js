import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  orderKey, analysable, selectableOrders, selectedOrders, selectionCounts, printableCount,
} from '../src/core/lab-selection.js';

/**
 * La regla que este módulo tiene que sostener es una: «marcar todas» significa
 * las de los dos hospitales. Antes había una casilla por tabla y marcar todo
 * dejaba fuera el otro hospital sin avisar; el PDF salía con seis informes de
 * Hanga Roa y ninguno del Salvador, y nada en pantalla lo decía.
 */
const hsr = (numero, { informe = true, imprimible = true } = {}) => ({
  numero, ordenEncryptada: informe ? `enc${numero}` : '', puedeImprimir: imprimible,
});
const hhr = (id, { informe = true } = {}) => ({
  id, link: informe ? `http://10.4.69.90/syslab/detalleexamenes.php?id=${id}` : null,
  puedeImprimir: informe,
});
const results = () => ({
  hsr: [hsr('02131899'), hsr('02120408'), hsr('02110000', { informe: false })],
  hhr: [hhr('43095679'), hhr('43088164')],
});
const claves = results => new Set(selectableOrders(results).map(({ source, o }) => orderKey(source, o)));

test('la clave distingue hospitales que repiten el número de orden', () => {
  assert.equal(orderKey('hsr', { numero: '1234' }), 'hsr:1234');
  assert.equal(orderKey('hhr', { id: '1234' }), 'hhr:1234');
  assert.notEqual(orderKey('hsr', { numero: '1234' }), orderKey('hhr', { id: '1234' }));
});

test('sólo es marcable la orden de la que se puede pedir el informe', () => {
  assert.equal(analysable('hsr', { ordenEncryptada: 'enc1' }), true);
  assert.equal(analysable('hsr', { ordenEncryptada: '' }), false);
  assert.equal(analysable('hhr', { link: 'http://10.4.69.90/syslab/x.php' }), true);
  assert.equal(analysable('hhr', { link: null }), false);
});

test('las marcables son las de los dos hospitales, en el orden de las tablas', () => {
  const orden = selectableOrders(results()).map(({ source, o }) => orderKey(source, o));
  assert.deepEqual(orden, ['hsr:02131899', 'hsr:02120408', 'hhr:43095679', 'hhr:43088164']);
});

test('marcar todas alcanza a los dos hospitales, no sólo al que se pintó primero', () => {
  const r = results();
  const c = selectionCounts(r, claves(r));
  assert.equal(c.marcadas, 4);
  assert.equal(c.hsr, 2);
  assert.equal(c.hhr, 2);
  assert.equal(c.todasMarcadas, true);
});

test('marcar sólo un hospital no cuenta como haberlas marcado todas', () => {
  const r = results();
  const soloHhr = new Set(selectableOrders(r).filter(x => x.source === 'hhr').map(({ source, o }) => orderKey(source, o)));
  const c = selectionCounts(r, soloHhr);
  assert.equal(c.marcadas, 2);
  assert.equal(c.hsr, 0);
  assert.equal(c.todasMarcadas, false, 'con un hospital fuera, «todas» sería mentira');
});

test('una orden sin informe no se puede marcar ni entra en el recuento', () => {
  const r = results();
  const c = selectionCounts(r, new Set(['hsr:02110000']));
  assert.equal(c.marcables, 4);
  assert.equal(c.marcadas, 0, 'la clave de una orden sin informe no cuenta aunque esté en el conjunto');
});

test('marcadas e imprimibles no son lo mismo: en el Salvador puede haber informe sin validar', () => {
  const r = { hsr: [hsr('1', { imprimible: false }), hsr('2')], hhr: [] };
  const c = selectionCounts(r, claves(r));
  assert.equal(c.marcadas, 2);
  assert.equal(c.imprimibles, 1, 'el PDF sólo puede incluir la que ya tiene informe');
});

test('las claves que ya no están en pantalla se ignoran', () => {
  const r = results();
  const c = selectionCounts(r, new Set([...claves(r), 'hsr:99999999', 'hhr:88888888']));
  assert.equal(c.marcadas, 4);
  assert.equal(selectedOrders(r, new Set(['hsr:99999999'])).length, 0);
});

test('sin resultados no hay nada marcable y «todas» es falso, no verdadero por vacío', () => {
  for (const vacio of [{ hsr: [], hhr: [] }, {}, null]) {
    const c = selectionCounts(vacio, new Set());
    assert.equal(c.marcables, 0);
    assert.equal(c.todasMarcadas, false, 'un menú que ofrece «marcar todas» sobre nada engaña');
  }
});

test('el total imprimible cuenta los dos hospitales', () => {
  assert.equal(printableCount(results()), 4);
  assert.equal(printableCount({ hsr: [hsr('1', { imprimible: false })], hhr: [hhr('2')] }), 1);
});
