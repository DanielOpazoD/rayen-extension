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
  await page.getByRole('tablist', { name: 'Secciones' }).getByRole('tab', { name: 'Laboratorio' }).click();

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

  // Marcar dos órdenes habilita el análisis con el conteo correcto.
  const boxes = page.locator('#labHsrBody .lab-check');
  await boxes.nth(0).check();
  await boxes.nth(2).check();
  await expect(page.locator('#labAnalyze')).toHaveText('Analizar 2');
  await expect(page.locator('#labDownloadAll')).toBeVisible();

  // Editar el RUT sin volver a buscar avisa de que la tabla es del paciente anterior.
  await page.locator('#labRut').fill('16.940.645-6');
  await expect(page.locator('#labStale')).toBeVisible();
  await expect(page.locator('#labStale')).toContainText(RUT);
  // Con la tabla desfasada no se puede generar el PDF único (llevaría el RUT de
  // otra persona); al volver al RUT buscado se reactiva.
  await expect(page.locator('#labDownloadAll')).toBeDisabled();
  await page.locator('#labRut').fill(RUT);
  await expect(page.locator('#labStale')).toBeHidden();
  await expect(page.locator('#labDownloadAll')).toBeEnabled();

  // La solicitud de exámenes abre con el catálogo completo y sin «enviar».
  await page.locator('#labRequestOpen').click();
  await expect(page.locator('#labRequestBody input[type=checkbox]')).toHaveCount(67);
  await expect(page.locator('#labRequest')).not.toContainText(/enviar/i);

  // Todo el tráfico de laboratorio se resolvió en el navegador: nada salió a la red.
  expect(external.filter(u => !/hsalvador\.cl|10\.4\.69\.90/.test(u))).toEqual([]);
});
