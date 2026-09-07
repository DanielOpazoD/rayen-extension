import { readFileSync } from 'node:fs';
import { test, expect } from '@playwright/test';
import {
  probeStatus, stepPrepareSearch, stepSubmitSearch, stepReadResults, stepFetchReport,
} from '../src/io/syslab-http.js';

/**
 * El lector de SysLab: el único código de la extensión que interpreta la
 * interfaz de otro sistema. Si SysLab mueve un botón o cambia una tabla, hasta
 * ahora fallaba en silencio.
 *
 * Se prueba en Chromium y no con un DOM de mentira porque estas cinco funciones
 * viajan serializadas: `chrome.scripting.executeScript({ func })` las convierte
 * en texto y las ejecuta dentro de la pestaña. `page.evaluate` hace exactamente
 * lo mismo, así que la prueba también comprueba que sigan siendo autocontenidas
 * (sin cerrar sobre nada de fuera), que es el error más fácil de cometer aquí.
 *
 * Las páginas se sirven interceptando la dirección real de SysLab: así el
 * origen, los enlaces relativos y las descargas se resuelven como en el
 * hospital, sin tocar la red. La de inicio de sesión es la real (capturada del
 * portal, sin datos de nadie); las demás son sintéticas, escritas contra el
 * mismo contrato que lee el código. Eso no demuestra que SysLab siga siendo
 * así —sólo el hospital puede decirlo—, pero fija el contrato por escrito y
 * hace ruidoso cualquier cambio en el lector.
 */

const ORIGEN = 'http://10.4.69.90';
const LOGIN = readFileSync(new URL('../tests/fixtures/syslab-login.html', import.meta.url), 'utf8');
const pagina = cuerpo => `<!DOCTYPE html><html><head><meta charset="utf-8"><title>SysLab</title></head><body>${cuerpo}</body></html>`;

const MENU = pagina(`<ul id="menu">
  <li><a href="listado.php">Listado del día</a></li>
  <li><a href="buscarut.php">Búsqueda por RUT</a></li>
  <li><a href="salir.php">Salir</a></li></ul>`);
const MENU_SIN_OPCION = pagina(`<ul><li><a href="listado.php">Listado del día</a></li>
  <li><a href="salir.php">Salir</a></li></ul>`);
const BUSQUEDA = pagina(`<form class="ym-form" action="resultado.php" method="post">
  <input type="text" name="usuario" value="jperez" />
  <input type="text" name="rut" size="12" />
  <input type="submit" class="ym-button" value="Aceptar" /></form>`);
const BUSQUEDA_SIN_NOMBRE = pagina(`<form action="resultado.php" method="post">
  <input type="text" name="usuario" value="jperez" />
  <input type="text" name="paciente" size="12" />
  <input type="button" value="Consultar" /></form>`);
const BUSQUEDA_SIN_BOTON = pagina(`<form action="resultado.php" method="post">
  <input type="text" name="rut" size="12" /></form>`);

/** Una fila de resultados con la forma que lee `stepReadResults`. */
function fila({
  id = '101', href = 'detalleexamenes.php?id=101', fecha = '04-09-2026', hora = '10:32',
  rut = '12.345.678', nombre = 'PACIENTE DE PRUEBA', origen = 'Ambulatorio',
  examenes = ['HEMOGRAMA (V)', 'PERFIL BIOQUIMICO (P)'], salto = '<br />',
} = {}) {
  const primera = href ? `<a href="${href}">${id}</a>` : id;
  const celdas = `<td>${primera}</td><td>${fecha}${hora ? `${salto}${hora}` : ''}</td>` +
    `<td>${rut}</td><td>${nombre}</td><td>${origen}</td>` +
    `<td><table class="mitabla">${examenes.map(e => `<tr><td>${e}</td></tr>`).join('')}</table></td>`;
  return `<tr>${celdas}</tr>`;
}

const tabla = filas => pagina(`<table class="narrow">
  <tr><th>N°</th><th>Fecha</th><th>RUT</th><th>Nombre</th><th>Origen</th><th>Exámenes</th></tr>
  ${filas.join('')}</table>`);

// ── Arnés: SysLab de mentira en la dirección real, sin red ──

