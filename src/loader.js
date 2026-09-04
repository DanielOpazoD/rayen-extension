import { humanError } from './errors.js';
import { loadData } from './api.js';
import { attachNotes } from './notes.js';
import { savePrefs } from './cache.js';
import { cancelRun } from './http.js';
import { toast } from './toast.js';
import { $, skeletonRows, skeletonCards } from './dom.js';
import { COLUMNS } from './table.js';
import { CONFIG } from './config.js';
import { state, setData, emit } from './state.js';
import { setStatus } from './ui.js';
import { initSyncStatus, renderSyncStatus } from './sync-status.js';
import { failRunningSyncSources, loadSyncHealth, pendingSyncItems } from './sync-health.js';
import { summarizeLoad } from './load-summary.js';

/** Fetching, refreshing and the expired-session path. Emits 'fetched' after a manual load. */

let refreshTimer = null;
let expired = false;
let fetchInFlight = null;

async function applyResult(result) {
  setData({ allData: await attachNotes(result.records), team: result.team ?? {} });
}

async function performFetch({ retryOnly = false, forceHistorial = false } = {}) {
  const operationId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const btn  = $('btnFetch');
  const prog = $('progress');
  state.loadedMonths = parseInt($('months').value);
  const selectedHistorial = $('optHistorial').checked;
  const historial = selectedHistorial || forceHistorial;
  savePrefs({ months: state.loadedMonths, historial: selectedHistorial }).catch(() => setStatus('No se pudo guardar la preferencia de período en este perfil de Chrome.', 'warn'));

  btn.disabled = true;
  $('btnRetrySync').disabled = true;
  btn.textContent = 'Cargando...';
  $('btnCancel').style.display = '';
  $('btnCancel').disabled = false;
  prog.style.display = 'block';
  if (!state.allData.length) {
    ['barEl', 'tblWrap'].forEach(id => { $(id).style.display = ''; });
    $('tbody').innerHTML = skeletonRows(10, COLUMNS.length);
    $('todayContent').innerHTML = `<div class="today-h"><span class="sk" style="width:220px;height:20px"></span></div>` + skeletonCards(3);
  }
  prog.value = 0;
  setStatus(retryOnly ? 'Reintentando sincronizaciones pendientes…' : 'Conectando con Eloisa...');

  let result;
  try {
    result = await loadData(state.loadedMonths, (pct, phase) => {
      prog.value = pct;
      const label = phase === 'ficha' ? 'Ficha clínica' : 'Agenda';
      setStatus(`${label}… ${pct}%`);
      document.title = `${pct}% · ${label} — Rayen`;   // visible desde otra pestaña
    }, { historial, retryOnly, operationId });
  } catch (err) {
    await failRunningSyncSources(operationId).catch(() => {});
    await renderSyncStatus();
    setStatus(humanError(err, 'Eloisa'), 'err');
    result = null;
  } finally {
    prog.style.display = 'none';
    $('btnCancel').style.display = 'none';
    btn.disabled = false;
    $('btnRetrySync').disabled = false;
    btn.textContent = 'Actualizar';
    document.title = 'Rayen Atenciones — Hospital Hanga Roa';
  }

  if (!result) {
    if ($('statusBar').className !== 'err')
      setStatus('No hay sesión activa. Abre clinicohangaroa.eloisa.cl e inicia sesión.', 'err');
    return;
  }

  await renderSyncStatus(result.sync);
  await applyResult(result);
  if (result.sessionExpired) { showExpired(); return; }
  if (result.cancelled) {
    setStatus(`Carga cancelada · ${state.allData.length} atenciones desde lo ya descargado`, 'warn');
    toast('Carga cancelada; lo descargado se conservó', { tone: 'info' });
    return;
  }
  expired = false;
  const s = summarizeLoad(state.allData.length, result);
  setStatus(s.text, s.cls);
  armRefresh();
  emit('fetched');
  return result;
}

