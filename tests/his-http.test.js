import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  resolveHisUrl, parseLoginForm, hisLogin, hisStatus, hisAtencionesPorRut, hisFichaUrl,
} from '../src/io/his-http.js';

/**
 * El transporte del HIS. Custodia dos cosas: la contraseña sólo sale al origen
 * del HIS (guardián de origen), y el flujo de login/consficha replica el que el
 * proyecto RCE VISOR dejó probado.
 */
const consficha = readFileSync(new URL('./fixtures/his-consficha.html', import.meta.url), 'utf8');
const realFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = realFetch; });

/** Enruta por URL+método y guarda lo enviado. */
function instalar(rutas) {
  const vistos = [];
  globalThis.fetch = async (url, init = {}) => {
    vistos.push({ url: String(url), method: init.method ?? 'GET', body: init.body ?? null, credentials: init.credentials });
    for (const [re, resp] of rutas) if (re.test(String(url) + ' ' + (init.method ?? 'GET'))) {
      const { text = '', status = 200 } = typeof resp === 'function' ? resp(init) : resp;
      return new Response(text, { status });
    }
    return new Response('', { status: 404 });
  };
  return vistos;
}

test('resolveHisUrl sólo permite el origen del HIS; la contraseña no puede viajar a otro sitio', () => {
  assert.match(resolveHisUrl('/hishhr/menu.php'), /^https:\/\/his\.hospitalhangaroa\.cl\/hishhr\/menu\.php$/);
  assert.throws(() => resolveHisUrl('https://evil.example/x'), /Origen no permitido/);
});

test('parseLoginForm elige el form con password+login y toma sus ocultos', () => {
  const html = `
    <form action="/otro.php"><input name="q"></form>
    <form action="acceso1.php"><input type="hidden" name="csrf" value="abc"><input name="login"><input type="password" name="password"></form>`;
  assert.deepEqual(parseLoginForm(html), { action: 'acceso1.php', hidden: { csrf: 'abc' } });
});

test('hisLogin: manda login/password al origen del HIS y confirma la sesión', async () => {
  const vistos = instalar([
    [/\/hishhr\/ GET/, { text: '<form action="acceso1.php"><input name="login"><input type="password" name="password"></form>' }],
    [/acceso1\.php POST/, { text: "<script>window.location='menu.php'</script>" }],
    [/menu\.php GET/, { text: 'ok' }],
    [/ateurg022\.php GET/, { text: '<table>atenciones del día</table>' }],
  ]);
  const r = await hisLogin('12345678', 'clave');
  assert.equal(r.ok, true);
  const post = vistos.find(v => /acceso1\.php/.test(v.url));
  assert.ok(post.url.startsWith('https://his.hospitalhangaroa.cl/'), 'sólo al HIS');
  assert.equal(post.credentials, 'include', 'con la cookie de sesión');
  const body = new URLSearchParams(post.body);
  assert.equal(body.get('login'), '12345678');
  assert.equal(body.get('password'), 'clave');
});

test('hisLogin: credenciales rechazadas devuelven el mensaje del HIS, sin la clave', async () => {
  instalar([
    [/\/hishhr\/ GET/, { text: '<form action="acceso1.php"><input name="login"><input type="password" name="password"></form>' }],
    [/acceso1\.php POST/, { text: "<script>alert('Usuario o clave incorrecta')</script>" }],
  ]);
  const r = await hisLogin('12345678', 'mala');
  assert.equal(r.ok, false);
  assert.match(r.error, /Usuario o clave incorrecta/);
  assert.doesNotMatch(r.error, /mala/, 'el error nunca lleva la contraseña');
});

test('hisAtencionesPorRut manda el RUT sin DV y parsea la tabla', async () => {
  const vistos = instalar([
    [/consficha000\.php POST/, { text: consficha }],
    [/consficha000\.php GET/, { text: 'form' }],
  ]);
  const r = await hisAtencionesPorRut('12.345.678-9');
  assert.equal(r.atenciones.length, 2);
  const post = vistos.find(v => v.method === 'POST');
  assert.equal(new URLSearchParams(post.body).get('rut'), '12345678', 'sin puntos ni DV');
});

test('hisAtencionesPorRut avisa si el HIS pide iniciar sesión', async () => {
  instalar([[/consficha000\.php/, { text: '<form action="acceso1.php"><input name="password"></form>' }]]);
  const r = await hisAtencionesPorRut('12345678');
  assert.equal(r.authRequired, true);
  assert.deepEqual(r.atenciones, []);
});

test('hisStatus distingue con sesión de sin sesión', async () => {
  instalar([[/ateurg022\.php/, { text: '<table>ok</table>' }]]);
  assert.equal((await hisStatus()).authenticated, true);
  instalar([[/ateurg022\.php/, { text: '<form action="acceso1.php"><input name="password"></form>' }]]);
  assert.equal((await hisStatus()).authenticated, false);
});

test('hisFichaUrl arma la ficha imprimible según el tipo', () => {
  assert.match(hisFichaUrl('111', 'ambulatorio'), /PAMB0005\.php\?id=111&noprint=1$/);
  assert.match(hisFichaUrl('222', 'urgencia'), /PURG0005\.php\?id=222&print=1$/);
});
