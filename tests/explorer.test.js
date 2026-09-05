import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { installFakeChrome } from './helpers/fake-chrome.js';
import { explorerFetch, summarizeExtraFields, QUICK_LINKS } from '../src/io/explorer.js';

/**
 * El Explorador API es la única superficie donde la persona escribe una URL a
 * mano. Lo que importa: que el token jamás salga del origen de Eloisa, que un
 * error no reviente la pestaña y que el resumen de campos desconocidos sea fiel.
 */
let calls;
beforeEach(() => {
  installFakeChrome();
  calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), auth: init?.headers?.Authorization ?? '' });
    if (String(url).includes('texto')) return new Response('no es json', { status: 200 });
    if (String(url).includes('caido')) throw new TypeError('Failed to fetch');
    return new Response(JSON.stringify({ ok: 1 }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
});

test('explorerFetch envía el token sólo a Eloisa y devuelve JSON analizado', async () => {
  const r = await explorerFetch('/API/api/rayen/servidor/fechaHora');
  assert.equal(r.ok, true);
  assert.deepEqual(r.data, { ok: 1 });
  assert.equal(calls.length, 1);
  assert.match(calls[0].url, /^https:\/\/clinicohangaroa\.eloisa\.cl\/API\/api\/rayen\/servidor\/fechaHora$/);
  assert.equal(calls[0].auth, 'Bearer tok');
});

test('explorerFetch rechaza otro origen antes de tocar la red: el token no viaja', async () => {
  const r = await explorerFetch('https://evil.example/API/x');
  assert.equal(r.ok, false);
  assert.match(r.raw, /Origen no permitido/);
  assert.equal(calls.length, 0);
});

test('explorerFetch: respuesta no JSON y red caída se devuelven como resultado, no como excepción', async () => {
  const texto = await explorerFetch('/API/texto');
  assert.deepEqual([texto.ok, texto.data, texto.raw], [true, null, 'no es json']);
  const caido = await explorerFetch('/API/caido');
  assert.equal(caido.ok, false);
  assert.match(caido.raw, /Failed to fetch/);
});

test('explorerFetch sin sesión no llama a la red', async () => {
  installFakeChrome({ token: null });
  const r = await explorerFetch('/API/api/rayen/servidor/fechaHora');
  assert.deepEqual([r.ok, r.status, r.raw], [false, 0, 'Sin sesión activa.']);
  assert.equal(calls.length, 0);
});

test('summarizeExtraFields cuenta los campos que el parser no mapea, con la primera muestra útil, de mayor a menor', () => {
  const out = summarizeExtraFields([
    { Id: 1, Razon: 'x', Nuevo: null, Otro: 'a' },
    { Id: 2, Nuevo: 0, Otro: 'b', Raro: true },
    { Id: 3, Nuevo: 'valor' },
    null,
  ]);
  assert.deepEqual(out, [
    { key: 'Nuevo', count: 3, sample: 'valor' }, // null y 0 no sirven de muestra
    { key: 'Otro', count: 2, sample: 'a' },
    { key: 'Raro', count: 1, sample: true },
  ]);
  assert.ok(!out.some(x => x.key === 'Id' || x.key === 'Razon'), 'los conocidos no aparecen');
});

test('QUICK_LINKS apuntan todos a rutas relativas de la API de Rayen', () => {
  assert.ok(QUICK_LINKS.length >= 10);
  for (const l of QUICK_LINKS) { assert.ok(l.label); assert.match(l.url, /^\/API\/api\/rayen\//); }
});
