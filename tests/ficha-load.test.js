import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { installFakeChrome } from './helpers/fake-chrome.js';
import { loadFicha } from '../src/io/ficha-load.js';

/**
 * loadFicha reúne seis fuentes por paciente. Lo que importa aquí no es el
 * parseo —ya probado— sino qué pasa cuando una fuente falla: antes, alergias,
 * RAM y vigencias devolvían una lista vacía en silencio, y un paciente con
 * reacción adversa registrada se veía igual que uno sin ella.
 */
let calls;
function scriptFetch(handler) {
  calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push(String(url));
    const r = handler(String(url), init);
    if (r instanceof Response) return r;
    return new Response(JSON.stringify(r), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
}
const fail = () => new Response('boom', { status: 500 });
let seq = 100; // idUsp distinto por prueba: loadFicha memoiza por paciente 30 min

beforeEach(() => { installFakeChrome(); });

test('una RAM registrada llega al modelo cuando el endpoint responde', async () => {
  scriptFetch(url => {
    if (url.includes('AlertaRAM')) return [{ Descripcion: 'Penicilina — anafilaxia' }];
    return [];
  });
  const f = await loadFicha('tok', { run: null, idUsp: ++seq });
  assert.equal(f.ram.length, 1);
  assert.deepEqual(f.errors, []);
});

test('si falla el endpoint de RAM, el fallo queda registrado y no se disfraza de «sin alergias»', async () => {
  scriptFetch(url => url.includes('AlertaRAM') ? fail() : []);
  const f = await loadFicha('tok', { run: null, idUsp: ++seq });
  assert.deepEqual(f.ram, [], 'sin datos no se inventa nada');
  assert.ok(f.errors.some(e => /RAM/i.test(e)), `el error debe nombrar la fuente: ${JSON.stringify(f.errors)}`);
});

test('vigencias y riesgo también registran su fallo', async () => {
  scriptFetch(url => /VigenciaExamenes|RiesgoMultiMorbilidad/.test(url) ? fail() : []);
  const f = await loadFicha('tok', { run: null, idUsp: ++seq });
  assert.equal(f.errors.length, 2, JSON.stringify(f.errors));
  assert.ok(f.errors.some(e => /Vigencias/i.test(e)));
  assert.ok(f.errors.some(e => /Riesgo/i.test(e)));
});

test('un fallo en una fuente no impide cargar las demás', async () => {
  scriptFetch(url => {
    if (url.includes('RecuperarAntecedentes')) return fail();
    if (url.includes('AlertaRAM')) return [{ Descripcion: 'AINE — urticaria' }];
    return [];
  });
  const f = await loadFicha('tok', { run: null, idUsp: ++seq });
  assert.equal(f.ram.length, 1, 'la RAM se conserva aunque los antecedentes fallen');
  assert.ok(f.errors.some(e => /Antecedentes/.test(e)));
});

test('sin identificador de paciente no se consulta nada y se explica', async () => {
  scriptFetch(() => []);
  const f = await loadFicha('tok', { run: null, idUsp: 0 });
  assert.equal(calls.length, 0);
  assert.ok(f.errors.some(e => /identificar/.test(e)));
});
