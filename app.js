import { loadData, getRawSamples }        from './src/api.js';
import { getToken }                       from './src/auth.js';
import { attachNotes, saveNote, restoreNote }          from './src/notes.js';
import { exportCSV, exportSICsCSV, exportSICsXLS, exportXLS, exportHTML, exportJSON, exportPDF, exportNotas, exportRows } from './src/export.js';
import { toast, copyToClipboard, flashOk } from './src/toast.js';
import { initPalette } from './src/palette.js';
import { PERIODS, date8ToIso, isoToDate8 } from './src/period.js';
import { clearAllCaches, clearEverything, loadPrefs, savePrefs } from './src/cache.js';
import { AuthError, cancelRun } from './src/http.js';
import { renderCharts }                   from './src/charts.js';
import { initPanel, openPanel }           from './src/patient-panel.js';
import { explorerFetch, QUICK_LINKS, summarizeExtraFields } from './src/explorer.js';
import { renderTable, sortRecords, appendChunk, hasMoreRows, rowSelector, COLUMNS, ALWAYS_VISIBLE, applyColumnVisibility } from './src/table.js';
import { renderToday } from './src/today.js';
import { buildPatients, filterPatients, sortPatients, setPatientSort, renderPatients, PACIENTE_COLS } from './src/patients.js';
import { initLock }    from './src/lock.js';
import { computePendientes } from './src/pendientes.js';
import { diffWatched }       from './src/watch.js';
import { buildStats, buildFilters, filterRecords } from './src/stats.js';
import { loadSICs, contactsFromSICs }     from './src/sic.js';
import { renderSICTab, filterSICs, sortSICs, setSICSort, buildSICFilters, toggleSIC, expandOnly } from './src/ic-tab.js';
import { certificadoPath, sicPdfPath, openPDF } from './src/pdf.js';
import { localDateStr } from './src/parser.js';
import { esc, $, initTooltips, initTablist, activateOnKey, revealRow, skeletonRows, skeletonCards } from './src/dom.js';
import { CONFIG } from './src/config.js';

// ── State ─────────────────────────────────────────────────────
let allData      = [];
let team         = {};
let sics         = [];
let sicsById     = new Map();
let sicsByRun    = new Map();
let contacts     = new Map();
let sortCol      = 'fechaAtencion';
let sortDir      = -1;
let refreshTimer = null;
let loadedMonths = 6;
let sicLoading   = false;
let sicLoadedFor = 0;
let pendientes   = [];
let novedades    = null;
let watchEsp     = [...CONFIG.watchEspecialidades];
let umbrales     = { ...CONFIG.pendientes };
let refreshMin   = 15;
let lockCtl      = null;
let todayDate    = '';   // '' = hoy (con fallback a la última jornada)
let lastRendered = [];   // orden actual de la tabla: alimenta ‹ › y la paleta
let pacientes    = [];   // derivado de allData + sics + pendientes
let hiddenCols   = new Set();

const FILTER_IDS = ['search','filtFecha','filtDia','filtSexo','filtEstado','filtPrev','filtTipo','filtPrest','filtIC','filtDx','filtDesde','filtHasta'];
const SIC_FILTER_IDS = ['sicSearch','sicGrupo','sicEsp','sicQuien','sicContra','sicGes','sicPrio','sicDesde','sicHasta'];

/** Period chips: one group per tab, writing into a hidden input the filters read. */
function initChips(containerId, hiddenId, onChange) {
  const box = $(containerId), hidden = $(hiddenId);
  box.innerHTML = Object.entries(PERIODS).map(([k, l]) =>
    `<button type="button" class="chip ${k === hidden.value ? 'on' : ''}" data-per="${k}" aria-pressed="${k === hidden.value}">${l}</button>`).join('');
  box.addEventListener('click', e => {
    const b = e.target.closest('.chip'); if (!b) return;
    hidden.value = b.dataset.per;
    box.querySelectorAll('.chip').forEach(c => { const on = c === b; c.classList.toggle('on', on); c.setAttribute('aria-pressed', String(on)); });
    onChange();
  });
  const set = key => {
    hidden.value = key;
    box.querySelectorAll('.chip').forEach(c => {
      const on = c.dataset.per === key;
      c.classList.toggle('on', on);
      c.setAttribute('aria-pressed', String(on));
    });
  };
  return { set, reset: () => set('todo') };
}

/**
 * The tables fill whatever the controls leave. Measuring beats the hardcoded
 * offset that used to be there: fold the filters and the table grows by itself.
 */
function measureChrome() {
  const pane = document.querySelector('.tab-pane.active');
  const bar  = pane?.querySelector('.toolbar');
  const fp   = pane?.querySelector('.filter-panel:not([hidden])');
  const h = ($('topbar')?.offsetHeight ?? 0) + (bar?.offsetHeight ?? 0) + (fp?.offsetHeight ?? 0)
          + (pane?.querySelector('.stats')?.offsetHeight ?? 0) + 48;
  document.documentElement.style.setProperty('--chrome-h', `${h}px`);
}
const remeasure = () => requestAnimationFrame(measureChrome);
window.addEventListener('resize', remeasure);

// ── Utils ─────────────────────────────────────────────────────
function setStatus(msg, cls = 'idle') {
  const el = $('statusBar');
  el.textContent = msg;
  el.className = cls;
}

