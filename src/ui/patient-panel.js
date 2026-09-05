import { humanError } from '../core/errors.js';
import { patientKey } from '../io/notes.js';
import { dateToInt } from '../core/parser.js';
import { esc, $, initTablist, activateOnKey, skeletonCards } from './dom.js';
import { openPDF } from '../io/pdf.js';
import { getToken } from '../io/auth.js';
import { loadFicha } from '../io/ficha-load.js';
import { SCOPE_LABEL } from './patient-report.js';
import { initIaPanel, openIa, closeIa } from './ia-panel.js';
import { showExpired } from './loader.js';
import { session } from '../io/http.js';
import { copyToClipboard } from './toast.js';
import { renderHeader, renderDatos } from './panel/datos.js';
import { renderDx } from './panel/problemas.js';
import { renderAt } from './panel/atenciones.js';
import { renderIc } from './panel/interconsultas.js';
import { renderRx, toggleRecetaDetalle } from './panel/recetas.js';
import { olvidarRecetas } from '../io/receta.js';
import { renderNotes, initNotas } from './panel/notas.js';
import { initPdfMenu } from './panel/pdf-menu.js';
import { setFichaStatus, fichaStatusHtml } from './panel/ficha-status.js';

/**
 * Panel del paciente: el controlador. Guarda el paciente abierto y los filtros,
 * abre y cierra el diálogo, cablea los controles y reparte el pintado entre
 * los módulos de `panel/`, cada uno dueño de una pestaña.
 */

// ── State ─────────────────────────────────────────────────────
let cur = null;          // { record, key, visits, sics, contact, ficha }
let activeTab = 'dx';    // remembered across patients
let atFilter = 'medicina'; // Medicina | Otros, también recordado
let icFilter = 'mias';     // Mías | De otros
let rxFilter = 'activas';  // Activas | Vencidas
let navigate = null;     // (dir) => void, supplied by the host
let opener = null;       // quien tenía el foco al abrir; lo recupera al cerrar

// Diálogo modal de verdad: mientras está abierto, cabecera y contenido quedan
// inertes (sin foco, sin clics, sin lector de pantalla); cerrado, el propio
// panel queda inerte e invisible. Antes el fondo seguía tabulable bajo el velo y
// el panel cerrado conservaba catorce controles alcanzables con Tab.
const shielded = () => [document.getElementById('mainContent'), document.getElementById('topbar')].filter(Boolean);
const isOpen = () => $('patientPanel').classList.contains('open');

function close() {
  closeIa();
  if (!isOpen()) return;
  const id = cur?.record?.id;
  const panel = $('patientPanel');
  panel.classList.remove('open');
  $('panelBackdrop').classList.remove('open');
  panel.inert = true;
  for (const node of shielded()) node.inert = false;
  cur = null;
  // Guardar una nota repinta la tabla y la fila original deja de existir: el
  // foco vuelve a la fila del mismo paciente, buscada por su id.
  const fallback = id != null && typeof CSS !== 'undefined' ? document.querySelector(`#tbody tr[data-id="${CSS.escape(String(id))}"]`) : null;
  const target = opener?.isConnected ? opener : fallback;
  target?.focus({ preventScroll: true });
  opener = null;
  // The host brings the table back to the row this patient came from
  document.dispatchEvent(new CustomEvent('rayen:panel-closed', { detail: { id } }));
}

/**
 * Call once at app startup to wire up static panel controls.
 * @param {{ saveNote: (record: object, text: string) => Promise<boolean>, onNavigate?: (dir: number, record: object) => void }} hooks
 *   saveNote is the host's single note-writing path (it updates every row,
 *   shows the toast and offers undo); the panel never writes on its own.
 */
let labSearch = null;

