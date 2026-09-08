import { normalizeSexo } from '../../core/lab-parser.js';
import { periodoDesde } from '../../core/period.js';
import { formatRun } from '../../core/parser.js';
import { humanError } from '../../core/errors.js';
import { esc, $, targetOf, closestOf, qsa } from '../dom.js';
import { initMenu, closeMenus } from '../ui.js';
import { checkLabSession, informeResultado, resetLabSession, LAB_ORIGIN } from '../../io/lab-api.js';
import { checkSyslabSession, syslabReportBytes, resetSyslabSession, SYSLAB_BASE } from '../../io/syslab-api.js';
import { createSessionMonitor } from '../../core/lab-session.js';
import { createLabSearch } from '../../io/lab-search.js';
import { buildDetails } from '../../io/lab-report.js';
import { buildAnalysis, comparisonClipboard, MAX_SELECTED_EXAMS } from '../../core/lab-analytics.js';
import { buildAnalysisSummary } from '../../core/lab-summary.js';
import { renderHsrResults, renderHhrResults } from '../lab/results.js';
import { orderKey, selectableOrders, selectedOrders, selectionCounts, printableCount } from '../../core/lab-selection.js';
import { fmtDMY, fmtIso as isoDate } from '../../core/dates.js';
import { renderComparison, renderReports, renderFilteredTrends, renderMicrobiology } from '../lab/analysis-views.js';
import { initRequest } from '../lab/request.js';
import { downloadPdfs } from '../lab/pdf-all.js';
import { labItemsFromAnalysis } from '../../ai/lab-items.js';

/**
 * Pestaña Exámenes complementarios: el controlador. Sesiones, búsqueda,
 * selección y orquestación del análisis viven aquí; las tablas, las vistas
 * del análisis, la solicitud impresa y el PDF único en `ui/lab/`.
 */
let initialized = false;
/** Claves «hsr:id» / «hhr:id» de las órdenes marcadas para analizar. */
const selected = new Set();
// Sexo del paciente para elegir la referencia por grupo: el del portal del
// Salvador si respondió, si no el de la ficha desde donde se abrió el laboratorio.
let patientSexo = '';
const sexoPaciente = () => normalizeSexo(search.results.hsr[0]?.sexo) || normalizeSexo(patientSexo);
let analysis = null;
let analysisView = 'comparacion';
/**
 * De dónde se llegó. Cuando el laboratorio se abre desde la ficha, volver a
 * ella era un camino de tres pasos (cerrar, ir a Atenciones, buscar de nuevo al
 * paciente): se ofrece la vuelta directa mientras las tablas sigan siendo suyas.
 */
let volverA = null;

const showError = (texto, tone = 'error') => { $('labError').textContent = texto; $('labError').className = `lab-msg ${tone}`; };
const tableDeps = { selected, onSelectionChange: () => updateSelectionUI(), onError: showError };