/**
 * The badge counts things that need attention, not appointments. An agenda is
 * something you already know about; an overdue loop is not.
 */
function updateBadge() {
  try {
    const n = pendientes.length;
    chrome.action.setBadgeText({ text: n > 0 ? String(n) : '' });
    chrome.action.setBadgeBackgroundColor({ color: n > 0 ? '#a02a2a' : '#1a7f5f' });
    chrome.action.setTitle({ title: n > 0 ? `${n} pendiente${n > 1 ? 's' : ''} · Rayen Atenciones` : 'Rayen Atenciones' });
  } catch { /* not in extension context */ }
}

/** Recomputes the morning brief. Cheap: pure functions over data already in memory. */
function refreshBrief() {
  pendientes = allData.length ? computePendientes(allData, sics, { umbrales }) : [];
  const shown = renderToday(allData, sics, { pendientes, novedades, especialidades: watchEsp, dia8: todayDate || undefined });
  refreshPatients();
  $('dayNav').style.display = allData.length ? '' : 'none';
  if (shown) $('dayPick').value = date8ToIso(shown);
  $('dayHint').textContent = todayDate ? '' : 'Hoy (o la última jornada con datos)';
  updateBadge();
}

function shiftDay(n) {
  const base = isoToDate8($('dayPick').value) || localDateStr(new Date());
  const d = new Date(+base.slice(0, 4), +base.slice(4, 6) - 1, +base.slice(6, 8));
  d.setDate(d.getDate() + n);
  todayDate = localDateStr(d);
  refreshBrief();
}
$('dayPrev').addEventListener('click', () => shiftDay(-1));
$('dayNext').addEventListener('click', () => shiftDay(1));
$('dayToday').addEventListener('click', () => { todayDate = ''; refreshBrief(); });
$('dayPick').addEventListener('change', () => { todayDate = isoToDate8($('dayPick').value); refreshBrief(); });

/**
 * Writes a note and, when it removed text, offers to put it back. Undo is what
 * makes the inline editor safe: nothing here asks "are you sure?".
 */
async function writeNote(record, text, { silent = false } = {}) {
  const before = record.note ?? '';
  const after  = text.trim();
  if (before === after) return;
  try {
    await saveNote(record, after);
    const key = record.run ?? record.nombre;
    allData.forEach(p => { if ((p.run ?? p.nombre) === key) p.note = after; });
    render();
    refreshBrief();
    revealRow(rowSelector(record.id), { scroll: false });
    if (silent) return;
    const undo = before
      ? { label: 'Deshacer', onClick: async () => {
            await restoreNote(record, before);
            allData.forEach(p => { if ((p.run ?? p.nombre) === key) p.note = before; });
            render(); refreshBrief();
            revealRow(rowSelector(record.id), { scroll: false });
            toast('Nota restaurada');
          } }
      : null;
    toast(after ? 'Nota guardada' : 'Nota eliminada', { tone: after ? 'ok' : 'info', action: undo });
  } catch (err) {
    setStatus(`No se pudo guardar la nota: ${err.message}`, 'err');
    toast('No se pudo guardar la nota', { tone: 'bad' });
  }
}

/** Deduped patients in the order the table shows them — for ‹ › and the palette. */
function patientList() {
  const seen = new Set(), out = [];
  for (const r of (lastRendered.length ? lastRendered : allData)) {
    const k = r.run ?? r.nombre;
    if (seen.has(k)) continue;
    seen.add(k); out.push(r);
  }
  return out;
}

function openPatient(record) {
  const list = patientList();
  const key  = record.run ?? record.nombre;
  const i    = list.findIndex(p => (p.run ?? p.nombre) === key);
  openPanel(record, { allData, sics, contacts, pos: i >= 0 ? { i, n: list.length } : null });
}

// ── Session expiry ────────────────────────────────────────────
let expired = false;

async function openEloisa() {
  try {
    const tabs = await chrome.tabs.query({ url: `${CONFIG.base}/*` });
    if (tabs[0]) await chrome.tabs.update(tabs[0].id, { active: true });
    else await chrome.tabs.create({ url: CONFIG.base });
  } catch { window.open(CONFIG.base, '_blank'); }
}

/** One clear message instead of "N días fallaron"; auto-refresh stops until the session is back. */
function showExpired() {
  expired = true;
  if (refreshTimer) { clearInterval(refreshTimer); refreshTimer = null; }
  const el = $('statusBar');
  el.className = 'err';
  el.innerHTML = `Sesión de Eloisa vencida. Inicia sesión de nuevo y vuelve a esta pestaña: se recargará sola. ` +
    `<button class="btn-mini" id="btnOpenEloisa">Abrir Eloisa</button>`;
  $('btnOpenEloisa').addEventListener('click', openEloisa);
}

// When the user comes back after logging in again, retry once automatically
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && expired && !$('btnFetch').disabled) handleFetch();
});

// Tabs: click or ←/→ (WAI-ARIA tablist, roving tabindex)
const showTab = initTablist(document.querySelector('.tabs'), name => {
  document.querySelectorAll('.tab-pane').forEach(p => p.classList.toggle('active', p.id === `tab-${name}`));
  if (name === 'interconsultas') ensureSICs();
  if (name === 'explorador')     renderExplorerExtras();
  if (name === 'hoy')            refreshBrief();
  if (name === 'pacientes')      renderPacientes();
  remeasure();
}, 'tab');

