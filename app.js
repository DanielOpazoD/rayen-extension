import { loadData, getRawSamples }        from './src/api.js';
import { getToken }                       from './src/auth.js';
import { attachNotes, saveNote }          from './src/notes.js';
import { exportCSV, exportSICsCSV, exportXLS, exportHTML, exportJSON, exportPDF } from './src/export.js';
import { clearAllCaches, clearEverything, loadPrefs, savePrefs } from './src/cache.js';
import { AuthError } from './src/http.js';
import { renderCharts }                   from './src/charts.js';
import { initPanel, openPanel }           from './src/patient-panel.js';
import { explorerFetch, QUICK_LINKS, summarizeExtraFields } from './src/explorer.js';
import { renderTable, sortRecords, COLUMNS, ALWAYS_VISIBLE, applyColumnVisibility } from './src/table.js';
import { buildStats, buildFilters, filterRecords } from './src/stats.js';
import { loadSICs, contactsFromSICs }     from './src/sic.js';
import { renderSICTab, filterSICs, buildSICFilters, toggleSIC, expandOnly } from './src/ic-tab.js';
import { certificadoPath, sicPdfPath, openPDF } from './src/pdf.js';
import { localDateStr } from './src/parser.js';
import { esc, $, initTooltips, initTablist, activateOnKey } from './src/dom.js';
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
let hiddenCols   = new Set();

const FILTER_IDS = ['search','filtFecha','filtDia','filtSexo','filtEstado','filtPrev','filtTipo','filtPrest','filtIC','filtDx'];
const SIC_FILTER_IDS = ['sicSearch','sicGrupo','sicEsp','sicQuien','sicContra'];

// ── Utils ─────────────────────────────────────────────────────
function setStatus(msg, cls = 'idle') {
  const el = $('statusBar');
  el.textContent = msg;
  el.className = cls;
}

function updateBadge() {
  try {
    const today = localDateStr(new Date());
    const count = allData.filter(p => p.fecha8 === today).length;
    chrome.action.setBadgeText({ text: count > 0 ? String(count) : '' });
    chrome.action.setBadgeBackgroundColor({ color: '#2d8c6e' });
  } catch { /* not in extension context */ }
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
}, 'tab');

// ── Atenciones ────────────────────────────────────────────────
function tableCtx() { return { sicsById, sicsByRun, officerId: CONFIG.officerId }; }

function render() {
  const data = sortRecords(filterRecords(allData, tableCtx()), sortCol, sortDir);
  renderTable(data, allData.length, tableCtx());
  const active = FILTER_IDS.filter(id => $(id).value).length;
  $('btnClearFilters').textContent = active ? `✕ ${active} filtro${active > 1 ? 's' : ''}` : '✕ Filtros';
  $('btnClearFilters').classList.toggle('on', active > 0);
}

async function applyResult(result) {
  allData = await attachNotes(result.records);
  team    = result.team ?? {};
  buildFilters(allData);
  buildStats(allData, team);
  render();
  renderCharts(allData, team, $('chartsSection'));
  updateBadge();
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
  prog.style.display = 'block';
  prog.value = 0;
  setStatus('Conectando con Eloisa...');

  let result;
  try {
    result = await loadData(loadedMonths, (pct, phase) => {
      prog.value = pct;
      setStatus(phase === 'ficha' ? `Ficha clínica (diagnósticos)… ${pct}%` : `Agenda… ${pct}%`);
    }, { historial });
  } catch (err) {
    setStatus(`Error al cargar: ${err.message}`, 'err');
    result = null;
  } finally {
    prog.style.display = 'none';
    btn.disabled = false;
    btn.textContent = 'Actualizar';
  }

  if (!result) {
    if ($('statusBar').className !== 'err')
      setStatus('No hay sesión activa. Abre clinicohangaroa.eloisa.cl e inicia sesión.', 'err');
    return;
  }

  if (result.records.length) await applyResult(result);
  if (result.sessionExpired) { showExpired(); return; }
  expired = false;
  const s = summarize(result);
  setStatus(s.text, s.cls);

  if (refreshTimer) clearInterval(refreshTimer);
  refreshTimer = setInterval(silentRefresh, 15 * 60 * 1000);

  ensureSICs();
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
  renderSICTab(sics, filterSICs(sics));
}

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
    renderSICs();
    if (allData.length) render(); // IC column of the agenda depends on the SICs
    const when = new Date(res.savedAt).toLocaleTimeString('es-CL');
    $('sicStatus').textContent = `${sics.length} SIC · ${res.fromCache ? 'caché' : 'red'} · ${when}${res.failed ? ` · ⚠ ${res.failed} llamadas fallaron` : ''}`;
    $('btnSicExport').style.display = '';
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
$('btnSicExport').addEventListener('click', () => exportSICsCSV(filterSICs(sics)));
$('btnSicClear').addEventListener('click', () => { SIC_FILTER_IDS.forEach(i => { $(i).value = ''; }); renderSICs(); });

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
    if (rec) openPanel(rec, { allData, sics, contacts });
    else $('sicStatus').textContent = 'Ese paciente no tiene atenciones tuyas en el período cargado.';
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
  $('btnDensity').textContent = dense ? '☰ Cómodo' : '☰ Compacto';
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
const EXPORTERS = { csv: exportCSV, xls: exportXLS, html: exportHTML, json: exportJSON, pdf: exportPDF };
$('btnExport').addEventListener('click', e => { e.stopPropagation(); const open = $('exportMenu').classList.toggle('open'); e.currentTarget.setAttribute('aria-expanded', String(open)); });
$('exportMenu').addEventListener('click', async e => {
  const b = e.target.closest('button[data-fmt]');
  if (!b) return;
  $('exportMenu').classList.remove('open');
  try { await EXPORTERS[b.dataset.fmt](sortRecords(filterRecords(allData, tableCtx()), sortCol, sortDir)); }
  catch (err) { setStatus(`No se pudo exportar: ${err.message}`, 'err'); }
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
$('btnClearFilters').addEventListener('click', () => {
  FILTER_IDS.forEach(id => { $(id).value = ''; });
  render();
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

  const patCell = e.target.closest('.pat-link');
  if (patCell) {
    const record = allData.find(p => String(p.id) === patCell.dataset.id);
    if (record) openPanel(record, { allData, sics, contacts });
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
    if (save && text.trim() !== (record.note ?? '')) {
      try {
        await saveNote(record, text);
        const key = record.run ?? record.nombre;
        allData.forEach(p => { if ((p.run ?? p.nombre) === key) p.note = text.trim(); });
      } catch (err) {
        setStatus(`No se pudo guardar la nota: ${err.message}`, 'err');
      }
    }
    render();
  };
  ta.addEventListener('keydown', ev => {
    if (ev.key === 'Enter' && !ev.shiftKey) { ev.preventDefault(); finish(true); }
    else if (ev.key === 'Escape')           { ev.preventDefault(); finish(false); }
  });
  ta.addEventListener('blur', () => finish(true));
}

// ── Init ──────────────────────────────────────────────────────
initPanel();
initTooltips();
activateOnKey($('mainTable')); // Enter/Space on sortable headers, patient names, SIC lines
activateOnKey($('sicBody'));   // Enter/Space expands a SIC row
loadPrefs().then(p => {
  $('months').value = String(p.months);
  $('optHistorial').checked = p.historial;
  hiddenCols = new Set(p.hiddenCols ?? []);
  applyDensity(!!p.dense);
  buildColumnsMenu();
  applyColumnVisibility($('mainTable'), hiddenCols);
}).catch(() => { applyDensity(false); buildColumnsMenu(); });