export function init() {
  if (initialized) return;
  initialized = true;

  // El mismo botón busca o cancela: una búsqueda colgada tenía antes un
  // «Buscando…» deshabilitado sin salida.
  $('labSearchBtn').addEventListener('click', () => (search.searching ? cancelSearch() : doSearch()));
  $('labRut').addEventListener('keyup', e => { if (e.key === 'Enter') doSearch(); });
  $('labRut').addEventListener('input', markStaleIfRutChanged);
  $('labClear').addEventListener('click', clearResults);
  $('labCheckHsr').addEventListener('click', () => { sessions.invalidate(); sessions.refreshHsr(); });
  $('labCheckHhr').addEventListener('click', () => { sessions.invalidate(); sessions.refreshHhr(); });
  initMenu('labSelBtn', 'labSelMenu', 'labSelWrap');
  // «Todos» son los que tienen informe: incluir las órdenes sin resultado sólo
  // añadiría fallos que ya se anuncian en la propia opción.
  $('labDownloadAll').addEventListener('click', () => { closeMenus(); pdfDe(selectableOrders(search.results).filter(({ o }) => o.puedeImprimir)); });
  $('labPdfSelected').addEventListener('click', () => { closeMenus(); pdfDe(selectedOrders(search.results, selected)); });
  $('labPickAll').addEventListener('click', () => { closeMenus(); pickAll(true); });
  $('labPickNone').addEventListener('click', () => { closeMenus(); pickAll(false); });
  $('labAnalyze').addEventListener('click', () => { closeMenus(); analyzeSelected(); });
  $('labBack').addEventListener('click', () => volverA?.abrir());
  $('labCloseAnalysis').addEventListener('click', closeAnalysis);
  $('labCopyTable').addEventListener('click', copyComparison);
  $('labCopySummary').addEventListener('click', copySummary);
  // Nombre y RUN salen los dos de la misma búsqueda: editar el campo sin volver
  // a buscar imprimía un par cruzado en un papel que viaja al laboratorio.
  initRequest({ getPaciente: () => ({
    nombre: search.results.hsr[0]?.nombrePaciente || search.results.hhr[0]?.nombrePaciente || '',
    run: search.rut.display, fecha: fmtDMY(new Date()), procedencia: '',
  }) });
  $('labPickAllHsr').addEventListener('change', e => pickAll(targetOf(e).checked, 'hsr'));
  $('labPickAllHhr').addEventListener('change', e => pickAll(targetOf(e).checked, 'hhr'));
  $('labPeriodo').addEventListener('change', applyPeriodo);
  for (const id of ['labTrendRange', 'labTrendSearch', 'labTrendAltered']) {
    $(id).addEventListener('input', () => { if (analysisView === 'tendencias') showView('tendencias'); });
  }
  applyPeriodo();
  $('labViews').addEventListener('click', e => {
    const view = closestOf(e, '[data-view]')?.dataset.view;
    if (view) showView(view);
  });
}

/** Resultados del análisis vigente para el registro clínico, sólo si son de este RUN. */
export function labItemsForRun(run) {
  return labItemsFromAnalysis(analysis, search.rut.body, run);
}

export async function onShow() {
  await sessions.check();
}

// ── Estado de sesión ── (la política vive en lab-session.js; aquí sólo se pinta)

const sessions = createSessionMonitor({
  checkHsr: checkLabSession, checkHhr: checkSyslabSession,
  resetHsr: resetLabSession, resetHhr: resetSyslabSession,
  links: { hsr: LAB_ORIGIN, hhr: SYSLAB_BASE },
  paint(source, state) {
    const el = $(source === 'hsr' ? 'labHsrStatus' : 'labHhrStatus');
    el.className = `lab-session ${state.status}`;
    el.title = state.title || '';
    if (state.href) el.innerHTML = `${esc(state.text)} — <a href="${esc(state.href)}" target="_blank" rel="noopener">abrir</a>`;
    else el.textContent = state.text;
  },
})

// ── Período ──


/** El selector rellena las fechas; editarlas a mano sigue mandando. */
function applyPeriodo() {
  const desde = periodoDesde(Number($('labPeriodo').value));
  $('labDesde').value = desde ? isoDate(desde) : '';
  $('labHasta').value = desde ? isoDate(new Date()) : '';
}

/**
 * Avisa cuando el buscador ya no corresponde a lo que hay en pantalla.
 *
 * Editar el RUT sin volver a buscar dejaba las tablas del paciente anterior sin
 * ninguna señal: quien mirara el campo y la tabla a la vez leería los exámenes
 * de una persona bajo el identificador de otra.
 */
function markStaleIfRutChanged() {
  const hayResultados = search.results.hsr.length > 0 || search.results.hhr.length > 0;
  const desfasada = hayResultados && search.isStale($('labRut').value);
  $('labResults').classList.toggle('stale', desfasada);
  $('labStale').hidden = !desfasada;
  // Con la tabla desfasada no se genera ningún PDF: llevaría el RUT de una
  // persona y los informes de otra.
  $('labDownloadAll').dataset.stale = desfasada ? '1' : '';
  updateSelectionUI();
  if (desfasada) {
    $('labStale').textContent =
      `En pantalla siguen los exámenes de ${search.rut.display}. Pulsa Buscar para el RUT que escribiste.`;
  }
}