// ── Atenciones ────────────────────────────────────────────────
function tableCtx() { return { sicsById, sicsByRun, officerId: CONFIG.officerId }; }

function render() {
  const data = sortRecords(filterRecords(allData, tableCtx()), sortCol, sortDir);
  lastRendered = data;
  renderTable(data, allData.length, tableCtx());
  updateFilterCount();
}

async function applyResult(result) {
  allData = await attachNotes(result.records);
  team    = result.team ?? {};
  buildFilters(allData);
  buildStats(allData, team);
  render();
  renderCharts(allData, team, $('chartsSection'), sics);
  refreshBrief();
  ['statsBar','chartsSection','barEl','tblWrap','exportWrap','clearWrap'].forEach(id => { $(id).style.display = ''; });
  $('statsEmpty').style.display = 'none';
}

function summarize(result) {
  const parts = [`${allData.length} atenciones`];
  parts.push(result.fromNetwork > 0 ? `${result.fromNetwork} días vía red · ${result.fromCache} desde caché` : 'todo desde caché');
  const fails = result.failedDays + result.historialFailed;
  if (fails) parts.push(`⚠ ${fails} días fallaron (se reintentan en la próxima carga)`);
  parts.push(new Date().toLocaleTimeString('es-CL'));
  return { text: parts.join(' · '), cls: fails ? 'warn' : 'ok' };
}

