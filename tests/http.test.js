import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { installFakeChrome } from './helpers/fake-chrome.js';
import { apiGet, resolveUrl, cancelRun, resetRun, run, net, session, resetSession, CancelledError, TimeoutError, AuthError } from '../src/io/http.js';
import { getToken } from '../src/io/auth.js';
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

test('cancelRun aborta la carga en vuelo; las llamadas sin señal (panel, PDF) siguen funcionando', async () => {
  globalThis.fetch = (_url, { signal }) => new Promise((_, reject) => signal.addEventListener('abort', () => reject(signal.reason)));
  const enVuelo = apiGet('tok', '/API/x', { signal: run.controller.signal });
  cancelRun();
  await assert.rejects(enVuelo, err => err instanceof CancelledError);
  let llamadas = 0;
  globalThis.fetch = async () => { llamadas++; return new Response('{}'); };
  await assert.rejects(apiGet('tok', '/API/y', { signal: run.controller.signal }), err => err instanceof CancelledError);
  assert.equal(llamadas, 0, 'con la señal cancelada nada sale');
  assert.deepEqual(await apiGet('tok', '/API/panel'), {}, 'sin señal, la ficha del panel no se ve afectada por un Cancelar anterior');
  assert.equal(llamadas, 1);
});

test('un 401 marca la sesión vencida e invalida el token guardado', async () => {
  globalThis.fetch = async () => new Response('', { status: 401 });
  assert.equal(fake.session.get('rayenToken'), 'tok');
  await assert.rejects(apiGet('tok', '/API/x'), err => err instanceof AuthError);
  assert.equal(session.expired, true);
  assert.equal(fake.session.has('rayenToken'), false, 'el token rechazado sale de storage.session');
  fake.session.set('rayenToken', 'tok');
  assert.equal(await getToken(), null, 'aunque vuelva a aparecer el mismo token, no se entrega');
  fake.session.set('rayenToken', 'tok2');
  assert.equal(await getToken(), 'tok2', 'un token nuevo sí');
});

test('la ficha completa espera más que la agenda y Preferencias sube ambos límites', async () => {
  const { applyNetPrefs } = await import('../src/io/http.js');
  applyNetPrefs({ netTimeoutSec: 20 });
  assert.equal(net.timeoutMs, 20000); assert.equal(net.longTimeoutMs, 60000, 'nunca menos que el límite por defecto de la ficha');
  applyNetPrefs({ netTimeoutSec: 40 });
  assert.equal(net.timeoutMs, 40000); assert.equal(net.longTimeoutMs, 120000);
  applyNetPrefs({ netTimeoutSec: 'x' }); assert.equal(net.timeoutMs, 40000, 'un valor inválido no cambia nada');
  const usados = [];
  globalThis.fetch = (_url, { signal }) => new Promise((_, reject) => { usados.push(signal); signal.addEventListener('abort', () => reject(signal.reason)); });
  net.timeoutMs = 30;
  await assert.rejects(apiGet('tok', '/API/a'), err => err instanceof TimeoutError && /0 s/.test(err.message));
  const larga = apiGet('tok', '/API/b', { timeoutMs: 100000 });
  await new Promise(r => setTimeout(r, 80));
  assert.equal(usados[1].aborted, false, 'la llamada con su propio límite sigue viva pasado el límite corto');
  cancelRun(); await new Promise(r => setTimeout(r, 10));
  assert.equal(usados[1].aborted, false, 'sin señal, Cancelar no la toca');
  net.timeoutMs = CONFIG.httpTimeoutMs; larga.catch(() => {});
});
