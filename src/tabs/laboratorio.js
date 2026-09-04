import { humanCase } from '../parser.js';
import { humanError } from '../errors.js';
import { esc, $ } from '../dom.js';
import { on } from '../state.js';
import {
  checkLabSession, buscarOrdenesPorRut, normalizeOrden, ordersMatchRut,
  informeResultado, resetLabSession, LAB_ORIGIN,
} from '../lab-api.js';
import {
  checkSyslabSession, buscarExamenesPorRut, normalizeSyslabExam,
  syslabPdfUrl, syslabReportBytes, resetSyslabSession, SYSLAB_BASE,
} from '../syslab-api.js';
import { mergePdfs } from '../pdf-merge.js';
import { buildDetails } from '../lab-report.js';
import {
  buildAnalysis, comparisonClipboard, normalizePatientRutBody, rutInputAmbiguous, MAX_SELECTED_EXAMS,
} from '../lab-analytics.js';
import { renderTrendGroups } from '../lab-charts.js';
import {
  buildTrendGroups, filterTrendGroups, latestTrendTimestamp, countTrendVariables,
} from '../lab-trends.js';
import { buildAnalysisSummary } from '../lab-summary.js';
import { toggleExamSelection } from '../exam-request.js';
import {
  renderExamRequestForm, buildExamRequestPrintFragment, EXAM_REQUEST_PRINT_CSS,
} from '../exam-request-view.js';
import { openReport } from '../export.js';

let initialized = false;
let hsrResults = [];
let hhrResults = [];
/** Claves «hsr:id» / «hhr:id» de las órdenes marcadas para analizar. */
const selected = new Set();
/**
 * Identidad de la búsqueda vigente.
 *
 * Cada búsqueda toma un número y el cuerpo del RUT que la originó. Una respuesta
 * que llega cuando ya empezó otra búsqueda se descarta: sin esto, abrir el
 * laboratorio de un paciente y pasar al siguiente antes de que respondiera
 * pintaba las órdenes del primero bajo el RUT del segundo.
 */
let searchRun = 0;
let searchRutBody = '';
let searching = false;
let searchRutDisplay = '';
let analysis = null;
let analysisView = 'comparacion';

export function init() {
  if (initialized) return;
  initialized = true;

  // El mismo botón busca o cancela: una búsqueda colgada tenía antes un
  // «Buscando…» deshabilitado sin salida.
  $('labSearchBtn').addEventListener('click', () => (searching ? cancelSearch() : doSearch()));
  $('labRut').addEventListener('keyup', e => { if (e.key === 'Enter') doSearch(); });
  $('labRut').addEventListener('input', markStaleIfRutChanged);
  $('labClear').addEventListener('click', clearResults);
  $('labCheckHsr').addEventListener('click', () => { lastCheck.at = 0; updateHsrSession(); });
  $('labCheckHhr').addEventListener('click', () => { lastCheck.at = 0; updateHhrSession(); });
  $('labDownloadAll').addEventListener('click', () => downloadAllPdfs());
  $('labAnalyze').addEventListener('click', () => analyzeSelected());
  $('labCloseAnalysis').addEventListener('click', closeAnalysis);
  $('labCopyTable').addEventListener('click', copyComparison);
  $('labCopySummary').addEventListener('click', copySummary);
  $('labRequestOpen').addEventListener('click', openRequest);
  $('labRequestClose').addEventListener('click', () => { $('labRequest').hidden = true; });
  $('labRequestClear').addEventListener('click', () => { requestSelected = new Set(); renderRequest(); });
  $('labRequestPrint').addEventListener('click', printRequest);
  // Delegación: son 67 casillas y un solo escucha basta.
  $('labRequestBody').addEventListener('change', e => {
    const key = e.target.dataset?.key;
    if (!key) return;
    requestSelected = toggleExamSelection(requestSelected, key);
    updateRequestCount();
  });
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

  on('data', () => {});
}

export async function onShow() {
  await checkSessions();
}

/**
 * Comprueba ambas sesiones, reutilizando el resultado durante unos segundos.
 *
 * Abrir el laboratorio desde el panel del paciente dispara la comprobación por
 * dos caminos a la vez, y la de SysLab inyecta un script en la pestaña del
 * usuario. Sin esta ventana, un clic costaba cuatro comprobaciones.
 */
