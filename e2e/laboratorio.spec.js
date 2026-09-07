import { expect, test } from '@playwright/test';

/**
 * La pestaña Laboratorio no tenía ningún recorrido de navegador. Este usa la
 * aplicación real con datos sintéticos e intercepta los dos laboratorios en el
 * propio navegador: ninguna petición sale a la red.
 */

// Paciente sintético con RUT válido (11.111.111-1). El portal del Salvador
// entrega el documento relleno con ceros y con el dígito verificador pegado.
const RUT = '11.111.111-1';
const DOC = '0111111111';
const orden = (num, fecha, area, prestaciones) => ({
  OrdenId: Number(num), NumeroOrden: num, FechaOrden: `/Date(${fecha})/`, numDocumentoCompleto: DOC,
  Paciente: { NombreCompletoPaciente: 'PACIENTE EJEMPLO SINTÉTICO', Sexo: 'M', NumeroDocumento: DOC },
  Procedencia: { Descripcion: 'HOSPITALES - HOSPITAL HANGA ROA' }, ProcedenciaDetalle: { Descripcion: 'HOSPITAL HANGA ROA' },
  usaSubProcedencia: true, AreasString: area,
  CantidadPrtValidadas: { cantPrtOrdenes: prestaciones.length, CantPrtValidadas: prestaciones.length, CantPrtRechazadas: 0 },
  ListadoPrestacionesEstado: prestaciones.map(p => ({ NombrePrestacion: p, EstadoPrestacion: ' Prestacion Validada ', FechaValidacion: '- 26/11/2025', DestinoDerivacion: '' })),
  OrdenEncryptada: `enc${num}`, contieneDocumentos: false, mensajeBusqueda: null,
});
const ORDENES = [
  orden('02131899', 1764168289483, 'QUÍMICA', ['FERRITINA', 'VITAMINA B12']),
  orden('02131884', 1764168289483, 'MICROBIOLOGIA', ['VDRL']),
  orden('02120408', 1750860000000, 'SEROLOGIA', ['VIH', 'HEPATITIS B', 'HEPATITIS C', 'VDRL']),
  orden('02120387', 1750860000000, 'QUÍMICA, INMUNOREUMATOLOGIA', ['ANA', 'FACTOR REUMATOIDEO', 'VITAMINA D', 'PCR']),
];

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => { globalThis.__RAYEN_DEV_NET = 'mock'; }); // el stub deja pasar los laboratorios: los simulan las rutas de abajo
  // Hospital Salvador: sesión viva y búsqueda con cuatro órdenes.
  await page.route('https://examenesusuarios.hsalvador.cl/**', route => {
    const url = route.request().url();
    if (url.includes('/BuscarOrdenes/buscarOrdenes')) {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(ORDENES) });
    }
    return route.fulfill({ status: 200, contentType: 'text/html', body: '<html><body>ok</body></html>' });
  });
  // Hanga Roa: sin pestaña de SysLab → el estado debe decirlo, no fallar.
  await page.route('http://10.4.69.90/**', route => route.abort());
});

test('busca en el Salvador, muestra las órdenes con su detalle y ofrece analizar', async ({ page }) => {
  const external = [];
  page.on('request', r => { const h = new URL(r.url()).hostname; if (!['127.0.0.1', 'localhost'].includes(h)) external.push(r.url()); });

  await page.goto('/dev/');
  await expect(page.locator('html')).toHaveAttribute('data-dev-ready', 'true');
  await page.getByRole('tablist', { name: 'Secciones' }).getByRole('tab', { name: 'Exámenes complementarios' }).click();

  await expect(page.locator('#labHsrStatus')).toHaveText('HSR conectado');
  await expect(page.locator('#labHhrStatus')).toContainText('SysLab');

  await page.locator('#labRut').fill(RUT);
  await page.locator('#labSearchBtn').click();

  // La tabla dice cuántas y de quién.
  await expect(page.locator('#labHsrCount')).toHaveText(`HSR: 4 órdenes de ${RUT}`);
  await expect(page.locator('#labHsrBody > tr:not(.lab-detail)')).toHaveCount(4);

  // El detalle de prestaciones se despliega desde el progreso.
  await page.locator('#labHsrBody .lab-expand').first().click();
  await expect(page.locator('#labPrest0')).toBeVisible();
  await expect(page.locator('#labPrest0')).toContainText('Ferritina'); // el laboratorio grita «FERRITINA»; en pantalla, caja de oración

  // Marcar dos órdenes se refleja en el botón del menú y en sus opciones.
  const boxes = page.locator('#labHsrBody .lab-check');
  await boxes.nth(0).check();
  await boxes.nth(2).check();
  await expect(page.locator('#labSelBtn')).toHaveText(/2 marcadas/);
  await page.locator('#labSelBtn').click();
  await expect(page.locator('#labAnalyzeHint')).toHaveText('2 informes');
  await expect(page.locator('#labPdfSelected')).toBeEnabled();
  await page.keyboard.press('Escape');

  // Editar el RUT sin volver a buscar avisa de que la tabla es del paciente anterior.
  await page.locator('#labRut').fill('16.940.645-6');
  await expect(page.locator('#labStale')).toBeVisible();
  await expect(page.locator('#labStale')).toContainText(RUT);
  // Con la tabla desfasada no se genera ningún PDF (llevaría el RUT de otra
  // persona); al volver al RUT buscado se reactiva.
  await page.locator('#labSelBtn').click();
  await expect(page.locator('#labDownloadAll')).toBeDisabled();
  await expect(page.locator('#labPdfSelected')).toBeDisabled();
  await page.keyboard.press('Escape');
  await page.locator('#labRut').fill(RUT);
  await expect(page.locator('#labStale')).toBeHidden();
  await page.locator('#labSelBtn').click();
  await expect(page.locator('#labDownloadAll')).toBeEnabled();
  await page.keyboard.press('Escape');

  // La solicitud de exámenes abre con el catálogo completo y sin «enviar».
  await page.locator('#labRequestOpen').click();
  await expect(page.locator('#labRequestBody input[type=checkbox]')).toHaveCount(67);
  await expect(page.locator('#labRequest')).not.toContainText(/enviar/i);

  // Todo el tráfico de laboratorio se resolvió en el navegador: nada salió a la red.
  expect(external.filter(u => !/hsalvador\.cl|10\.4\.69\.90/.test(u))).toEqual([]);
});

