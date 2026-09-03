import { esc } from './dom.js';

const DOW_SORTED  = ['Lun','Mar','Mié','Jue','Vie','Sáb','Dom'];
const MONTHS_ES   = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];

// Colours come from the page's CSS tokens so the SVGs follow light/dark mode.
const GREEN = 'var(--g-700)';
const BLUE  = 'var(--blue)';
const TXT   = 'var(--ink)';
const TXT2  = 'var(--ink-3)';
const TXT3  = 'var(--ink-4)';
const VAL   = 'var(--g-800)';

// ── Primitives ────────────────────────────────────────────────

function barSVG({ labels, values, title, width = 300, height = 175, color = GREEN }) {
  const P = { top: 28, bottom: 34, left: 8, right: 8 };
  const cw = width - P.left - P.right;
  const ch = height - P.top - P.bottom;
  const max = Math.max(...values, 1);
  const n   = labels.length;
  const bw  = Math.max(4, Math.floor(cw / n) - 3);

  const bars = labels.map((lbl, i) => {
    const v   = values[i] || 0;
    const bh  = Math.max(v > 0 ? 3 : 0, Math.round((v / max) * ch));
    const x   = P.left + i * (cw / n) + 1;
    const y   = P.top + ch - bh;
    const op  = (0.4 + 0.6 * v / max).toFixed(2);
    const lbl8 = lbl.length > 5 ? lbl.slice(0, 4) : lbl;
    return [
      `<rect x="${x}" y="${y}" width="${bw}" height="${bh}" rx="3" fill="${color}" opacity="${op}"/>`,
      v > 0 ? `<text x="${x+bw/2}" y="${y-3}" text-anchor="middle" font-size="8.5" fill="${VAL}" font-weight="600">${v}</text>` : '',
      `<text x="${x+bw/2}" y="${height-6}" text-anchor="middle" font-size="8" fill="${TXT2}">${esc(lbl8)}</text>`,
    ].join('');
  }).join('');

  return `<svg viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${esc(title)}" style="width:100%;display:block">
    <text x="${width/2}" y="16" text-anchor="middle" font-size="11" font-weight="700" fill="${TXT}">${esc(title)}</text>
    ${bars}
  </svg>`;
}

function hBarSVG({ labels, values, title, width = 300, color = GREEN, labelW = 96 }) {
  const rowH  = 24;
  const PAD   = { top: 28, bottom: 10, left: labelW, right: 36 };
  const h     = PAD.top + PAD.bottom + Math.max(labels.length, 1) * rowH;
  const cw    = width - PAD.left - PAD.right;
  const max   = Math.max(...values, 1);
  const total = values.reduce((a, b) => a + b, 0);
  const barH  = 13;
  const maxChars = Math.floor(labelW / 5.2);

  const bars = labels.map((lbl, i) => {
    const v   = values[i] || 0;
    const bw  = Math.round((v / max) * cw);
    const y   = PAD.top + i * rowH + (rowH - barH) / 2;
    const pct = total > 0 ? Math.round(v / total * 100) : 0;
    const op  = (0.4 + 0.6 * v / max).toFixed(2);
    const short = lbl.length > maxChars ? lbl.slice(0, maxChars - 1) + '…' : lbl;
    return [
      `<text x="${PAD.left-4}" y="${y+barH/2+3.5}" text-anchor="end" font-size="8.5" fill="${TXT2}"><title>${esc(lbl)}</title>${esc(short)}</text>`,
      `<rect x="${PAD.left}" y="${y}" width="${bw}" height="${barH}" rx="3" fill="${color}" opacity="${op}"/>`,
      `<text x="${PAD.left+bw+4}" y="${y+barH/2+3.5}" font-size="8.5" fill="${VAL}" font-weight="600">${v}</text>`,
      `<text x="${width-2}" y="${y+barH/2+3.5}" text-anchor="end" font-size="7.5" fill="${TXT3}">${pct}%</text>`,
    ].join('');
  }).join('');

  return `<svg viewBox="0 0 ${width} ${h}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${esc(title)}" style="width:100%;display:block">
    <text x="${width/2}" y="16" text-anchor="middle" font-size="11" font-weight="700" fill="${TXT}">${esc(title)}</text>
    ${bars}
  </svg>`;
}

function topEntries(counts, n) {
  return Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, n);
}

