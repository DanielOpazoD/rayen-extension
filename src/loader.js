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

/** Fetching, refreshing and the expired-session path. Emits 'fetched' after a manual load. */

let refreshTimer = null;
let expired = false;

async function applyResult(result) {
  setData({ allData: await attachNotes(result.records), team: result.team ?? {} });
}

function summarize(result) {
  const parts = [`${state.allData.length} atenciones`];
  parts.push(result.fromNetwork > 0 ? `${result.fromNetwork} días vía red · ${result.fromCache} desde caché` : 'todo desde caché');
  const fails = result.failedDays + result.historialFailed;
  if (fails) parts.push(`⚠ ${fails} días fallaron (se reintentan en la próxima carga)`);
  parts.push(new Date().toLocaleTimeString('es-CL'));
  return { text: parts.join(' · '), cls: fails ? 'warn' : 'ok' };
}

export async function handleFetch() {
  const btn  = $('btnFetch');
  const prog = $('progress');
  state.loadedMonths = parseInt($('months').value);
  const historial = $('optHistorial').checked;
  savePrefs({ months: state.loadedMonths, historial }).catch(() => {});

  btn.disabled = true;
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
  setStatus('Conectando con Eloisa...');

  let result;
  try {
    result = await loadData(state.loadedMonths, (pct, phase) => {
      prog.value = pct;
      const label = phase === 'ficha' ? 'Ficha clínica' : 'Agenda';
      setStatus(`${label}… ${pct}%`);
      document.title = `${pct}% · ${label} — Rayen`;   // visible desde otra pestaña
    }, { historial });
  } catch (err) {
    setStatus(`Error al cargar: ${err.message}`, 'err');
    result = null;
  } finally {
    prog.style.display = 'none';
    $('btnCancel').style.display = 'none';
    btn.disabled = false;
    btn.textContent = 'Actualizar';
    document.title = 'Rayen Atenciones — Hospital Hanga Roa';
  }

  if (!result) {
    if ($('statusBar').className !== 'err')
      setStatus('No hay sesión activa. Abre clinicohangaroa.eloisa.cl e inicia sesión.', 'err');
    return;
  }

  if (result.records.length) await applyResult(result);
  if (result.sessionExpired) { showExpired(); return; }
  if (result.cancelled) {
    setStatus(`Carga cancelada · ${state.allData.length} atenciones desde lo ya descargado`, 'warn');
    toast('Carga cancelada; lo descargado se conservó', { tone: 'info' });
    return;
  }
  expired = false;
  const s = summarize(result);
  setStatus(s.text, s.cls);
  armRefresh();
  emit('fetched');
}

export function armRefresh() {
  if (refreshTimer) clearInterval(refreshTimer);
  const min = state.prefs.refreshMin;
  refreshTimer = min > 0 ? setInterval(silentRefresh, min * 60 * 1000) : null;
}

async function silentRefresh() {
  let result;
  try { result = await loadData(state.loadedMonths, () => {}, { historial: $('optHistorial').checked }); }
  catch { return; }
  if (!result) return;
  if (result.sessionExpired) { showExpired(); return; }
  const scrollY = window.scrollY;
  await applyResult(result);
  window.scrollTo(0, scrollY);
  const s = summarize(result);
  setStatus(`${s.text} · auto`, s.cls);
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