const SESSION_CACHE_MS = 5000;
let lastCheck = { at: 0, result: null };

async function checkSessions() {
  const now = Date.now();
  if (lastCheck.result && now - lastCheck.at < SESSION_CACHE_MS) return lastCheck.result;
  const [hsr, hhr] = await Promise.all([updateHsrSession(), updateHhrSession()]);
  lastCheck = { at: now, result: { hsr, hhr } };
  return lastCheck.result;
}

// ── Estado de sesión ──

async function updateHsrSession() {
  const el = $('labHsrStatus');
  el.textContent = 'Verificando…';
  el.className = 'lab-session checking';
  try {
    const ok = await checkLabSession();
    if (ok) {
      el.textContent = 'HSR conectado';
      el.className = 'lab-session ok';
      resetLabSession();
      return true;
    }
    el.innerHTML = `HSR sin sesión — <a href="${esc(LAB_ORIGIN)}" target="_blank" rel="noopener">abrir</a>`;
    el.className = 'lab-session expired';
  } catch {
    el.textContent = 'HSR no disponible';
    el.className = 'lab-session expired';
  }
  return false;
}

async function updateHhrSession() {
  const el = $('labHhrStatus');
  el.textContent = 'Verificando…';
  el.className = 'lab-session checking';
  try {
    await checkSyslabSession();
    el.textContent = 'HHR conectado';
    el.className = 'lab-session ok';
    resetSyslabSession();
    return true;
  } catch (err) {
    if (err.name === 'SyslabAuthError') {
      el.innerHTML = `HHR: ${esc(humanError(err, 'SysLab'))} — <a href="${esc(SYSLAB_BASE)}" target="_blank" rel="noopener">abrir</a>`;
    } else {
      el.textContent = `HHR: ${humanError(err, 'SysLab')}`;
    }
    el.className = 'lab-session expired';
  }
  return false;
}

// ── Período ──

const isoDate = d => d.getFullYear() + '-' +
  String(d.getMonth() + 1).padStart(2, '0') + '-' +
  String(d.getDate()).padStart(2, '0');

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
 * SysLab no admite filtro de fechas en el servidor: devuelve todas las órdenes
 * del RUT. Para que ambas tablas muestren el mismo período, el rango se aplica
 * aquí sobre lo que ya llegó.
 */
