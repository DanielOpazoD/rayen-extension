/** Solicitud de exámenes: formulario de casillas que se imprime; no se envía a ningún sistema. */
import { $ } from '../dom.js';
import { toggleExamSelection } from '../../core/exam-request.js';
import {
  renderExamRequestForm, buildExamRequestPrintFragment, EXAM_REQUEST_PRINT_CSS,
} from '../exam-request-view.js';
import { openReport } from '../export.js';

let getPaciente = () => ({ nombre: '', run: '', fecha: '', procedencia: '' });

/** `getPaciente` entrega nombre, RUN y fecha de la misma búsqueda que produjo las tablas. */
export function initRequest(deps) {
  getPaciente = deps.getPaciente;
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
}

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
    paciente: getPaciente(),
    prevision: $('labRequestPrev').value,
  });
  await openReport(fragment, EXAM_REQUEST_PRINT_CSS);
}