export function initPanel({ saveNote, addNote, editNote, onNavigate, onLabSearch, labItems } = {}) {
  const panel = $('patientPanel');
  panel.inert = true;
  // Tab y Shift+Tab dan la vuelta dentro del diálogo.
  panel.addEventListener('keydown', e => {
    if (e.key !== 'Tab') return;
    // Con la hoja de informe abierta, el ciclo de Tab se queda dentro de ella.
    const root = $('iaSheet').hidden ? panel : $('iaSheet');
    const focusables = [...root.querySelectorAll('button,[href],input,select,textarea,[tabindex]:not([tabindex="-1"])')]
      .filter(el => !el.disabled && el.offsetParent !== null);
    if (!focusables.length) return;
    const first = focusables[0], last = focusables[focusables.length - 1];
    const at = document.activeElement;
    if (e.shiftKey && (at === first || at === panel)) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && at === last) { e.preventDefault(); first.focus(); }
  });
  navigate = onNavigate;
  labSearch = onLabSearch;
  $('ppClose').addEventListener('click', close);
  $('panelBackdrop').addEventListener('click', close);

  initNotas({ getCur: () => cur, saveNote, addNote, editNote });
  initPdfMenu({ getCur: () => cur, onError: err => setFichaStatus(`<span class="al al-bad">No se pudo generar el informe. ${esc(humanError(err, 'Eloisa'))}</span>`, 'bad') });

  // Los datos administrativos se abren desde las iniciales del paciente: un
  // botón menos en una cabecera que ya iba apretada.
  $('ppAvatar').addEventListener('click', () => {
    const hidden = $('ppDatos').toggleAttribute('hidden');
    $('ppAvatar').classList.toggle('on', !hidden);
    $('ppAvatar').setAttribute('aria-expanded', String(!hidden));
  });
  // Segmentos internos: Medicina/Otros, Mías/De otros, Activas/Vencidas.
  $('patientPanel').addEventListener('click', e => {
    const seg = e.target.closest('[data-seg][data-scope]');
    if (!seg) return;
    if (seg.dataset.scope === 'at') { atFilter = seg.dataset.seg; renderAt(cur, atFilter); }
    if (seg.dataset.scope === 'ic') { icFilter = seg.dataset.seg; renderIc(cur, icFilter); }
    if (seg.dataset.scope === 'rx') { rxFilter = seg.dataset.seg; renderRx(cur, rxFilter); }
  });

  initIaPanel({ labItems });
  $('ppIaBtn').addEventListener('click', () => {
    if (!cur) return;
    openIa({ record: cur.record, ficha: cur.ficha, visits: cur.visits, sics: cur.sics });
  });
  $('ppLabBtn').addEventListener('click', () => {
    // Se cierra antes de saltar: con el diálogo abierto el resto queda inerte y
    // la pestaña Laboratorio no se podría usar.
    if (!cur?.record?.run || !labSearch) return;
    const { run, sexo } = cur.record; // close() vacía `cur`: se lee todo antes
    close();
    labSearch(run, sexo);
  });

  // Tabs: click or ←/→; remembered across patients
  showTab = initTablist(document.querySelector('.pp-tabs'), id => {
    activeTab = id;
    document.querySelectorAll('.pp-pane').forEach(p => p.classList.toggle('active', p.dataset.pt === id));
  }, 'pt');

  // Sticky tab strip sits right under the header, whatever its height
  const head = $('ppHeader');
  const setHead = () => $('patientPanel').style.setProperty('--pp-head', `${head.offsetHeight}px`);
  if ('ResizeObserver' in window) new ResizeObserver(setHead).observe(head);
  setHead();

  activateOnKey($('patientPanel')); // Enter/Space on visit headers

  $('ppPrev').addEventListener('click', () => navigate?.(-1, cur?.record));
  $('ppNext').addEventListener('click', () => navigate?.(1, cur?.record));
  // ←/→ walk the patient list while the panel is open, unless you are typing
  document.addEventListener('keydown', e => {
    if (!cur || $('patientPanel').classList.contains('open') === false) return;
    if (/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
    if (e.key === 'ArrowLeft')  { e.preventDefault(); navigate?.(-1, cur?.record); }
    if (e.key === 'ArrowRight') { e.preventDefault(); navigate?.(1, cur?.record); }
  });

  // The RUN is the thing most often retyped elsewhere: one click copies it
  $('ppHeader').addEventListener('click', e => {
    const r = e.target.closest('.copy-run');
    if (r) { e.stopPropagation(); copyToClipboard(r.dataset.run, 'RUN copiado'); }
  });

  $('patientPanel').addEventListener('click', async e => {
    const det = e.target.closest('button[data-receta]');
    if (det) { toggleRecetaDetalle(det); return; }
    const pdf = e.target.closest('button[data-pdf]');
    if (pdf) {
      pdf.disabled = true;
      const err = await openPDF(pdf.dataset.pdf);
      pdf.disabled = false;
      if (err) { pdf.textContent = '✗'; pdf.title = err; }
      return;
    }
    const tog = e.target.closest('.pp-vhead');
    if (tog && tog.closest('.pp-visit.has-body') && !e.target.closest('button')) {
      const open = tog.closest('.pp-visit').classList.toggle('expanded');
      tog.setAttribute('aria-expanded', String(open));
      return;
    }
    if (e.target.closest('#ppReload') && cur) loadAndRenderFicha(true);
  });

  // Escape cierra lo más interno: un menú abierto o la hoja de informe antes que el panel.
  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    if (document.querySelector('.menu.open')) return;
    if (!$('iaSheet').hidden) { closeIa(); return; }
    close();
  });
}