async function handleFetch() {
  const btn  = $('btnFetch');
  const prog = $('progress');
  loadedMonths = parseInt($('months').value);
  const historial = $('optHistorial').checked;
  savePrefs({ months: loadedMonths, historial }).catch(() => {});

  btn.disabled = true;
  btn.textContent = 'Cargando...';
  $('btnCancel').style.display = '';
  $('btnCancel').disabled = false;
  prog.style.display = 'block';
  if (!allData.length) {
    ['barEl', 'tblWrap'].forEach(id => { $(id).style.display = ''; });
    $('tbody').innerHTML = skeletonRows(10, COLUMNS.length);
    $('todayContent').innerHTML = `<div class="today-h"><span class="sk" style="width:220px;height:20px"></span></div>` + skeletonCards(3);
  }
  prog.value = 0;
  setStatus('Conectando con Eloisa...');

  let result;
  try {
    result = await loadData(loadedMonths, (pct, phase) => {
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
    setStatus(`Carga cancelada · ${allData.length} atenciones desde lo ya descargado`, 'warn');
    toast('Carga cancelada; lo descargado se conservó', { tone: 'info' });
    return;
  }
  expired = false;
  const s = summarize(result);
  setStatus(s.text, s.cls);

  armRefresh();
  ensureSICs();
}

function armRefresh() {
  if (refreshTimer) clearInterval(refreshTimer);
  refreshTimer = refreshMin > 0 ? setInterval(silentRefresh, refreshMin * 60 * 1000) : null;
}

async function silentRefresh() {
  let result;
  try { result = await loadData(loadedMonths, () => {}, { historial: $('optHistorial').checked }); }
  catch { return; }
  if (!result) return;
  if (result.sessionExpired) { showExpired(); return; }
  const scrollY = window.scrollY;
  await applyResult(result);
  window.scrollTo(0, scrollY);
  const s = summarize(result);
  setStatus(`${s.text} · auto`, s.cls);
}

// ── Pacientes ─────────────────────────────────────────────────
function refreshPatients() {
  pacientes = allData.length ? buildPatients(allData, sics, pendientes) : [];
  renderPacientes();
  const has = pacientes.length > 0;
  $('pacBar').style.display  = has ? '' : 'none';
  $('pacWrap').style.display = has ? '' : 'none';
  $('pacEmpty').style.display = has ? 'none' : '';
}

function renderPacientes() {
  const shown = sortPatients(filterPatients(pacientes, { q: $('pacSearch').value, modo: $('pacFilt').value }));
  renderPatients(pacientes, shown);
  remeasure();
}

['pacSearch', 'pacFilt'].forEach(id => {
  $(id).addEventListener(id === 'pacSearch' ? 'input' : 'change', renderPacientes);
});
document.querySelectorAll('.pac-table th[data-psort]').forEach(th => {
  th.addEventListener('click', () => {
    const { dir } = setPatientSort(th.dataset.psort);
    document.querySelectorAll('.pac-table th[data-psort]').forEach(t => { t.classList.remove('sorted'); t.removeAttribute('data-dir'); t.setAttribute('aria-sort', 'none'); });
    th.classList.add('sorted'); th.dataset.dir = dir > 0 ? 'asc' : 'desc';
    th.setAttribute('aria-sort', dir > 0 ? 'ascending' : 'descending');
    renderPacientes();
  });
});
$('pacBody').addEventListener('click', e => {
  const copy = e.target.closest('.copy-run');
  if (copy) { e.stopPropagation(); navigator.clipboard.writeText(copy.dataset.run).then(() => flashOk(copy, '✓ copiado')).catch(() => copyToClipboard(copy.dataset.run, 'RUN copiado')); return; }
  const sic = e.target.closest('[data-sic]');
  if (sic) { e.stopPropagation(); jumpToSIC({ id: sic.dataset.sic }); return; }
  const tr = e.target.closest('.pac-row');
  if (!tr) return;
  const rec = allData.find(p => String(p.id) === tr.dataset.id);
  if (rec) openPatient(rec);
});
$('btnPacExport').addEventListener('click', () => {
  const shown = sortPatients(filterPatients(pacientes, { q: $('pacSearch').value, modo: $('pacFilt').value }));
  exportRows(PACIENTE_COLS, shown, `pacientes_dr_opazo`);
  toast(`CSV: ${shown.length} pacientes`);
});

// ── Interconsultas ────────────────────────────────────────────
function indexSICs() {
  sicsById  = new Map(sics.map(s => [s.id, s]));
  sicsByRun = new Map();
  for (const s of sics) {
    if (!s.paciente.run) continue;
    if (!sicsByRun.has(s.paciente.run)) sicsByRun.set(s.paciente.run, []);
    sicsByRun.get(s.paciente.run).push(s);
  }
  contacts = contactsFromSICs(sics);
}

function renderSICs() {
  renderSICTab(sics, sortSICs(filterSICs(sics)));
  updateSicCount();
  remeasure();
}

document.querySelectorAll('.sic-table th[data-sort]').forEach(th => {
  th.addEventListener('click', () => {
    const { key, dir } = setSICSort(th.dataset.sort);
    document.querySelectorAll('.sic-table th[data-sort]').forEach(t => { t.classList.remove('sorted'); t.removeAttribute('data-dir'); t.setAttribute('aria-sort', 'none'); });
    th.classList.add('sorted'); th.dataset.dir = dir > 0 ? 'asc' : 'desc';
    th.setAttribute('aria-sort', dir > 0 ? 'ascending' : 'descending');
    void key;
    renderSICs();
  });
});

async function ensureSICs(force = false) {
  if (sicLoading) return;
  if (!force && sics.length && sicLoadedFor >= loadedMonths) return;
  let token = null;
  try { token = await getToken(); } catch { /* no extension context */ }
  if (!token) { $('sicStatus').textContent = 'Sin sesión activa en Eloisa.'; return; }

  sicLoading = true;
  $('btnSicRefresh').disabled = true;
  $('sicStatus').textContent = 'Cargando interconsultas…';
  try {
    const res = await loadSICs(token, loadedMonths, pct => { $('sicStatus').textContent = `Cargando interconsultas… ${pct}%`; }, { force });
    sics = res.sics;
    sicLoadedFor = loadedMonths;
    indexSICs();
    buildSICFilters(sics);
    buildWatchList();
    renderSICs();
    // Change memory: what moved in the watched streams since the last load
    try { novedades = await diffWatched(sics, watchEsp); }
    catch { novedades = null; }
    // The agenda's IC column, the charts and the Hoy brief all depend on the SICs
    if (allData.length) { render(); renderCharts(allData, team, $('chartsSection'), sics); }
    refreshBrief();
    const when = new Date(res.savedAt).toLocaleTimeString('es-CL');
    $('sicStatus').textContent = `${sics.length} SIC · ${res.fromCache ? 'caché' : 'red'} · ${when}${res.failed ? ` · ⚠ ${res.failed} llamadas fallaron` : ''}`;
    $('btnSicExport').style.display = '';
    $('btnSicExportXls').style.display = '';
  } catch (err) {
    $('sicStatus').textContent = err instanceof AuthError ? 'Sesión de Eloisa vencida.' : `Error: ${err.message}`;
    if (err instanceof AuthError) showExpired();
  } finally {
    sicLoading = false;
    $('btnSicRefresh').disabled = false;
  }
}

SIC_FILTER_IDS.forEach(id => {
  $(id).addEventListener('input',  renderSICs);
  $(id).addEventListener('change', renderSICs);
});
$('btnSicRefresh').addEventListener('click', () => ensureSICs(true));
$('btnSicExport').addEventListener('click', () => { const r = sortSICs(filterSICs(sics)); exportSICsCSV(r); toast(`CSV: ${r.length} interconsultas`); });
$('btnSicExportXls').addEventListener('click', () => { const r = sortSICs(filterSICs(sics)); exportSICsXLS(r); toast(`Excel: ${r.length} interconsultas`); });
const sicChips = initChips('sicPerChips', 'sicPer', renderSICs);
$('btnSicClear').addEventListener('click', () => { SIC_FILTER_IDS.forEach(i => { $(i).value = ''; }); sicChips.reset(); renderSICs(); });

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
  if (open) {
    const rec = allData.find(p => p.run === open.dataset.run);
    if (rec) openPatient(rec);
    else toast('Ese paciente no tiene atenciones tuyas en el período cargado.', { tone: 'info' });
    return;
  }
  const row = e.target.closest('tr.sic-row');
  if (row && !e.target.closest('button')) {
    toggleSIC(Number(row.dataset.id));
    renderSICs();
  }
});

