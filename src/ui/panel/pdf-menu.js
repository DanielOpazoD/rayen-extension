/** Menú «PDF ▾» del panel: la historia del paciente por alcance, en report.html. */
import { $, closestOf } from '../dom.js';
import { initMenu, closeMenus } from '../ui.js';
import { buildPatientReport } from '../../core/patient-report.js';
import { openReport } from '../export.js';
import { hisLoadFichas } from '../../io/his-session.js';
import { claveFicha } from './his.js';

/**
 * Trae del RCE las fichas que aún no estén, para que el informe salga con las
 * dos historias (Eloisa + RCE) y no sólo con lo que el médico haya desplegado
 * a mano en el panel.
 *
 * Es una petición por atención y el HIS es lento, así que se avisa por dónde
 * va en el propio botón. Lo que no llegue queda registrado como error en el
 * mapa: el informe lo imprime diciendo que falta, en vez de omitirlo callado.
 *
 * @param {object} cur      el paciente abierto
 * @param {(t: string) => void} avisar  pinta el progreso
 */
async function traerFichasRce(cur, avisar) {
  if (cur.his?.estado !== 'ok') return;
  const rows = cur.his.atenciones ?? [];
  const fichas = (cur.his.fichas ??= new Map());
  const faltan = rows.filter(a => fichas.get(claveFicha(a))?.estado !== 'ok');
  if (!faltan.length) return;
  const traidas = await hisLoadFichas(faltan, {
    onProgress: (n, t) => avisar(`RCE ${n}/${t}…`),
  });
  for (const x of traidas) {
    const clave = claveFicha(x.atencion);
    fichas.set(clave, { ...fichas.get(clave),
      ...(x.error ? { estado: 'error', error: x.error } : { estado: 'ok', ficha: x.ficha }) });
  }
}

export function initPdfMenu({ getCur, onError }) {
  initMenu('ppPdfBtn', 'ppPdfMenu', 'ppPdfWrap'); // clic fuera, Escape y flechas, como los demás menús
  $('ppPdfMenu').addEventListener('click', async e => {
    const cur = getCur();
    const b = closestOf(e, 'button[data-scope]');
    if (!b || !cur) return;
    closeMenus();
    b.disabled = true;
    const etiqueta = b.textContent;
    try {
      // El alcance «ic» es sólo interconsultas: ahí el RCE no pinta nada.
      if (b.dataset.scope !== 'ic') await traerFichasRce(cur, t => { b.textContent = t; });
      // Traer las fichas del RCE es una petición por atención: puede tardar. Si
      // el médico se movió a otro paciente con ‹ › mientras tanto, abrir aquí
      // el informe del anterior sería darle el papel equivocado.
      if (getCur() !== cur) return;
      const { fragment, css } = buildPatientReport(cur, /** @type {any} */ (b.dataset.scope));
      await openReport(fragment, css);
    } catch (err) {
      onError(err);
    } finally { b.disabled = false; b.textContent = etiqueta; }
  });
}
