/**
 * Formulario de solicitud de exámenes: pantalla e impreso.
 *
 * La maqueta de tres columnas viene de `exam-request.js`, que es pura; aquí
 * sólo se dibuja. El impreso reproduce el formulario de papel que recibe el
 * laboratorio, así que conserva su orden, sus rótulos y sus tubos.
 *
 * Esta solicitud NO se envía a ningún sistema: se imprime y se entrega en mano,
 * igual que el formulario original. No hay estado «enviada» porque no existe.
 */

import { esc } from '../core/text.js';
import { buildExamRequestLayout, previsionMarks, EXAM_REQUEST_TEXTS } from '../core/exam-request.js';
import { FONASA_LEVELS } from '../core/exam-request-catalog.js';

const marca = on => on ? '☒' : '☐';

function seccionHtml(section, selected, imprimible) {
  const filas = section.rows.map(row => {
    const on = selected.has(row.key);
    return imprimible
      ? `<li>${marca(on)} ${esc(row.exam)}</li>`
      : `<li><label><input type="checkbox" data-key="${esc(row.key)}"${on ? ' checked' : ''}> ${esc(row.exam)}</label></li>`;
  }).join('');
  return `<section class="er-sec">
    <h3>${esc(section.title)}${section.tube ? ` <span class="er-tube">${esc(section.tube)}</span>` : ''}</h3>
    <ul class="er-list${section.columns > 1 ? ' er-2col' : ''}">${filas}</ul>
  </section>`;
}

function columnaHtml(column, selected, imprimible) {
  const secciones = column.sections.map(s => seccionHtml(s, selected, imprimible)).join('');
  const pie = column.footer
    ? `<section class="er-sec"><h3><span class="er-tube">${esc(column.footer.label)}</span></h3>
       <ul class="er-list">${column.footer.rows.map(row => {
         const on = selected.has(row.key);
         return imprimible
           ? `<li>${marca(on)} ${esc(row.exam)}</li>`
           : `<li><label><input type="checkbox" data-key="${esc(row.key)}"${on ? ' checked' : ''}> ${esc(row.exam)}</label></li>`;
       }).join('')}</ul></section>`
    : '';
  return `<div class="er-col">${secciones}${pie}</div>`;
}

/**
 * Rejilla de selección para la pantalla.
 *
 * La sección de inmunología no está en ninguna columna: en el impreso va al pie,
 * y si no se dibuja aquí sus cuatro exámenes quedan invisibles y sin poder pedirse.
 */
export function renderExamRequestForm(selected) {
  const layout = buildExamRequestLayout();
  const columnas = layout.columns.map(c => columnaHtml(c, selected, false)).join('');
  const pie = seccionHtml(layout.footer.section, selected, false);
  return `<div class="er-grid">${columnas}</div><div class="er-tail">${pie}</div>`;
}

/**
 * Fragmento imprimible con los datos del paciente y lo marcado.
 *
 * El médico tratante y la firma van como líneas en blanco: se firman a mano,
 * igual que en el formulario de papel.
 *
 * @param {{selected:Set<string>, paciente:object, prevision:string}} datos
 */