/** Jump from the agenda to one SIC (by id) or to every SIC of a patient (by RUN). */
function jumpToSIC({ id, run }) {
  showTab('interconsultas');
  SIC_FILTER_IDS.forEach(i => { $(i).value = ''; });
  if (id) { $('sicSearch').value = String(id); expandOnly(Number(id)); }
  else if (run) { $('sicSearch').value = sicsByRun.get(run)?.[0]?.paciente.runStr ?? run; }
  renderSICs();
  $('sicSummary').scrollIntoView({ block: 'start' });
}

// ── View options: density + columns ───────────────────────────
function applyDensity(dense) {
  document.body.classList.toggle('dense', dense);
  $('btnDensity').textContent = dense ? 'Cómodo' : 'Compacto';
  $('btnDensity').classList.toggle('on', dense);
}
$('btnDensity').addEventListener('click', () => {
  const dense = !document.body.classList.contains('dense');
  applyDensity(dense);
  savePrefs({ dense }).catch(() => {});
});

function buildColumnsMenu() {
  const menu = $('colsMenu');
  menu.innerHTML = COLUMNS.filter(([id]) => !ALWAYS_VISIBLE.has(id)).map(([id, label]) =>
    `<label><input type="checkbox" data-col="${id}" ${hiddenCols.has(id) ? '' : 'checked'}> ${esc(label)}</label>`
  ).join('');
  menu.addEventListener('change', e => {
    const cb = e.target.closest('input[data-col]');
    if (!cb) return;
    cb.checked ? hiddenCols.delete(cb.dataset.col) : hiddenCols.add(cb.dataset.col);
    applyColumnVisibility($('mainTable'), hiddenCols);
    savePrefs({ hiddenCols: [...hiddenCols] }).catch(() => {});
  });
}
$('btnCols').addEventListener('click', e => {
  e.stopPropagation();
  const open = $('colsMenu').classList.toggle('open');
  e.currentTarget.setAttribute('aria-expanded', String(open));
});
document.addEventListener('click', e => {
  if (!e.target.closest('#colsMenu') && !e.target.closest('#btnCols')) $('colsMenu').classList.remove('open');
});

// Clicking a bar filters the table by that value and jumps to Atenciones
$('chartsSection').addEventListener('click', e => {
  const g = e.target.closest('[data-f]');
  if (!g) return;
  const raw = g.dataset.f;
  const i = raw.indexOf(':');
  const campo = raw.slice(0, i), valor = raw.slice(i + 1);
  if (campo === 'sicEsp') {
    SIC_FILTER_IDS.forEach(id => { $(id).value = ''; });
    $('sicEsp').value = valor;
    showTab('interconsultas');
    renderSICs();
  } else {
    FILTER_IDS.forEach(id => { $(id).value = ''; });
    $(campo).value = valor;
    showTab('atenciones');
    render();
  }
  toast(`Filtrado por «${valor}»`, { tone: 'info' });
});

// ── Ajustes ───────────────────────────────────────────────────
function buildWatchList() {
  const esp = [...new Set([...sics.map(s => s.especialidad), ...watchEsp])].filter(Boolean).sort();
  if (!esp.length) return;
  $('watchList').innerHTML = esp.map(e =>
    `<label class="${watchEsp.includes(e) ? 'on' : ''}"><input type="checkbox" data-esp="${esc(e)}" ${watchEsp.includes(e) ? 'checked' : ''}> ${esc(e)}</label>`).join('');
}

function fillSettings() {
  $('setRefresh').value = String(refreshMin);
  $('setLock').value = String(lockCtl?.minutes ?? 15);
  $('setCr').value = umbrales.crDias; $('setNueva').value = umbrales.nuevaDias;
  $('setCita').value = umbrales.citaDias; $('setControl').value = umbrales.controlDias;
}

$('btnSettings').addEventListener('click', e => {
  e.stopPropagation();
  const open = $('settingsMenu').classList.toggle('open');
  e.currentTarget.setAttribute('aria-expanded', String(open));
  if (open) { fillSettings(); buildWatchList(); }
});
$('settingsMenu').addEventListener('click', e => e.stopPropagation());
document.addEventListener('click', e => { if (!e.target.closest('#settingsWrap')) $('settingsMenu').classList.remove('open'); });

$('settingsMenu').addEventListener('change', async e => {
  const t = e.target;
  if (t.id === 'setRefresh') { refreshMin = Number(t.value); if (allData.length) armRefresh(); await savePrefs({ refreshMin }); }
  if (t.id === 'setLock')    { const m = Number(t.value); lockCtl?.setMinutes(m); if (lockCtl) lockCtl.minutes = m; await savePrefs({ lockMin: m }); }
  if (t.id === 'setStartTab') await savePrefs({ startTab: t.value });
  if (['setCr','setNueva','setCita','setControl'].includes(t.id)) {
    umbrales = { crDias: +$('setCr').value || 1, nuevaDias: +$('setNueva').value || 1, citaDias: +$('setCita').value || 0, controlDias: +$('setControl').value || 0 };
    await savePrefs({ umbrales });
    refreshBrief();
  }
  const cb = t.closest('input[data-esp]');
  if (cb) {
    const esp = cb.dataset.esp;
    watchEsp = cb.checked ? [...new Set([...watchEsp, esp])] : watchEsp.filter(x => x !== esp);
    cb.closest('label').classList.toggle('on', cb.checked);
    await savePrefs({ watchEsp });
    try { novedades = await diffWatched(sics, watchEsp); } catch { novedades = null; }
    refreshBrief();
  }
});