/**
 * Con los dos hospitales en pantalla. El arnés simula el transporte de SysLab
 * (`?syslab=1`), que no es HTTP sino la conducción de una pestaña ajena; el
 * lector real de esa página se prueba aparte, en `syslab.spec.js`.
 *
 * Antes había una casilla de cabecera por tabla y ninguna forma de marcar las
 * dos: «seleccionar todo» dejaba fuera un hospital entero sin decirlo, y el PDF
 * salía con los informes de uno solo.
 */
test('«marcar todas» alcanza a los dos hospitales, y el PDF sale de lo marcado', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'no depende del ancho de la ventana');
  await page.goto('/dev/?syslab=1');
  await expect(page.locator('html')).toHaveAttribute('data-dev-ready', 'true');
  await page.getByRole('tablist', { name: 'Secciones' }).getByRole('tab', { name: 'Exámenes complementarios' }).click();
  await expect(page.locator('#labHhrStatus')).toHaveText(/conectado/i);

  await page.locator('#labRut').fill(RUT);
  await page.locator('#labPeriodo').selectOption('0'); // «Todo»: las órdenes sintéticas de SysLab son de 2025-2026
  await page.locator('#labSearchBtn').click();
  await expect(page.locator('#labHsrCount')).toContainText('4 órdenes');
  await expect(page.locator('#labHhrCount')).toContainText('3 órdenes');

  await page.locator('#labSelBtn').click();
  await page.locator('#labPickAll').click();
  await expect(page.locator('#labHsrBody .lab-check:checked')).toHaveCount(4);
  await expect(page.locator('#labHhrBody .lab-check:checked')).toHaveCount(3);
  await expect(page.locator('#labSelBtn')).toHaveText(/7 marcadas/);
  // Las casillas de cabecera reflejan que su tabla quedó entera marcada.
  await expect(page.locator('#labPickAllHsr')).toBeChecked();
  await expect(page.locator('#labPickAllHhr')).toBeChecked();

  // El PDF de lo marcado incluye lo que se pudo y nombra el hospital que quedó
  // fuera con su motivo: «2 no se pudo incluir» sin decir por qué mandaba a
  // buscar el problema en el paciente.
  const bajada = page.waitForEvent('download');
  await page.locator('#labSelBtn').click();
  await page.locator('#labPdfSelected').click();
  expect((await bajada).suggestedFilename()).toBe('laboratorio-11111111-1.pdf');
  await expect(page.locator('#labError')).toContainText('PDF con 3 informes');
  await expect(page.locator('#labError')).toContainText('del Salvador');
  await expect(page.locator('#labError')).toContainText('ProactiveLIS');

  // Quitar la selección deja el menú en su estado inicial.
  await page.locator('#labSelBtn').click();
  await page.locator('#labPickNone').click();
  await expect(page.locator('#labSelBtn')).toHaveText(/Informes/);
  await expect(page.locator('#labHhrBody .lab-check:checked')).toHaveCount(0);
});

/** Llegar al laboratorio desde una ficha y poder volver a ella en un clic. */
test('desde la ficha, el laboratorio ofrece la vuelta al paciente y la retira al cambiar de RUT', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'no depende del ancho de la ventana');
  await page.goto('/dev/');
  await expect(page.locator('html')).toHaveAttribute('data-dev-ready', 'true');
  await page.locator('#btnFetch').click();
  await expect(page.locator('#statusBar')).toContainText('atenciones');
  await page.getByRole('tablist', { name: 'Secciones' }).getByRole('tab', { name: 'Atenciones', exact: true }).click();
  await page.locator('#tbody tr[data-id] .pat-link').first().click();
  await expect(page.locator('#patientPanel')).toBeVisible();
  const nombre = (await page.locator('#ppName').innerText()).trim();

  await page.locator('#ppLabBtn').click();
  await expect(page.locator('#tab-laboratorio')).toBeVisible();
  await expect(page.locator('#labBack')).toHaveText(`‹ Volver a ${nombre}`);

  await page.locator('#labBack').click();
  await expect(page.locator('#patientPanel')).toBeVisible();
  await expect(page.locator('#ppName')).toHaveText(nombre);

  // Buscar a otra persona retira el botón: volver «a la ficha» abriendo otra
  // sería peor que no ofrecerlo.
  await page.locator('#ppLabBtn').click();
  await expect(page.locator('#labBack')).toBeVisible();
  await page.locator('#labRut').fill('16.940.645-6');
  await page.locator('#labSearchBtn').click();
  await expect(page.locator('#labBack')).toBeHidden();
});
