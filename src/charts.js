import { esc } from './dom.js';

const DOW_SORTED = ['Lun','Mar','Mié','Jue','Vie','Sáb','Dom'];
const MONTHS_ES  = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];

// Colours come from the page's CSS tokens so the SVGs follow light/dark mode.
// Las barras van en neutro: el verde de marca queda para acción y estado activo,
// no para un gráfico. El valor se lee en el número, no en el color.
const GREEN = 'var(--ink-3)', BLUE = 'var(--ink-4)', TXT2 = 'var(--ink-3)', TXT3 = 'var(--ink-3)', VAL = 'var(--ink)';

const pct = (v, total) => total > 0 ? Math.round(v / total * 100) : 0;

// ── Primitives: every mark carries value and percentage ───────

function barSVG({ labels, values, title, width = 300, height = 190, color = GREEN }) {
  // 30 px arriba para el valor (y-11) y el % (y-2) de la barra más alta; el título va fuera, en HTML.
  const P = { top: 30, bottom: 34, left: 8, right: 8 };
  const cw = width - P.left - P.right, ch = height - P.top - P.bottom;
  const max = Math.max(...values, 1), n = labels.length, total = values.reduce((a, b) => a + b, 0);
  const bw = Math.max(4, Math.floor(cw / n) - 3);
  const bars = labels.map((lbl, i) => {
    const v = values[i] || 0;
    const bh = Math.max(v > 0 ? 3 : 0, Math.round((v / max) * ch));
    const x = P.left + i * (cw / n) + 1, y = P.top + ch - bh;
    const op = (0.4 + 0.6 * v / max).toFixed(2);
    return [
      `<rect x="${x}" y="${y}" width="${bw}" height="${bh}" rx="3" fill="${color}" opacity="${op}"/>`,
      v > 0 ? `<text x="${x+bw/2}" y="${y-11}" text-anchor="middle" font-size="8.5" fill="${VAL}" font-weight="500">${v}</text>` +
              `<text x="${x+bw/2}" y="${y-2}" text-anchor="middle" font-size="7" fill="${TXT3}">${pct(v,total)}%</text>` : '',
      `<text x="${x+bw/2}" y="${height-6}" text-anchor="middle" font-size="8" fill="${TXT2}">${esc(lbl.length > 5 ? lbl.slice(0, 4) : lbl)}</text>`,
    ].join('');
  }).join('');
  return `${chartTitle(title)}<svg viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${esc(title)}" style="width:100%;display:block">
    ${bars}</svg>`;
}

// El título vive fuera del SVG: dentro escalaba con la tarjeta (5 px a 800 de
// ancho, 12 a 700). En HTML es el mismo nivel «título» que th y h4, a 12 px fijos.
const chartTitle = title => `<div class="chart-t" title="${esc(title)}">${esc(title)}</div>`;

function hBarSVG({ labels, values, title, width = 300, color = GREEN, labelW = 96, filter = null }) {
  const rowH = 22, PAD = { top: 6, bottom: 8, left: labelW, right: 44 };
  const h = PAD.top + PAD.bottom + Math.max(labels.length, 1) * rowH;
  const cw = width - PAD.left - PAD.right, max = Math.max(...values, 1), total = values.reduce((a, b) => a + b, 0), barH = 12;
  const maxChars = Math.floor(labelW / 5.2);
  const bars = labels.map((lbl, i) => {
    const v = values[i] || 0, bw = Math.round((v / max) * cw), y = PAD.top + i * rowH + (rowH - barH) / 2;
    const op = (0.4 + 0.6 * v / max).toFixed(2);
    const short = lbl.length > maxChars ? lbl.slice(0, maxChars - 1) + '…' : lbl;
    const wrap = filter ? [`<g data-f="${esc(filter)}:${esc(lbl)}" style="cursor:pointer"><rect x="0" y="${y-5}" width="${width}" height="${barH+10}" fill="transparent"/>`, '</g>'] : ['', ''];
    return [wrap[0],
      `<text x="${PAD.left-4}" y="${y+barH/2+3.5}" text-anchor="end" font-size="8.5" fill="${TXT2}"><title>${esc(lbl)}</title>${esc(short)}</text>`,
      `<rect x="${PAD.left}" y="${y}" width="${bw}" height="${barH}" rx="3" fill="${color}" opacity="${op}"/>`,
      `<text x="${PAD.left+bw+4}" y="${y+barH/2+3.5}" font-size="8.5" fill="${VAL}" font-weight="500">${v}</text>`,
      `<text x="${width-2}" y="${y+barH/2+3.5}" text-anchor="end" font-size="8" fill="${TXT3}">${pct(v,total)}%</text>`,
    wrap[1]].join('');
  }).join('');
  return `${chartTitle(title)}<svg viewBox="0 0 ${width} ${h}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${esc(title)}" style="width:100%;display:block">
    ${bars}</svg>`;
}

