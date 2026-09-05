import { humanError } from '../../core/errors.js';
import { renderTable, sortRecords, appendChunk, hasMoreRows, rowSelector, COLUMNS, ALWAYS_VISIBLE, applyColumnVisibility } from '../table.js';
import { buildFilters, filterRecords } from '../stats.js';
import { exportCSV, exportXLS, exportHTML, exportJSON, exportPDF, exportNotas } from '../export.js';
import { certificadoPath, openPDF } from '../../io/pdf.js';
import { savePrefs } from '../../io/cache.js';
import { toast } from '../toast.js';
import { esc, $, revealRow } from '../dom.js';
import { state, on, tableCtx, setRendered } from '../../io/state.js';
import { initChips, initFilterFold, initMenu, markSorted, debounce, setStatus } from '../ui.js';
import { writeNote, openPatientById, copyRun, jumpToSIC } from '../actions.js';
import { decodeMultiValue, initMultiSelect } from '../multi-select.js';

// Guardar una preferencia fallaba en silencio: la persona creía que el orden o
// las columnas quedaban y al volver no estaban.
const prefsFailed = () => toast('No se pudo guardar la preferencia en este perfil de Chrome.', { tone: 'bad' });

/** The agenda table: filters, sort, inline notes, columns, export. */

const FILTER_IDS = ['search', 'filtFecha', 'filtDia', 'filtSexo', 'filtEstado', 'filtPrev', 'filtTipo', 'filtPrest', 'filtIC', 'filtDx', 'filtDesde', 'filtHasta'];

let sortCol = 'fechaAtencion', sortDir = -1;
let hiddenCols = new Set();
let perChips, typeSelect, updateFilterCount;

/** The rows as the user sees them: filtered and sorted. Also what exports get. */
export function currentRows() {
  return sortRecords(filterRecords(state.allData, tableCtx()), sortCol, sortDir);
}

export function render() {
  const data = currentRows();
  setRendered(data);
  renderTable(data, state.allData.length, tableCtx());
  // Roving tabindex: la primera fila es la única parada de Tab.
  const first = $('tbody').querySelector('tr[data-id]');
  if (first) first.tabIndex = 0;
  requestAnimationFrame(() => { const w = $('tblWrap'); w.classList.toggle('more-right', w.scrollLeft + w.clientWidth < w.scrollWidth - 1); });
  updateFilterCount();
}

/**
 * From a chart bar: one filter, everything else cleared.
 *
 * Devuelve false si el valor no existe como opción: asignarlo a un <select>
 * dejaba `value === ''`, es decir sin filtro, y la tabla completa se mostraba
 * como si estuviera filtrada mientras el aviso decía «Filtrado por…».
 */