// ── Explorer ──────────────────────────────────────────────────
function renderExplorerExtras() {
  const extras = summarizeExtraFields(getRawSamples());
  if (!extras.length) return;
  $('extraFieldsBody').innerHTML = extras.map(({ key, count, sample }) => {
    const sampleStr = sample === null ? '—'
      : typeof sample === 'object' ? JSON.stringify(sample).slice(0, 80)
      : String(sample).slice(0, 80);
    return `<tr><td>${esc(key)}</td><td>${count}</td><td>${esc(sampleStr)}</td></tr>`;
  }).join('');
  $('extraFields').style.display = '';
}

QUICK_LINKS.forEach(({ label, url }) => {
  const btn = document.createElement('button');
  btn.className = 'ql-btn';
  btn.textContent = label;
  btn.addEventListener('click', () => {
    $('explorerUrl').value = url.replaceAll('{YYYYMMDD}', localDateStr(new Date()));
  });
  $('explorerQl').appendChild(btn);
});

$('btnExplorerFetch').addEventListener('click', async () => {
  const url = $('explorerUrl').value.trim();
  if (!url) return;
  const meta = $('explorerMeta'), out = $('explorerOut');
  meta.textContent = 'Consultando…';
  meta.className   = 'explorer-meta';
  out.value        = '';
  const { ok, status, data, raw } = await explorerFetch(url);
  meta.textContent = `HTTP ${status} ${ok ? '✓' : '✗'}  ·  ${new Date().toLocaleTimeString('es-CL')}`;
  meta.className   = `explorer-meta ${ok ? 'ok' : 'err'}`;
  out.value = data !== null ? JSON.stringify(data, null, 2) : raw;
});

// ── Events ────────────────────────────────────────────────────
$('btnFetch').addEventListener('click', handleFetch);
$('btnCancel').addEventListener('click', () => { cancelRun(); $('btnCancel').disabled = true; setStatus('Cancelando… se conserva lo ya descargado', 'warn'); });
document.addEventListener('click', e => {
  if (e.target.closest('.empty-cta[data-act="fetch"]')) handleFetch();
});
const EXPORTERS = {
  csv: exportCSV, xls: exportXLS, html: exportHTML, json: exportJSON, pdf: exportPDF,
  notas: rows => { const n = exportNotas(rows); toast(n ? `${n} pacientes con nota exportados` : 'No hay notas que exportar', { tone: n ? 'ok' : 'info' }); },
};
const EXPORT_LABEL = { csv: 'CSV', xls: 'Excel', html: 'HTML', json: 'JSON', pdf: 'PDF', notas: '' };
$('btnExport').addEventListener('click', e => { e.stopPropagation(); const open = $('exportMenu').classList.toggle('open'); e.currentTarget.setAttribute('aria-expanded', String(open)); });
$('exportMenu').addEventListener('click', async e => {
  const b = e.target.closest('button[data-fmt]');
  if (!b) return;
  $('exportMenu').classList.remove('open');
  const rows = sortRecords(filterRecords(allData, tableCtx()), sortCol, sortDir);
  try {
    await EXPORTERS[b.dataset.fmt](rows);
    const lbl = EXPORT_LABEL[b.dataset.fmt];
    if (lbl) toast(`${lbl}: ${rows.length} atenciones`);
  } catch (err) {
    setStatus(`No se pudo exportar: ${err.message}`, 'err');
    toast('No se pudo exportar', { tone: 'bad' });
  }
});
document.addEventListener('click', e => { if (!e.target.closest('#exportWrap')) $('exportMenu').classList.remove('open'); });
$('btnClearCache').addEventListener('click', e => { e.stopPropagation(); const open = $('clearMenu').classList.toggle('open'); e.currentTarget.setAttribute('aria-expanded', String(open)); });
$('clearMenu').addEventListener('click', async e => {
  const b = e.target.closest('button[data-clear]');
  if (!b) return;
  $('clearMenu').classList.remove('open');
  const all = b.dataset.clear === 'all';
  const msg = all
    ? '¿Borrar TODOS los datos de la extensión?\n\nAgenda, ficha clínica, interconsultas, NOTAS, preferencias y el token de sesión. No se puede deshacer.'
    : '¿Borrar el caché local (agenda, ficha clínica e interconsultas)?\n\nLas notas y preferencias se conservan.';
  if (!confirm(msg)) return;
  if (all && !confirm('Última confirmación: se borrarán también tus notas por paciente. ¿Continuar?')) return;
  try {
    if (all) await clearEverything(); else await clearAllCaches();
    allData = []; team = {}; sics = []; sicLoadedFor = 0; indexSICs();
    render(); buildStats(allData, team);
    setStatus(all ? 'Todos los datos borrados.' : 'Caché borrado. Pulsa Actualizar para recargar desde la red.', 'idle');
  } catch (err) {
    setStatus(`No se pudo borrar: ${err.message}`, 'err');
  }
});
document.addEventListener('click', e => { if (!e.target.closest('#clearWrap')) $('clearMenu').classList.remove('open'); });

