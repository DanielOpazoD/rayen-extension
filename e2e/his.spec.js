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
  await expect(block.locator('.his-open')).toHaveCount(2); // cada una sigue abrible en el HIS
});

test('una atención del RCE se despliega y muestra su contenido clínico, como una de Eloisa', async ({ page }) => {
  await abrirPacienteAtenciones(page);
  const urgencia = page.locator('#ppPaneAt .his-visit[data-his-tipo="urgencia"]');
  // Cerrada no adelanta el contenido: se trae al abrirla, no al abrir el panel.
  await expect(urgencia).not.toContainText('Dolor torácico opresivo');

  await urgencia.locator('.pp-vhead').click();
  await expect(urgencia).toHaveClass(/expanded/);
  await expect(urgencia.locator('.pp-body')).toContainText('Dolor torácico opresivo de 2 horas.', { timeout: 5000 });

  // El mismo marcado que una atención de Eloisa: secciones, diagnóstico y médico.
  await expect(urgencia.locator('.pp-who')).toContainText('DR. EJEMPLO URGENCIA');
  await expect(urgencia.locator('.pp-dx')).toContainText('Dolor torácico en estudio');
  await expect(urgencia.locator('.pp-sec-l').first()).toBeVisible();
  await expect(urgencia).toContainText('Refiere dolor retroesternal irradiado a brazo izquierdo.');
  await expect(urgencia).toContainText('ECG seriado cada 6 horas.', { useInnerText: true });
  // La tabla de signos vitales llega como pares rótulo-valor, con la presión
  // en un solo par (la misma lista que imprime el informe).
  await expect(urgencia.locator('.his-sv')).toContainText(['FC', '145/90', '96']);

  // Al cerrarla, el diagnóstico sigue a la vista —como en Eloisa— y lo ya
  // traído no se pierde: volver a abrirla no pide la ficha otra vez.
  await urgencia.locator('.pp-vhead').click();
  await expect(urgencia).not.toHaveClass(/expanded/);
  await expect(urgencia.locator('.pp-dx')).toContainText('Dolor torácico en estudio');
  await urgencia.locator('.pp-vhead').click();
  await expect(urgencia.locator('.pp-body')).toContainText('Dolor torácico opresivo de 2 horas.');
});

test('la ficha ambulatoria trae su médico aunque el HIS no lo ponga como etiqueta', async ({ page }) => {
  await abrirPacienteAtenciones(page);
  const amb = page.locator('#ppPaneAt .his-visit[data-his-tipo="ambulatorio"]');
  await amb.locator('.pp-vhead').click();
  await expect(amb.locator('.pp-who')).toContainText('DRA. EJEMPLO CARDIOLOGA', { timeout: 5000 });
  await expect(amb).toContainText('Control de hipertensión, asintomático.');
  // Ambulatorio no trae signos vitales: no se inventa la sección.
  await expect(amb.locator('.his-sv')).toHaveCount(0);
});

test('al imprimir, el informe lleva las dos historias: Eloisa y el RCE', async ({ page }) => {
  await abrirPacienteAtenciones(page);
  // Sin desplegar ninguna ficha a mano: la impresión debe ir a buscarlas ella.
  await expect(page.locator('#ppPaneAt .his-visit .pp-body')).toHaveText(['', '']);

  // report.html lee y BORRA el informe de storage.session al abrirse, así que se
  // captura al vuelo en vez de leerlo después (ya no estaría).
  await page.evaluate(() => {
    const set = chrome.storage.session.set.bind(chrome.storage.session);
    chrome.storage.session.set = obj => {
      if (obj?.rayen_report?.fragment) globalThis.__informeRce = obj.rayen_report.fragment;
      return set(obj);
    };
  });

  await page.locator('#ppPdfBtn').click();
  await page.locator('#ppPdfMenu button[data-scope="todos"]').click();

  const informe = await page.waitForFunction(
    () => globalThis.__informeRce ?? null, null, { timeout: 20000 },
  ).then(h => h.jsonValue());

  expect(informe).toContain('Atenciones del RCE');
  expect(informe).toContain('Dolor torácico opresivo de 2 horas.');   // urgencia, traída al imprimir
  expect(informe).toContain('Control de hipertensión, asintomático.'); // ambulatoria, idem
  expect(informe).toContain('DR. EJEMPLO URGENCIA');
  expect(informe).toContain('145/90');                                 // signos vitales en el papel
  expect(informe).toContain('Atenciones · todos los profesionales');   // y las de Eloisa siguen
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
