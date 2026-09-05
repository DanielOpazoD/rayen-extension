import { normalizeSexo } from '../../core/lab-parser.js';
import { formatRun } from '../../core/parser.js';
import { humanError } from '../../core/errors.js';
import { esc, $ } from '../dom.js';
import { checkLabSession, informeResultado, resetLabSession, LAB_ORIGIN } from '../../io/lab-api.js';
import { checkSyslabSession, syslabReportBytes, resetSyslabSession, SYSLAB_BASE } from '../../io/syslab-api.js';
import { createSessionMonitor } from '../../core/lab-session.js';
import { createLabSearch } from '../../io/lab-search.js';
import { buildDetails } from '../../io/lab-report.js';
import { buildAnalysis, comparisonClipboard, MAX_SELECTED_EXAMS } from '../../core/lab-analytics.js';
import { buildAnalysisSummary } from '../../core/lab-summary.js';
import { renderHsrResults, renderHhrResults, analysable } from '../lab/results.js';
import { fmtDMY, fmtIso as isoDate } from '../../core/dates.js';
import { renderComparison, renderReports, renderFilteredTrends, renderMicrobiology } from '../lab/analysis-views.js';
import { initRequest } from '../lab/request.js';
import { downloadAllPdfs } from '../lab/pdf-all.js';
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
  $('labDownloadAll').addEventListener('click', () => downloadAllPdfs(search));
  $('labAnalyze').addEventListener('click', () => analyzeSelected());
  $('labCloseAnalysis').addEventListener('click', closeAnalysis);
  $('labCopyTable').addEventListener('click', copyComparison);
  $('labCopySummary').addEventListener('click', copySummary);
  // Nombre y RUN salen los dos de la misma búsqueda: editar el campo sin volver
  // a buscar imprimía un par cruzado en un papel que viaja al laboratorio.
  initRequest({ getPaciente: () => ({
    nombre: search.results.hsr[0]?.nombrePaciente || search.results.hhr[0]?.nombrePaciente || '',
    run: search.rut.display, fecha: fmtDMY(new Date()), procedencia: '',
  }) });
  $('labPickAllHsr').addEventListener('change', e => pickAll('hsr', e.target.checked));
  $('labPickAllHhr').addEventListener('change', e => pickAll('hhr', e.target.checked));
  $('labPeriodo').addEventListener('change', applyPeriodo);
  for (const id of ['labTrendRange', 'labTrendSearch', 'labTrendAltered']) {
    $(id).addEventListener('input', () => { if (analysisView === 'tendencias') showView('tendencias'); });
  }
  applyPeriodo();
  $('labViews').addEventListener('click', e => {
    const view = e.target.closest('[data-view]')?.dataset.view;
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
  const years = Number($('labPeriodo').value);
  if (!years) {
    $('labDesde').value = '';
    $('labHasta').value = '';
    return;
  }
  const desde = new Date();
  if (years < 1) desde.setMonth(desde.getMonth() - Math.round(years * 12));
  else desde.setFullYear(desde.getFullYear() - years);
  $('labDesde').value = isoDate(desde);
  $('labHasta').value = isoDate(new Date());
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
  // Con la tabla desfasada no se genera el PDF único: llevaría el RUT de una
  // persona y los informes de otra.
  $('labDownloadAll').disabled = desfasada;
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

  $('labError').textContent = '';
  $('labHsrBody').innerHTML = '';
  $('labHhrBody').innerHTML = '';
  $('labHsrCount').textContent = '';
  $('labHhrCount').textContent = '';
  $('labDownloadAll').hidden = true;
  selected.clear();
  closeAnalysis();

  const { superseded } = await outcome.done;
  if (superseded) return; // Otra búsqueda tomó el relevo, o se canceló.
  const printable = search.results.hsr.filter(o => o.puedeImprimir).length +
    search.results.hhr.filter(o => o.puedeImprimir).length;
  $('labDownloadAll').hidden = printable < 2;
  markStaleIfRutChanged();
  updateSelectionUI();
}

// ── Selección ──

function pickAll(source, checked) {
  const rows = source === 'hsr' ? search.results.hsr : search.results.hhr;
  const ids = rows.filter(o => analysable(source, o)).map(o => String(source === 'hsr' ? o.numero : o.id));
  for (const id of ids) {
    const key = `${source}:${id}`;
    if (checked) selected.add(key); else selected.delete(key);
  }
  document.querySelectorAll(`.lab-check[data-source="${source}"]`).forEach(box => {
    if (ids.includes(box.dataset.id)) box.checked = checked;
  });
  updateSelectionUI();
}

function updateSelectionUI() {
  const btn = $('labAnalyze');
  const n = selected.size;
  btn.hidden = n === 0;
  btn.disabled = n > MAX_SELECTED_EXAMS;
  btn.textContent = n > MAX_SELECTED_EXAMS
    ? `Máximo ${MAX_SELECTED_EXAMS} informes`
    : `Analizar ${n}`;
}

// ── Análisis ──

/** Une lo seleccionado de ambos hospitales en una sola lista analizable. */
function selectedItems() {
  const items = [];
  for (const o of search.results.hsr) {
    if (selected.has(`hsr:${o.numero}`) && analysable('hsr', o)) {
      items.push({
        source: 'HSR',
        date: o.fecha ? fmtDMY(o.fecha) : '',
        time: '',
        patientName: o.nombrePaciente,
        origin: o.procedencia,
        exams: o.areas ? [o.areas] : [],
        loadBytes: async () => new Uint8Array(await (await informeResultado(o.ordenEncryptada)).arrayBuffer()),
      });
    }
  }
  for (const o of search.results.hhr) {
    if (selected.has(`hhr:${o.id}`) && analysable('hhr', o)) {
      items.push({
        source: 'HHR',
        date: o.fecha,
        time: o.hora,
        patientName: o.nombrePaciente,
        origin: o.procedencia,
        exams: o.examenes,
        loadBytes: () => syslabReportBytes(o.link),
      });
    }
  }
  return items;
}

async function analyzeSelected() {
  const items = selectedItems();
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
    $('labViews').querySelector('[data-view="microbiologia"]').hidden = !analysis.microbiology.length;
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
  $('labViews').querySelectorAll('[data-view]').forEach(b => {
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
  $('labDownloadAll').hidden = true;
  $('labPickAllHsr').checked = false;
  $('labPickAllHhr').checked = false;
  search.reset();
  patientSexo = '';
  selected.clear();
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
export async function searchFromPatient(run, sexo = '') {
  if (!run) return;
  patientSexo = sexo;
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
