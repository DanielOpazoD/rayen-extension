import { test, expect } from '@playwright/test';

/**
 * Capturas de referencia de las tres superficies que más veces han cambiado sin
 * que nadie lo viera (la marca en cruz dibujada sobre el título vivió semanas).
 * El reloj se congela para que el arnés pinte siempre la misma agenda. Las
 * referencias son de macOS: en CI (Linux, otras fuentes) el recorrido se salta;
 * se regeneran con `npm run visual:update` cuando el cambio visual es intencional.
 */
const FIJO = new Date(2026, 8, 4, 10, 0, 0);
test.skip(Boolean(process.env.CI), 'referencias tomadas en macOS; en Linux las fuentes difieren');
test.beforeEach(async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'una sola referencia por superficie');
  await page.clock.setFixedTime(FIJO);
});

test('pantalla de PIN (creación)', async ({ page }) => {
  await page.goto('/dev/?pin=1');
  await expect(page.locator('#pinScreen')).toBeVisible();
  await page.locator('#pinInput').fill('1234');
  await expect(page.locator('#pinForm')).toHaveScreenshot('pin-crear.png', { maxDiffPixelRatio: 0.01 });
});

test('tabla de atenciones y panel del paciente', async ({ page }) => {
  await page.goto('/dev/');
  await expect(page.locator('html')).toHaveAttribute('data-dev-ready', 'true');
  await page.locator('#btnFetch').click();
  await expect(page.locator('#statusBar')).toContainText('atenciones');
  await page.getByRole('tablist', { name: 'Secciones' }).getByRole('tab', { name: 'Atenciones', exact: true }).click();
  await expect(page.locator('#tbody tr[data-id]').first()).toBeVisible();
  await expect(page.locator('#mainContent')).toHaveScreenshot('tabla-atenciones.png', { maxDiffPixelRatio: 0.01 });
  await page.locator('#tbody tr[data-id] .pat-link').first().click();
  await expect(page.locator('#ppAvatar')).toHaveAttribute('data-ficha', /Ficha/, { timeout: 10000 });
  await page.locator('.pp-tab[data-pt="at"]').click();
  await expect(page.locator('#patientPanel')).toHaveScreenshot('panel-atenciones.png', { maxDiffPixelRatio: 0.01 });
});
