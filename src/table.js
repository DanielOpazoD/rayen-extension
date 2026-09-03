import { esc, stateClass, sicClass } from './dom.js';
import { dateToInt } from './parser.js';
import { CONFIG } from './config.js';

/** Column ids in display order. Fecha and Nombre are sticky and always visible. */
export const COLUMNS = [
  ['fechaAtencion', 'Fecha'], ['nombre', 'Nombre'], ['edad', 'Edad'], ['sexo', 'Sexo'],
  ['razon', 'Razón'], ['tipoAtencion', 'Tipo de atención'], ['diagnostico', 'Diagnóstico'],
  ['estado', 'Estado'], ['ic', 'Interconsulta'], ['nota', 'Notas'],
];
export const COLUMN_COUNT = COLUMNS.length;
export const ALWAYS_VISIBLE = new Set(['fechaAtencion', 'nombre']);

const DOW_LONG = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

/** "Martes · 09:30" from fecha8 + hora */
export function whenLabel(p) {
  const f = p.fecha8 ?? '';
  const dow = f.length === 8 ? DOW_LONG[new Date(+f.slice(0, 4), +f.slice(4, 6) - 1, +f.slice(6, 8)).getDay()] : '';
  return [dow, p.hora].filter(Boolean).join(' · ');
}

/** "Mujer" → "M", "Hombre" → "H" */
export function sexLetter(s = '') {
  if (/^m/i.test(s)) return 'M';
  if (/^h/i.test(s)) return 'H';
  return s ? s[0].toUpperCase() : '';
}

/**
 * The officer's role in a SIC:
 *   out   – he wrote it (registrador)           → "Emití"
 *   in    – he is the executor / it generated a cita in his agenda → "Recibí"
 *   other – another professional's SIC on the same patient → "Otra"
 */
export function sicRole(s, isOrigin = false) {
  if (s.registrador.id === CONFIG.officerId) return 'out';
  if (s.ejecutor.id === CONFIG.officerId || isOrigin) return 'in';
  return 'other';
}
const ROLE_LABEL = { out: 'Emití', in: 'Recibí', other: 'Otra' };

function sortValue(p, col) {
  if (col === 'fechaAtencion') return dateToInt(p.fechaAtencion) * 10000 + (parseInt(String(p.hora).replace(':', '')) || 0);
  if (col === 'edad')        return Number(p[col]) || 0;
  if (col === 'diagnostico') return (p.diagnosticos?.[0]?.nombre ?? '').toLowerCase();
  return String(p[col] ?? '').toLowerCase();
}

export function sortRecords(data, sortCol, sortDir) {
  return data.slice().sort((a, b) => {
    const va = sortValue(a, sortCol), vb = sortValue(b, sortCol);
    return (va < vb ? -1 : va > vb ? 1 : 0) * sortDir || String(a.hora).localeCompare(String(b.hora));
  });
}

function dxCell(p) {
  const list = p.diagnosticos ?? [];
  if (!list.length) return `<span class="dx-none">${p.atencionId ? 'Sin diagnóstico' : '—'}</span>`;
  const d0  = list[0];
  const tip = list.map(d => `${d.nombre}${d.clasificacion && d.clasificacion !== d.nombre ? ` [${d.clasificacion}]` : ''}${d.certeza ? ` (${d.certeza})` : ''}${d.esAuge ? ' GES' : ''}`).join('\n');
  return `<span class="dx-main" data-tip="${esc(tip)}">${esc(d0.nombre)}</span>` +
    (d0.certeza && d0.certeza !== 'Confirmada' ? `<span class="dx-cert">${esc(d0.certeza.toLowerCase())}</span>` : '') +
    (d0.esAuge ? `<span class="badge bges">GES</span>` : '') +
    (list.length > 1 ? `<span class="dx-more" data-tip="${esc(tip)}">+${list.length - 1}</span>` : '');
}

/** One line per SIC: [rol] especialidad · quién · estado · CIE-10 */
function sicLine(s, role, extra = '') {
  const who = role === 'in'    ? (s.registrador.nombre ? `de ${s.registrador.nombre}` : '')
            : role === 'other' ? (s.registrador.nombre ? `por ${s.registrador.nombre}` : '')
            : (s.ejecutor.nombre ? `a ${s.ejecutor.nombre}` : '');
  const cr  = s.contrarreferencias.length ? ` · CR ✓` : '';
  const tip = `SIC #${s.id} · ${s.fecha} · ${s.estado}${who ? ` · ${who}` : ''}${s.cie10 ? ` · ${s.cie10}` : ''}${s.diagnostico ? ` · ${s.diagnostico}` : ''}${cr}${extra ? `\n${extra}` : ''}`;
  return `<div class="ic-line sic-link" data-sic="${s.id}" data-tip="${esc(tip)}">` +
    `<span class="rol rol-${role}">${ROLE_LABEL[role]}</span>` +
    `<span class="ic-esp">${esc(s.especialidad)}</span>` +
    `<span class="badge ${sicClass(s.grupo)} sm">${esc(s.estado)}</span>` +
    (s.contrarreferencias.length ? `<span class="ic-cr">CR</span>` : '') +
    `</div>`;
}

