import { test, expect } from '@playwright/test';

/**
 * Citas futuras en el calendario: el arnés sirve la agenda día por día, como
 * Eloisa. Lo que se comprueba es que una cita agendada no se cuenta como
 * atención en ningún sitio y que su día se puede abrir.
 */
test('el calendario marca los días con citas agendadas y al abrir uno se ve a quién tengo citado', async ({ page }) => {
  await page.goto('/dev/');
  await expect(page.locator('html')).toHaveAttribute('data-dev-ready', 'true');
  await page.locator('#btnFetch').click();
  await expect(page.locator('#statusBar')).toContainText('atenciones');

  await page.getByRole('tablist', { name: 'Secciones' }).getByRole('tab', { name: 'Hoy' }).click();
  await expect(page.locator('#calFuturas')).toContainText(/Citado a futuro: \d+ citas hasta el \d{2}-\d{2}-\d{4}/, { timeout: 15000 });

  // Un día futuro se marca con su propia insignia, distinta de la de atenciones.
  const futuro = page.locator('#calGrid .cal-d.fut').first();
  await expect(futuro).toBeVisible();
  await expect(futuro.locator('.cal-f')).toBeVisible();
  await expect(futuro).toHaveAttribute('aria-label', /cita/);

  const atenciones = Number(await page.locator('#statusBar').innerText().then(t => t.match(/(\d+) atenciones/)?.[1] ?? '0'));
  await futuro.click();
  await expect(page.locator('#todayContent .today-h h2')).toContainText('Agendado');
  await expect(page.locator('#todayContent .today-h span')).toContainText(/cita[s]? agendada/);
  await expect(page.locator('#todayContent .tcard').first()).toBeVisible();

  // La agenda futura no entra en el período cargado: el recuento no se mueve.
  await page.getByRole('tablist', { name: 'Secciones' }).getByRole('tab', { name: 'Atenciones', exact: true }).click();
  await expect(page.locator('#statusBar')).toContainText(`${atenciones} atenciones`);

  // Y la tarjeta de un paciente citado abre su ficha.
  await page.getByRole('tablist', { name: 'Secciones' }).getByRole('tab', { name: 'Hoy' }).click();
  await page.locator('#todayContent .tcard .pat-link').first().click();
  await expect(page.locator('#patientPanel')).toHaveClass(/open/);
  await expect(page.locator('#ppName')).not.toHaveText('');
});

test('apagar las citas futuras en Preferencias vacía el calendario sin recargar la agenda', async ({ page }) => {
  await page.goto('/dev/');
  await expect(page.locator('html')).toHaveAttribute('data-dev-ready', 'true');
  await page.locator('#btnFetch').click();
  await expect(page.locator('#statusBar')).toContainText('atenciones');
  await page.getByRole('tablist', { name: 'Secciones' }).getByRole('tab', { name: 'Hoy' }).click();
  await expect(page.locator('#calGrid .cal-d.fut').first()).toBeVisible({ timeout: 15000 });

  // Bajo 1100 px la cabecera pliega Preferencias tras «⋯».
  if (!(await page.locator('#btnSettings').isVisible())) await page.locator('#btnMore').click();
  await page.locator('#btnSettings').click();
  await page.locator('#setFuturas').selectOption('0');
  await expect(page.locator('#calGrid .cal-d.fut')).toHaveCount(0);
  await expect(page.locator('#calFuturas')).toHaveText('');
});
