import { buildPatients, filterPatients, sortPatients, setPatientSort, renderPatients, PACIENTE_COLS } from '../patients.js';
import { exportRows } from '../export.js';
import { toast } from '../toast.js';
import { $, closestOf, qsa } from '../dom.js';
import { state, on, pendientes } from '../../io/state.js';
import { markSorted, remeasure } from '../ui.js';
import { openPatientById, copyRun, jumpToSIC, abrirFichaPorRun } from '../actions.js';

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

/** Búsqueda manual por RUN: abre la ficha de cualquier paciente del nodo. */
async function buscarPorRun() {
  const btn = $('btnPacRun'), msg = $('pacRunMsg');
  btn.disabled = true;
  msg.className = 'pac-find-msg';
  msg.textContent = 'Buscando en Eloisa…';
  const { ok, mensaje } = await abrirFichaPorRun($('pacRun').value);
  btn.disabled = false;
  msg.className = `pac-find-msg${ok ? '' : ' err'}`;
  msg.textContent = mensaje;
}

export function init() {
  $('btnPacRun').addEventListener('click', buscarPorRun);
  $('pacRun').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); buscarPorRun(); } });
  $('pacSearch').addEventListener('input', render);
  $('pacFilt').addEventListener('change', render);

  const headers = qsa(document, '.pac-table th[data-psort]');
  headers.forEach(th => th.addEventListener('click', () => {
    const { dir } = setPatientSort(th.dataset.psort);
    markSorted(headers, th, dir);
    render();
  }));

  $('pacBody').addEventListener('click', e => {
    const copy = closestOf(e, '.copy-run');
    if (copy) { e.stopPropagation(); copyRun(copy); return; }
    const sic = closestOf(e, '[data-sic]');
    if (sic) { e.stopPropagation(); jumpToSIC({ id: sic.dataset.sic }); return; }
    const tr = closestOf(e, '.pac-row');
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