/**
 * Interconsulta cell. First the SIC that generated this appointment (if any),
 * then the patient's other SICs. Each line states the officer's role
 * (Emití / Recibí / Otra), specialty and lifecycle state; details on hover.
 * The "Citado por" from Cupos[0].Descripcion is the SOME clerk — tooltip only.
 */
function icCell(p, { sicsById, sicsByRun }) {
  const lines = [];
  const origin = p.icSIC ? sicsById.get(Number(p.icSIC)) : null;
  const agendo = p.icCitadoPor ? `Cupo agendado por ${p.icCitadoPor}` : '';

  if (origin) {
    lines.push(sicLine(origin, sicRole(origin, true), `Origen de esta cita${agendo ? ` · ${agendo.toLowerCase()}` : ''}`));
  } else if (p.esIC) {
    lines.push(`<div class="ic-line" data-tip="${esc(['Esta cita se generó desde una interconsulta', p.icSIC ? `SIC ${p.icSIC} fuera del período cargado` : '', agendo].filter(Boolean).join('\n'))}">` +
      `<span class="rol rol-in">Recibí</span><span class="muted">SIC ${esc(p.icSIC || '?')}</span></div>`);
  }

  const others = (p.run ? sicsByRun.get(p.run) ?? [] : []).filter(s => !origin || s.id !== origin.id);
  others.slice(0, 3).forEach(s => lines.push(sicLine(s, sicRole(s))));
  if (others.length > 3) {
    lines.push(`<div class="ic-line"><span class="ic-chip bg sic-run" data-run="${esc(p.run)}" data-tip="Ver todas en Interconsultas">+${others.length - 3} más</span></div>`);
  }
  return lines.join('');
}

function row(p, ctx) {
  const noteEl = p.note
    ? `<span class="note-text" data-tip="${esc(p.note)}">${esc(p.note)}</span>`
    : `<span class="note-empty">—</span>`;
  const flags = [
    p.esUrgencia   ? `<span class="flag flag-urg" data-tip="Urgencia">U</span>` : '',
    p.esEspontanea ? `<span class="flag flag-esp" data-tip="Espontánea (sin cita)">E</span>` : '',
    p.adjuntos?.length ? `<span class="flag flag-adj" data-tip="${esc(p.adjuntos.map(a => a.nombre).join('\n'))}">📎${p.adjuntos.length}</span>` : '',
  ].join('');
  const prest = p.prestador && !/opazo/i.test(p.prestador)
    ? `<span class="prest-other" data-tip="Atendido por ${esc(p.prestador)}">${esc(p.prestador)}</span>` : '';
  const rowCls = [p.origen === 'ficha' ? 'r-ficha' : '', /presentó/i.test(p.estado) ? 'r-ns' : ''].filter(Boolean).join(' ');
  const edadTip = [p.dob ? `Nac. ${p.dob}` : '', p.edadLabel].filter(Boolean).join(' · ');

  return `<tr data-id="${esc(p.id)}" class="${rowCls}">
    <td data-c="fechaAtencion" class="sticky s1"><span class="fd">${p.fechaAtencion}</span><span class="info" tabindex="0" data-tip="${esc(whenLabel(p))}">i</span></td>
    <td data-c="nombre" class="sticky s2 pat-link" data-id="${esc(p.id)}" data-tip="Ver ficha del paciente"><span class="pname">${esc(p.nombre)}</span>${p.runStr ? `<span class="run">${p.runStr}</span>` : ''}</td>
    <td data-c="edad" class="num"><span class="tip" data-tip="${esc(edadTip)}">${p.edad ?? ''}</span></td>
    <td data-c="sexo" class="sex" data-tip="${esc(p.sexo)}">${sexLetter(p.sexo)}</td>
    <td data-c="razon">${esc(p.razon)}</td>
    <td data-c="tipoAtencion" class="wrap" data-tip="${esc(p.tipoAtencion)}">${esc(p.tipoAtencion)}${flags}${prest}</td>
    <td data-c="diagnostico" class="wrap dx-cell">${dxCell(p)}</td>
    <td data-c="estado"><span class="badge ${stateClass(p.estado)}">${esc(p.estado)}</span></td>
    <td data-c="ic" class="wrap ic-cell">${icCell(p, ctx)}</td>
    <td data-c="nota" class="note-cell" data-id="${esc(p.id)}">${noteEl}</td>
  </tr>`;
}

/**
 * Renders the atenciones table body.
 * @param {object[]} data   already filtered + sorted
 * @param {number}   total  size of the unfiltered dataset
 * @param {{ sicsById: Map, sicsByRun: Map }} ctx
 */
export function renderTable(data, total, ctx = { sicsById: new Map(), sicsByRun: new Map() }) {
  document.getElementById('countRow').textContent = `${data.length} de ${total} registros`;
  const tbody = document.getElementById('tbody');
  tbody.innerHTML = data.length
    ? data.map(p => row(p, ctx)).join('')
    : `<tr><td colspan="${COLUMN_COUNT}" class="empty">Sin resultados</td></tr>`;
}

/** Applies hidden-column classes to the table element. */
export function applyColumnVisibility(table, hidden) {
  for (const [id] of COLUMNS) table.classList.toggle(`hide-${id}`, hidden.has(id) && !ALWAYS_VISIBLE.has(id));
}
