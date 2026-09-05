/** Tablas de órdenes del Hospital Salvador (HSR) y de SysLab (HHR), con PDF y casilla de selección. */
import { humanCase } from '../../core/parser.js';
import { humanError } from '../../core/errors.js';
import { esc, $ } from '../dom.js';
import { informeResultado } from '../../io/lab-api.js';
import { syslabPdfUrl } from '../../io/syslab-api.js';

/** Sólo se puede analizar una orden de la que se pueda obtener el informe. */
export const analysable = (source, o) => source === 'hsr' ? Boolean(o.ordenEncryptada) : Boolean(o.link);

export function fmtFecha(d) {
  return String(d.getDate()).padStart(2, '0') + '/' +
    String(d.getMonth() + 1).padStart(2, '0') + '/' +
    d.getFullYear();
}

/**
 * Sólo se ofrece marcar lo que se puede analizar. Una casilla sobre una orden
 * sin informe descargable haría que el contador prometiera más informes de los
 * que el análisis puede incluir.
 */
const pickCell = (source, id, enabled) => enabled
  ? `<td class="lab-pick"><input type="checkbox" class="lab-check" data-source="${source}" data-id="${esc(String(id))}" aria-label="Seleccionar orden ${esc(String(id))}"></td>`
  : '<td class="lab-pick"></td>';

export function renderHsrResults(ordenes, deps) {
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
  wireRows(tbody, 'hsr', deps);
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

export function renderHhrResults(ordenes, deps) {
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
  wireRows(tbody, 'hhr', deps);
}

function wireRows(tbody, source, { selected, onSelectionChange, onError }) {
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
        onError(`No se pudo obtener el PDF. ${humanError(err, 'el laboratorio')}`);
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
      onSelectionChange();
    });
  });
}
