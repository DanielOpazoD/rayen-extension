/** Menú «PDF ▾» del panel: la historia del paciente por alcance, en report.html. */
import { $ } from '../dom.js';
import { buildPatientReport } from '../patient-report.js';
import { openReport } from '../export.js';

export function initPdfMenu({ getCur, onError }) {
  $('ppPdfBtn').addEventListener('click', e => {
    e.stopPropagation();
    const open = $('ppPdfMenu').classList.toggle('open');
    e.currentTarget.setAttribute('aria-expanded', String(open));
  });
  document.addEventListener('click', e => {
    if (!e.target.closest('#ppPdfWrap')) $('ppPdfMenu').classList.remove('open');
  });
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
