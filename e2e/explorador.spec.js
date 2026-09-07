import { test, expect } from '@playwright/test';

// El arnés no tiene red: se pega un JSON con datos de persona y se comprueba que la
// descarga no lleva ni nombres ni RUT, y que el informe lo dice.
test('la copia anonimizada del Explorador no contiene nombres, RUT ni correos', async ({ page }) => {
  await page.goto('/dev/');
  await expect(page.locator('html')).toHaveAttribute('data-dev-ready', 'true');
  await page.getByRole('tablist', { name: 'Secciones' }).getByRole('tab', { name: 'Explorador API' }).click();
  const muestra = {
    Id: 500439, Rut: '14407675-3', NombreFormateado: 'Rosa Ejemplo Tuki', FechaAtencion: '20260904 080000', EMail: 'rosa@example.cl',
    Sexo: { Id: 2, Nombre: 'Mujer' },
    Anamnesis: [{ Evolucion: 'Sra. Ejemplo Tuki, RUT 6.543.210-2, evoluciona bien; hija al 9 8765 4321.' }],
  };
  await page.locator('#explorerOut').fill(JSON.stringify(muestra));
  const [download] = await Promise.all([page.waitForEvent('download'), page.locator('#btnExplorerAnon').click()]);
  expect(download.suggestedFilename()).toMatch(/^captura-anonimizada-.*\.json$/);
  const texto = await (await import('node:fs/promises')).readFile(await download.path(), 'utf8');
  for (const prohibido of ['Rosa', 'Ejemplo', 'Tuki', '14407675', '6.543.210', 'rosa@example.cl', '8765 4321', '20260904']) expect(texto).not.toContain(prohibido);
  const cuerpo = JSON.parse(texto);
  expect(cuerpo.datos.Sexo.Nombre).toBe('Mujer');
  expect(cuerpo.datos.Anamnesis[0].Evolucion).toBe('Sra. <nombre>, RUT <rut>, evoluciona bien; hija al <fono>.');
  await expect(page.locator('#explorerAnonMeta')).toHaveText(/comprobación final sin restos/);
});

test('el diagnóstico resume la carga en recuentos y no lleva datos de pacientes', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto('/dev/');
  await expect(page.locator('html')).toHaveAttribute('data-dev-ready', 'true');
  await page.locator('#btnFetch').click();
  await expect(page.locator('#statusBar')).toContainText('atenciones');
  await page.getByRole('tablist', { name: 'Secciones' }).getByRole('tab', { name: 'Explorador API' }).click();
  await page.locator('#btnDiag').click();

  const texto = await page.locator('#explorerOut').inputValue();
  expect(texto).toMatch(/Rayen Atenciones .+ · diagnóstico/);
  expect(texto).toMatch(/Por día: lun \d+( \(\d+ urg\))? · mar \d+/);
  expect(texto).toMatch(/Cruce agenda–ficha: \d+ mismo día/);
  // Ningún nombre ni RUN del arnés sobrevive.
  for (const prohibido of ['Ejemplo', 'Tuki', 'Lagos', '25106217', '56.785.678']) expect(texto).not.toContain(prohibido);
  await expect(page.locator('#explorerAnonMeta')).toContainText('Sólo recuentos');
});