function card(svg) { return `<div class="chart-card">${svg}</div>`; }

// ── Public ────────────────────────────────────────────────────

/**
 * Renders the officer's charts and, when available, the team charts built from
 * HistorialAtencion daily aggregates.
 * @param {object[]} records
 * @param {Record<string, object>} team  date8 → aggregate (may be empty)
 * @param {HTMLElement} container
 */
export function renderCharts(records, team, container) {
  if (!records.length) { container.style.display = 'none'; return; }

  const byDow = Object.fromEntries(DOW_SORTED.map(d => [d, 0]));
  records.forEach(r => { if (r.diaSemana) byDow[r.diaSemana]++; });
  const chart1 = barSVG({ labels: DOW_SORTED, values: DOW_SORTED.map(d => byDow[d]), title: 'Por día de semana' });

  const byMonth = {};
  records.forEach(r => {
    const p = (r.fechaAtencion || '').split('-');
    if (p.length < 3) return;
    const key = `${p[2]}-${p[1]}`;
    byMonth[key] = (byMonth[key] || 0) + 1;
  });
  const monthKeys = Object.keys(byMonth).sort().slice(-7);
  const chart2 = barSVG({
    labels: monthKeys.map(k => MONTHS_ES[parseInt(k.split('-')[1]) - 1]),
    values: monthKeys.map(k => byMonth[k]),
    title: 'Por mes',
  });

  const byPrev = {};
  records.forEach(r => { const k = r.prevision || 'Sin datos'; byPrev[k] = (byPrev[k] || 0) + 1; });
  const prev = topEntries(byPrev, 6);
  const chart3 = hBarSVG({ labels: prev.map(([k]) => k), values: prev.map(([, v]) => v), title: 'Por previsión' });

  const byTipo = {};
  records.forEach(r => { const k = r.tipoAtencion || 'Sin tipo'; byTipo[k] = (byTipo[k] || 0) + 1; });
  const tipo = topEntries(byTipo, 10);
  const chart4 = hBarSVG({ labels: tipo.map(([k]) => k), values: tipo.map(([, v]) => v), title: 'Mis tipos de atención', labelW: 120 });

  const byDx = {};
  records.forEach(r => (r.diagnosticos ?? []).forEach(d => { const k = d.clasificacion || d.nombre; if (k) byDx[k] = (byDx[k] || 0) + 1; }));
  const dx = topEntries(byDx, 10);
  const chart5 = dx.length
    ? hBarSVG({ labels: dx.map(([k]) => k), values: dx.map(([, v]) => v), title: 'Mis diagnósticos más frecuentes', labelW: 130 })
    : '';

  let teamHTML = '';
  const days = Object.values(team ?? {});
  if (days.length) {
    const sum = key => days.reduce((acc, d) => {
      for (const [k, v] of Object.entries(d[key] ?? {})) acc[k] = (acc[k] || 0) + v;
      return acc;
    }, {});
    const inst = topEntries(sum('byInstrumento'), 10);
    const pres = topEntries(sum('byPrestador'), 12);
    const tipoT = topEntries(sum('byTipo'), 12);
    const total = days.reduce((a, d) => a + d.total, 0);
    teamHTML =
      `<h3 class="chart-h3">Equipo Hospital Hanga Roa · ${total.toLocaleString('es-CL')} atenciones en ${days.length} días (ficha clínica)</h3>` +
      `<div class="chart-section">` +
      card(hBarSVG({ labels: inst.map(([k]) => k), values: inst.map(([, v]) => v), title: 'Por profesión', color: BLUE, labelW: 110 })) +
      card(hBarSVG({ labels: pres.map(([k]) => k), values: pres.map(([, v]) => v), title: 'Por profesional', color: BLUE, labelW: 130 })) +
      card(hBarSVG({ labels: tipoT.map(([k]) => k), values: tipoT.map(([, v]) => v), title: 'Por tipo de atención', color: BLUE, labelW: 130 })) +
      `</div>`;
  }

  container.innerHTML =
    `<h3 class="chart-h3">Mis atenciones</h3>` +
    `<div class="chart-section">${card(chart1)}${card(chart2)}${card(chart3)}</div>` +
    `<div class="chart-section">${card(chart4)}${chart5 ? card(chart5) : ''}</div>` +
    teamHTML;
  container.style.display = '';
}