const debounce = (fn, ms) => { let t; return () => { clearTimeout(t); t = setTimeout(fn, ms); }; };
const renderSoon = debounce(render, 150);
FILTER_IDS.forEach(id => {
  // Typing re-renders after a pause; selects re-render at once
  $(id).addEventListener(id === 'search' ? 'input' : 'change', id === 'search' ? renderSoon : render);
});
// Stream the rest of the rows in as the user scrolls; also drive the sticky shadow
$('tblWrap').addEventListener('scroll', e => {
  const w = e.currentTarget;
  w.classList.toggle('scrolled', w.scrollLeft > 0);
  if (hasMoreRows() && w.scrollTop + w.clientHeight > w.scrollHeight - 600) appendChunk();
}, { passive: true });

// Patient cards in the Hoy tab open the same panel as the table
$('todayContent').addEventListener('click', e => {
  const sic = e.target.closest('[data-sic]');
  if (sic) { jumpToSIC({ id: sic.dataset.sic }); return; }
  const byRun = e.target.closest('.pat-run[data-run]');
  if (byRun) {
    const record = allData.find(p => p.run === byRun.dataset.run);
    if (record) openPatient(record);
    return;
  }
  const card = e.target.closest('.pat-link[data-id]');
  if (!card) return;
  const record = allData.find(p => String(p.id) === card.dataset.id);
  if (record) openPatient(record);
});

// Summary tiles in the IC tab double as filters
$('sicSummary').addEventListener('click', e => {
  const tile = e.target.closest('[data-filter]');
  if (!tile) return;
  const [campo, valor] = tile.dataset.filter.split(':');
  SIC_FILTER_IDS.forEach(i => { $(i).value = ''; });
  if (campo === 'grupo')  $('sicGrupo').value  = valor;
  if (campo === 'quien')  $('sicQuien').value  = valor;
  if (campo === 'cr')     $('sicContra').value = valor;
  renderSICs();
});

const perChips = initChips('perChips', 'filtPer', render);

/** One fold control per tab: the panel holds every secondary filter. */
function initFilterFold(btnId, panelId, ids, perId, onClear) {
  const btn = $(btnId), panel = $(panelId);
  btn.addEventListener('click', () => {
    const open = panel.hasAttribute('hidden');
    panel.toggleAttribute('hidden', !open);
    btn.setAttribute('aria-expanded', String(open));
    btn.classList.toggle('on', open);
    remeasure();
    if (open) panel.querySelector('select')?.focus();
  });
  return function updateCount() {
    const n = ids.filter(id => $(id).value).length + ($(perId).value !== 'todo' ? 1 : 0);
    btn.textContent = n ? `Filtros · ${n}` : 'Filtros';
    btn.classList.toggle('on', n > 0 || !panel.hasAttribute('hidden'));
    void onClear;
  };
}
const updateFilterCount = initFilterFold('btnFilters', 'filterPanel', FILTER_IDS, 'filtPer');
const updateSicCount    = initFilterFold('btnSicFilters', 'sicFilterPanel', SIC_FILTER_IDS, 'sicPer');
$('btnClearFilters').addEventListener('click', () => {
  const before = Object.fromEntries(FILTER_IDS.map(id => [id, $(id).value]));
  const beforePer = $('filtPer').value;
  const n = Object.values(before).filter(Boolean).length + (beforePer !== 'todo' ? 1 : 0);
  FILTER_IDS.forEach(id => { $(id).value = ''; });
  perChips.reset();
  render();
  if (n) toast(`${n} filtro${n > 1 ? 's' : ''} limpiado${n > 1 ? 's' : ''}`, { tone: 'info', action: { label: 'Deshacer', onClick: () => {
    for (const [id, v] of Object.entries(before)) $(id).value = v;
    perChips.set(beforePer);
    render();
  } } });
});
$('btnMoreFilters').addEventListener('click', () => {
  const bar  = document.querySelector('#barEl .bar');
  const open = bar.classList.toggle('show-more');
  $('btnMoreFilters').textContent = open ? '− Menos filtros' : '+ Más filtros';
  $('btnMoreFilters').classList.toggle('on', open);
  $('btnMoreFilters').setAttribute('aria-expanded', String(open));
});

document.querySelectorAll('th[data-col]').forEach(th => {
  th.addEventListener('click', () => {
    const col = th.dataset.col;
    sortDir = col === sortCol ? sortDir * -1 : 1;
    sortCol = col;
    document.querySelectorAll('th[data-col]').forEach(t => { t.classList.remove('sorted'); t.removeAttribute('data-dir'); t.setAttribute('aria-sort', 'none'); });
    th.classList.add('sorted');
    th.dataset.dir = sortDir > 0 ? 'asc' : 'desc';
    th.setAttribute('aria-sort', sortDir > 0 ? 'ascending' : 'descending');
    savePrefs({ sortCol, sortDir }).catch(() => {});
    render();
  });
});