let showTab = () => {}; // assigned in initPanel (WAI-ARIA tablist with roving tabindex)

function renderAll() {
  renderHeader(cur);
  renderDatos(cur);
  renderDx(cur);
  renderAt(cur, atFilter);
  renderIc(cur, icFilter);
  renderRx(cur, rxFilter);
}

// ── Ficha loading ─────────────────────────────────────────────

async function loadAndRenderFicha(force = false) {
  const me = cur;
  const { record } = me;
  setFichaStatus(`<span class="muted">Cargando ficha clínica…</span>`);
  // Show the shape of what is coming instead of an empty pane
  for (const id of ['ppPaneDx', 'ppPaneAt', 'ppPaneIc', 'ppPaneRx']) {
    if (!$(id).innerHTML.trim()) $(id).innerHTML = skeletonCards(3);
  }
  let token = null;
  try { token = await getToken(); } catch { /* no extension context */ }
  if (!token) { setFichaStatus(`<span class="al al-warn">Sin sesión en Eloisa — solo agenda</span>`, 'warn'); return; }
  if (!record.run && !record.idUsp) { setFichaStatus(`<span class="al al-warn">Paciente sin RUN — no se puede consultar la ficha</span>`, 'warn'); return; }
  try {
    if (force) olvidarRecetas(); // el detalle de despacho se vuelve a pedir con la ficha
    const ficha = await loadFicha(token, { run: record.run, idUsp: record.idUsp }, { force });
    if (cur !== me) return; // user moved to another patient meanwhile
    me.ficha = ficha;
    renderAll();
    if (session.expired) showExpired(); // loadFicha no lanza: la sesión muerta se lee del transporte
    const { html, tone } = fichaStatusHtml(ficha);
    setFichaStatus(html, tone);
  } catch (err) {
    if (err?.name === 'AuthError') showExpired(); // la sesión murió: que la barra lo diga y ofrezca recargar
    if (cur === me) { me.fichaFailed = true; renderRx(cur, rxFilter); setFichaStatus(`<span class="al al-bad">Ficha clínica: ${esc(humanError(err, 'Eloisa'))}</span>`, 'bad'); }
  }
}

/** Keeps the open panel's textarea in step when a note changes elsewhere (undo, inline edit). */
export function syncNote(record) {
  if (!cur || patientKey(cur.record) !== patientKey(record)) return;
  cur.record.note = record.note;
  cur.record.notas = record.notas;
  renderNotes(cur);
}

/**
 * Opens the patient panel. Renders agenda data at once, then fetches the full
 * ficha (10 years, all professionals) and re-renders every pane.
 * @param {object} record
 * @param {{ allData, sics, contacts, pos?: {i: number, n: number} }} ctx
 *   pos drives the ‹ › controls: where this patient sits in the current list.
 */
export function openPanel(record, { allData, sics = [], contacts = new Map(), pos = null }) {
  const wasOpen = isOpen();
  if (!wasOpen) opener = document.activeElement; // antes de dejar inerte el fondo, que le quita el foco
  const key = patientKey(record);
  cur = {
    record, key,
    visits: allData.filter(r => patientKey(r) === key)
      .sort((a, b) => dateToInt(b.fechaAtencion) - dateToInt(a.fechaAtencion) || b.hora.localeCompare(a.hora)),
    sics: record.run ? sics.filter(s => s.paciente.run === record.run) : [],
    contact: record.run ? contacts.get(record.run) ?? {} : {},
    ficha: null,
  };
  $('ppDatos').setAttribute('hidden', '');
  $('ppAvatar').classList.remove('on');
  $('ppAvatar').setAttribute('aria-expanded', 'false');
  $('ppPdfMenu').classList.remove('open');
  $('ppPdfMenu').querySelectorAll('button[data-scope]').forEach(b => { b.textContent = SCOPE_LABEL[b.dataset.scope]; });
  $('ppNoteText').value = '';
  renderNotes(cur);
  $('ppPos').textContent = pos ? `${pos.i + 1}/${pos.n}` : '';
  $('ppPrev').disabled = !pos || pos.i <= 0;
  $('ppNext').disabled = !pos || pos.i >= pos.n - 1;
  renderAll();
  showTab(activeTab);
  const panel = $('patientPanel');
  panel.inert = false;
  panel.classList.add('open');
  $('panelBackdrop').classList.add('open');
  if (!wasOpen) {
    for (const node of shielded()) node.inert = true;
    panel.focus({ preventScroll: true }); // el lector anuncia «diálogo, <nombre>»; Tab sigue al primer control
  }
  panel.scrollTop = 0;
  loadAndRenderFicha();
}