async function abrir(page, rutas, ruta = '/syslab/index.php') {
  await page.route(`${ORIGEN}/**`, route => {
    const destino = rutas[new URL(route.request().url()).pathname];
    if (destino === undefined) return route.fulfill({ status: 404, contentType: 'text/plain', body: 'sin ruta' });
    const r = typeof destino === 'string' ? { body: destino } : destino;
    return route.fulfill({
      status: r.status ?? 200,
      contentType: r.tipo ?? 'text/html; charset=utf-8',
      body: r.body ?? '',
    });
  });
  await page.goto(`${ORIGEN}${ruta}`);
  // Los pasos hacen clic con `setTimeout(…, 0)` para poder responder antes de
  // que la pestaña navegue. Aquí se anota el clic y se cancela la navegación.
  await page.evaluate(() => {
    globalThis.__clics = [];
    globalThis.__envios = 0;
    document.addEventListener('click', ev => {
      const el = ev.target;
      globalThis.__clics.push((el.value || el.textContent || '').replace(/\s+/g, ' ').trim());
      ev.preventDefault();
    }, true);
    document.addEventListener('submit', ev => { globalThis.__envios += 1; ev.preventDefault(); }, true);
  });
}

/** Cede el turno para que corra el `setTimeout(…, 0)` del paso. */
const reposar = page => page.evaluate(() => new Promise(r => setTimeout(r, 0)));
const clics = page => page.evaluate(() => globalThis.__clics);

test.beforeEach(async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'no depende del ancho de la ventana');
  page.setDefaultTimeout(10_000);
});

// ── Sesión caducada: la página real de inicio de sesión ──

test('los cuatro pasos reconocen la pantalla de inicio de sesión real', async ({ page }) => {
  await abrir(page, { '/syslab/index.php': LOGIN });
  expect(await page.evaluate(probeStatus)).toMatchObject({ loginRequired: true, hasRutInput: false });
  expect(await page.evaluate(stepPrepareSearch)).toEqual({ loginRequired: true });
  expect(await page.evaluate(stepSubmitSearch, '12345678')).toEqual({ loginRequired: true });
  expect(await page.evaluate(stepReadResults)).toEqual({ loginRequired: true });
});

test('no escribe el RUT en el campo de usuario de la pantalla de acceso', async ({ page }) => {
  await abrir(page, { '/syslab/index.php': LOGIN });
  await page.evaluate(stepSubmitSearch, '12345678');
  await reposar(page);
  expect(await page.locator('#usuario').inputValue()).toBe('');
  expect(await clics(page)).toEqual([]);
});

// ── Paso 1: llegar al formulario de búsqueda por RUT ──

test('desde el menú hace clic en «Búsqueda por RUT»', async ({ page }) => {
  await abrir(page, { '/syslab/index.php': MENU });
  expect(await page.evaluate(stepPrepareSearch)).toEqual({ navigated: true });
  await reposar(page);
  expect(await clics(page)).toEqual(['Búsqueda por RUT']);
});

test('si ya está en el formulario no navega ni hace clic', async ({ page }) => {
  await abrir(page, { '/syslab/index.php': BUSQUEDA });
  expect(await page.evaluate(stepPrepareSearch)).toEqual({ navigated: false });
  await reposar(page);
  expect(await clics(page)).toEqual([]);
});

test('avisa cuando el menú ya no ofrece la búsqueda por RUT', async ({ page }) => {
  await abrir(page, { '/syslab/index.php': MENU_SIN_OPCION });
  const paso = await page.evaluate(stepPrepareSearch);
  expect(paso.error).toMatch(/Búsqueda por RUT/);
  expect(await clics(page)).toEqual([]);
});

// ── Paso 2: escribir el RUT y enviar ──

test('escribe el RUT, avisa a la página y pulsa «Aceptar»', async ({ page }) => {
  await abrir(page, { '/syslab/index.php': BUSQUEDA });
  const eventos = await page.evaluate(() => {
    globalThis.__eventos = [];
    const campo = document.querySelector('input[name="rut"]');
    for (const tipo of ['input', 'change']) campo.addEventListener(tipo, () => globalThis.__eventos.push(tipo));
    return globalThis.__eventos;
  });
  expect(eventos).toEqual([]);
  expect(await page.evaluate(stepSubmitSearch, '12345678')).toEqual({ navigated: true });
  expect(await page.evaluate(() => document.activeElement.getAttribute('name'))).toBe('rut');
  await reposar(page);
  expect(await page.locator('input[name="rut"]').inputValue()).toBe('12345678');
  expect(await page.evaluate(() => globalThis.__eventos)).toEqual(['input', 'change']);
  expect(await clics(page)).toEqual(['Aceptar']);
});

