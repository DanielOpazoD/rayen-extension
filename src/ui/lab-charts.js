/**
 * Gráficos de tendencia de laboratorio.
 *
 * Cada serie es un analito medido en varios informes. Sólo llegan aquí series
 * ya filtradas por `buildAnalysis`: muestras sistémicas, con al menos dos
 * puntos y comparador exacto. Un «<0,01» no es un punto de gráfico y no debe
 * dibujarse como si lo fuera.
 *
 * Los colores salen de los tokens CSS para seguir el modo claro/oscuro, igual
 * que el resto de los gráficos de la aplicación.
 */

import { esc } from '../core/text.js';

const LINE = 'var(--brand)';
const ALERT = 'var(--bad)';
const TXT = 'var(--ink)';
const TXT3 = 'var(--ink-3)';
const GRID = 'var(--line, var(--ink-4))';

/**
 * Rango normal común a toda la serie.
 *
 * Sólo se dibuja si TODOS los puntos declaran el mismo rango. Si un informe usa
 * otro laboratorio o el rango cambia con la edad, pintar una banda única daría
 * por normal un valor que no lo era en su momento.
 */
function sharedReferenceBand(points) {
  const first = points[0];
  if (!first || (first.refMin == null && first.refMax == null)) return null;
  const igual = points.every(p => p.refMin === first.refMin && p.refMax === first.refMax);
  return igual ? { min: first.refMin, max: first.refMax } : null;
}

/** La banda normal como rectángulo de fondo; una cota abierta llega al borde. */
function bandRect(band, { min, span, P, plotH, width }) {
  if (!band) return '';
  const yOf = v => P.top + plotH - ((v - min) / span) * plotH;
  const top = band.max != null ? yOf(band.max) : P.top;
  const bottom = band.min != null ? yOf(band.min) : P.top + plotH;
  const alto = Math.max(1, bottom - top);
  return `<rect x="${P.left}" y="${top.toFixed(1)}" width="${width - P.left - P.right}" height="${alto.toFixed(1)}"
    fill="var(--good-soft, rgba(16,143,90,.08))"/>`;
}

/** Número corto para etiqueta: evita 13.499999999 y respeta la coma decimal. */
function shortNumber(value) {
  const abs = Math.abs(value);
  const decimals = abs >= 100 ? 0 : abs >= 10 ? 1 : 2;
  return value.toFixed(decimals).replace(/\.?0+$/, '').replace('.', ',');
}

/**
 * Una serie temporal como SVG.
 * @param {{analysis: string, unit: string, points: Array<{label,value,alert}>}} trend
 */
export function trendSVG(trend, { width = 260, height = 120 } = {}) {
  const points = trend.points;
  if (!points || points.length < 2) return '';

  const P = { top: 26, right: 10, bottom: 20, left: 10 };
  const values = points.map(p => p.value);
  const band = sharedReferenceBand(points);
  // La banda entra en la escala para que se vea aunque todos los valores estén
  // fuera de ella: si no, un paciente con todo alterado no vería dónde empieza
  // lo normal.
  let min = Math.min(...values, band ? band.min ?? Infinity : Infinity);
  let max = Math.max(...values, band ? band.max ?? -Infinity : -Infinity);
  if (!Number.isFinite(min)) min = Math.min(...values);
  if (!Number.isFinite(max)) max = Math.max(...values);
  if (min === max) { min -= 1; max += 1; } // Serie plana: banda artificial para que se vea la línea.
  const span = max - min;
  const plotW = width - P.left - P.right;
  const plotH = height - P.top - P.bottom;

  const xy = (point, index) => [
    P.left + (points.length === 1 ? plotW / 2 : (index / (points.length - 1)) * plotW),
    P.top + plotH - ((point.value - min) / span) * plotH,
  ];

  const path = points.map((p, i) => {
    const [x, y] = xy(p, i);
    return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`;
  }).join(' ');

  const dots = points.map((p, i) => {
    const [x, y] = xy(p, i);
    return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${p.alert ? 3.5 : 2.5}"
      fill="${p.alert ? ALERT : LINE}"><title>${esc(p.label)}: ${esc(shortNumber(p.value))}${trend.unit ? ' ' + esc(trend.unit) : ''}</title></circle>`;
  }).join('');

  const first = points[0];
  const last = points[points.length - 1];
  const [lastX, lastY] = xy(last, points.length - 1);
  const titulo = `${trend.analysis}${trend.unit ? ` (${trend.unit})` : ''}`;
  const alterados = points.filter(p => p.alert).length;

  return `<svg viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg" role="img"
    aria-label="${esc(titulo)}: ${points.length} mediciones, de ${esc(shortNumber(first.value))} a ${esc(shortNumber(last.value))}${alterados ? `, ${alterados} fuera de rango` : ''}"
    style="width:100%;display:block">
    <text x="8" y="13" font-size="11" font-weight="700" fill="${TXT}">${esc(trend.analysis)}</text>
    <text x="${width - 8}" y="13" text-anchor="end" font-size="9" fill="${TXT3}">${esc(trend.unit || '')}</text>
    ${bandRect(band, { min, span, P, plotH, width })}
    <line x1="${P.left}" y1="${P.top + plotH}" x2="${width - P.right}" y2="${P.top + plotH}" stroke="${GRID}" stroke-width="1"/>
    <path d="${path}" fill="none" stroke="${LINE}" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round"/>
    ${dots}
    <text x="8" y="${height - 6}" font-size="9" fill="${TXT3}">${esc(shortNumber(first.value))}</text>
    <text x="${lastX.toFixed(1)}" y="${Math.max(lastY - 7, P.top + 8).toFixed(1)}" text-anchor="middle"
      font-size="10" font-weight="700" fill="${last.alert ? ALERT : TXT}">${esc(shortNumber(last.value))}</text>
    <text x="${width - 8}" y="${height - 6}" text-anchor="end" font-size="9" fill="${TXT3}">${esc(last.label)}</text>
  </svg>`;
}

/**
 * Todas las tendencias como una grilla de tarjetas.
 * Las series con alguna medición fuera de rango van primero: es lo que el
 * médico busca al abrir el panel.
 */
export function renderTrends(trends) {
  if (!trends || !trends.length) {
    return '<p class="muted">Sin series con al menos dos mediciones comparables.</p>';
  }
  const ordered = trends.slice().sort((a, b) => {
    const alertA = a.points.some(p => p.alert) ? 1 : 0;
    const alertB = b.points.some(p => p.alert) ? 1 : 0;
    return alertB - alertA;
  });
  return `<div class="lab-trend-grid">${
    ordered.map(t => `<div class="chart-card">${trendSVG(t)}</div>`).join('')
  }</div>`;
}

/**
 * Tendencias repartidas en sus tarjetas clínicas.
 *
 * Se agrupan por familia —electrolitos, función renal, perfil hepático…— porque
 * es como el médico las lee: un sodio se interpreta junto a su potasio, no al
 * lado de una TSH.
 *
 * @param {Array<{label:string, series:Array}>} groups salida de `buildTrendGroups`
 */
export function renderTrendGroups(groups) {
  if (!groups || !groups.length) {
    return '<p class="muted">Ninguna serie cumple el filtro. Amplía la ventana o quita el texto de búsqueda.</p>';
  }
  return groups.map(group => `<section class="lab-trend-group">
    <h3>${esc(group.label)} <span class="muted">${group.series.length}</span></h3>
    <div class="lab-trend-grid">${
      group.series.map(t => `<div class="chart-card">${trendSVG(t)}</div>`).join('')
    }</div>
  </section>`).join('');
}
