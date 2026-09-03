import { esc } from './dom.js';
import { storageSet } from './cache.js';

// ── Shared ─────────────────────────────────────────────────────

/**
 * CSV cell: quoted, quotes doubled, and formula-leading characters neutralised
 * so a note like "=HYPERLINK(...)" cannot execute when opened in Excel.
 */
export function csvCell(v) {
  let s = String(v ?? '');
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
}

function download(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a   = Object.assign(document.createElement('a'), { href: url, download: filename });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

const stamp = () => new Date().toISOString().slice(0, 10);

/** Column definitions shared by every atenciones export: [header, getter, type] */
const ATENCION_COLS = [
  ['F. Atención',            p => p.fechaAtencion],
  ['Hora',                   p => p.hora],
  ['Día',                    p => p.diaSemana],
  ['Nombre Completo',        p => p.nombre],
  ['RUN',                    p => p.runStr],
  ['F. Nacimiento',          p => p.dob],
  ['Edad',                   p => p.edad, 'n'],
  ['Sexo',                   p => p.sexo],
  ['Previsión',              p => p.prevision],
  ['Razón',                  p => p.razon],
  ['Tipo Atención',          p => p.tipoAtencion],
  ['Estado',                 p => p.estado],
  ['Origen',                 p => p.origen === 'ficha' ? 'Ficha clínica' : 'Agenda'],
  ['Urgencia',               p => p.esUrgencia ? 'Sí' : 'No'],
  ['Espontánea',             p => p.esEspontanea ? 'Sí' : 'No'],
  ['Diagnóstico principal',  p => p.diagnosticos?.[0]?.nombre ?? ''],
  ['Certeza',                p => p.diagnosticos?.[0]?.certeza ?? ''],
  ['GES',                    p => p.diagnosticos?.[0]?.esAuge ? 'Sí' : 'No'],
  ['Todos los diagnósticos', p => (p.diagnosticos ?? []).map(d => `${d.nombre}${d.certeza ? ` (${d.certeza})` : ''}`).join(' | ')],
  ['Actividades',            p => (p.actividades ?? []).map(a => `${a.codigo} ${a.descripcion}`.trim()).join(' | ')],
  ['Prestador',              p => p.prestador ?? ''],
  ['Cita por IC',            p => p.esIC ? 'Sí' : 'No'],
  ['Cupo agendado por (SOME)', p => p.icCitadoPor ?? ''],
  ['N° SIC origen',          p => p.icSIC ?? ''],
  ['Notas',                  p => p.note ?? ''],
];

const SIC_COLS = [
  ['N° SIC', s => s.id, 'n'], ['Fecha', s => s.fecha], ['Antigüedad (días)', s => s.antiguedadDias, 'n'],
  ['Estado', s => s.estado], ['Grupo', s => s.grupo], ['Prioridad', s => s.prioridad, 'n'],
  ['Paciente', s => s.paciente.nombre], ['RUN', s => s.paciente.runStr], ['Edad', s => s.paciente.edad],
  ['Sexo', s => s.paciente.sexo], ['Previsión', s => s.paciente.prevision],
  ['Especialidad', s => s.especialidad], ['Especialidad origen', s => s.especialidadOrigen], ['Motivo', s => s.motivo],
  ['GES', s => s.esAuge ? 'Sí' : 'No'], ['Diagnóstico', s => s.diagnostico], ['CIE-10', s => s.cie10],
  ['Hipótesis diagnóstica', s => s.hipotesis], ['Fundamentos clínicos', s => s.fundamentos], ['Exámenes realizados', s => s.examenes],
  ['Origen', s => s.origen], ['Destino', s => s.destino], ['Solicitante', s => s.registrador.nombre], ['Ejecutor', s => s.ejecutor.nombre],
  ['Fecha cita', s => s.fechaCita],
  ['Contrarreferencia', s => s.contrarreferencias.map(c => `${c.fecha} ${c.profesional} (${c.especialidad})`).join(' | ')],
];

// ── CSV ────────────────────────────────────────────────────────

function toCSV(cols, rows) {
  const lines = [cols.map(([h]) => csvCell(h)).join(';'), ...rows.map(r => cols.map(([, get]) => csvCell(get(r))).join(';'))];
  // BOM so Excel opens UTF-8 correctly
  return new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
}

export function exportCSV(records, filename) {
  download(toCSV(ATENCION_COLS, records), filename ?? `atenciones_dr_opazo_${stamp()}.csv`);
}

export function exportSICsCSV(sics, filename) {
  download(toCSV(SIC_COLS, sics), filename ?? `interconsultas_hhr_${stamp()}.csv`);
}

// ── Excel (SpreadsheetML 2003 — opens in Excel/LibreOffice/Numbers without libraries) ──

function xmlEsc(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function toXLS(cols, rows, sheetName) {
  const head = `<Row>${cols.map(([h]) => `<Cell ss:StyleID="h"><Data ss:Type="String">${xmlEsc(h)}</Data></Cell>`).join('')}</Row>`;
  const body = rows.map(r => `<Row>${cols.map(([, get, type]) => {
    const v = get(r);
    const isNum = type === 'n' && v !== '' && v !== null && v !== undefined && Number.isFinite(Number(v));
    return `<Cell><Data ss:Type="${isNum ? 'Number' : 'String'}">${xmlEsc(isNum ? Number(v) : v)}</Data></Cell>`;
  }).join('')}</Row>`).join('\n');
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
<Styles><Style ss:ID="h"><Font ss:Bold="1" ss:Color="#FFFFFF"/><Interior ss:Color="#2D8C6E" ss:Pattern="Solid"/></Style></Styles>
<Worksheet ss:Name="${xmlEsc(sheetName)}"><Table>${head}
${body}</Table><WorksheetOptions xmlns="urn:schemas-microsoft-com:office:excel"><FreezePanes/><SplitHorizontal>1</SplitHorizontal><TopRowBottomPane>1</TopRowBottomPane></WorksheetOptions></Worksheet>
</Workbook>`;
  return new Blob([xml], { type: 'application/vnd.ms-excel' });
}

export function exportXLS(records) {
  download(toXLS(ATENCION_COLS, records, 'Atenciones'), `atenciones_dr_opazo_${stamp()}.xls`);
}

/** Generic CSV for any column set — used by the Pacientes view. */
export function exportRows(cols, rows, basename) {
  download(toCSV(cols, rows), `${basename}_${stamp()}.csv`);
}

const NOTAS_COLS = [
  ['Paciente', p => p.nombre], ['RUN', p => p.runStr], ['Edad', p => p.edad, 'n'],
  ['Últ. atención', p => p.fechaAtencion], ['Nota', p => p.note],
];

/** One row per patient with a note — your own knowledge, backed up. */
export function exportNotas(records, fmt = 'csv') {
  const seen = new Map();
  for (const r of records) {
    if (!r.note) continue;
    const k = r.run ?? r.nombre;
    const prev = seen.get(k);
    if (!prev || (r.fechaAtencion || '') > (prev.fechaAtencion || '')) seen.set(k, r);
  }
  const rows = [...seen.values()].sort((a, b) => a.nombre.localeCompare(b.nombre));
  if (fmt === 'xls') download(toXLS(NOTAS_COLS, rows, 'Notas'), `notas_dr_opazo_${stamp()}.xls`);
  else download(toCSV(NOTAS_COLS, rows), `notas_dr_opazo_${stamp()}.csv`);
  return rows.length;
}

export function exportSICsXLS(sics) {
  download(toXLS(SIC_COLS, sics, 'Interconsultas'), `interconsultas_hhr_${stamp()}.xls`);
}

// ── JSON ───────────────────────────────────────────────────────

export function exportJSON(records) {
  const clean = records.map(p => {
    const { note, ...rest } = p;
    return { ...rest, nota: note ?? '' };
  });
  const blob = new Blob([JSON.stringify({ generado: new Date().toISOString(), total: clean.length, atenciones: clean }, null, 2)], { type: 'application/json' });
  download(blob, `atenciones_dr_opazo_${stamp()}.json`);
}

// ── HTML report (also used by report.html for printing / PDF) ──

const REPORT_COLS = ATENCION_COLS.filter(([h]) => !['Día', 'Origen', 'Cupo agendado por (SOME)', 'Certeza', 'Todos los diagnósticos', 'Actividades', 'F. Nacimiento'].includes(h));

const REPORT_CSS = `
  body{font-family:'Segoe UI',system-ui,sans-serif;font-size:11px;color:#1f2933;margin:24px}
  h1{font-size:18px;margin:0 0 2px;color:#1a6b53}
  .sub{color:#718096;margin:0 0 14px;font-size:11px}
  table{border-collapse:collapse;width:100%}
  th{background:#2d8c6e;color:#fff;text-align:left;padding:5px 6px;font-size:10px;text-transform:uppercase;letter-spacing:.03em}
  td{padding:4px 6px;border-bottom:1px solid #e3e8ee;vertical-align:top}
  tr:nth-child(even) td{background:#f7fafc}
  .n{text-align:right}
  @media print{body{margin:10mm}th{-webkit-print-color-adjust:exact;print-color-adjust:exact}@page{size:landscape;margin:10mm}}
`;

/** Body fragment (h1 + table). Wrapped by exportHTML() and rendered by report.js. */
function reportFragment(records, { title = 'Atenciones — Dr. Daniel Opazo Damiani', subtitle = '' } = {}) {
  const sub = subtitle || `Hospital Hanga Roa · ${records.length} atenciones · generado ${new Date().toLocaleString('es-CL')}`;
  const head = `<tr>${REPORT_COLS.map(([h]) => `<th>${esc(h)}</th>`).join('')}</tr>`;
  const rows = records.map(p => `<tr>${REPORT_COLS.map(([, get, type]) => `<td class="${type === 'n' ? 'n' : ''}">${esc(get(p))}</td>`).join('')}</tr>`).join('\n');
  return `<h1>${esc(title)}</h1><p class="sub">${esc(sub)}</p><table><thead>${head}</thead><tbody>${rows}</tbody></table>`;
}

export function exportHTML(records) {
  const html = `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><title>Atenciones Dr. Opazo ${stamp()}</title><style>${REPORT_CSS}</style></head><body>${reportFragment(records)}</body></html>`;
  download(new Blob([html], { type: 'text/html;charset=utf-8' }), `atenciones_dr_opazo_${stamp()}.html`);
}

/**
 * PDF without libraries: stores an HTML fragment in chrome.storage.local and
 * opens report.html?print=1, which renders it, deletes it, and calls
 * window.print() (the user picks "Guardar como PDF" in the dialog).
 * @param {string} fragment  body HTML, already escaped
 * @param {string} [extraCss]  appended to the base report stylesheet
 */
export async function openReport(fragment, extraCss = '') {
  await storageSet('rayen_report', { fragment, css: REPORT_CSS + extraCss, at: Date.now() });
  const url = chrome.runtime.getURL('report.html?print=1');
  try { await chrome.tabs.create({ url }); } catch { window.open(url, '_blank'); }
}

export async function exportPDF(records) {
  await openReport(reportFragment(records));
}