test('si el campo no se llama «rut» usa el primero que no sea el de usuario', async ({ page }) => {
  await abrir(page, { '/syslab/index.php': BUSQUEDA_SIN_NOMBRE });
  expect(await page.evaluate(stepSubmitSearch, '12345678')).toEqual({ navigated: true });
  await reposar(page);
  expect(await page.locator('input[name="paciente"]').inputValue()).toBe('12345678');
  expect(await page.locator('input[name="usuario"]').inputValue()).toBe('jperez');
  expect(await clics(page)).toEqual(['Consultar']);
});

test('sin botón reconocible envía el formulario igual', async ({ page }) => {
  await abrir(page, { '/syslab/index.php': BUSQUEDA_SIN_BOTON });
  expect(await page.evaluate(stepSubmitSearch, '12345678')).toEqual({ navigated: true });
  await reposar(page);
  expect(await page.evaluate(() => globalThis.__envios)).toBe(1);
});

test('rechaza cuerpos de RUT que no son de 5 a 9 dígitos', async ({ page }) => {
  await abrir(page, { '/syslab/index.php': BUSQUEDA });
  for (const malo of ['', '123', '1234567890', '1234567a', '12.345.678', 'DROP TABLE']) {
    const paso = await page.evaluate(stepSubmitSearch, malo);
    expect(paso.error, `cuerpo «${malo}»`).toMatch(/no está disponible/);
  }
  await reposar(page);
  expect(await page.locator('input[name="rut"]').inputValue()).toBe('');
  expect(await clics(page)).toEqual([]);
});

// ── Paso 3: leer la tabla de resultados ──

test('lee una fila completa: número, enlace, fecha, hora, RUT, nombre y exámenes', async ({ page }) => {
  await abrir(page, { '/syslab/resultado.php': tabla([fila()]) }, '/syslab/resultado.php');
  const { exams } = await page.evaluate(stepReadResults);
  expect(exams).toEqual([{
    id: '101',
    link: `${ORIGEN}/syslab/detalleexamenes.php?id=101`,
    date: '04-09-2026',
    time: '10:32',
    rutBody: '12345678',
    patientName: 'PACIENTE DE PRUEBA',
    origin: 'Ambulatorio',
    exams: ['HEMOGRAMA', 'PERFIL BIOQUIMICO'],
  }]);
});

test('descarta las filas que no llevan a un informe de SysLab', async ({ page }) => {
  const buenas = [fila({ id: '201', href: 'detalleexamenes.php?id=201' })];
  const malas = [
    fila({ id: '202', href: 'http://otro.example/syslab/detalleexamenes.php?id=202' }),
    fila({ id: '203', href: 'verpaciente.php?id=203' }),
    fila({ id: '204', href: '' }),
    fila({ id: 'X7', href: 'detalleexamenes.php?id=X7' }),
    fila({ id: '205', href: 'javascript:void(0)' }),
    // PHP acepta rutas con cola: sin el ancla final, «detalleexamenes.php/1»
    // pasaría por informe y llevaría a otra parte del portal.
    fila({ id: '206', href: 'detalleexamenes.php/1' }),
    '<tr><td>207</td><td>04-09-2026</td></tr>',
    // Cinco celdas: sin el mínimo de seis, leer la columna de exámenes revienta
    // y se pierde la búsqueda entera, no sólo esta fila.
    '<tr><td><a href="detalleexamenes.php?id=208">208</a></td><td>04-09-2026<br>10:00</td>' +
      '<td>11.111.111</td><td>FILA SIN COLUMNA DE EXAMENES</td><td>Ambulatorio</td></tr>',
  ];
  await abrir(page, { '/syslab/resultado.php': tabla([...buenas, ...malas]) }, '/syslab/resultado.php');
  const { exams } = await page.evaluate(stepReadResults);
  expect(exams.map(e => e.id)).toEqual(['201']);
});

test('no confunde otras tablas de la página con la de resultados', async ({ page }) => {
  const html = pagina(`<table class="menu">${fila({ id: '301' })}</table>` +
    `<table class="narrow">${fila({ id: '302' })}</table>`);
  await abrir(page, { '/syslab/resultado.php': html }, '/syslab/resultado.php');
  const { exams } = await page.evaluate(stepReadResults);
  expect(exams.map(e => e.id)).toEqual(['302']);
});

