/** Menú «PDF ▾» del panel: la historia del paciente por alcance, en report.html. */
import { $, closestOf } from '../dom.js';
import { initMenu, closeMenus } from '../ui.js';
import { buildPatientReport } from '../../core/patient-report.js';
import { openReport } from '../export.js';

export function initPdfMenu({ getCur, onError }) {
  initMenu('ppPdfBtn', 'ppPdfMenu', 'ppPdfWrap'); // clic fuera, Escape y flechas, como los demás menús
  $('ppPdfMenu').addEventListener('click', async e => {
    const cur = getCur();
    const b = closestOf(e, 'button[data-scope]');
    if (!b || !cur) return;
    closeMenus();
    b.disabled = true;
    try {
      const { fragment, css } = buildPatientReport(cur, /** @type {any} */ (b.dataset.scope));
      await openReport(fragment, css);
    } catch (err) {
      onError(err);
    } finally { b.disabled = false; }
  });
}
