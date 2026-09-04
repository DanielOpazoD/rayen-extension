import { test, expect } from '@playwright/test';

test('el informe con IA se prepara sin nombre ni RUN, y se arma con la identidad repuesta', async ({ page }) => {
  await page.goto('/dev/');
  await expect(page.locator('html')).toHaveAttribute('data-dev-ready', 'true');
  await page.locator('#btnFetch').click();
  await expect(page.locator('#statusBar')).toContainText('atenciones');
  await page.getByRole('tablist', { name: 'Secciones' }).getByRole('tab', { name: 'Atenciones', exact: true }).click();
  await page.locator('#tbody tr[data-id] .pat-link').first().click();
  await expect(page.locator('#ppName')).not.toBeEmpty();
  const nombre = (await page.locator('#ppName').innerText()).trim();
  const apellido = nombre.split(/\s+/).pop();
  await page.locator('#ppIaBtn').click();
  await expect(page.locator('#iaSheet')).toBeVisible();
  await expect(page.locator('#iaCtxMeta')).toHaveText(/sin nombre ni RUN \(comprobado\)/);
  const contexto = await page.locator('#iaContexto').inputValue();
  expect(contexto).not.toContain(apellido);
  expect(contexto).not.toMatch(/\d{1,2}\.\d{3}\.\d{3}-[\dkK]/);
  expect(await page.locator('#iaPrompt').inputValue()).toContain('Estructura obligatoria');
  await page.locator('#iaRespuesta').fill('## Problemas activos\n- Hipertensión arterial\n## Antecedentes relevantes\nSin datos en el registro.\n## Evolución reciente\nControl reciente.\n## Tratamiento actual\nEnalapril.\n## Pendientes\nNinguno.');
  await page.locator('#iaArmar').click();
  await expect(page.locator('#iaInforme h1')).toHaveText('Resumen clínico');
  await expect(page.locator('#iaInforme')).toContainText(nombre);
  await expect(page.locator('#iaInforme h2').first()).toHaveText('Problemas activos');
  await expect(page.locator('#iaInformeMeta')).toHaveText(/Todas las secciones presentes/);
  await expect(page.locator('#iaImprimir')).toBeEnabled();
  await page.keyboard.press('Escape');
  await expect(page.locator('#iaSheet')).toBeHidden();
  await expect(page.locator('#patientPanel')).toBeVisible(); // Escape cerró la hoja, no el panel
});