// ── Búsqueda ── (RUT, token, cancelación y período viven en lab-search.js; aquí sólo se pinta)

const search = createLabSearch({
  onState(patch) {
    if (patch.searching !== undefined) paintSearching(patch.searching);
  },
  onHsr(r) {
    const el = $('labHsrCount');
    if (r.status === 'empty') el.textContent = 'HSR: 0 órdenes';
    else if (r.status === 'mismatch') el.textContent = 'HSR: la respuesta no corresponde al RUN consultado';
    else if (r.status === 'auth') { el.textContent = 'HSR: sin sesión en el portal del Hospital Salvador. Ábrelo e inicia sesión.'; sessions.refreshHsr(); }
    else if (r.status === 'error') el.textContent = `HSR: ${humanError(r.error, 'el portal del Hospital Salvador')}`;
    else {
      if (r.message) showError(r.message, 'info');
      el.textContent = `HSR: ${search.results.hsr.length} ${search.results.hsr.length === 1 ? 'orden' : 'órdenes'} de ${search.rut.display}`;
      renderHsrResults(search.results.hsr, tableDeps);
    }
  },
  onHhr(r) {
    const el = $('labHhrCount');
    if (r.status === 'empty') el.textContent = 'HHR: 0 órdenes';
    else if (r.status === 'auth') { el.textContent = 'HHR: sin sesión en SysLab. Abre SysLab en una pestaña e inicia sesión.'; sessions.refreshHhr(); }
    else if (r.status === 'error') el.textContent = `HHR: ${humanError(r.error, 'SysLab')}`;
    else {
      el.textContent = `HHR: ${search.results.hhr.length} ${search.results.hhr.length === 1 ? 'orden' : 'órdenes'} de ${search.rut.display}` +
        (r.ocultas ? ` · ${r.ocultas} fuera del período` : '');
      renderHhrResults(search.results.hhr, tableDeps);
    }
  },
});

// El mismo botón busca o cancela.
function paintSearching(on) {
  const btn = $('labSearchBtn');
  btn.textContent = on ? 'Cancelar' : 'Buscar';
  btn.classList.toggle('btn-primary', !on);
  btn.setAttribute('aria-label', on ? 'Cancelar la búsqueda en curso' : 'Buscar exámenes');
}

function cancelSearch() {
  search.cancel();
  if (!$('labHsrCount').textContent) $('labHsrCount').textContent = 'HSR: búsqueda cancelada.';
  if (!$('labHhrCount').textContent) $('labHhrCount').textContent = 'HHR: búsqueda cancelada.';
}

async function doSearch() {
  const rut = $('labRut').value.trim();
  if (!rut) return;
  const outcome = search.start(rut, { desde: $('labDesde').value, hasta: $('labHasta').value });
  if (outcome.rejected === 'ambiguous') {
    // Sin guion ni verificador, 7 u 8 dígitos pueden ser dos personas distintas.
    $('labError').textContent = 'Escribe el RUT completo, con guion y dígito verificador (por ejemplo 11.957.001-8). Sin él podría buscarse a otra persona.';
    return;
  }
  if (outcome.rejected) return;

  // Buscar otro RUT deja de ser «lo que abrí desde la ficha»: el botón de
  // vuelta se retira antes de que la tabla cambie de paciente.
  if (volverA && search.rut.body !== volverA.runBody) setVolver(null);

  $('labError').textContent = '';
  $('labHsrBody').innerHTML = '';
  $('labHhrBody').innerHTML = '';
  $('labHsrCount').textContent = '';
  $('labHhrCount').textContent = '';
  selected.clear();
  updateSelectionUI();
  closeAnalysis();

  const { superseded } = await outcome.done;
  if (superseded) return; // Otra búsqueda tomó el relevo, o se canceló.
  markStaleIfRutChanged();
  updateSelectionUI();
}