const topEntries = (counts, n) => Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, n);
const count = (records, keyFn) => records.reduce((acc, r) => { const k = keyFn(r); if (k) acc[k] = (acc[k] || 0) + 1; return acc; }, {});
const card = svg => svg ? `<div class="chart-card">${svg}</div>` : '';
const hb = (counts, title, n = 10, opts = {}) => {
  // `ordered`: categorías ordinales («1 visita», «2», «3–4», «5+») en su orden, no por valor.
  const e = opts.ordered ? Object.entries(counts).slice(0, n) : topEntries(counts, n);
  return e.length ? hBarSVG({ labels: e.map(([k]) => k), values: e.map(([, v]) => v), title, ...opts }) : '';
};

/** Age → clinical bracket (MINSAL-style). Exported for tests. */
export function ageBucket(edad) {
  if (edad == null || !Number.isFinite(+edad)) return null;
  const e = +edad;
  return e < 1 ? '<1' : e < 5 ? '1–4' : e < 10 ? '5–9' : e < 15 ? '10–14' : e < 20 ? '15–19' : e < 45 ? '20–44' : e < 65 ? '45–64' : '65+';
}
const AGE_ORDER = ['<1','1–4','5–9','10–14','15–19','20–44','45–64','65+'];

/**
 * Renders the officer's charts, the SIC charts, and the team charts.
 * @param {object[]} records
 * @param {Record<string, object>} team  date8 → aggregate (may be empty)
 * @param {HTMLElement} container
 * @param {object[]} [sics]
 */
