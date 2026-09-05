import { test, expect } from '@playwright/test';

async function abrirPaciente(page) {
  await page.goto('/dev/');
  await expect(page.locator('html')).toHaveAttribute('data-dev-ready', 'true');
  await page.locator('#btnFetch').click();
  await expect(page.locator('#statusBar')).toContainText('atenciones');
  await page.getByRole('tablist', { name: 'Secciones' }).getByRole('tab', { name: 'Atenciones', exact: true }).click();
  await page.locator('#tbody tr[data-id] .pat-link').first().click();
  await expect(page.locator('#patientPanel')).toBeVisible();
}

test('el botón Lab del panel abre Exámenes complementarios con el RUN del paciente', async ({ page }) => {
  await abrirPaciente(page);
  await page.locator('#ppLabBtn').click();
  await expect(page.locator('#patientPanel')).toBeHidden();
  await expect(page.getByRole('tablist', { name: 'Secciones' }).getByRole('tab', { name: 'Exámenes complementarios' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('#labRut')).not.toHaveValue('');
});

test('Escape cierra primero el menú PDF y sólo después el panel', async ({ page }) => {
  await abrirPaciente(page);
  await page.locator('#ppPdfBtn').click();
  await expect(page.locator('#ppPdfMenu')).toHaveClass(/open/);
  await page.keyboard.press('Escape');
  await expect(page.locator('#ppPdfMenu')).not.toHaveClass(/open/);
  await page.waitForTimeout(400); // la transición del panel dura 200 ms: «visible» recién pulsado no prueba nada
  await expect(page.locator('#patientPanel')).toHaveClass(/open/);
  await page.keyboard.press('Escape');
  await expect(page.locator('#patientPanel')).not.toHaveClass(/open/);
});

test('el chip «+n» de interconsultas es clicable y lleva a Interconsultas', async ({ page }) => {
  await page.goto('/dev/');
  await expect(page.locator('html')).toHaveAttribute('data-dev-ready', 'true');
  await page.locator('#btnFetch').click();
  await expect(page.locator('#statusBar')).toContainText('atenciones');
  await page.getByRole('tablist', { name: 'Secciones' }).getByRole('tab', { name: 'Atenciones', exact: true }).click();
  const chip = page.locator('#tbody .ic-chip.sic-run').first();
  await expect(chip).toBeVisible();
  await chip.click();
  await expect(page.getByRole('tablist', { name: 'Secciones' }).getByRole('tab', { name: 'Interconsultas' })).toHaveAttribute('aria-selected', 'true');
});

test('el desplegable «Detalle» de sincronización se cierra con un clic fuera y con Escape', async ({ page }) => {
  await page.goto('/dev/');
  await expect(page.locator('html')).toHaveAttribute('data-dev-ready', 'true');
  await page.locator('#btnFetch').click();
  await expect(page.locator('#statusBar')).toContainText('atenciones');
  await page.locator('#btnSyncDetails').click();
  await expect(page.locator('#syncDetails')).toBeVisible();
  await page.locator('h1').first().click();
  await expect(page.locator('#syncDetails')).toBeHidden();
  await page.locator('#btnSyncDetails').click();
  await expect(page.locator('#syncDetails')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('#syncDetails')).toBeHidden();
});

test('las flechas recorren el menú Exportar de una en una', async ({ page }) => {
  await page.goto('/dev/');
  await expect(page.locator('html')).toHaveAttribute('data-dev-ready', 'true');
  await page.locator('#btnFetch').click();
  await expect(page.locator('#statusBar')).toContainText('atenciones');
  await page.getByRole('tablist', { name: 'Secciones' }).getByRole('tab', { name: 'Atenciones', exact: true }).click();
  const btn = page.locator('#btnExport');
  if (!(await btn.isVisible())) await page.locator('#btnMore').click(); // en estrecho, Exportar vive tras «⋯»
  await btn.focus();
  await page.keyboard.press('ArrowDown');
  const items = page.locator('#exportMenu button[data-fmt]');
  await expect(items.nth(0)).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(items.nth(1)).toBeFocused();
  await page.keyboard.press('End');
  await expect(items.last()).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.locator('#exportMenu')).not.toHaveClass(/open/);
});