export function buildExamRequestPrintFragment({ selected, paciente = {}, prevision = '' }) {
  const layout = buildExamRequestLayout();
  const marks = previsionMarks(prevision);
  const fonasa = FONASA_LEVELS
    .map(n => `${marca(marks.fonasa === n)} ${esc(n)}`).join(' ');

  const campos = layout.footer.fields
    .map(f => `<div class="er-field"><span>${esc(f.label)}</span><i></i></div>`).join('');

  return `<div class="er-print">
    <header class="er-head">
      <h1>${esc(EXAM_REQUEST_TEXTS.formTitle)}</h1>
      <p class="er-inst">${esc(EXAM_REQUEST_TEXTS.institution)} · ${esc(EXAM_REQUEST_TEXTS.unit)}</p>
      <div class="er-pac">
        <div><span>Paciente</span><b>${esc(paciente.nombre || '')}</b></div>
        <div><span>RUT</span><b>${esc(paciente.run || '')}</b></div>
        <div><span>Fecha</span><b>${esc(paciente.fecha || '')}</b></div>
        <div><span>Procedencia</span><b>${esc(paciente.procedencia || '')}</b></div>
        <div class="er-prev"><span>Previsión</span>
          <b>FONASA ${fonasa} &nbsp; ${marca(marks.prais)} PRAIS</b></div>
      </div>
    </header>
    <div class="er-grid">${layout.columns.map(c => columnaHtml(c, selected, true)).join('')}</div>
    <div class="er-tail">${seccionHtml(layout.footer.section, selected, true)}</div>
    <footer class="er-foot">${campos}</footer>
  </div>`;
}

/** Estilos del impreso. Se anexan a la hoja base de `report.html`. */
export const EXAM_REQUEST_PRINT_CSS = `
.er-print{font-size:10px;color:#000}
.er-head h1{font-size:14px;margin:0;text-align:center;letter-spacing:.04em}
.er-inst{font-size:9px;text-align:center;margin:1px 0 6px;color:#333}
.er-pac{display:grid;grid-template-columns:repeat(3,1fr);gap:2px 12px;border:1px solid #000;padding:4px 6px;margin-bottom:6px}
.er-pac span{font-size:8px;color:#333;display:block;text-transform:uppercase;letter-spacing:.06em}
.er-prev{grid-column:1/-1}
.er-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;align-items:start}
.er-sec{border:1px solid #000;margin-bottom:6px;break-inside:avoid}
.er-sec h3{font-size:9px;margin:0;padding:2px 4px;background:#eee;border-bottom:1px solid #000;
  display:flex;justify-content:space-between;gap:6px;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.er-tube{font-weight:400;font-size:8px}
.er-list{list-style:none;margin:0;padding:3px 4px}
.er-list.er-2col{columns:2;column-gap:8px}
.er-list li{line-height:1.5;break-inside:avoid}
.er-foot{display:grid;grid-template-columns:repeat(3,1fr);gap:14px;margin-top:10px}
.er-field span{font-size:8px;text-transform:uppercase;letter-spacing:.06em}
.er-field i{display:block;border-bottom:1px solid #000;height:22px}
@page{size:portrait;margin:8mm}
`;

// ── Impresión (vive aquí, no en core: necesita document y window) ──
const DEFAULT_PRINT_DELAY_MS = 150;
const DEFAULT_RESTORE_DELAY_MS = 1000;

/**
 * Manda el formulario a la impresora.
 *
 * El título del documento se vacía antes de imprimir porque el navegador lo
 * estampa en la cabecera de cada hoja, y esta hoja es un impreso oficial del
 * laboratorio: no puede salir con el nombre de una extensión encima. Se repone
 * después, con un margen para que el diálogo de impresión alcance a leer el
 * documento ya en blanco.
 *
 * `documentRef` y `windowRef` entran por parámetro para poder probar el
 * vaciado y la reposición sin navegador.
 */
export function runExamRequestPrint({
  documentRef = document,
  windowRef = window,
  printDelayMs = DEFAULT_PRINT_DELAY_MS,
  restoreDelayMs = DEFAULT_RESTORE_DELAY_MS,
} = {}) {
  const originalTitle = documentRef.title;
  documentRef.title = '';

  windowRef.setTimeout(() => {
    try {
      windowRef.print();
    } finally {
      // El `finally` no es adorno: si print() lanza (impresión bloqueada) y la
      // reposición quedara colgando del camino feliz, la pestaña se quedaría
      // sin título hasta que alguien la recargue.
      windowRef.setTimeout(() => { documentRef.title = originalTitle; }, restoreDelayMs);
    }
  }, printDelayMs);
}
