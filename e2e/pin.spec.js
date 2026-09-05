import { test, expect } from '@playwright/test';

// Con ?pin=1 el arnés deja de guardar en claro: aparece la pantalla de PIN, y al
// crearlo los datos sintéticos que ya estaban en el almacenamiento se cifran.
test('la primera vez pide crear un PIN, cifra lo que había y después lo exige para entrar', async ({ page }) => {
  await page.goto('/dev/?pin=1');
  await expect(page.locator('#pinScreen')).toBeVisible();
  await expect(page.locator('#pinTitle')).toHaveText(/Crea un PIN/);
  await page.locator('#pinInput').fill('123456');
  await page.locator('#pinConfirm').fill('654321');
  await page.locator('#pinBtn').click();
  await expect(page.locator('#pinMsg')).toHaveText(/no coinciden/);
  await page.locator('#pinConfirm').fill('123456');
  await page.locator('#pinBtn').click();
  await expect(page.locator('#pinScreen')).toBeHidden({ timeout: 15000 });
  await expect(page.locator('html')).toHaveAttribute('data-dev-ready', 'true');
  const cifrado = await page.evaluate(() => new Promise(r => chrome.storage.local.get(null, d => r(Object.entries(d).filter(([k]) => k !== 'rayen_crypto_v1').every(([, v]) => v && v.__enc === 1)))));
  expect(cifrado).toBe(true);
  await page.locator('#btnFetch').click();
  await expect(page.locator('#statusBar')).toContainText('atenciones');
});