$('tbody').addEventListener('click', async e => {
  const sicChip = e.target.closest('.sic-link');
  if (sicChip) { jumpToSIC({ id: sicChip.dataset.sic }); return; }
  const runChip = e.target.closest('.sic-run');
  if (runChip) { jumpToSIC({ run: runChip.dataset.run }); return; }

  const cert = e.target.closest('.pdf-cert');
  if (cert) {
    cert.disabled = true;
    const err = await openPDF(certificadoPath(cert.dataset.id));
    cert.disabled = false;
    if (err) setStatus(err, 'err');
    return;
  }

  const copy = e.target.closest('.copy-run');
  if (copy) {
    e.stopPropagation();
    navigator.clipboard.writeText(copy.dataset.run).then(() => flashOk(copy, '✓ copiado'))
      .catch(() => copyToClipboard(copy.dataset.run, 'RUN copiado'));
    return;
  }

  const patCell = e.target.closest('.pat-link');
  if (patCell) {
    const record = allData.find(p => String(p.id) === patCell.dataset.id);
    if (record) openPatient(record);
    return;
  }

  const noteCell = e.target.closest('.note-cell');
  if (noteCell && !noteCell.classList.contains('editing')) startNoteEdit(noteCell);
});

/**
 * Inline note editor inside the cell: Enter saves, Shift+Enter adds a line,
 * Esc cancels, leaving the field saves. Replaces the blocking prompt().
 */
function startNoteEdit(cell) {
  const record = allData.find(p => String(p.id) === cell.dataset.id);
  if (!record) return;
  cell.classList.add('editing');
  cell.innerHTML = `<textarea class="note-edit" rows="2" placeholder="Nota… Enter guarda · Esc cancela" aria-label="Nota para ${esc(record.nombre)}"></textarea>`;
  const ta = cell.querySelector('textarea');
  ta.value = record.note ?? '';
  ta.focus();
  ta.setSelectionRange(ta.value.length, ta.value.length);

  let done = false;
  const finish = async save => {
    if (done) return;
    done = true;
    const text = ta.value;
    cell.classList.remove('editing');
    if (save) await writeNote(record, text);
    else render();
  };
  ta.addEventListener('keydown', ev => {
    if (ev.key === 'Enter' && !ev.shiftKey) { ev.preventDefault(); finish(true); }
    else if (ev.key === 'Escape')           { ev.preventDefault(); finish(false); }
  });
  ta.addEventListener('blur', () => finish(true));
}

// ── Init ──────────────────────────────────────────────────────
initPanel({
  // A note saved in the panel must show up in every row of that patient and in the brief
  onNoteSaved(record, text, before) {
    const key = record.run ?? record.nombre;
    allData.forEach(p => { if ((p.run ?? p.nombre) === key) p.note = text; });
    render();
    refreshBrief();
    if (before && !text) {
      toast('Nota eliminada', { tone: 'info', action: { label: 'Deshacer', onClick: async () => {
        await restoreNote(record, before);
        allData.forEach(p => { if ((p.run ?? p.nombre) === key) p.note = before; });
        record.note = before;
        $('ppNoteText').value = before;
        render(); refreshBrief();
        toast('Nota restaurada');
      } } });
    }
  },
  // ‹ › and ←/→ walk the patient list in the order the table shows it
  onNavigate(dir) {
    const list = patientList();
    const key  = document.getElementById('ppName').textContent;
    const i    = list.findIndex(p => p.nombre === key);
    const next = list[i + dir];
    if (next) openPatient(next);
  },
});
initPalette(patientList, openPatient);

// Closing the panel returns you to the row you came from, and says which one
document.addEventListener('rayen:panel-closed', e => {
  if (e.detail?.id != null) revealRow(rowSelector(e.detail.id));
});
initTooltips();
lockCtl = initLock({ minutes: 15 }); // patient data on screen; blur it when idle
lockCtl.minutes = 15;
activateOnKey($('mainTable'));    // Enter/Space on sortable headers, patient names, SIC lines
activateOnKey($('sicBody'));      // Enter/Space expands a SIC row
activateOnKey($('todayContent')); // Enter/Space opens a patient from Hoy
loadPrefs().then(p => {
  $('months').value = String(p.months);
  $('optHistorial').checked = p.historial;
  hiddenCols = new Set(p.hiddenCols ?? []);
  applyDensity(!!p.dense);
  buildColumnsMenu();
  applyColumnVisibility($('mainTable'), hiddenCols);
  refreshMin = Number.isFinite(+p.refreshMin) ? +p.refreshMin : 15;
  if (Number.isFinite(+p.lockMin)) { lockCtl.setMinutes(+p.lockMin); lockCtl.minutes = +p.lockMin; }
  if (Array.isArray(p.watchEsp) && p.watchEsp.length) watchEsp = p.watchEsp;
  if (p.umbrales && typeof p.umbrales === 'object') umbrales = { ...CONFIG.pendientes, ...p.umbrales };
  if (p.sortCol) { sortCol = p.sortCol; sortDir = p.sortDir === 1 ? 1 : -1;
    document.querySelectorAll('th[data-col]').forEach(t => { const on = t.dataset.col === sortCol; t.classList.toggle('sorted', on);
      if (on) { t.dataset.dir = sortDir > 0 ? 'asc' : 'desc'; t.setAttribute('aria-sort', sortDir > 0 ? 'ascending' : 'descending'); } else { t.removeAttribute('data-dir'); t.setAttribute('aria-sort', 'none'); } }); }
  if (p.startTab && p.startTab !== 'hoy') showTab(p.startTab);
}).catch(() => { applyDensity(false); buildColumnsMenu(); });
