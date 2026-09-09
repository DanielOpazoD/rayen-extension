import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SISTEMAS, sistemaPorId, estadoCredencial, puedeEntrarSola } from '../src/core/credenciales-catalogo.js';
import { crearRespaldo, abrirRespaldo, fraseValida, RespaldoError } from '../src/io/credenciales-respaldo.js';

/**
 * El centro de contraseñas. Lo que custodian estas pruebas es la promesa que se
 * le hizo al médico: las claves se guardan y se reemplazan, pero no se leen; y
 * una credencial que el sistema rechazó no se vuelve a probar sola, porque los
 * portales del hospital bloquean la cuenta tras unos cuantos intentos.
 */

test('el catálogo dice, por sistema, si la extensión puede entrar sola', () => {
  assert.equal(SISTEMAS.length, 5);
  assert.equal(sistemaPorId('rce').entrada, 'silenciosa', 'el RCE acepta POST de login y su cookie vuelve');
  assert.equal(sistemaPorId('lab-hhr').entrada, 'pestana', 'SysLab va por HTTP: sus cookies no llegan a la extensión');
  assert.ok(sistemaPorId('lab-hhr').nota, 'y dice por qué, en vez de ofrecer un botón que no haría nada');
  assert.equal(sistemaPorId('lab-hsr').entrada, 'por-construir');
  assert.equal(sistemaPorId('mmrad').entrada, 'sin-transporte');
  assert.equal(sistemaPorId('biopsias').entrada, 'sin-transporte');
  assert.equal(sistemaPorId('inventado'), null);
});

test('cada sistema dice qué se escribe en «usuario»: no es lo mismo en todos', () => {
  assert.match(sistemaPorId('rce').usuarioLabel, /sin d[ií]gito/i, 'el HIS pide el RUT sin DV');
  for (const s of SISTEMAS) assert.ok(s.usuarioLabel && s.nombre, `${s.id} necesita nombre y rótulo`);
});

test('estadoCredencial describe la situación y nunca devuelve la clave', () => {
  assert.deepEqual(estadoCredencial(null), { estado: 'sin-guardar', usuario: '', guardadaEn: null, caducadaEn: null });

  const guardada = estadoCredencial({ usuario: '12345678', clave: 'secreta', guardadaEn: 1000 });
  assert.equal(guardada.estado, 'guardada');
  assert.equal(guardada.usuario, '12345678');
  assert.deepEqual(Object.keys(guardada).sort(), ['caducadaEn', 'estado', 'guardadaEn', 'usuario'],
    'la forma es cerrada: no hay hueco por donde añadir la clave sin romper esto');

  assert.equal(estadoCredencial({ usuario: '12345678', guardadaEn: 1 }).estado, 'sin-guardar',
    'usuario sin clave no es un acceso: se pintaba «guardada» y ofrecía iniciar sesión');

  const caducada = estadoCredencial({ usuario: 'u', clave: 'c', guardadaEn: 1, caducadaEn: 2000 });
  assert.equal(caducada.estado, 'caducada');
});

test('«Iniciar sesión» sólo se ofrece donde de verdad puede y con la clave vigente', () => {
  assert.equal(puedeEntrarSola(sistemaPorId('rce'), 'guardada'), true);
  assert.equal(puedeEntrarSola(sistemaPorId('rce'), 'caducada'), false, 'una rechazada no se reintenta sola');
  assert.equal(puedeEntrarSola(sistemaPorId('rce'), 'sin-guardar'), false);
  assert.equal(puedeEntrarSola(sistemaPorId('lab-hhr'), 'guardada'), false, 'SysLab no puede en silencio');
  assert.equal(puedeEntrarSola(sistemaPorId('mmrad'), 'guardada'), false, 'sin integración no hay a dónde entrar');
});

// ── Respaldo cifrado ────────────────────────────────────────
const CREDS = { rce: { usuario: '12345678', clave: 'clave-de-prueba', guardadaEn: 1 } };

test('el respaldo va y vuelve con la frase correcta', async () => {
  const fichero = await crearRespaldo(CREDS, 'una frase larga de prueba');
  assert.equal(fichero.formato, 'rayen-cred-respaldo');
  assert.deepEqual(await abrirRespaldo(fichero, 'una frase larga de prueba'), CREDS);
});

test('el fichero de respaldo no lleva ninguna clave en claro', async () => {
  const fichero = await crearRespaldo(CREDS, 'una frase larga de prueba');
  const texto = JSON.stringify(fichero);
  assert.equal(texto.includes('clave-de-prueba'), false, 'este fichero viaja: nada legible puede ir dentro');
  assert.equal(texto.includes('12345678'), false, 'ni el usuario');
});

