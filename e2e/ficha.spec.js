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
  await expect(page.locator('#ppFichaToggle')).toHaveAttribute('title', /Ficha completa/, { timeout: 10000 });
  await expect(page.locator('#ppPaneRes .pp-row').first()).toBeVisible();
  await page.locator('.pp-tab[data-pt="at"]').click();
  const conCuerpo = page.locator('#ppPaneAt .pp-visit.has-body');
  await expect(conCuerpo.first()).toBeVisible();
  await conCuerpo.first().locator('.pp-vhead').click();
  await expect(conCuerpo.first()).toHaveClass(/expanded/);
  await expect(conCuerpo.first().locator('.pp-sec-l').first()).toHaveText(/Motivo de consulta|Evolución/);
  await page.locator('.pp-tab[data-pt="rx"]').click();
  await expect(page.locator('#ppPaneRx')).toContainText(/Recetas por atención|Sin recetas/);
  await page.locator('#ppIaBtn').click();
  await expect(page.locator('#iaFuentes')).toContainText('eloisa-ficha · completa');
  await expect(page.locator('#iaCtxMeta')).toHaveText(/sin nombre ni RUN \(comprobado\)/);
  const contexto = await page.locator('#iaContexto').inputValue();
  expect(contexto).not.toContain('Ejemplo');
  expect(contexto).toMatch(/Prescripciones:|Motivo:/);
});

test('con la ficha caída (?ficha=off) el panel lo dice y no afirma ausencia clínica', async ({ page }) => {
  await abrirPrimerPaciente(page, '?ficha=off');
  await expect(page.locator('#ppFichaToggle')).toHaveAttribute('title', /fuentes fallaron|fuente falló/, { timeout: 10000 });
  await page.locator('.pp-tab[data-pt="at"]').click();
  await expect(page.locator('#ppPaneAt')).toContainText('Ficha no disponible');
  await page.locator('.pp-tab[data-pt="rx"]').click();
  await expect(page.locator('#ppPaneRx')).toContainText('Ficha no disponible');
});
