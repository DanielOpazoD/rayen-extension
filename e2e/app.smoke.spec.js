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
  const total = Number((await page.locator('#statusBar').innerText()).split(' ')[0]);
  expect(total).toBeGreaterThan(0);

  await expect(page.locator('#todayContent')).not.toContainText('Citas pasadas sin resolver');
  await expect(page.locator('#todayContent')).not.toContainText('Sin contrarreferencia');

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

  const overflow = await page.evaluate(() => ({
    page: document.documentElement.scrollWidth > window.innerWidth,
    offenders: [...document.querySelectorAll('body *')]
      .filter(element => element.getBoundingClientRect().right > window.innerWidth + 1)
      .slice(0, 8)
      .map(element => `${element.tagName.toLowerCase()}#${element.id}.${element.className}`),
  }));
  expect(overflow.page, `elementos fuera del viewport: ${overflow.offenders.join(', ')}`).toBe(false);
  const menuBox = await page.locator('#filtTipoMenu').boundingBox();
  expect(menuBox.x).toBeGreaterThanOrEqual(0);
  expect(menuBox.x + menuBox.width).toBeLessThanOrEqual(page.viewportSize().width);
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
