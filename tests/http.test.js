import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { installFakeChrome } from './helpers/fake-chrome.js';
import { apiGet, resolveUrl, cancelRun, resetRun, net, session, resetSession, CancelledError, TimeoutError, AuthError } from '../src/io/http.js';
import { CONFIG } from '../src/core/config.js';

/**
 * Tres propiedades que el proyecto promete y que una mutación podía borrar sin
 * que ninguna prueba lo notara: el token no sale del origen de Eloisa, una red
 * muda no cuelga la carga, y cancelar aborta de verdad.
 */
const realFetch = globalThis.fetch;
let fake;
beforeEach(() => { fake = installFakeChrome('tok'); resetRun(); resetSession(); net.timeoutMs = CONFIG.httpTimeoutMs; });
afterEach(() => { globalThis.fetch = realFetch; });

test('el token nunca viaja a otro origen: resolveUrl lanza y fetch no se llama', async () => {
  let llamadas = 0;
  globalThis.fetch = async () => { llamadas++; return new Response('{}'); };
  assert.throws(() => resolveUrl('https://evil.example/API/x'), /Origen no permitido/);
  await assert.rejects(apiGet('tok', 'https://evil.example/API/x'), /Origen no permitido/);
  assert.equal(llamadas, 0);
  assert.equal(resolveUrl('/API/api/rayen/servidor/fechaHora'), `${CONFIG.base}/API/api/rayen/servidor/fechaHora`);
});

test('una petición que no responde se aborta por tiempo y el error es humano', async () => {
  net.timeoutMs = 30;
  globalThis.fetch = (_url, { signal }) => new Promise((_, reject) => signal.addEventListener('abort', () => reject(signal.reason)));
  const t0 = Date.now();
  await assert.rejects(apiGet('tok', '/API/x'), err => err instanceof TimeoutError && /no respondió en 0 s|no respondió/.test(err.message));
  assert.ok(Date.now() - t0 < 1000, 'no espera al servidor');
});

test('cancelRun aborta lo que está en vuelo y lo que venga después no sale', async () => {
  globalThis.fetch = (_url, { signal }) => new Promise((_, reject) => signal.addEventListener('abort', () => reject(signal.reason)));
  const enVuelo = apiGet('tok', '/API/x');
  cancelRun();
  await assert.rejects(enVuelo, err => err instanceof CancelledError);
  let llamadas = 0;
  globalThis.fetch = async () => { llamadas++; return new Response('{}'); };
  await assert.rejects(apiGet('tok', '/API/y'), err => err instanceof CancelledError);
  assert.equal(llamadas, 0);
});

test('un 401 marca la sesión vencida e invalida el token guardado', async () => {
  globalThis.fetch = async () => new Response('', { status: 401 });
  assert.equal(fake.session.get('rayenToken'), 'tok');
  await assert.rejects(apiGet('tok', '/API/x'), err => err instanceof AuthError);
  assert.equal(session.expired, true);
  assert.equal(fake.session.has('rayenToken'), false, 'el token rechazado no se vuelve a entregar');
});
