import { buildPatients, filterPatients, sortPatients, setPatientSort, renderPatients, PACIENTE_COLS } from '../patients.js';
import { exportRows } from '../export.js';
import { toast } from '../toast.js';
import { $ } from '../dom.js';
import { state, on, pendientes } from '../../io/state.js';
import { markSorted, remeasure } from '../ui.js';
import { openPatientById, copyRun, jumpToSIC } from '../actions.js';

/** One row per person. Aggregated lazily: only rebuilt when the data version moved. */

let list = [], builtAt = -1, dirty = true;

function patients() {
  if (builtAt !== state.version) {
    list = state.allData.length ? buildPatients(state.allData, state.sics, pendientes()) : [];
    builtAt = state.version;
  }
  return list;
}
const shown  = () => sortPatients(filterPatients(patients(), { q: $('pacSearch').value, modo: $('pacFilt').value }));
const active = () => $('tab-pacientes').classList.contains('active');

function render() {
  const all = patients();
  renderPatients(all, shown());
  const has = all.length > 0;
  $('pacBar').style.display   = has ? '' : 'none';
  $('pacWrap').style.display  = has ? '' : 'none';
  $('pacEmpty').style.display = has ? 'none' : '';
  dirty = false;
  remeasure();
}

/** Render on show if something changed while the tab was hidden. */
export function onShow() { if (dirty) render(); }

export function init() {
  $('pacSearch').addEventListener('input', render);
  $('pacFilt').addEventListener('change', render);

  const headers = [...document.querySelectorAll('.pac-table th[data-psort]')];
  headers.forEach(th => th.addEventListener('click', () => {
    const { dir } = setPatientSort(th.dataset.psort);
    markSorted(headers, th, dir);
    render();
  }));

  $('pacBody').addEventListener('click', e => {
    const copy = e.target.closest('.copy-run');
    if (copy) { e.stopPropagation(); copyRun(copy); return; }
    const sic = e.target.closest('[data-sic]');
    if (sic) { e.stopPropagation(); jumpToSIC({ id: sic.dataset.sic }); return; }
    const tr = e.target.closest('.pac-row');
    if (tr) openPatientById(tr.dataset.id);
  });
  $('btnPacExport').addEventListener('click', () => {
    const rows = shown();
    exportRows(PACIENTE_COLS, rows, 'pacientes_dr_opazo');
    toast(`CSV: ${rows.length} pacientes`);
  });

  const invalidate = () => { dirty = true; if (active()) render(); };
  on('data', invalidate);
  on('notes', invalidate);
}