// ── Selección ──

/**
 * Marca o desmarca. Sin `source` alcanza a los dos hospitales, que es lo que
 * «marcar todas» tiene que significar: con una casilla por tabla, marcar todo
 * dejaba fuera el otro hospital sin decirlo.
 */
function pickAll(checked, source = null) {
  const alcance = selectableOrders(search.results).filter(x => !source || x.source === source);
  const claves = new Set(alcance.map(({ source: src, o }) => orderKey(src, o)));
  for (const clave of claves) {
    if (checked) selected.add(clave); else selected.delete(clave);
  }
  qsa(document, '.lab-check').forEach(box => {
    if (claves.has(`${box.dataset.source}:${box.dataset.id}`)) box.checked = checked;
  });
  updateSelectionUI();
}

/** Las casillas de cabecera reflejan si su tabla está entera marcada. */
function paintHeaderChecks() {
  for (const [source, id] of [['hsr', 'labPickAllHsr'], ['hhr', 'labPickAllHhr']]) {
    const filas = selectableOrders(search.results).filter(x => x.source === source);
    const marcadas = filas.filter(({ source: src, o }) => selected.has(orderKey(src, o))).length;
    const caja = /** @type {HTMLInputElement} */ ($(id));
    caja.checked = filas.length > 0 && marcadas === filas.length;
    caja.indeterminate = marcadas > 0 && marcadas < filas.length;
  }
}

function updateSelectionUI() {
  const c = selectionCounts(search.results, selected);
  const total = printableCount(search.results);
  $('labSelWrap').hidden = c.marcables === 0;
  const _caret = '<svg class="i i-sm caret" viewBox="0 0 24 24" aria-hidden="true"><polyline points="6 9 12 15 18 9"/></svg>';
  $('labSelBtn').innerHTML = c.marcadas
    ? `${c.marcadas} marcada${c.marcadas === 1 ? '' : 's'} ${_caret}`
    : `Informes ${_caret}`;

  const desfasada = $('labDownloadAll').dataset.stale === '1';
  const item = (id, disabled, hint) => {
    /** @type {HTMLButtonElement} */ ($(id)).disabled = disabled;
    $(`${id}Hint`).textContent = hint;
  };
  item('labPickAll', c.todasMarcadas, `${c.marcables} en total · Salvador y Hanga Roa`);
  item('labPdfSelected', desfasada || c.imprimibles === 0,
    c.marcadas === 0 ? 'marca al menos una orden'
      : c.imprimibles === c.marcadas ? `${c.imprimibles} informe${c.imprimibles === 1 ? '' : 's'}`
        : `${c.imprimibles} de ${c.marcadas} tienen informe`);
  item('labAnalyze', c.marcadas === 0 || c.marcadas > MAX_SELECTED_EXAMS,
    c.marcadas === 0 ? 'marca al menos una orden'
      : c.marcadas > MAX_SELECTED_EXAMS ? `máximo ${MAX_SELECTED_EXAMS}` : `${c.marcadas} informes`);
  item('labDownloadAll', desfasada || total === 0, `${total} informe${total === 1 ? '' : 's'} disponibles`);
  /** @type {HTMLButtonElement} */ ($('labPickNone')).disabled = c.marcadas === 0;
  paintHeaderChecks();
}

// ── Vuelta a la ficha ──

/**
 * El botón sólo tiene sentido mientras lo que se ve en pantalla sea del mismo
 * paciente. Si se busca otro RUT o se limpia, desaparece: un «volver a la
 * ficha» que abriera a otra persona sería peor que no tenerlo.
 */
function setVolver(destino) {
  volverA = destino;
  $('labBack').hidden = !destino;
  if (destino) $('labBackName').textContent = `Volver a ${destino.nombre}`;
}

