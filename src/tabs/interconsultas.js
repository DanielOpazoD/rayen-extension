import { getToken } from '../auth.js';
import { loadSICs } from '../sic.js';
import { AuthError } from '../http.js';
import { diffWatched } from '../watch.js';
import { renderSICTab, filterSICs, sortSICs, setSICSort, buildSICFilters, toggleSIC, expandOnly } from '../ic-tab.js';
import { exportSICsCSV, exportSICsXLS } from '../export.js';
import { sicPdfPath, openPDF } from '../pdf.js';
import { toast } from '../toast.js';
import { $ } from '../dom.js';
import { state, setData, on } from '../state.js';
import { initChips, initFilterFold, markSorted, remeasure } from '../ui.js';
import { openPatientByRun } from '../actions.js';
import { showExpired } from '../loader.js';

/** Interconsultas: loading (cache-first, 30 min TTL), filters, sort, detail rows. */

const SIC_FILTER_IDS = ['sicSearch', 'sicGrupo', 'sicEsp', 'sicQuien', 'sicContra', 'sicGes', 'sicPrio', 'sicDesde', 'sicHasta'];

let loading = false, loadedFor = 0;
let chips, updateCount;

export function render() {
  renderSICTab(state.sics, sortSICs(filterSICs(state.sics)));
  updateCount();
  remeasure();
}

function clearFilters() {
  SIC_FILTER_IDS.forEach(id => { $(id).value = ''; });
  chips.reset();
}

/** From a chart bar or a summary tile: one filter, everything else cleared. */
export function applyFilter(campo, valor) {
  clearFilters();
  $(campo).value = valor;
  render();
}

export async function ensureSICs(force = false) {
  if (loading) return;
  if (!force && state.sics.length && loadedFor >= state.loadedMonths) return;
  let token = null;
  try { token = await getToken(); } catch { /* no extension context */ }
  if (!token) { $('sicStatus').textContent = 'Sin sesión activa en Eloisa.'; return; }

  loading = true;
  $('btnSicRefresh').disabled = true;
  $('sicStatus').textContent = 'Cargando interconsultas…';
  try {
    const res = await loadSICs(token, state.loadedMonths, pct => { $('sicStatus').textContent = `Cargando interconsultas… ${pct}%`; }, { force });
    loadedFor = state.loadedMonths;
    // Change memory: what moved in the watched streams since the last load
    let novedades = null;
    try { novedades = await diffWatched(res.sics, state.prefs.watchEsp); } catch { novedades = null; }
    // The agenda's IC column, the charts, Hoy and Pacientes all depend on the SICs
    setData({ sics: res.sics, novedades });
    const when = new Date(res.savedAt).toLocaleTimeString('es-CL');
    $('sicStatus').textContent = `${res.sics.length} SIC · ${res.fromCache ? 'caché' : 'red'} · ${when}${res.failed ? ` · ⚠ ${res.failed} llamadas fallaron` : ''}`;
    $('btnSicExport').style.display = '';
    $('btnSicExportXls').style.display = '';
  } catch (err) {
    $('sicStatus').textContent = err instanceof AuthError ? 'Sesión de Eloisa vencida.' : `Error: ${err.message}`;
    if (err instanceof AuthError) showExpired();
  } finally {
    loading = false;
    $('btnSicRefresh').disabled = false;
  }
}

export function init() {
  const headers = [...document.querySelectorAll('.sic-table th[data-sort]')];
  headers.forEach(th => th.addEventListener('click', () => {
    const { dir } = setSICSort(th.dataset.sort);
    markSorted(headers, th, dir);
    render();
  }));

  chips = initChips('sicPerChips', 'sicPer', render);
  updateCount = initFilterFold('btnSicFilters', 'sicFilterPanel', SIC_FILTER_IDS, 'sicPer');
  SIC_FILTER_IDS.forEach(id => {
    $(id).addEventListener('input',  render);
    $(id).addEventListener('change', render);
  });
  $('btnSicClear').addEventListener('click', () => { clearFilters(); render(); });
  $('btnSicRefresh').addEventListener('click', () => ensureSICs(true));
  $('btnSicExport').addEventListener('click',    () => { const r = sortSICs(filterSICs(state.sics)); exportSICsCSV(r); toast(`CSV: ${r.length} interconsultas`); });
  $('btnSicExportXls').addEventListener('click', () => { const r = sortSICs(filterSICs(state.sics)); exportSICsXLS(r); toast(`Excel: ${r.length} interconsultas`); });

  $('sicBody').addEventListener('click', async e => {
    const pdf = e.target.closest('.pdf-sic');
    if (pdf) {
      pdf.disabled = true;
      const err = await openPDF(sicPdfPath(pdf.dataset.id));
      pdf.disabled = false;
      if (err) $('sicStatus').textContent = err;
      return;
    }
    const open = e.target.closest('.pat-open');
    if (open) { openPatientByRun(open.dataset.run); return; }
    const row = e.target.closest('tr.sic-row');
    if (row && !e.target.closest('button')) { toggleSIC(Number(row.dataset.id)); render(); }
  });

  // Summary tiles double as filters
  $('sicSummary').addEventListener('click', e => {
    const tile = e.target.closest('[data-filter]');
    if (!tile) return;
    const [campo, valor] = tile.dataset.filter.split(':');
    const id = { grupo: 'sicGrupo', quien: 'sicQuien', cr: 'sicContra' }[campo];
    if (id) applyFilter(id, valor);
    else { clearFilters(); render(); }
  });

  // From the agenda, Hoy or Pacientes: one SIC by id, or every SIC of a patient
  document.addEventListener('rayen:goto-sic', e => {
    clearFilters();
    $('sicSearch').value = e.detail.q;
    if (e.detail.id) expandOnly(e.detail.id);
    render();
    $('sicSummary').scrollIntoView({ block: 'start' });
  });

  on('data', () => {
    buildSICFilters(state.sics);
    render();
  });
  on('fetched', () => ensureSICs());
}
