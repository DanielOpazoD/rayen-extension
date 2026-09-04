import { expect, test } from '@playwright/test';

function observeRuntime(page) {
  const consoleIssues = [];
  const pageErrors = [];
  const externalRequests = [];

  page.on('console', message => {
    if (['error', 'warning'].includes(message.type())) consoleIssues.push(`${message.type()}: ${message.text()}`);
  });
  page.on('pageerror', error => pageErrors.push(error.message));
  page.on('request', request => {
    const url = new URL(request.url());
    if (!['127.0.0.1', 'localhost'].includes(url.hostname)) externalRequests.push(request.url());
  });

  return { consoleIssues, pageErrors, externalRequests };
}

test('carga y filtra datos sintéticos sin salir del navegador local', async ({ page }) => {
  const runtime = observeRuntime(page);

  await page.goto('/dev/');
  await expect(page.locator('html')).toHaveAttribute('data-dev-ready', 'true');
  await expect(page).toHaveTitle('Rayen Atenciones — Hospital Hanga Roa · dev');
  await expect(page.getByRole('heading', { name: 'Rayen Atenciones' })).toBeVisible();
  await expect(page.getByText('DEV · DATOS SINTÉTICOS')).toBeVisible();

  await page.locator('#btnFetch').click();
  await expect(page.locator('#statusBar')).toHaveText(/^\d+ atenciones( · .+)?$/);
  await expect(page.locator('#syncOverall')).toHaveText(/^(Al día( · sin ficha)?|Pendiente)$/);
  const total = Number((await page.locator('#statusBar').innerText()).split(' ')[0]);
  expect(total).toBeGreaterThan(0);

  // El estado vive en el riel de pestañas (una sola banda de ≤40 px) y el
  // detalle de sincronización se despliega encima sin empujar las pestañas.
  const rail = await page.locator('.rail').boundingBox();
  const narrowViewport = (await page.evaluate(() => document.documentElement.clientWidth)) <= 760;
  expect(rail.height).toBeLessThanOrEqual(narrowViewport ? 84 : 40); // bajo 760 px el estado baja a una segunda línea del riel
  const tabsBeforeDetails = await page.locator('.tabs').first().boundingBox();
  await page.locator('#btnSyncDetails').click();
  await expect(page.locator('#syncDetails')).toBeVisible();
  const tabsAfterDetails = await page.locator('.tabs').first().boundingBox();
  expect(tabsAfterDetails.y).toBe(tabsBeforeDetails.y);
  await page.locator('#btnSyncDetails').click();
  await expect(page.locator('#syncDetails')).toBeHidden();

  await expect(page.locator('#todayContent')).not.toContainText('Citas pasadas sin resolver');
  await expect(page.locator('#todayContent')).not.toContainText('Sin contrarreferencia');

  await page.getByRole('tablist', { name: 'Secciones' }).getByRole('tab', { name: 'Interconsultas' }).click();
  await expect(page.locator('#tab-interconsultas')).toBeVisible();
  await expect(page.locator('#tab-interconsultas')).not.toContainText(/contrarreferencia/i);
  await expect(page.locator('.sic-table thead th')).toHaveCount(8);

  await page.getByRole('tablist', { name: 'Secciones' }).getByRole('tab', { name: 'Atenciones' }).click();
  await page.locator('#btnFilters').click();
  await page.locator('#filtTipoButton').click();
  await page.getByRole('checkbox', { name: 'Consulta Morbilidad' }).check();
  await page.getByRole('checkbox', { name: 'Control Salud' }).check();
  await expect(page.locator('#filtTipoButton')).toHaveText('2 seleccionados');

  const countText = await page.locator('#countRow').innerText();
  // «N en pantalla · M de T registros», «M de T registros» o «T registros».
  const count = countText.match(/^(?:(\d+) en pantalla · )?(?:(\d+) de )?(\d+) (?:atención|atenciones)$/);
  expect(count, `contador inesperado: ${countText}`).not.toBeNull();
  const all = Number(count[3]), matching = Number(count[2] ?? count[3]), visible = Number(count[1] ?? matching);
  expect(visible).toBeLessThanOrEqual(matching);
  expect(matching).toBeLessThan(total);
  expect(all).toBe(total);

  const layout = await page.evaluate(() => {
    const viewportWidth = document.documentElement.clientWidth;
    const violations = ['#topbar', '#mainContent', '#filterPanel']
      .map(selector => [selector, document.querySelector(selector)?.getBoundingClientRect()])
      .filter(([, box]) => box && (box.left < -1 || box.right > viewportWidth + 1))
      .map(([selector]) => selector);
    return { viewportWidth, violations };
  });
  expect(layout.violations).toEqual([]);
  const menuBox = await page.locator('#filtTipoMenu').boundingBox();
  expect(menuBox.x).toBeGreaterThanOrEqual(0);
  expect(menuBox.x + menuBox.width).toBeLessThanOrEqual(layout.viewportWidth + 1);
  await page.keyboard.press('Escape');
  await expect(page.locator('#filtTipoMenu')).toBeHidden();
  expect(runtime.externalRequests).toEqual([]);
  expect(runtime.consoleIssues).toEqual([]);
  expect(runtime.pageErrors).toEqual([]);
});

