import { test, expect } from '@playwright/test';

/**
 * Búsqueda manual por RUN: abre la ficha de cualquier paciente del nodo, esté o
 * no entre las atenciones cargadas. Se prueba sin cargar la agenda a propósito:
 * es justo el caso en que el paciente no está en ninguna lista.
 */
test('abre la ficha de un paciente por su RUN sin haber cargado la agenda', async ({ page }) => {
  await page.goto('/dev/');
  await expect(page.locator('html')).toHaveAttribute('data-dev-ready', 'true');
  await page.getByRole('tablist', { name: 'Secciones' }).getByRole('tab', { name: 'Pacientes' }).click();

  // Dígito verificador incorrecto: se avisa sin tocar la red.
  await page.locator('#pacRun').fill('17.752.753-0');
  await page.locator('#btnPacRun').click();
  await expect(page.locator('#pacRunMsg')).toHaveText(/dígito verificador/);
  await expect(page.locator('#patientPanel')).not.toHaveClass(/open/);

  await page.locator('#pacRun').fill('17752753K');
  await page.locator('#btnPacRun').click();
  await expect(page.locator('#patientPanel')).toHaveClass(/open/);
  await expect(page.locator('#ppName')).toHaveText('Luis Ejemplo Lagos');
  await expect(page.locator('#ppMeta')).toContainText('17.752.753-K');
  await expect(page.locator('#ppAvatar')).toHaveAttribute('data-ficha', /Ficha/, { timeout: 10000 });
  await expect(page.locator('#pacRunMsg')).toHaveText('');
  // Sin agenda cargada no hay lista en la que moverse: las flechas quedan apagadas.
  await expect(page.locator('#ppPrev')).toBeDisabled();
  await expect(page.locator('#ppNext')).toBeDisabled();
});

test('un RUN que Eloisa no conoce lo dice y no abre el panel', async ({ page }) => {
  await page.goto('/dev/');
  await expect(page.locator('html')).toHaveAttribute('data-dev-ready', 'true');
  await page.getByRole('tablist', { name: 'Secciones' }).getByRole('tab', { name: 'Pacientes' }).click();
  await page.locator('#pacRun').fill('11111111-1');
  await page.locator('#pacRun').press('Enter');
  await expect(page.locator('#pacRunMsg')).toHaveText(/no devolvió a nadie/);
  await expect(page.locator('#patientPanel')).not.toHaveClass(/open/);
});