/** El PDF único, sea de lo marcado o de todo: la diferencia es qué órdenes llegan. */
function pdfDe(ordenes) {
  const btn = $('labSelBtn');
  const etiqueta = btn.innerHTML;
  btn.setAttribute('disabled', '');
  return downloadPdfs(
    ordenes.map(({ source, o }) => ({ source: source.toUpperCase(), puedeImprimir: o.puedeImprimir, loadBytes: loadBytesDe(source, o) })),
    { rutDisplay: search.rut.display, progreso: t => { btn.textContent = t; } }
  ).finally(() => { btn.removeAttribute('disabled'); btn.innerHTML = etiqueta; updateSelectionUI(); });
}

const loadBytesDe = (source, o) => source === 'hsr'
  ? async () => new Uint8Array(await (await informeResultado(o.ordenEncryptada)).arrayBuffer())
  : () => syslabReportBytes(o.link);

// ── Análisis ──

/** Une lo seleccionado de ambos hospitales en una sola lista analizable. Recibe los datos: no lee el estado del módulo. */
function selectedItems(results, selected) {
  return selectedOrders(results, selected).map(({ source, o }) => source === 'hsr'
    ? {
      source: 'HSR',
      date: o.fecha ? fmtDMY(o.fecha) : '',
      time: '',
      patientName: o.nombrePaciente,
      origin: o.procedencia,
      exams: o.areas ? [o.areas] : [],
      loadBytes: loadBytesDe('hsr', o),
    }
    : {
      source: 'HHR',
      date: o.fecha,
      time: o.hora,
      patientName: o.nombrePaciente,
      origin: o.procedencia,
      exams: o.examenes,
      loadBytes: loadBytesDe('hhr', o),
    });
}

async function analyzeSelected() {
  const items = selectedItems(search.results, selected);
  if (!items.length) return;

  const btn = $('labAnalyze');
  btn.disabled = true;
  $('labAnalysisWarn').textContent = '';

  // Identificadores sintéticos: dos hospitales pueden emitir el mismo número de
  // orden, y sin esto sus informes se mezclarían en la misma columna.
  const exams = items.map((it, i) => ({
    id: String(i + 1),
    date: it.date,
    time: it.time,
    patientName: it.patientName,
    origin: `${it.source} · ${it.origin}`,
    exams: it.exams,
  }));
  // El RUN se toma de la búsqueda que produjo estas filas, no del campo: si
  // alguien edita el buscador sin volver a buscar, el análisis seguiría siendo
  // del paciente cuyos informes están en pantalla.
  const expectedRutBody = search.rut.body;

  try {
    const { details, errors } = await buildDetails(
      items.map((it, i) => ({ examId: String(i + 1), expectedRutBody, loadBytes: it.loadBytes, sexo: sexoPaciente() })),
      (done, total) => { btn.textContent = `Analizando ${done}/${total}…`; }
    );

    if (!details.length) {
      throw new Error(errors[0]?.message || 'Ningún informe se pudo interpretar.');
    }
    analysis = buildAnalysis(details, exams);
    analysis.sourceByExamId = Object.fromEntries(exams.map((e, i) => [e.id, items[i].source]));

    reportHonestly(details, errors, items.length);
    /** @type {HTMLElement} */ ($('labViews').querySelector('[data-view="microbiologia"]')).hidden = !analysis.microbiology.length;
    if (analysisView === 'microbiologia' && !analysis.microbiology.length) analysisView = 'comparacion';
    $('labAnalysis').hidden = false;
    showView(analysisView);
    $('labAnalysis').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  } catch (err) {
    $('labAnalysisWarn').textContent = `No se pudo analizar. ${humanError(err, 'el laboratorio')}`;
    $('labAnalysisWarn').className = 'lab-msg error';
  } finally {
    updateSelectionUI();
  }
}

/**
 * Un análisis clínico incompleto que se presenta como completo es peor que uno
 * que declara lo que le falta. Se dice cuántos informes quedaron fuera y
 * cuántos no pudieron confirmar la identidad del paciente.
 */