test('el salto al contenido funciona con teclado', async ({ page }) => {
  const runtime = observeRuntime(page);

  await page.goto('/dev/');
  await expect(page.locator('html')).toHaveAttribute('data-dev-ready', 'true');
  await page.keyboard.press('Tab');
  await expect(page.locator('.skip-link')).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('#mainContent')).toBeFocused();
  await expect(page).toHaveURL(/#mainContent$/);

  expect(runtime.externalRequests).toEqual([]);
  expect(runtime.consoleIssues).toEqual([]);
  expect(runtime.pageErrors).toEqual([]);
});

// Etapa 2, fase B: una parada de tabulación por fila. Antes cada fila tenía
// tres (nombre, «i», RUN) más una por interconsulta. Aquí se recorre la tabla
// con ↑/↓, se comprueba que sólo una fila es parada y que Enter abre al paciente.
test('la tabla se recorre por filas con el teclado y cada fila cabe en una línea', async ({ page }) => {
  const runtime = observeRuntime(page);

  await page.goto('/dev/');
  await expect(page.locator('html')).toHaveAttribute('data-dev-ready', 'true');
  await page.locator('#btnFetch').click();
  await expect(page.locator('#statusBar')).toHaveText(/^\d+ atenciones( · .+)?$/);
  await page.getByRole('tablist', { name: 'Secciones' }).getByRole('tab', { name: 'Atenciones' }).click();

  const rows = page.locator('#tbody tr[data-id]');
  await expect(rows.first()).toHaveAttribute('tabindex', '0');
  await expect(page.locator('#tbody [tabindex="0"]')).toHaveCount(1);

  const heights = await rows.evaluateAll(list => list.slice(0, 40).map(tr => tr.offsetHeight));
  expect(Math.max(...heights), `filas de ${heights.join(', ')} px`).toBeLessThanOrEqual(48);
  const dateFits = await page.locator('#tbody td[data-c="fechaAtencion"]').first()
    .evaluate(td => td.scrollWidth <= td.clientWidth);
  expect(dateFits, 'la fecha no debe recortarse').toBe(true);

  await rows.first().focus();
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  await expect(rows.nth(2)).toBeFocused();
  await expect(page.locator('#tbody [tabindex="0"]')).toHaveCount(1);
  await page.keyboard.press('ArrowUp');
  await expect(rows.nth(1)).toBeFocused();

  await page.keyboard.press('Enter');
  const panel = page.locator('#patientPanel');
  await expect(panel).toBeVisible();
  // Fase E: diálogo real. El foco entra al diálogo, el fondo queda inerte, Tab
  // no sale del panel, y Escape cierra devolviendo el foco a la fila de origen.
  await expect(panel).toBeFocused();
  await expect(page.locator('#mainContent')).toHaveJSProperty('inert', true);
  await expect(page.locator('#topbar')).toHaveJSProperty('inert', true);
  for (let i = 0; i < 25; i++) {
    await page.keyboard.press('Tab');
    const inside = await page.evaluate(() => document.getElementById('patientPanel').contains(document.activeElement));
    expect(inside, `Tab nº ${i + 1} salió del diálogo`).toBe(true);
  }
  // Cabecera mínima: RUN y edad; Datos se abre desde las iniciales.
  await expect(page.locator('#ppMeta')).toHaveText(/^RUN [\d.]+-[\dK] · \d+ años$/);
  await expect(page.locator('#ppDatosBtn')).toHaveCount(0);
  await page.locator('#ppAvatar').click();
  await expect(page.locator('#ppDatos')).toBeVisible();
  await page.locator('#ppAvatar').click();
  await expect(page.locator('#ppDatos')).toBeHidden();
  // Atenciones con pestañas internas Medicina / Otros.
  await page.locator('.pp-tab[data-pt="at"]').click();
  await expect(page.locator('#ppPaneAt .pp-seg button[data-seg="medicina"]')).toHaveAttribute('aria-pressed', 'true');
  await page.locator('#ppPaneAt .pp-seg button[data-seg="otros"]').click();
  await expect(page.locator('#ppPaneAt .pp-seg button[data-seg="otros"]')).toHaveAttribute('aria-pressed', 'true');
  // Interconsultas con «Mías / De otros» y Recetas con «Activas / Vencidas».
  await page.locator('.pp-tab[data-pt="ic"]').click();
  await expect(page.locator('#ppPaneIc .pp-seg button[data-seg="mias"]')).toHaveAttribute('aria-pressed', 'true');
  await page.locator('#ppPaneIc .pp-seg button[data-seg="otros"]').click();
  await expect(page.locator('#ppPaneIc .pp-seg button[data-seg="otros"]')).toHaveAttribute('aria-pressed', 'true');
  await page.locator('.pp-tab[data-pt="dx"]').click();
  await page.keyboard.press('Escape');
  await expect(panel).toBeHidden();
  await expect(page.locator('#mainContent')).toHaveJSProperty('inert', false);
  await expect(rows.nth(1)).toBeFocused();
  // Cerrado, ningún control del panel es alcanzable con Tab.
  await page.keyboard.press('Tab');
  const escaped = await page.evaluate(() => document.getElementById('patientPanel').contains(document.activeElement));
  expect(escaped).toBe(false);

  expect(runtime.externalRequests).toEqual([]);
  expect(runtime.consoleIssues).toEqual([]);
  expect(runtime.pageErrors).toEqual([]);
});

