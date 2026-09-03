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
  await expect(page.locator('#statusBar')).toHaveText(/^\d+ atenciones$/);
  await expect(page.locator('#syncOverall')).toHaveText(/^(Al día|Pendiente)$/);
  const total = Number((await page.locator('#statusBar').innerText()).split(' ')[0]);
  expect(total).toBeGreaterThan(0);

  const compactHeader = await page.locator('.status-line').boundingBox();
  expect(compactHeader.height).toBeLessThanOrEqual(40);
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
  const count = countText.match(/^(?:(\d+) de )?(\d+) de (\d+) registros$/);
  expect(count, `contador inesperado: ${countText}`).not.toBeNull();
  const [visible, matching, all] = [Number(count[1] ?? count[2]), Number(count[2]), Number(count[3])];
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
