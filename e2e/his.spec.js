import { test, expect } from '@playwright/test';

/**
 * El HIS de Hanga Roa dentro del panel. El arnés simula el login y el historial
 * por RUT (`?his=1` deja el HIS conectado y con datos). Verifica los dos asuntos
 * que pidió el médico: la historia del paciente muestra las atenciones del HIS
 * con un icono de origen, y hay un login por usuario/contraseña en Preferencias.
 */
async function abrirPacienteAtenciones(page, query = '?his=1') {
  await page.goto(`/dev/${query}`);
  await expect(page.locator('html')).toHaveAttribute('data-dev-ready', 'true');
  await page.locator('#btnFetch').click();
  await expect(page.locator('#statusBar')).toContainText('atenciones');
  await page.getByRole('tablist', { name: 'Secciones' }).getByRole('tab', { name: 'Atenciones', exact: true }).click();
  await page.locator('#tbody tr[data-id] .pat-link').first().click();
  await expect(page.locator('#patientPanel')).toBeVisible();
  await page.locator('.pp-tab[data-pt="at"]').click();
}

test('la historia del paciente muestra las atenciones del HIS con su icono de origen', async ({ page }) => {
  await abrirPacienteAtenciones(page);
  const block = page.locator('#ppPaneAt .his-block');
  await expect(block).toBeVisible();
  await expect(block.locator('.his-origen')).toContainText('HIS');
  await expect(block.locator('.his-visit')).toHaveCount(2);
  await expect(block).toContainText('CARDIOLOGIA');
  await expect(block).toContainText('URGENCIA ADULTOS');
  await expect(block.locator('.his-open')).toHaveCount(2); // cada una abre su ficha en el HIS
});

test('sin HIS configurado no aparece el bloque (no se muestra nada de otro sistema por defecto)', async ({ page }) => {
  await abrirPacienteAtenciones(page, ''); // sin ?his=1
  await expect(page.locator('#ppPaneAt')).toBeVisible();
  await expect(page.locator('#ppPaneAt .his-block')).toHaveCount(0);
});

test('login del HIS en Preferencias: conectar guarda la sesión y lo confirma', async ({ page }) => {
  await page.goto('/dev/');
  await expect(page.locator('html')).toHaveAttribute('data-dev-ready', 'true');
  const narrow = (await page.evaluate(() => document.documentElement.clientWidth)) <= 1100;
  if (narrow) await page.locator('#btnMore').click();
  await page.locator('#btnSettings').click();
  await page.locator('.set-adv > summary').click(); // el login del HIS vive en «Avanzado»
  await page.locator('#hisUser').fill('12345678');
  await page.locator('#hisPass').fill('clave-de-prueba');
  await page.locator('#hisConnect').click();
  await expect(page.locator('#hisStatus')).toContainText('Conectado al HIS', { timeout: 5000 });
  await expect(page.locator('#hisForget')).toBeVisible();
  // La contraseña no queda en pantalla tras conectar.
  await expect(page.locator('#hisPass')).toHaveValue('');
});