// Etapa 2, fase A: bajo 1100 px la cabecera es una línea y las opciones se
// pliegan tras «⋯». En escritorio el botón no existe y todo está a la vista.
test('la cabecera pliega sus opciones en pantallas estrechas y las muestra en escritorio', async ({ page }) => {
  const runtime = observeRuntime(page);
  await page.goto('/dev/');
  await expect(page.locator('html')).toHaveAttribute('data-dev-ready', 'true');

  const narrow = (await page.evaluate(() => document.documentElement.clientWidth)) <= 1100;
  const more = page.locator('#btnMore');
  await expect(page.locator('#btnFetch')).toBeVisible();
  if (narrow) {
    await expect(more).toBeVisible();
    await expect(page.locator('#btnSettings')).toBeHidden();
    const headerHeight = await page.locator('#hdrWrap').evaluate(el => el.offsetHeight);
    expect(headerHeight, 'la cabecera estrecha cabe en una línea').toBeLessThanOrEqual(64);
    await more.click();
    await expect(more).toHaveAttribute('aria-expanded', 'true');
    await expect(page.locator('#btnSettings')).toBeVisible();
    await expect(page.locator('#months')).toBeVisible();
    // Menú anidado: cerrar «⋯» con Preferencias abiertas debe cerrar también
    // Preferencias; antes quedaba marcado abierto e invisible.
    await page.locator('#btnSettings').click();
    await expect(page.locator('#settingsMenu')).toBeVisible();
    await more.click();
    await expect(page.locator('#settingsMenu')).toBeHidden();
    await expect(page.locator('#btnSettings')).toHaveAttribute('aria-expanded', 'false');
    await more.click();
    await expect(page.locator('#settingsMenu')).toBeHidden();
    await page.keyboard.press('Escape');
    await expect(more).toHaveAttribute('aria-expanded', 'false');
    await expect(more).toBeFocused();
    await more.click();
    const box = await page.locator('#hdrMore').boundingBox();
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual((await page.evaluate(() => document.documentElement.clientWidth)) + 1);
    await page.locator('#mainContent').click();
    await expect(page.locator('#btnSettings')).toBeHidden();
    await expect(more).toHaveAttribute('aria-expanded', 'false');
  } else {
    await expect(more).toBeHidden();
    await expect(page.locator('#btnSettings')).toBeVisible();
    await expect(page.locator('#months')).toBeVisible();
    // Escape cierra el menú abierto y devuelve el foco a su botón.
    await page.locator('#btnSettings').click();
    await expect(page.locator('#settingsMenu')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('#settingsMenu')).toBeHidden();
    await expect(page.locator('#btnSettings')).toBeFocused();
  }
  expect(runtime.consoleIssues).toEqual([]);
  expect(runtime.pageErrors).toEqual([]);
});
