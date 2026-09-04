import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSessionMonitor, sessionState } from '../src/lab-session.js';

// Antes esta política vivía en la pestaña, mezclada con el DOM y sin pruebas:
// «Verificando…» eterno, y «sin sesión» cuando en realidad el portal no respondía.
class SyslabAuthError extends Error { name = 'SyslabAuthError'; }
const timeout = () => Object.assign(new Error('signal timed out'), { name: 'TimeoutError' });

test('sessionState distingue conectado, sin sesión (con enlace) y no responde (con causa)', () => {
  assert.deepEqual(sessionState('hsr', { ok: true }), { status: 'ok', text: 'HSR conectado' });
  assert.deepEqual(sessionState('hsr', { ok: false, href: 'https://x' }), { status: 'expired', text: 'HSR sin sesión', href: 'https://x' });
  const down = sessionState('hsr', { error: timeout() });
  assert.equal(down.text, 'HSR no responde');
  assert.match(down.title, /no respondió a tiempo/);
  const auth = sessionState('hhr', { error: new SyslabAuthError('abre SysLab en una pestaña e inicia sesión'), href: 'http://s' });
  assert.equal(auth.text, 'HHR: Abre SysLab en una pestaña e inicia sesión.');
  assert.equal(auth.href, 'http://s');
  assert.equal(sessionState('hhr', { checking: true }).status, 'checking');
});

function monitor(over = {}) {
  const painted = [];
  let t = 0;
  const m = createSessionMonitor({
    checkHsr: async () => true, checkHhr: async () => {}, links: { hsr: 'https://hsr', hhr: 'http://hhr' },
    paint: (source, state) => painted.push([source, state.status]),
    now: () => t, cacheMs: 5000, ...over,
  });
  return { m, painted, tick: ms => { t += ms; } };
}

test('check reutiliza el resultado dentro de la ventana y vuelve a comprobar al vencer o invalidar', async () => {
  let calls = 0;
  const { m, tick } = monitor({ checkHsr: async () => { calls++; return true; } });
  assert.deepEqual(await m.check(), { hsr: true, hhr: true });
  await m.check();
  assert.equal(calls, 1, 'dentro de los 5 s no se vuelve a preguntar');
  tick(6000); await m.check();
  assert.equal(calls, 2);
  m.invalidate(); await m.check();
  assert.equal(calls, 3, 'invalidar fuerza la comprobación aunque la ventana no haya vencido');
});

test('cada origen pinta «verificando» y luego su estado; un fallo de red no cuenta como sesión', async () => {
  const { m, painted } = monitor({ checkHsr: async () => { throw timeout(); }, checkHhr: async () => { throw new SyslabAuthError('SysLab pide iniciar sesión.'); } });
  const r = await m.check();
  assert.deepEqual(r, { hsr: false, hhr: false });
  assert.deepEqual(painted.filter(([s]) => s === 'hsr').map(([, st]) => st), ['checking', 'expired']);
  assert.deepEqual(painted.filter(([s]) => s === 'hhr').map(([, st]) => st), ['checking', 'expired']);
});

test('una sesión válida limpia la marca de vencida del transporte', async () => {
  let reset = 0;
  const { m } = monitor({ resetHsr: () => { reset++; }, resetHhr: () => { reset++; } });
  await m.check();
  assert.equal(reset, 2);
});

test('dos check() simultáneos comparten una sola comprobación por origen', async () => {
  let calls = 0;
  const { m } = monitor({ checkHsr: async () => { calls++; await new Promise(r => setTimeout(r, 20)); return true; } });
  const [a, b] = await Promise.all([m.check(), m.check()]);
  assert.deepEqual(a, b);
  assert.equal(calls, 1, 'antes costaba dos: la caché sólo se llenaba al resolver');
});