export function renderCharts(records, team, container, sics = []) {
  if (!records.length) { container.style.display = 'none'; return; }

  // ── Mis atenciones: cuándo ──
  const byDow = Object.fromEntries(DOW_SORTED.map(d => [d, 0]));
  records.forEach(r => { if (r.diaSemana) byDow[r.diaSemana]++; });
  const cDow = barSVG({ labels: DOW_SORTED, values: DOW_SORTED.map(d => byDow[d]), title: 'Por día de semana' });

  const byMonth = count(records, r => { const p = (r.fechaAtencion || '').split('-'); return p.length === 3 ? `${p[2]}-${p[1]}` : ''; });
  const mk = Object.keys(byMonth).sort().slice(-12);
  const cMonth = barSVG({ labels: mk.map(k => MONTHS_ES[+k.split('-')[1] - 1]), values: mk.map(k => byMonth[k]), title: 'Por mes' });

  const byHour = {};
  records.forEach(r => { const h = parseInt(String(r.hora).slice(0, 2)); if (Number.isFinite(h)) byHour[h] = (byHour[h] || 0) + 1; });
  const hours = Object.keys(byHour).map(Number).sort((a, b) => a - b);
  const cHour = hours.length ? barSVG({ labels: hours.map(h => `${h}h`), values: hours.map(h => byHour[h]), title: 'Por hora del día' }) : '';

  // ── Mis atenciones: quién ──
  const bySex = count(records, r => r.sexo || 'Sin dato');
  const byAge = count(records, r => ageBucket(r.edad));
  const ages = AGE_ORDER.filter(k => byAge[k]);
  const cAge = ages.length ? barSVG({ labels: ages, values: ages.map(k => byAge[k]), title: 'Por grupo etario' }) : '';
  const unicos = new Set(records.map(r => r.run || r.nombre)).size;
  const porPac = count(records, r => r.run || r.nombre);
  const freq = { '1 visita': 0, '2 visitas': 0, '3–4 visitas': 0, '5+ visitas': 0 };
  Object.values(porPac).forEach(n => { freq[n === 1 ? '1 visita' : n === 2 ? '2 visitas' : n <= 4 ? '3–4 visitas' : '5+ visitas']++; });

  // ── Mis atenciones: qué ──
  const byEstado = count(records, r => r.estado || 'Sin estado');
  const byTipo   = count(records, r => r.tipoAtencion || 'Sin tipo');
  const byDx     = {};
  records.forEach(r => (r.diagnosticos ?? []).forEach(d => { const k = d.clasificacion || d.nombre; if (k) byDx[k] = (byDx[k] || 0) + 1; }));
  const byCert = count(records, r => r.diagnosticos?.[0]?.certeza || (r.diagnosticos?.length ? 'Sin certeza' : 'Sin diagnóstico'));
  const byGes  = { 'GES': records.filter(r => r.diagnosticos?.some(d => d.esAuge)).length };
  byGes['No GES'] = records.length - byGes.GES;
  const byRazon = count(records, r => r.razon || 'Sin razón');
  const byPrest = count(records, r => r.prestador && !/opazo/i.test(r.prestador) ? r.prestador : '');

  const mine = [
    `<h3 class="chart-h3">Mis atenciones · ${records.length} atenciones · ${unicos} pacientes</h3>`,
    `<div class="chart-section">${card(cDow)}${card(cMonth)}${card(cHour)}</div>`,
    `<div class="chart-section">${card(hb(bySex, 'Por sexo', 4, { filter: 'filtSexo' }))}${card(cAge)}${card(hb(freq, 'Visitas por paciente', 4, { ordered: true }))}</div>`,
    `<div class="chart-section">${card(hb(byEstado, 'Por estado', 6, { filter: 'filtEstado' }))}${card(hb(byRazon, 'Por razón', 6))}${card(hb(byGes, 'GES', 2))}</div>`,
    `<div class="chart-section">${card(hb(byTipo, 'Tipos de atención', 15, { labelW: 130, filter: 'filtTipo' }))}${card(hb(byDx, 'Diagnósticos más frecuentes', 15, { labelW: 140, filter: 'search' }))}${card(hb(byCert, 'Certeza del diagnóstico principal', 5))}</div>`,
    Object.keys(byPrest).length ? `<div class="chart-section">${card(hb(byPrest, 'Atendidas por otro prestador', 8, { labelW: 130, filter: 'filtPrest' }))}</div>` : '',
  ].join('');

  // ── Interconsultas ──
  let sicHTML = '';
  if (sics.length) {
    const byEsp = count(sics, s => s.especialidad);
    const byGrp = count(sics, s => ({ pendiente: 'Pendiente', enviada: 'En curso', atendida: 'Atendida', cerrada: 'Cerrada', fallida: 'Fallida' })[s.grupo] || s.grupo);
    const byPrio = count(sics, s => `P${s.prioridad}`);
    sicHTML =
      `<h3 class="chart-h3">Interconsultas del hospital · ${sics.length}</h3>` +
      `<div class="chart-section">${card(hb(byEsp, 'Por especialidad', 15, { color: BLUE, labelW: 140, filter: 'sicEsp' }))}${card(hb(byGrp, 'Por estado', 5, { color: BLUE }))}${card(hb(byPrio, 'Por prioridad', 3, { color: BLUE }))}</div>`;
  }

  // ── Equipo ──
  let teamHTML = '';
  const days = Object.values(team ?? {});
  if (days.length) {
    const sum = key => days.reduce((acc, d) => { for (const [k, v] of Object.entries(d[key] ?? {})) acc[k] = (acc[k] || 0) + v; return acc; }, {});
    const total = days.reduce((a, d) => a + d.total, 0);
    teamHTML =
      `<h3 class="chart-h3">Equipo Hospital Hanga Roa · ${total.toLocaleString('es-CL')} atenciones en ${days.length} días</h3>` +
      `<div class="chart-section">${card(hb(sum('byInstrumento'), 'Por profesión', 10, { color: BLUE, labelW: 110 }))}${card(hb(sum('byPrestador'), 'Por profesional', 15, { color: BLUE, labelW: 130 }))}${card(hb(sum('byTipo'), 'Por tipo de atención', 15, { color: BLUE, labelW: 130 }))}</div>`;
  }

  container.innerHTML = mine + sicHTML + teamHTML;
  container.style.display = '';
}
