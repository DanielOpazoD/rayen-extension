/** Menú «PDF ▾» del panel: la historia del paciente por alcance, en report.html. */
import { $ } from '../dom.js';
import { initMenu } from '../ui.js';
import { buildPatientReport } from '../patient-report.js';
import { openReport } from '../export.js';

export function initPdfMenu({ getCur, onError }) {
  initMenu('ppPdfBtn', 'ppPdfMenu', 'ppPdfWrap'); // clic fuera, Escape y flechas, como los demás menús
  $('ppPdfMenu').addEventListener('click', async e => {
    const cur = getCur();
    const b = e.target.closest('button[data-scope]');
    if (!b || !cur) return;
    $('ppPdfMenu').classList.remove('open');
    b.disabled = true;
    try {
      const { fragment, css } = buildPatientReport(cur, b.dataset.scope);
      await openReport(fragment, css);
    } catch (err) {
      onError(err);
    } finally { b.disabled = false; }
  });
}
