/** Vistas del análisis: comparación (matriz), informes, tendencias y microbiología. Sólo pintan. */
import { esc, $ } from '../dom.js';
import { renderTrendGroups } from '../lab-charts.js';
import {
  buildTrendGroups, filterTrendGroups, latestTrendTimestamp, countTrendVariables,
} from '../lab-trends.js';

export function renderComparison(a) {
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
      const ref = f.refValue ? `Referencia ${f.refValue}${f.refGroup ? ` (${f.refGroup})` : ''}${f.refUncertain ? ' · sexo no informado, sin alerta' : ''}${f.flag ? ` · marcado ${f.flag} por el laboratorio` : ''}` : 'Sin referencia';
      return `<td class="${f.alert ? 'lab-out' : ''}" title="${esc(ref)}">${esc(f.result)}</td>`;
    }).join('')}
  </tr>`).join('');
  return `<div class="tbl-wrap"><table class="lab-table lab-matrix">
    <thead><tr><th>Variable</th>${head}</tr></thead><tbody>${rows}</tbody></table></div>`;
}

export function renderReports(a) {
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
          <td>${esc(f.unit)}</td><td>${esc(f.refValue)}${f.refGroup ? ` <span class="muted">${esc(f.refGroup)}</span>` : ''}${f.flag ? ` <span class="lab-out">${esc(f.flag)}</span>` : ''}</td></tr>`).join('')}</tbody>
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
export function renderFilteredTrends(analysis) {
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

export function renderMicrobiology(a) {
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