export function applyFilter(campo, valor) {
  if (campo !== 'filtTipo') {
    const sel = $(campo);
    if (sel.tagName === 'SELECT' && ![...sel.options].some(o => o.value === valor)) return false;
  }
  FILTER_IDS.forEach(id => { if (id !== 'filtTipo') $(id).value = ''; });
  typeSelect.setValues(campo === 'filtTipo' ? [valor] : [], { notify: false });
  perChips.reset();
  if (campo !== 'filtTipo') $(campo).value = valor;
  render();
  return true;
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
    savePrefs({ hiddenCols: [...hiddenCols] }).catch(prefsFailed);
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
    savePrefs({ sortCol, sortDir }).catch(prefsFailed);
    render();
  }));

  perChips = initChips('perChips', 'filtPer', render);
  typeSelect = initMultiSelect({
    inputId: 'filtTipo', buttonId: 'filtTipoButton', menuId: 'filtTipoMenu', onChange: render,
  });
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
    FILTER_IDS.forEach(id => { if (id !== 'filtTipo') $(id).value = ''; });
    typeSelect.setValues([], { notify: false });
    perChips.reset();
    render();
    if (n) toast(`${n} filtro${n > 1 ? 's' : ''} limpiado${n > 1 ? 's' : ''}`, { tone: 'info', action: { label: 'Deshacer', onClick: () => {
      for (const [id, v] of Object.entries(before)) if (id !== 'filtTipo') $(id).value = v;
      typeSelect.setValues(decodeMultiValue(before.filtTipo), { notify: false });
      perChips.set(beforePer);
      render();
    } } });
  });

  $('btnDensity').addEventListener('click', () => {
    const dense = !document.body.classList.contains('dense');
    applyDensity(dense);
    savePrefs({ dense }).catch(prefsFailed);
  });
  initMenu('btnCols', 'colsMenu');

  // Stream the rest of the rows in as the user scrolls; also drive the sticky shadow
  // Pistas de desplazamiento horizontal: sombra a la izquierda cuando ya se
  // desplazó, y a la derecha mientras queden columnas fuera de la vista.
  const scrollHints = w => {
    w.classList.toggle('scrolled', w.scrollLeft > 0);
    w.classList.toggle('more-right', w.scrollLeft + w.clientWidth < w.scrollWidth - 1);
  };
  window.addEventListener('resize', () => scrollHints($('tblWrap')));
  // La tabla se pinta con la pestaña oculta (mide 0): al mostrarse cambia de
  // tamaño y el observador recalcula las pistas.
  if (typeof ResizeObserver !== 'undefined') new ResizeObserver(() => scrollHints($('tblWrap'))).observe($('tblWrap'));
  $('tblWrap').addEventListener('scroll', e => {
    const w = e.currentTarget;
    scrollHints(w);
    if (hasMoreRows() && w.scrollTop + w.clientHeight > w.scrollHeight - 600) appendChunk();
  }, { passive: true });

  // Navegación por filas: ↑/↓ mueven el foco, Enter abre al paciente. Antes
  // cada fila tenía tres paradas de tabulación (nombre, info, RUN): unas 360
  // por tabla. La fila enfocada es la única con tabindex 0.
  $('tbody').addEventListener('keydown', e => {
    const row = e.target.closest('tr[data-id]');
    if (!row || e.target.tagName === 'TEXTAREA') return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      const next = e.key === 'ArrowDown' ? row.nextElementSibling : row.previousElementSibling;
      if (!next?.dataset.id) return;
      e.preventDefault();
      row.tabIndex = -1; next.tabIndex = 0; next.focus();
    } else if ((e.key === 'Enter' || e.key === ' ') && e.target === row) {
      e.preventDefault();
      openPatientById(row.dataset.id);
    }
  });
  $('tbody').addEventListener('focusin', e => {
    const row = e.target.closest('tr[data-id]');
    if (!row) return;
    $('tbody').querySelectorAll('tr[tabindex="0"]').forEach(r => { if (r !== row) r.tabIndex = -1; });
    row.tabIndex = 0;
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
    // Un archivo con nombre, RUN y diagnósticos sale del navegador: antes se
    // generaba sin decir cuántos pacientes ni qué campos llevaba.
    const pacientes = new Set(rows.map(r => r.run || r.nombre)).size;
    const destino = EXPORT_LABEL[b.dataset.fmt] || 'un archivo de notas';
    const aviso = `¿Exportar ${rows.length} ${rows.length === 1 ? 'atención' : 'atenciones'} de ${pacientes} ${pacientes === 1 ? 'paciente' : 'pacientes'} a ${destino}?\n\nEl archivo incluye nombre, RUN y diagnósticos. Guárdalo sólo en un equipo del hospital.`;
    if (!window.confirm(aviso)) return;
    try {
      await EXPORTERS[b.dataset.fmt](rows);
      const lbl = EXPORT_LABEL[b.dataset.fmt];
      if (lbl) toast(`${lbl}: ${rows.length} atenciones`);
    } catch (err) {
      setStatus(`No se pudo exportar. ${humanError(err, 'Chrome')}`, 'err');
      toast('No se pudo exportar', { tone: 'bad' });
    }
  });

  // Closing the panel returns you to the row you came from, and says which one
  document.addEventListener('rayen:panel-closed', e => {
    if (e.detail?.id != null) revealRow(rowSelector(e.detail.id));
  });

  on('data', () => {
    // Si hay una nota a medio escribir, no se repinta: el refresco de 15 min
    // vaciaba el <tbody> con el textarea dentro y el texto se perdía sin aviso.
    // El render que hace la propia nota al terminar ya lee el estado nuevo.
    if (document.querySelector('.note-edit')) return;
    const { tipos } = buildFilters(state.allData);
    typeSelect.setOptions(tipos);
    render();
    if (state.allData.length) ['barEl', 'tblWrap', 'exportWrap'].forEach(id => { $(id).style.display = ''; });
  });
  on('notes', record => {
    render();
    revealRow(rowSelector(record.id), { scroll: false });
  });
}