function runFetch(options = {}) {
  if (fetchInFlight) return fetchInFlight;
  fetchInFlight = performFetch(options).finally(() => { fetchInFlight = null; });
  return fetchInFlight;
}

export async function handleFetch() {
  return runFetch();
}

async function retryPending() {
  if (fetchInFlight) return;
  const btn = $('btnRetrySync');
  btn.disabled = true;
  try {
    const health = await loadSyncHealth();
    const retrySics = pendingSyncItems(health, 'sics').size > 0;
    const retryAgenda = pendingSyncItems(health, 'agenda').size > 0;
    const retryHistory = pendingSyncItems(health, 'historial').size > 0;
    if (retryAgenda || retryHistory) await runFetch({ retryOnly: true, forceHistorial: retryAgenda || retryHistory });
    if (retrySics) document.dispatchEvent(new CustomEvent('rayen:retry-sics'));
  } finally {
    btn.disabled = false;
  }
}

export function armRefresh() {
  if (refreshTimer) clearInterval(refreshTimer);
  const min = state.prefs.refreshMin;
  refreshTimer = min > 0 ? setInterval(silentRefresh, min * 60 * 1000) : null;
}

/**
 * El refresco comparte el mismo cerrojo que la carga manual. Sin él, un tick de
 * 15 minutos podía entrar encima de una carga en curso —o de una recién
 * cancelada, descancelándola— y dos cargas concurrentes se pisaban el store.
 */
function silentRefresh() {
  if (fetchInFlight) return fetchInFlight;
  fetchInFlight = silentRefreshBody().finally(() => { fetchInFlight = null; });
  return fetchInFlight;
}

async function silentRefreshBody() {
  let result;
  try { result = await loadData(state.loadedMonths, () => {}, { historial: $('optHistorial').checked }); }
  catch (err) {
    // Antes se tragaba el error y la barra seguía diciendo «N atenciones» como si
    // los datos estuvieran al día.
    const hora = new Date().toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit', hour12: false });
    setStatus(`${state.allData.length} atenciones · sin actualizar desde las ${hora}: ${humanError(err, 'Eloisa')}`, 'warn');
    return;
  }
  if (!result) return;
  if (result.sessionExpired) { showExpired(); return; }
  const scrollY = window.scrollY;
  await applyResult(result);
  window.scrollTo(0, scrollY);
  const s = summarizeLoad(state.allData.length, result);
  setStatus(s.text, s.cls);
  await renderSyncStatus(result.sync);
}

async function openEloisa() {
  try {
    const tabs = await chrome.tabs.query({ url: `${CONFIG.base}/*` });
    if (tabs[0]) await chrome.tabs.update(tabs[0].id, { active: true });
    else await chrome.tabs.create({ url: CONFIG.base });
  } catch { window.open(CONFIG.base, '_blank'); }
}

/** One clear message instead of "N días fallaron"; auto-refresh stops until the session is back. */
export function showExpired() {
  expired = true;
  if (refreshTimer) { clearInterval(refreshTimer); refreshTimer = null; }
  const el = $('statusBar');
  el.className = 'err';
  el.innerHTML = `Sesión de Eloisa vencida. Inicia sesión de nuevo y vuelve a esta pestaña: se recargará sola. ` +
    `<button class="btn-mini" id="btnOpenEloisa">Abrir Eloisa</button>`;
  $('btnOpenEloisa').addEventListener('click', openEloisa);
}

export function init(prefs) {
  $('months').value = String(prefs.months);
  $('optHistorial').checked = prefs.historial;
  $('btnFetch').addEventListener('click', handleFetch);
  initSyncStatus(retryPending);
  $('btnCancel').addEventListener('click', () => {
    cancelRun();
    $('btnCancel').disabled = true;
    setStatus('Cancelando… se conserva lo ya descargado', 'warn');
  });
  document.addEventListener('click', e => { if (e.target.closest('.empty-cta[data-act="fetch"]')) handleFetch(); });
  // When the user comes back after logging in again, retry once automatically
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && expired && !$('btnFetch').disabled) handleFetch();
  });
}
