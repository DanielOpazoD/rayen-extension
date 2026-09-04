import { humanError } from '../errors.js';
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
import { beginSyncSource, finishSyncSource, loadSyncHealth, pendingSyncItems } from '../sync-health.js';
import { renderSyncStatus } from '../sync-status.js';

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
  loading = true;
  $('btnSicRefresh').disabled = true;
  let token = null;
  try { token = await getToken(); } catch { /* no extension context */ }
  if (!token) {
    const attemptedAt = Date.now();
    await beginSyncSource('sics', attemptedAt);
    await finishSyncSource('sics', {
      attemptedAt, failedItems: ['sesión pendiente'], hasData: state.sics.length > 0, error: true,
    });
    await renderSyncStatus();
    $('sicStatus').textContent = 'Sin sesión activa en Eloisa.';
    loading = false;
    $('btnSicRefresh').disabled = false;
    return;
  }

  const attemptedAt = Date.now();
  const operationId = `${attemptedAt}-${Math.random().toString(36).slice(2)}`;
  const health = await loadSyncHealth();
  const effectiveForce = force || pendingSyncItems(health, 'sics').size > 0;
  await beginSyncSource('sics', attemptedAt, ['llamadas pendientes'], operationId);
  await renderSyncStatus();
  $('sicStatus').textContent = 'Cargando interconsultas…';
  try {
    const res = await loadSICs(token, state.loadedMonths, pct => { $('sicStatus').textContent = `Cargando interconsultas… ${pct}%`; }, { force: effectiveForce });
    loadedFor = state.loadedMonths;
    // Change memory: what moved in the watched streams since the last load
    let novedades = null;
    try { novedades = await diffWatched(res.sics, state.prefs.watchEsp); } catch { novedades = null; }
    // The agenda's IC column, the charts, Hoy and Pacientes all depend on the SICs
    setData({ sics: res.sics, novedades });
    await finishSyncSource('sics', {
      attemptedAt,
      failedItems: res.failed ? ['llamadas pendientes'] : [],
      networkCount: res.fromCache ? 0 : 1,
      cacheCount: res.fromCache ? 1 : 0,
      hasData: res.failed === 0 || res.sics.length > 0 || res.staleFallback,
      cancelled: res.cancelled,
      error: res.failed > 0,
      operationId,
    });
    // Antes: «28 SIC · caché · 8:37:29 p. m.». La persona necesita saber cuántas
    // hay, de cuándo son y si algo quedó sin actualizar.
    const hora = new Date(res.savedAt).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit', hour12: false });
    const n = res.sics.length;
    const cuenta = `${n} ${n === 1 ? 'interconsulta' : 'interconsultas'}`;
    const origen = res.staleFallback ? `se muestra la copia anterior (${hora}); la actualización no se completó`
      : res.fromCache ? `guardadas a las ${hora}` : `actualizadas a las ${hora}`;
    const fallos = res.failed && !res.staleFallback ? ` · ${res.failed} ${res.failed === 1 ? 'llamada falló' : 'llamadas fallaron'}` : '';
    $('sicStatus').textContent = `${cuenta} · ${origen}${fallos}`;
    $('btnSicExport').style.display = '';
    $('btnSicExportXls').style.display = '';
  } catch (err) {
    await finishSyncSource('sics', {
      attemptedAt,
      failedItems: [err instanceof AuthError ? 'sesión pendiente' : 'reintento de red'],
      hasData: state.sics.length > 0,
      error: true,
      operationId,
    });
    $('sicStatus').textContent = err instanceof AuthError ? 'La sesión de Eloisa venció. Ábrela e inicia sesión.' : humanError(err, 'Eloisa');
    if (err instanceof AuthError) showExpired();
  } finally {
    await renderSyncStatus();
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
  document.addEventListener('rayen:retry-sics', () => ensureSICs(true));
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
