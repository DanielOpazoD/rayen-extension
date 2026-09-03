import { renderTable, sortRecords, appendChunk, hasMoreRows, rowSelector, COLUMNS, ALWAYS_VISIBLE, applyColumnVisibility } from '../table.js';
import { buildFilters, filterRecords } from '../stats.js';
import { exportCSV, exportXLS, exportHTML, exportJSON, exportPDF, exportNotas } from '../export.js';
import { certificadoPath, openPDF } from '../pdf.js';
import { savePrefs } from '../cache.js';
import { toast } from '../toast.js';
import { esc, $, revealRow } from '../dom.js';
import { state, on, tableCtx } from '../state.js';
import { initChips, initFilterFold, initMenu, markSorted, debounce, setStatus } from '../ui.js';
import { writeNote, openPatientById, copyRun, jumpToSIC } from '../actions.js';

/** The agenda table: filters, sort, inline notes, columns, export. */

const FILTER_IDS = ['search', 'filtFecha', 'filtDia', 'filtSexo', 'filtEstado', 'filtPrev', 'filtTipo', 'filtPrest', 'filtIC', 'filtDx', 'filtDesde', 'filtHasta'];

let sortCol = 'fechaAtencion', sortDir = -1;
let hiddenCols = new Set();
let perChips, updateFilterCount;

/** The rows as the user sees them: filtered and sorted. Also what exports get. */
export function currentRows() {
  return sortRecords(filterRecords(state.allData, tableCtx()), sortCol, sortDir);
}

export function render() {
  const data = currentRows();
  state.rendered = data;
  renderTable(data, state.allData.length, tableCtx());
  updateFilterCount();
}

/** From a chart bar: one filter, everything else cleared. */
export function applyFilter(campo, valor) {
  FILTER_IDS.forEach(id => { $(id).value = ''; });
  perChips.reset();
  $(campo).value = valor;
  render();
}

/**
 * Inline note editor inside the cell: Enter saves, Shift+Enter adds a line,
 * Esc cancels, leaving the field saves. Replaces the blocking prompt().
 */
function startNoteEdit(cell) {
  const record = state.allData.find(p => String(p.id) === cell.dataset.id);
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
    if (save && text.trim() !== (record.note ?? '')) await writeNote(record, text);
    else render();
  };
  ta.addEventListener('keydown', ev => {
    if (ev.key === 'Enter' && !ev.shiftKey) { ev.preventDefault(); finish(true); }
    else if (ev.key === 'Escape')           { ev.preventDefault(); finish(false); }
  });
  ta.addEventListener('blur', () => finish(true));
}

function applyDensity(dense) {
  document.body.classList.toggle('dense', dense);
  $('btnDensity').textContent = dense ? 'Cómodo' : 'Compacto';
  $('btnDensity').classList.toggle('on', dense);
}

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

const EXPORTERS = {
  csv: exportCSV, xls: exportXLS, html: exportHTML, json: exportJSON, pdf: exportPDF,
  notas: rows => { const n = exportNotas(rows); toast(n ? `${n} pacientes con nota exportados` : 'No hay notas que exportar', { tone: n ? 'ok' : 'info' }); },
};
const EXPORT_LABEL = { csv: 'CSV', xls: 'Excel', html: 'HTML', json: 'JSON', pdf: 'PDF', notas: '' };

export function init(prefs) {
  hiddenCols = new Set(prefs.hiddenCols ?? []);
  applyDensity(!!prefs.dense);
  buildColumnsMenu();
  applyColumnVisibility($('mainTable'), hiddenCols);
  if (prefs.sortCol) { sortCol = prefs.sortCol; sortDir = prefs.sortDir === 1 ? 1 : -1; }

  const headers = [...document.querySelectorAll('th[data-col]')];
  markSorted(headers, headers.find(t => t.dataset.col === sortCol), sortDir);
  headers.forEach(th => th.addEventListener('click', () => {
    const col = th.dataset.col;
    sortDir = col === sortCol ? sortDir * -1 : 1;
    sortCol = col;
    markSorted(headers, th, sortDir);
    savePrefs({ sortCol, sortDir }).catch(() => {});
    render();
  }));

  perChips = initChips('perChips', 'filtPer', render);
  updateFilterCount = initFilterFold('btnFilters', 'filterPanel', FILTER_IDS, 'filtPer');
  const renderSoon = debounce(render, 150);
  FILTER_IDS.forEach(id => {
    // Typing re-renders after a pause; selects re-render at once
    $(id).addEventListener(id === 'search' ? 'input' : 'change', id === 'search' ? renderSoon : render);
  });
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

  $('btnDensity').addEventListener('click', () => {
    const dense = !document.body.classList.contains('dense');
    applyDensity(dense);
    savePrefs({ dense }).catch(() => {});
  });
  initMenu('btnCols', 'colsMenu');

  // Stream the rest of the rows in as the user scrolls; also drive the sticky shadow
  $('tblWrap').addEventListener('scroll', e => {
    const w = e.currentTarget;
    w.classList.toggle('scrolled', w.scrollLeft > 0);
    if (hasMoreRows() && w.scrollTop + w.clientHeight > w.scrollHeight - 600) appendChunk();
  }, { passive: true });

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
    if (copy) { e.stopPropagation(); copyRun(copy); return; }
    const patCell = e.target.closest('.pat-link');
    if (patCell) { openPatientById(patCell.dataset.id); return; }
    const noteCell = e.target.closest('.note-cell');
    if (noteCell && !noteCell.classList.contains('editing')) startNoteEdit(noteCell);
  });

  initMenu('btnExport', 'exportMenu', 'exportWrap');
  $('exportMenu').addEventListener('click', async e => {
    const b = e.target.closest('button[data-fmt]');
    if (!b) return;
    $('exportMenu').classList.remove('open');
    $('btnExport').setAttribute('aria-expanded', 'false');
    const rows = currentRows();
    try {
      await EXPORTERS[b.dataset.fmt](rows);
      const lbl = EXPORT_LABEL[b.dataset.fmt];
      if (lbl) toast(`${lbl}: ${rows.length} atenciones`);
    } catch (err) {
      setStatus(`No se pudo exportar: ${err.message}`, 'err');
      toast('No se pudo exportar', { tone: 'bad' });
    }
  });

  // Closing the panel returns you to the row you came from, and says which one
  document.addEventListener('rayen:panel-closed', e => {
    if (e.detail?.id != null) revealRow(rowSelector(e.detail.id));
  });

  on('data', () => {
    buildFilters(state.allData);
    render();
    if (state.allData.length) ['barEl', 'tblWrap', 'exportWrap'].forEach(id => { $(id).style.display = ''; });
  });
  on('notes', record => {
    render();
    revealRow(rowSelector(record.id), { scroll: false });
  });
}
