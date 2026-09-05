import { test, expect } from '@playwright/test';

async function abrirPrimerPaciente(page, query = '') {
  await page.goto(`/dev/${query}`);
  await expect(page.locator('html')).toHaveAttribute('data-dev-ready', 'true');
  await page.locator('#btnFetch').click();
  await expect(page.locator('#statusBar')).toContainText('atenciones');
  await page.getByRole('tablist', { name: 'Secciones' }).getByRole('tab', { name: 'Atenciones', exact: true }).click();
  await page.locator('#tbody tr[data-id] .pat-link').first().click();
  await expect(page.locator('#patientPanel')).toBeVisible();
}

test('con la ficha sintética el panel muestra problemas, atenciones con cuerpo, recetas y el informe la declara completa', async ({ page }) => {
  await abrirPrimerPaciente(page);
  await expect(page.locator('#ppAvatar')).toHaveAttribute('data-ficha', /Ficha completa/, { timeout: 10000 });
  await page.locator('#ppAvatar').click();
  await expect(page.locator('#ppFichaStatus')).toContainText('Ficha completa');
  await page.locator('#ppAvatar').click();
  await expect(page.locator('#ppPaneDx .pp-row').first()).toBeVisible();
  await page.locator('.pp-tab[data-pt="at"]').click();
  const conCuerpo = page.locator('#ppPaneAt .pp-visit.has-body');
  await expect(conCuerpo.first()).toBeVisible();
  await expect(conCuerpo.first().locator('.pp-expand')).toBeVisible(); // el botón de desplegar se ve
  await conCuerpo.first().locator('.pp-vhead').click();
  await expect(conCuerpo.first()).toHaveClass(/expanded/);
  await expect(conCuerpo.first().locator('.pp-sec-l').first()).toHaveText(/Motivo de consulta|Evolución/);
  // La impresora de la receta vive dentro de la atención: se ve al desplegar la primera que tenga receta.
  const conReceta = page.locator('#ppPaneAt .pp-visit.has-body').filter({ has: page.locator('.pp-print') }).first();
  if (!/expanded/.test(await conReceta.getAttribute('class'))) await conReceta.locator('.pp-vhead').click();
  await expect(conReceta.locator('.pp-print').first()).toBeVisible();
  await page.locator('.pp-tab[data-pt="rx"]').click();
  await expect(page.locator('#ppPaneRx')).toContainText(/Recetas por atención|Sin recetas/);
  // Cada receta dice quién afirma su estado y se despliega con su vigencia y despacho (consulta bajo demanda).
  if (!(await page.locator('#ppPaneRx button[data-receta]').count())) await page.locator('#ppPaneRx [data-scope="rx"][data-seg="vencidas"]').click();
  await expect(page.locator('#ppPaneRx .pp-rx-r small').first()).toContainText(/según Rayen|por duración escrita/);
  const rxBtn = page.locator('#ppPaneRx button[data-receta]').first();
  await rxBtn.click();
  await expect(rxBtn).toHaveAttribute('aria-expanded', 'true');
  const det = page.locator('#ppPaneRx .pp-rx-det:not([hidden])').first();
  await expect(det.locator('.pp-rx-cab')).toContainText(/vigente hasta|vencida el/);
  await expect(det.locator('.pp-item').first()).toContainText('Losartan');
  await rxBtn.click();
  await expect(rxBtn).toHaveAttribute('aria-expanded', 'false');
  await page.locator('#ppIaBtn').click();
  await expect(page.locator('#iaFuentes')).toContainText('eloisa-ficha · completa');
  await expect(page.locator('#iaCtxMeta')).toHaveText(/comprobado: sin paciente, profesionales, RUT/);
  const contexto = await page.locator('#iaContexto').inputValue();
  expect(contexto).not.toContain('Ejemplo');
  expect(contexto).toMatch(/Prescripciones:|Motivo:/);
});

test('con la ficha caída (?ficha=off) el panel lo dice y no afirma ausencia clínica', async ({ page }) => {
  await abrirPrimerPaciente(page, '?ficha=off');
  await expect(page.locator('#ppAvatar')).toHaveAttribute('data-ficha', /fuentes fallaron|fuente falló/, { timeout: 10000 });
  await expect(page.locator('#ppAvatar')).toHaveClass(/ficha-warn/);
  await page.locator('.pp-tab[data-pt="at"]').click();
  await expect(page.locator('#ppPaneAt')).toContainText('Ficha no disponible');
  await page.locator('.pp-tab[data-pt="rx"]').click();
  await expect(page.locator('#ppPaneRx')).toContainText('Ficha no disponible');
});