test('la frase equivocada no entrega nada, y se distingue de un fichero que no es un respaldo', async () => {
  const fichero = await crearRespaldo(CREDS, 'una frase larga de prueba');
  await assert.rejects(() => abrirRespaldo(fichero, 'otra frase larga distinta'),
    e => e instanceof RespaldoError && /frase no abre/i.test(e.message));
  await assert.rejects(() => abrirRespaldo({ hola: 'mundo' }, 'una frase larga de prueba'),
    e => /no es un respaldo/i.test(e.message));
  await assert.rejects(() => abrirRespaldo({ formato: 'rayen-cred-respaldo', version: 1, salt: 'x' }, 'una frase larga de prueba'),
    e => /incompleto o da/i.test(e.message));
});

test('la frase del respaldo se exige larga: el fichero sale de la máquina', async () => {
  assert.equal(fraseValida('corta'), false);
  assert.equal(fraseValida('doce caracts'), true);
  await assert.rejects(() => crearRespaldo(CREDS, 'corta'), e => /12 caracteres/.test(e.message));
});

test('dos respaldos de lo mismo no son iguales: sal e IV cambian', async () => {
  const a = await crearRespaldo(CREDS, 'una frase larga de prueba');
  const b = await crearRespaldo(CREDS, 'una frase larga de prueba');
  assert.notEqual(a.ct, b.ct);
  assert.notEqual(a.salt, b.salt);
});

test('un respaldo de una versión futura se rechaza en vez de malinterpretarse', async () => {
  const f = await crearRespaldo(CREDS, 'una frase larga de prueba');
  await assert.rejects(() => abrirRespaldo({ ...f, version: 99 }, 'una frase larga de prueba'),
    e => /versi[oó]n m[aá]s nueva/i.test(e.message));
});

// ── El almacén ──────────────────────────────────────────────
// Es el módulo que sostiene la promesa, y no tenía ni una prueba.

const { installFakeChrome } = await import('./helpers/fake-chrome.js');
const cs = await import('../src/io/crypto-store.js');
cs.setIteracionesParaPruebas(50);

async function almacenLimpio() {
  const h = installFakeChrome({ token: null });
  cs.clearKey();
  await cs.createPin('123456');
  const mod = await import('../src/io/credenciales.js');
  await mod.olvidarTodo();
  return { h, mod };
}

test('listar() no deja salir la contraseña del almacén real', async () => {
  const { mod } = await almacenLimpio();
  await mod.guardar('rce', '12345678', 'clave-de-prueba');
  const estados = await mod.listar();
  assert.equal(estados.rce.estado, 'guardada');
  assert.equal(estados.rce.usuario, '12345678');
  assert.equal(JSON.stringify(estados).includes('clave-de-prueba'), false,
    'la interfaz pinta esto: si la clave viaja aquí, se acabó la promesa');
});

test('lo guardado queda cifrado en disco, nunca legible', async () => {
  const { h, mod } = await almacenLimpio();
  await mod.guardar('rce', '12345678', 'clave-de-prueba');
  const enDisco = h.local.get('rayen_cred_v1');
  assert.equal(enDisco.__enc, 1, 'cifrado, como todo lo demás (ADR 0001)');
  assert.equal(JSON.stringify(enDisco).includes('clave-de-prueba'), false);
});

test('con la sesión bloqueada no se escribe: antes caía en claro al disco', async () => {
  const { h, mod } = await almacenLimpio();
  await mod.guardar('rce', '12345678', 'clave-de-prueba');
  cs.clearKey();                                   // lo que hace el bloqueo por inactividad
  await assert.rejects(() => mod.guardar('mmrad', 'u', 'OTRA-CLAVE'), /cifrad/i);
  assert.equal(JSON.stringify(h.local.get('rayen_cred_v1')).includes('OTRA-CLAVE'), false);
});

test('una credencial rechazada no se entrega: es lo que evita el bloqueo de cuenta', async () => {
  const { mod } = await almacenLimpio();
  await mod.guardar('rce', '12345678', 'clave-de-prueba');
  assert.deepEqual(await mod.credencialPara('rce'), { usuario: '12345678', clave: 'clave-de-prueba' });

  await mod.marcarCaducada('rce', 'credenciales rechazadas');
  assert.equal(await mod.credencialPara('rce'), null, 'mientras siga marcada, nadie la vuelve a probar');
  assert.equal((await mod.listar()).rce.estado, 'caducada');

  await mod.guardar('rce', '12345678', 'clave-nueva');
  assert.equal((await mod.listar()).rce.estado, 'guardada', 'reescribirla es justo lo que la arregla');
  assert.deepEqual(await mod.credencialPara('rce'), { usuario: '12345678', clave: 'clave-nueva' });
});

test('un rechazo en vuelo no invalida la contraseña que se acaba de escribir', async () => {
  const { mod } = await almacenLimpio();
  await mod.guardar('rce', '12345678', 'clave-vieja');
  const intentoDesde = Date.now();
  await new Promise(r => setTimeout(r, 5));
  await mod.guardar('rce', '12345678', 'clave-nueva');   // la persona la corrige
  await mod.marcarCaducada('rce', 'rechazada', intentoDesde);  // llega el fallo del intento viejo
  assert.equal((await mod.listar()).rce.estado, 'guardada',
    'marcarla dejaría inservible una clave buena y diría «rechazada» de algo recién puesto');
});