function reportHonestly(details, errors, requested) {
  const unverified = details.filter(d => !d.rutVerified).length;
  const partes = [];
  if (errors.length) {
    partes.push(`${details.length} de ${requested} informes interpretados; ${errors.length} quedaron fuera (${errors.map(e => humanError(e, 'el laboratorio')).join('; ')})`);
  }
  if (unverified) {
    partes.push(`${unverified} informe${unverified !== 1 ? 's' : ''} sin RUT legible: no se pudo confirmar que corresponda${unverified !== 1 ? 'n' : ''} al paciente`);
  }
  const warn = $('labAnalysisWarn');
  warn.textContent = partes.join('. ');
  warn.className = partes.length ? 'lab-msg error' : 'lab-msg';
}

function showView(view) {
  analysisView = view;
  qsa($('labViews'), '[data-view]').forEach(b => {
    b.setAttribute('aria-selected', String(b.dataset.view === view));
  });
  const body = $('labAnalysisBody');
  if (!analysis) { body.innerHTML = ''; return; }

  const s = analysis.summary;
  $('labAnalysisMeta').textContent =
    `${s.reportCount} informes · ${s.findingCount} resultados · ${s.alertCount} fuera de rango`;

  $('labTrendBar').hidden = view !== 'tendencias';
  if (view === 'tendencias') body.innerHTML = renderFilteredTrends(analysis);
  else if (view === 'microbiologia') body.innerHTML = renderMicrobiology(analysis);
  else if (view === 'informes') body.innerHTML = renderReports(analysis);
  else body.innerHTML = renderComparison(analysis);
}

async function copySummary() {
  if (!analysis) return;
  const btn = $('labCopySummary');
  const texto = buildAnalysisSummary(analysis, { markAlerts: true });
  if (!texto) {
    btn.textContent = 'Sin datos';
    setTimeout(() => { btn.textContent = 'Resumen'; }, 2000);
    return;
  }
  try {
    await navigator.clipboard.writeText(texto);
    btn.textContent = 'Copiado';
  } catch {
    btn.textContent = 'No se pudo copiar';
  }
  setTimeout(() => { btn.textContent = 'Resumen'; }, 2000);
}

async function copyComparison() {
  if (!analysis) return;
  const btn = $('labCopyTable');
  try {
    await navigator.clipboard.writeText(comparisonClipboard(analysis));
    btn.textContent = 'Copiado';
  } catch {
    btn.textContent = 'No se pudo copiar';
  }
  setTimeout(() => { btn.textContent = 'Copiar'; }, 2000);
}

function closeAnalysis() {
  analysis = null;
  $('labAnalysis').hidden = true;
  $('labAnalysisBody').innerHTML = '';
  $('labAnalysisWarn').textContent = '';
}

// ── Limpiar ──

function clearResults() {
  $('labRut').value = '';
  $('labHsrBody').innerHTML = '';
  $('labHhrBody').innerHTML = '';
  $('labHsrCount').textContent = '';
  $('labHhrCount').textContent = '';
  $('labError').textContent = '';
  search.reset();
  patientSexo = '';
  selected.clear();
  setVolver(null);
  closeAnalysis();
  updateSelectionUI();
}

/**
 * Búsqueda desde el panel del paciente.
 *
 * Se comprueba la sesión antes de buscar: disparar la consulta a ciegas produce
 * una ráfaga de errores de sesión que no dice nada útil. Si ningún laboratorio
 * responde, se explica qué abrir en vez de buscar.
 */
export async function searchFromPatient(run, sexo = '', volver = null) {
  if (!run) return;
  patientSexo = sexo;
  setVolver(volver);
  $('labRut').value = formatRun(run).runStr || run;
  $('labError').textContent = '';
  const { hsr, hhr } = await sessions.check();
  if (!hsr && !hhr) {
    $('labError').textContent =
      'Ningún laboratorio conectado. Abre ProactiveLIS o SysLab, inicia sesión y vuelve a intentar.';
    $('labError').className = 'lab-msg error';
    return;
  }
  await doSearch();
}