test('tolera una fila sin hora y sin RUT, y da igual cómo escriban el salto', async ({ page }) => {
  const filas = [
    fila({ id: '401', hora: '', rut: '' }),
    fila({ id: '402', href: 'detalleexamenes.php?id=402', salto: '<br>' }),
    fila({ id: '403', href: 'detalleexamenes.php?id=403', salto: '<BR/>' }),
  ];
  await abrir(page, { '/syslab/resultado.php': tabla(filas) }, '/syslab/resultado.php');
  const { exams } = await page.evaluate(stepReadResults);
  expect(exams[0]).toMatchObject({ date: '04-09-2026', time: '', rutBody: '' });
  expect(exams.slice(1).map(e => [e.date, e.time])).toEqual([['04-09-2026', '10:32'], ['04-09-2026', '10:32']]);
});

test('una tabla vacía o sin resultados devuelve una lista vacía, no un error', async ({ page }) => {
  await abrir(page, { '/syslab/resultado.php': tabla([]) }, '/syslab/resultado.php');
  expect(await page.evaluate(stepReadResults)).toEqual({ exams: [] });
});

// ── Paso 4: traer el PDF del informe ──

const PDF = Buffer.from('%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\n%%EOF\n');
const informe = (page, rutas) => abrir(page, { '/syslab/index.php': pagina('<p>SysLab</p>'), ...rutas });
const traer = (page, link) => page.evaluate(stepFetchReport, link);

test('trae un informe que ya es PDF', async ({ page }) => {
  await informe(page, { '/syslab/informe.pdf': { body: PDF, tipo: 'application/pdf' } });
  const { base64, error } = await traer(page, `${ORIGEN}/syslab/informe.pdf`);
  expect(error).toBeUndefined();
  expect(Buffer.from(base64, 'base64').equals(PDF)).toBe(true);
});

test('sigue un nivel cuando el informe viene envuelto en HTML', async ({ page }) => {
  await informe(page, {
    '/syslab/detalleexamenes.php': pagina('<iframe src="informe.pdf" width="100%"></iframe>'),
    '/syslab/informe.pdf': { body: PDF, tipo: 'application/octet-stream' },
  });
  const { base64 } = await traer(page, `${ORIGEN}/syslab/detalleexamenes.php`);
  expect(Buffer.from(base64, 'base64').equals(PDF)).toBe(true);
});

test('no se queda en bucle si el HTML se apunta a sí mismo', async ({ page }) => {
  await informe(page, {
    '/syslab/detalleexamenes.php': pagina('<a href="detalleexamenes.php">Ver informe</a>'),
  });
  expect(await traer(page, `${ORIGEN}/syslab/detalleexamenes.php`)).toEqual({ error: 'El informe no contiene un PDF.' });
});

test('avisa cuando la respuesta no trae ningún PDF', async ({ page }) => {
  await informe(page, { '/syslab/detalleexamenes.php': pagina('<p>Sin resultados para el paciente.</p>') });
  expect(await traer(page, `${ORIGEN}/syslab/detalleexamenes.php`)).toEqual({ error: 'El informe no contiene un PDF.' });
});

test('rechaza rutas fuera de SysLab sin pedirlas', async ({ page }) => {
  await informe(page, {});
  const pedidas = [];
  page.on('request', req => pedidas.push(req.url()));
  for (const link of [`http://otro.example/syslab/informe.pdf`, `${ORIGEN}/otro/informe.pdf`, 'javascript:alert(1)', 'http://']) {
    expect((await traer(page, link)).error, `enlace «${link}»`).toMatch(/no permitida/);
  }
  expect(pedidas).toEqual([]);
});

test('un enlace relativo se resuelve dentro de SysLab, que es donde corre', async ({ page }) => {
  await informe(page, { '/syslab/informe.pdf': { body: PDF, tipo: 'application/pdf' } });
  const { base64 } = await traer(page, 'informe.pdf');
  expect(Buffer.from(base64, 'base64').equals(PDF)).toBe(true);
});

test('traduce los fallos de SysLab en vez de dejarlos pasar', async ({ page }) => {
  await informe(page, {
    '/syslab/roto.pdf': { status: 500, body: 'error', tipo: 'text/plain' },
    '/syslab/vacio.pdf': { body: '', tipo: 'application/pdf' },
    '/syslab/enorme.pdf': { body: Buffer.alloc(6 * 1024 * 1024 + 16, 0x20), tipo: 'application/pdf' },
  });
  expect((await traer(page, `${ORIGEN}/syslab/roto.pdf`)).error).toMatch(/HTTP 500/);
  expect((await traer(page, `${ORIGEN}/syslab/vacio.pdf`)).error).toMatch(/vacío/);
  expect((await traer(page, `${ORIGEN}/syslab/enorme.pdf`)).error).toMatch(/6 MB/);
});