test('dos guardados a la vez no se pierden entre ellos', async () => {
  const { mod } = await almacenLimpio();
  await Promise.all([
    mod.guardar('rce', 'u1', 'c1'),
    mod.guardar('mmrad', 'u2', 'c2'),
    mod.guardar('biopsias', 'u3', 'c3'),
  ]);
  const e = await mod.listar();
  assert.equal(e.rce.estado, 'guardada');
  assert.equal(e.mmrad.estado, 'guardada');
  assert.equal(e.biopsias.estado, 'guardada');
});

test('un fallo de lectura no borra el almacén', async () => {
  const { h, mod } = await almacenLimpio();
  await mod.guardar('rce', 'u1', 'c1');
  await mod.guardar('mmrad', 'u2', 'c2');
  h.ctl.failNext = 'disco ocupado';
  await assert.rejects(() => mod.guardar('biopsias', 'u3', 'c3'));
  const e = await mod.listar();
  assert.equal(e.rce.estado, 'guardada', 'leer mal y escribir encima borraba las otras');
  assert.equal(e.mmrad.estado, 'guardada');
});

test('importar un respaldo FUSIONA: no borra los accesos que no vengan en él', async () => {
  const { mod } = await almacenLimpio();
  await mod.guardar('rce', 'u-rce', 'c-rce');
  await mod.guardar('mmrad', 'u-mmrad', 'c-mmrad');

  const fichero = await crearRespaldo({ biopsias: { usuario: 'u-bio', clave: 'c-bio', guardadaEn: 1 } }, 'una frase larga de prueba');
  const r = await mod.importarRespaldo(fichero, 'una frase larga de prueba');
  assert.deepEqual(r, { añadidas: 1, reemplazadas: 0, descartadas: 0 });

  const e = await mod.listar();
  assert.equal(e.rce.estado, 'guardada', 'reemplazar el almacén entero las destruía en silencio');
  assert.equal(e.mmrad.estado, 'guardada');
  assert.equal(e.biopsias.estado, 'guardada');
});

test('un respaldo manipulado no envenena el almacén', async () => {
  const { mod } = await almacenLimpio();
  const hostil = await crearRespaldo({
    rce: { usuario: { toString: 1 }, clave: 'x', guardadaEn: 1 },   // objeto donde va texto
    inventado: { usuario: 'u', clave: 'c', guardadaEn: 1 },          // sistema que no existe
    mmrad: { usuario: 'u-ok', clave: 'c-ok', guardadaEn: 1 },        // ésta sí vale
  }, 'una frase larga de prueba');
  const r = await mod.importarRespaldo(hostil, 'una frase larga de prueba');
  assert.equal(r.descartadas, 2, 'lo que no tiene la forma esperada se descarta y se cuenta');
  assert.equal(r.añadidas, 1);
  const e = await mod.listar();
  assert.equal(e.rce.estado, 'sin-guardar');
  assert.equal(e.mmrad.usuario, 'u-ok');
});

test('el respaldo con iteraciones absurdas se rechaza en vez de congelar la pestaña', async () => {
  const f = await crearRespaldo({ rce: { usuario: 'u', clave: 'c', guardadaEn: 1 } }, 'una frase larga de prueba');
  for (const it of [0, 1, 1e9, 'muchas']) {
    await assert.rejects(() => abrirRespaldo({ ...f, iteraciones: it }, 'una frase larga de prueba'),
      e => /fuera de lo aceptable|dañado/i.test(e.message), `iteraciones=${it}`);
  }
  await assert.rejects(() => abrirRespaldo({ ...f, version: 'muchas' }, 'una frase larga de prueba'),
    e => /dañado/i.test(e.message), 'una versión que no es número no puede colarse');
  await assert.rejects(() => abrirRespaldo({ ...f, salt: 'no-es-base64!!' }, 'una frase larga de prueba'),
    e => e instanceof RespaldoError, 'un base64 roto se traduce, no se escapa en crudo');
});

test('migrarDesdePrefs mueve el acceso del RCE y no deja copia en preferencias', async () => {
  const { mod } = await almacenLimpio();
  const cache = await import('../src/io/cache.js');
  await cache.savePrefs({ hisUser: '12345678', hisPass: 'clave-vieja' });

  assert.equal(await mod.migrarDesdePrefs(), true);
  assert.deepEqual(await mod.credencialPara('rce'), { usuario: '12345678', clave: 'clave-vieja' });
  const p = /** @type {any} */ (await cache.loadPrefs());
  assert.equal(p.hisPass, '', 'no puede quedar una segunda copia fuera del centro');

  assert.equal(await mod.migrarDesdePrefs(), false, 'correr dos veces no pisa nada');
  assert.deepEqual(await mod.credencialPara('rce'), { usuario: '12345678', clave: 'clave-vieja' });
});