function withinRange(fechaDdMmAaaa, desde, hasta) {
  if (!desde && !hasta) return true;
  const m = String(fechaDdMmAaaa || '').match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return true; // Sin fecha legible no se oculta: es peor perder un examen.
  const iso = `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  if (desde && iso < desde) return false;
  if (hasta && iso > hasta) return false;
  return true;
}

/**
 * Avisa cuando el buscador ya no corresponde a lo que hay en pantalla.
 *
 * Editar el RUT sin volver a buscar dejaba las tablas del paciente anterior sin
 * ninguna señal: quien mirara el campo y la tabla a la vez leería los exámenes
 * de una persona bajo el identificador de otra.
 */
function markStaleIfRutChanged() {
  const vigente = searchRutDisplay &&
    normalizePatientRutBody($('labRut').value) === searchRutBody;
  const hayResultados = hsrResults.length > 0 || hhrResults.length > 0;
  const desfasada = Boolean(hayResultados && !vigente);
  $('labResults').classList.toggle('stale', desfasada);
  $('labStale').hidden = !desfasada;
  // Con la tabla desfasada no se genera el PDF único: llevaría el RUT de una
  // persona y los informes de otra.
  $('labDownloadAll').disabled = desfasada;
  if (hayResultados && !vigente) {
    $('labStale').textContent =
      `En pantalla siguen los exámenes de ${searchRutDisplay}. Pulsa Buscar para el RUT que escribiste.`;
  }
}

// ── Búsqueda ──

function setSearching(on) {
  searching = on;
  const btn = $('labSearchBtn');
  btn.textContent = on ? 'Cancelar' : 'Buscar';
  btn.classList.toggle('btn-primary', !on);
  btn.setAttribute('aria-label', on ? 'Cancelar la búsqueda en curso' : 'Buscar exámenes');
}

/** Invalida la búsqueda en curso: lo que llegue después se descarta por el token `searchRun`. */
function cancelSearch() {
  searchRun += 1;
  setSearching(false);
  if (!$('labHsrCount').textContent) $('labHsrCount').textContent = 'HSR: búsqueda cancelada.';
  if (!$('labHhrCount').textContent) $('labHhrCount').textContent = 'HHR: búsqueda cancelada.';
}

async function doSearch() {
  const rut = $('labRut').value.trim();
  if (!rut) return;
  // Sin guion ni verificador, 7 u 8 dígitos pueden ser dos personas distintas.
  // Antes se resolvía por módulo 11 y una de cada once veces buscaba a otra.
  if (rutInputAmbiguous(rut)) {
    $('labError').textContent = 'Escribe el RUT con guion y dígito verificador (por ejemplo 11.957.001-8): sin él no se sabe si la última cifra es parte del RUT y se buscaría a otra persona.';
    return;
  }

  setSearching(true);
  $('labError').textContent = '';
  $('labHsrBody').innerHTML = '';
  $('labHhrBody').innerHTML = '';
  $('labHsrCount').textContent = '';
  $('labHhrCount').textContent = '';
  $('labDownloadAll').hidden = true;
  selected.clear();
  closeAnalysis();

  // El dígito verificador se quita sólo si de verdad lo es: cortar el último
  // carácter a ciegas mutila el RUT de quien lo escribe sin verificador.
  const rutBodyOnly = normalizePatientRutBody(rut);
  const run = ++searchRun;
  searchRutBody = rutBodyOnly;
  searchRutDisplay = rut;

  await Promise.allSettled([
    searchHsr(run, rut, rutBodyOnly, $('labDesde').value, $('labHasta').value),
    searchHhr(run, rutBodyOnly, $('labDesde').value, $('labHasta').value),
  ]);

  if (run !== searchRun) return; // Otra búsqueda tomó el relevo, o se canceló.
  setSearching(false);
  const printable = hsrResults.filter(o => o.puedeImprimir).length +
    hhrResults.filter(o => o.puedeImprimir).length;
  $('labDownloadAll').hidden = printable < 2;
  markStaleIfRutChanged();
  updateSelectionUI();
}

async function searchHsr(run, rut, rutBody, desde, hasta) {
  try {
    const raw = await buscarOrdenesPorRut(rut, { desde: desde || undefined, hasta: hasta || undefined });
    if (run !== searchRun) return; // Respuesta de una búsqueda ya reemplazada.
    if (!Array.isArray(raw) || raw.length === 0) {
      hsrResults = [];
      $('labHsrCount').textContent = 'HSR: 0 órdenes';
      return;
    }
    if (!ordersMatchRut(raw, rutBody)) {
      hsrResults = [];
      $('labHsrCount').textContent = 'HSR: la respuesta no corresponde al RUN consultado';
      return;
    }
    hsrResults = raw.map(normalizeOrden);
    const msg = raw[0]?.mensajeBusqueda;
    if (msg) {
      $('labError').textContent = msg;
      $('labError').className = 'lab-msg info';
    }
    $('labHsrCount').textContent =
      `HSR: ${hsrResults.length} ${hsrResults.length === 1 ? 'orden' : 'órdenes'} de ${searchRutDisplay}`;
    renderHsrResults(hsrResults);
  } catch (err) {
    if (run !== searchRun) return;
    hsrResults = [];
    if (err.name === 'LabAuthError') {
      $('labHsrCount').textContent = 'HSR: sin sesión en el portal del Hospital Salvador. Ábrelo e inicia sesión.';
      await updateHsrSession();
    } else {
      $('labHsrCount').textContent = `HSR: ${humanError(err, 'el portal del Hospital Salvador')}`;
    }
  }
}

async function searchHhr(run, rutBody, desde, hasta) {
  try {
    const raw = await buscarExamenesPorRut(rutBody);
    if (run !== searchRun) return; // Respuesta de una búsqueda ya reemplazada.
    if (!Array.isArray(raw) || raw.length === 0) {
      hhrResults = [];
      $('labHhrCount').textContent = 'HHR: 0 órdenes';
      return;
    }
    const todas = raw.map(normalizeSyslabExam);
    hhrResults = todas.filter(o => withinRange(o.fecha, desde, hasta));
    const ocultas = todas.length - hhrResults.length;
    $('labHhrCount').textContent =
      `HHR: ${hhrResults.length} ${hhrResults.length === 1 ? 'orden' : 'órdenes'} de ${searchRutDisplay}` +
      (ocultas ? ` · ${ocultas} fuera del período` : '');
    renderHhrResults(hhrResults);
  } catch (err) {
    if (run !== searchRun) return;
    hhrResults = [];
    if (err.name === 'SyslabAuthError') {
      $('labHhrCount').textContent = 'HHR: sin sesión en SysLab. Abre SysLab en una pestaña e inicia sesión.';
      await updateHhrSession();
    } else {
      $('labHhrCount').textContent = `HHR: ${humanError(err, 'SysLab')}`;
    }
  }
}

// ── Tablas ──

/**
 * Sólo se ofrece marcar lo que se puede analizar. Una casilla sobre una orden
 * sin informe descargable haría que el contador prometiera más informes de los
 * que el análisis puede incluir.
 */
const pickCell = (source, id, enabled) => enabled
  ? `<td class="lab-pick"><input type="checkbox" class="lab-check" data-source="${source}" data-id="${esc(String(id))}" aria-label="Seleccionar orden ${esc(String(id))}"></td>`
  : '<td class="lab-pick"></td>';

function renderHsrResults(ordenes) {
  const tbody = $('labHsrBody');
  tbody.innerHTML = ordenes.map((o, i) => {
    const pdfBtn = o.puedeImprimir
      ? `<button class="btn-mini lab-pdf" data-source="hsr" data-enc="${esc(o.ordenEncryptada)}" title="Descargar PDF">PDF</button>`
      : '<span class="muted">—</span>';
    const progreso = `${o.validadas}/${o.totalPrestaciones}`;
    const tienePrest = o.prestaciones && o.prestaciones.length > 0;
    return `<tr>
      ${pickCell('hsr', o.numero, analysable('hsr', o))}
      <td>${esc(o.fecha ? fmtFecha(o.fecha) : '')}</td>
      <td>${esc(o.numero)}</td>
      <td class="lab-nombre">${esc(humanCase(o.nombrePaciente))}</td>
      <td class="lab-progreso">${tienePrest
        ? `<button type="button" class="lab-expand" data-row="${i}" aria-expanded="false" title="Ver prestaciones">${esc(progreso)}</button>`
        : `<span>${esc(progreso)}</span>`}</td>
      <td>${o.rechazadas > 0 ? `<strong class="lab-rech">${o.rechazadas}</strong>` : '0'}</td>
      <td>${esc(humanCase(o.procedencia))}</td>
      <td>${esc(humanCase(o.areas, { siglas: true }))}</td>
      <td>${pdfBtn}</td>
    </tr>
    ${tienePrest ? `<tr class="lab-detail" id="labPrest${i}" hidden><td colspan="9">
      ${renderPrestaciones(o.prestaciones)}
    </td></tr>` : ''}`;
  }).join('');
  wireRows(tbody, 'hsr');
  tbody.querySelectorAll('.lab-expand').forEach(btn => {
    btn.addEventListener('click', () => {
      const row = $(`labPrest${btn.dataset.row}`);
      const abierto = !row.hidden;
      row.hidden = abierto;
      btn.setAttribute('aria-expanded', String(!abierto));
    });
  });
}

/** Detalle de prestaciones de una orden: qué se pidió y en qué estado está. */
function renderPrestaciones(prestaciones) {
  return `<table class="lab-table lab-prest-table">
    <thead><tr><th>Prestación</th><th>Estado</th><th>Validación</th><th>Derivación</th></tr></thead>
    <tbody>${prestaciones.map(p => `<tr>
      <td>${esc(humanCase(p.nombre, { siglas: true }))}</td>
      <td class="${/rechaz/i.test(p.estado) ? 'lab-out' : ''}">${esc(humanCase(p.estado))}</td>
      <td>${esc(p.fechaValidacion)}</td>
      <td>${esc(p.derivacion)}</td>
    </tr>`).join('')}</tbody>
  </table>`;
}

function renderHhrResults(ordenes) {
  const tbody = $('labHhrBody');
  tbody.innerHTML = ordenes.map(o => {
    const examList = o.examenes.map(x => humanCase(x, { siglas: true })).join(', ');
    const pdfBtn = o.puedeImprimir
      ? `<button class="btn-mini lab-pdf" data-source="hhr" data-link="${esc(o.link)}" title="Ver informe">PDF</button>`
      : '<span class="muted">—</span>';
    return `<tr>
      ${pickCell('hhr', o.id, analysable('hhr', o))}
      <td>${esc(o.fecha)}</td>
      <td>${esc(o.id)}</td>
      <td class="lab-nombre">${esc(humanCase(o.nombrePaciente))}</td>
      <td>${esc(o.hora)}</td>
      <td>${esc(humanCase(o.procedencia))}</td>
      <td class="lab-exams" title="${esc(examList)}">${esc(examList.length > 60 ? examList.slice(0, 57) + '…' : examList)}</td>
      <td>${pdfBtn}</td>
    </tr>`;
  }).join('');
  wireRows(tbody, 'hhr');
}

function wireRows(tbody, source) {
  tbody.querySelectorAll('.lab-pdf').forEach(btn => {
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      btn.textContent = '…';
      try {
        if (source === 'hsr') {
          const blob = await informeResultado(btn.dataset.enc);
          window.open(URL.createObjectURL(blob), '_blank');
        } else {
          window.open(syslabPdfUrl(btn.dataset.link), '_blank');
        }
      } catch (err) {
        $('labError').textContent = `No se pudo obtener el PDF. ${humanError(err, 'el laboratorio')}`;
        $('labError').className = 'lab-msg error';
      } finally {
        btn.disabled = false;
        btn.textContent = 'PDF';
      }
    });
  });
  tbody.querySelectorAll('.lab-check').forEach(box => {
    box.addEventListener('change', () => {
      const key = `${box.dataset.source}:${box.dataset.id}`;
      if (box.checked) selected.add(key); else selected.delete(key);
      updateSelectionUI();
    });
  });
}

// ── Selección ──

function pickAll(source, checked) {
  const rows = source === 'hsr' ? hsrResults : hhrResults;
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

/** Sólo se puede analizar una orden de la que se pueda obtener el informe. */
const analysable = (source, o) => source === 'hsr' ? Boolean(o.ordenEncryptada) : Boolean(o.link);

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
  for (const o of hsrResults) {
    if (selected.has(`hsr:${o.numero}`) && analysable('hsr', o)) {
      items.push({
        source: 'HSR',
        date: o.fecha ? fmtFecha(o.fecha) : '',
        time: '',
        patientName: o.nombrePaciente,
        origin: o.procedencia,
        exams: o.areas ? [o.areas] : [],
        loadBytes: async () => new Uint8Array(await (await informeResultado(o.ordenEncryptada)).arrayBuffer()),
      });
    }
  }
  for (const o of hhrResults) {
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
  const expectedRutBody = searchRutBody;

  try {
    const { details, errors } = await buildDetails(
      items.map((it, i) => ({ examId: String(i + 1), expectedRutBody, loadBytes: it.loadBytes })),
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
  if (view === 'tendencias') body.innerHTML = renderFilteredTrends();
  else if (view === 'microbiologia') body.innerHTML = renderMicrobiology(analysis);
  else if (view === 'informes') body.innerHTML = renderReports(analysis);
  else body.innerHTML = renderComparison(analysis);
}

function renderComparison(a) {
  if (!a.comparison.length) return '<p class="muted">Sin resultados interpretables.</p>';
  const head = a.columns.map(c =>
    `<th title="${esc(c.examNames.join(', '))}">${esc(c.label)}<br><span class="muted">${esc(a.sourceByExamId?.[c.key] || '')}</span></th>`
  ).join('');
  const rows = a.comparison.map(row => `<tr>
    <th scope="row" class="lab-var">${esc(row.analysis)}
      <span class="muted">${esc([row.section, row.unit].filter(Boolean).join(' · '))}</span></th>
    ${a.columns.map(c => {
      const f = row.values[c.key];
      if (!f) return '<td class="lab-gap">—</td>';
      return `<td class="${f.alert ? 'lab-out' : ''}" title="${esc(f.refValue ? `Referencia ${f.refValue}` : 'Sin referencia')}">${esc(f.result)}</td>`;
    }).join('')}
  </tr>`).join('');
  return `<div class="tbl-wrap"><table class="lab-table lab-matrix">
    <thead><tr><th>Variable</th>${head}</tr></thead><tbody>${rows}</tbody></table></div>`;
}

function renderReports(a) {
  return a.reports.map(r => {
    const alertas = r.findings.filter(f => f.alert);
    return `<details class="lab-report"${alertas.length ? ' open' : ''}>
      <summary><strong>${esc(r.label)}</strong>
        <span class="muted">${esc(a.sourceByExamId?.[r.examId] || '')} · ${r.findings.length} resultados${alertas.length ? ` · ${alertas.length} fuera de rango` : ''}</span>
      </summary>
      <div class="tbl-wrap"><table class="lab-table">
        <thead><tr><th>Sección</th><th>Analito</th><th>Resultado</th><th>Unidad</th><th>Referencia</th></tr></thead>
        <tbody>${r.findings.map(f => `<tr class="${f.alert ? 'lab-out-row' : ''}">
          <td>${esc(f.section)}</td><td>${esc(f.analysis)}</td>
          <td class="${f.alert ? 'lab-out' : ''}">${esc(f.result)}</td>
          <td>${esc(f.unit)}</td><td>${esc(f.refValue)}</td></tr>`).join('')}</tbody>
      </table></div>
    </details>`;
  }).join('');
}

/**
 * Tarjetas de cultivo, antibiograma y PCR viral.
 *
 * Se muestra la tarjeta aunque venga sin hallazgos: el texto del cultivo suele
 * llegar sólo dentro del PDF, y esconderla haría desaparecer de la vista un
 * hemocultivo que sí se pidió.
 */
/**
 * Tendencias agrupadas por familia clínica y acotadas por la barra de filtros.
 *
 * La ventana temporal se ancla en el examen más reciente del paciente, no en la
 * fecha de hoy: alguien sin exámenes de esta semana vería la vista vacía.
 */
function renderFilteredTrends() {
  const grupos = buildTrendGroups(analysis.trends);
  const visibles = filterTrendGroups(grupos, {
    range: $('labTrendRange').value,
    search: $('labTrendSearch').value,
    onlyAltered: $('labTrendAltered').checked,
    anchor: latestTrendTimestamp(grupos),
  });
  const total = countTrendVariables(grupos);
  const vistas = countTrendVariables(visibles);
  $('labTrendCount').textContent = vistas === total
    ? `${total} variable${total !== 1 ? 's' : ''}`
    : `${vistas} de ${total} variables`;
  return renderTrendGroups(visibles);
}

function renderMicrobiology(a) {
  if (!a.microbiology || !a.microbiology.length) {
    return '<p class="muted">Ningún examen microbiológico en los informes seleccionados.</p>';
  }
  return `<div class="lab-micro-grid">${a.microbiology.map(e => `
    <article class="lab-micro${e.hasAlertFinding ? ' alerta' : ''}">
      <header><strong>${esc(e.examLabel)}</strong><span class="muted">${esc(e.date)}</span></header>
      ${e.findings.length
        ? `<dl>${e.findings.map(f =>
            `<dt>${esc(f.analysis)}</dt><dd>${esc(f.result)}</dd>`).join('')}</dl>`
        : '<p class="muted">Sin resultado legible en el informe: ábrelo en PDF.</p>'}
    </article>`).join('')}</div>`;
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

// ── Solicitud de exámenes ──

/** Exámenes marcados en el formulario de solicitud. */
let requestSelected = new Set();

function openRequest() {
  $('labRequest').hidden = false;
  renderRequest();
  $('labRequest').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function renderRequest() {
  $('labRequestBody').innerHTML = renderExamRequestForm(requestSelected);
  updateRequestCount();
}

function updateRequestCount() {
  const n = requestSelected.size;
  $('labRequestCount').textContent = `${n} examen${n !== 1 ? 'es' : ''}`;
  $('labRequestPrint').disabled = n === 0;
}

/**
 * La solicitud se imprime; no se envía a ningún sistema. Se reutiliza el mismo
 * camino que el resto de los impresos: el fragmento se guarda, `report.html` lo
 * dibuja, lo borra del almacenamiento y abre el diálogo de impresión.
 */
async function printRequest() {
  if (!requestSelected.size) return;
  const fragment = buildExamRequestPrintFragment({
    selected: requestSelected,
    // Nombre y RUN salen los dos de la misma búsqueda. Antes el nombre venía de
    // la tabla y el RUN del buscador, así que editar el campo sin volver a
    // buscar imprimía un par cruzado en un papel que viaja al laboratorio.
    paciente: {
      nombre: hsrResults[0]?.nombrePaciente || hhrResults[0]?.nombrePaciente || '',
      run: searchRutDisplay,
      fecha: fmtFecha(new Date()),
      procedencia: '',
    },
    prevision: $('labRequestPrev').value,
  });
  await openReport(fragment, EXAM_REQUEST_PRINT_CSS);
}

// ── PDF único ──

async function downloadAllPdfs() {
  const btn = $('labDownloadAll');
  const msg = $('labError');
  btn.disabled = true;
  msg.textContent = '';

  const loaders = [
    ...hsrResults.filter(o => o.puedeImprimir).map(o => async () =>
      new Uint8Array(await (await informeResultado(o.ordenEncryptada)).arrayBuffer())),
    ...hhrResults.filter(o => o.puedeImprimir).map(o => () => syslabReportBytes(o.link)),
  ];

  btn.textContent = `0/${loaders.length}…`;
  try {
    const { bytes, merged, failed, pages } = await mergePdfs(loaders, (done, total) => {
      btn.textContent = `${done}/${total}…`;
    });
    if (!bytes) throw new Error('Ningún informe se pudo incluir.');

    // El nombre lleva el RUT que se buscó, no lo que haya en el campo: editarlo
    // sin volver a buscar guardaba los informes de A como «laboratorio-<RUT de B>».
    savePdf(bytes, `laboratorio-${searchRutDisplay.replace(/[^0-9kK-]/g, '') || 'informes'}.pdf`);
    msg.textContent = failed === 0
      ? `PDF único con ${merged} informe${merged !== 1 ? 's' : ''} (${pages} pág.).`
      : `PDF con ${merged} de ${merged + failed} informes (${pages} pág.). ${failed} no se pudo incluir.`;
    msg.className = failed === 0 ? 'lab-msg info' : 'lab-msg error';
  } catch (err) {
    msg.textContent = `No se pudo generar el PDF único. ${humanError(err, 'el laboratorio')}`;
    msg.className = 'lab-msg error';
  } finally {
    btn.disabled = false;
    btn.textContent = 'Todos los PDF';
  }
}

function savePdf(bytes, filename) {
  const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
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
  hsrResults = [];
  hhrResults = [];
  searchRutBody = '';
  searchRutDisplay = '';
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
export async function searchFromPatient(run) {
  if (!run) return;
  $('labRut').value = formatRut(run);
  $('labError').textContent = '';
  const { hsr, hhr } = await checkSessions();
  if (!hsr && !hhr) {
    $('labError').textContent =
      'Ningún laboratorio conectado. Abre ProactiveLIS o SysLab, inicia sesión y vuelve a intentar.';
    $('labError').className = 'lab-msg error';
    return;
  }
  await doSearch();
}

function formatRut(run) {
  const clean = String(run).replace(/[^0-9kK]/g, '');
  if (clean.length < 2) return run;
  const body = clean.slice(0, -1);
  const dv = clean.slice(-1).toUpperCase();
  return `${body.replace(/\B(?=(\d{3})+(?!\d))/g, '.')}-${dv}`;
}

function fmtFecha(d) {
  return String(d.getDate()).padStart(2, '0') + '/' +
    String(d.getMonth() + 1).padStart(2, '0') + '/' +
    d.getFullYear();
}
