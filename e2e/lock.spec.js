import { expect, test } from '@playwright/test';

/**
 * El bloqueo por inactividad afirma que oculta los datos de pacientes. Antes
 * era sólo un velo: la paleta (⌘K) se abría por encima con doce pacientes y
 * las flechas del panel seguían navegando detrás. Este recorrido lo comprueba
 * con la aplicación real y datos sintéticos.
 */
test('con la pantalla bloqueada no se puede abrir la paleta ni tocar el contenido', async ({ page }) => {
  await page.goto('/dev/');
  await expect(page.locator('html')).toHaveAttribute('data-dev-ready', 'true');
  await page.locator('#btnFetch').click();
  await expect(page.locator('#statusBar')).toHaveText(/^\d+ atenciones( · .+)?$/);

  // Armar el bloqueo por la vía real (Preferencias → select), con 0,6 s.
  await page.evaluate(() => {
    const sel = document.getElementById('setLock');
    const o = document.createElement('option'); o.value = '0.01'; sel.appendChild(o);
    sel.value = '0.01'; sel.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await expect(page.locator('#lockScreen')).toBeVisible({ timeout: 3000 });

  await expect(page.locator('#mainContent')).toHaveJSProperty('inert', true);
  await expect(page.locator('#topbar')).toHaveJSProperty('inert', true);

  // Los atajos globales no deben atravesar el bloqueo.
  await page.keyboard.press('Meta+K');
  await page.keyboard.press('/');
  await expect(page.locator('#palette')).toBeHidden();

  // El foco está en el botón del bloqueo; Tab no puede escapar al contenido.
  await expect(page.locator('#lockBtn')).toBeFocused();
  await page.keyboard.press('Tab');
  const focusedInside = await page.evaluate(() => document.getElementById('lockScreen').contains(document.activeElement) || document.activeElement === document.body);
  expect(focusedInside).toBe(true);

  await page.locator('#lockBtn').click();
  await expect(page.locator('#lockScreen')).toBeHidden();
  await expect(page.locator('#mainContent')).toHaveJSProperty('inert', false);

  // Desbloqueado, la paleta vuelve a funcionar.
  await page.keyboard.press('Meta+K');
  await expect(page.locator('#palette')).toBeVisible();
});
