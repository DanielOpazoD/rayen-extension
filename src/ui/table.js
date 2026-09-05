import { esc, stateDot, stateTone, sicTone } from './dom.js';
import { dateToInt } from '../core/parser.js';
import { CONFIG } from '../core/config.js';

/** Column ids in display order. Fecha and Nombre are sticky and always visible. */
// Ocho columnas. Razón y Tipo van juntas («Consulta Médica · Morbilidad») y el
// estado es un punto de color junto a la hora: la tabla cabe en 1280 px sin
// desplazamiento horizontal. Los valores siguen enteros en filtros, tooltips y
// exportaciones.
export const COLUMNS = [
  ['fechaAtencion', 'Fecha'], ['nombre', 'Nombre'], ['edad', 'Edad'], ['sexo', 'Sexo'],
  ['atencion', 'Atención'], ['diagnostico', 'Diagnóstico'], ['ic', 'Interconsulta'], ['nota', 'Notas'],
];
const COLUMN_COUNT = COLUMNS.length;
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

/** «Consulta Médica · Morbilidad»; si la razón ya está dentro del tipo («Control Crónico» / «Control»), sólo el tipo. */
export function atencionLabel(p) {
  const tipo = String(p.tipoAtencion || '').trim(), razon = String(p.razon || '').trim();
  if (!tipo) return razon;
  if (!razon || tipo.toLowerCase().includes(razon.toLowerCase())) return tipo;
  return `${tipo} · ${razon}`;
}
function atencionCell(p) {
  const tipo = String(p.tipoAtencion || '').trim(), razon = String(p.razon || '').trim();
  if (!tipo) return esc(razon);
  if (!razon || tipo.toLowerCase().includes(razon.toLowerCase())) return esc(tipo);
  return `${esc(tipo)}<span class="sec"> · ${esc(razon)}</span>`;
}

function dxCell(p) {
  const list = p.diagnosticos ?? [];
  if (!list.length) {
    // Sin registro propio ese día pero con atención de otro profesional: se
    // dice quién, sin heredar su diagnóstico.
    const pista = p.otrosEseDia ? ` data-tip="${esc(`Sin registro tuyo. Ese día registró atención: ${p.otrosEseDia}`)}"` : '';
    return `<span class="dx-none"${pista}>${p.atencionId ? 'Sin diagnóstico' : '—'}</span>`;
  }
  const d0  = list[0];
  const tip = list.map(d => `${d.nombre}${d.clasificacion && d.clasificacion !== d.nombre ? ` [${d.clasificacion}]` : ''}${d.certeza ? ` (${d.certeza})` : ''}${d.esAuge ? ' GES' : ''}`).join('\n');
  return `<span class="dx-main" data-tip="${esc(tip)}">${esc(d0.nombre)}</span>` +
    (d0.esAuge ? `<span class="bges">GES</span>` : '') +
    (list.length > 1 ? `<span class="dx-more" data-tip="${esc(tip)}">+${list.length - 1}</span>` : '');
}

/** One line per SIC: [rol] especialidad · quién · estado · CIE-10 */
function sicLine(s, role, extra = '') {
  const who = role === 'in'    ? (s.registrador.nombre ? `de ${s.registrador.nombre}` : '')
            : role === 'other' ? (s.registrador.nombre ? `por ${s.registrador.nombre}` : '')
            : (s.ejecutor.nombre ? `a ${s.ejecutor.nombre}` : '');
  const tip = `SIC #${s.id} · ${s.fecha} · ${s.estado}${who ? ` · ${who}` : ''}${s.cie10 ? ` · ${s.cie10}` : ''}${s.diagnostico ? ` · ${s.diagnostico}` : ''}${extra ? `\n${extra}` : ''}`;
  return `<div class="ic-line sic-link" data-sic="${s.id}" role="button" tabindex="-1" data-tip="${esc(tip)}">` +
    `<span class="rol rol-${role}">${ROLE_LABEL[role]}</span>` +
    `<span class="ic-esp">${esc(s.especialidad)}</span>` +
    stateDot(s.estado, { tone: sicTone(s.grupo), small: true }) +
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

  // Una sola línea por fila: si ya hay una SIC de origen no se añade otra; si
  // no, la primera del paciente. Las demás quedan en «+n», que lleva a
  // Interconsultas filtrado por este RUN. Apilar hasta cuatro dejaba filas de
  // 132 px y cinco visibles de 289.
  const others = (p.run ? sicsByRun.get(p.run) ?? [] : []).filter(s => !origin || s.id !== origin.id);
  const shown = lines.length ? 0 : Math.min(others.length, 1);
  others.slice(0, shown).forEach(s => lines.push(sicLine(s, sicRole(s))));
  if (others.length > shown) {
    lines.push(`<span class="ic-chip bg sic-run" data-run="${esc(p.run)}" data-tip="${esc(others.slice(shown).map(s => `${s.especialidad} · ${s.estado}`).join('\n'))}">+${others.length - shown}</span>`);
  }
  // Fila flexible: la línea se recorta con puntos suspensivos y el chip «+n»
  // conserva su sitio (antes quedaba bajo la celda de notas y el clic caía allí).
  return lines.length ? `<span class="ic-row">${lines.join('')}</span>` : '';
}

/** Exportada para poner bajo prueba el contrato de la fila (una parada de tabulación, una SIC). */
export function row(p, ctx) {
  const noteEl = p.note
    ? `<span class="note-text" data-tip="${esc(p.note)}">${esc(p.note)}</span>`
    : `<span class="note-empty">—</span>`;
  const flags = [
    // Los iconos de una letra llevan nombre accesible: el tooltip sólo lo lee quien ve.
    p.esUrgencia   ? `<span class="flag flag-urg" role="img" aria-label="Urgencia" data-tip="Urgencia">U</span>` : '',
    p.esEspontanea ? `<span class="flag flag-esp" role="img" aria-label="Espontánea, sin cita" data-tip="Espontánea (sin cita)">E</span>` : '',
    p.adjuntos?.length ? `<span class="flag flag-adj" role="img" aria-label="${p.adjuntos.length} ${p.adjuntos.length === 1 ? 'adjunto' : 'adjuntos'}" data-tip="${esc(p.adjuntos.map(a => a.nombre).join('\n'))}">📎${p.adjuntos.length}</span>` : '',
  ].join('');
  const prest = p.prestador && !/opazo/i.test(p.prestador)
    ? `<span class="prest-other" data-tip="Atendido por ${esc(p.prestador)}">${esc(p.prestador)}</span>` : '';
  const rowCls = [p.origen === 'ficha' ? 'r-ficha' : '', /presentó/i.test(p.estado) ? 'r-ns' : ''].filter(Boolean).join(' ');
  const edadTip = [p.dob ? `Nac. ${p.dob}` : '', p.edadLabel].filter(Boolean).join(' · ');

  return `<tr data-id="${esc(p.id)}" class="${rowCls}" tabindex="-1">
    <td data-c="fechaAtencion" class="sticky s1" data-tip="${esc(whenLabel(p))}${p.estado ? ` · ${esc(p.estado)}` : ''}${p.fechaRegistro ? ` · ficha registrada el ${esc(p.fechaRegistro)}` : ''}"><span class="fd">${esc(p.fechaAtencion)}</span>${p.hora ? `<span class="fh">${esc(p.hora)}</span>` : ''}${p.estado ? `<span class="sdot st-${stateTone(p.estado)}" role="img" aria-label="${esc(p.estado)}"></span>` : ''}</td>
    <td data-c="nombre" class="sticky s2 pat-link" data-id="${esc(p.id)}" role="button" tabindex="-1" data-tip="Ver ficha del paciente"><span class="pname">${esc(p.nombre)}</span>${p.runStr ? `<span class="run copy-run" data-run="${esc(p.runStr)}" role="button" tabindex="-1" data-tip="Copiar RUN">${p.runStr}</span>` : ''}</td>
    <td data-c="edad" class="num"><span class="tip" data-tip="${esc(edadTip)}">${p.edad ?? ''}</span></td>
    <td data-c="sexo" class="sex" data-tip="${esc(p.sexo)}">${sexLetter(p.sexo)}</td>
    <td data-c="atencion" class="wrap" data-tip="${esc([p.tipoAtencion, p.razon].filter(Boolean).join(' · '))}">${atencionCell(p)}${flags}${prest}</td>
    <td data-c="diagnostico" class="wrap dx-cell"><span class="dx">${dxCell(p)}</span></td>
    <td data-c="ic" class="wrap ic-cell">${icCell(p, ctx)}</td>
    <td data-c="nota" class="note-cell" data-id="${esc(p.id)}">${noteEl}</td>
  </tr>`;
}

// ── Chunked rendering ─────────────────────────────────────────
// Rows have variable height (wrapped cells), so true windowing would need
// per-row measurement. Rendering in chunks as the user scrolls keeps filtering
// instant with thousands of rows and stays exact for printing and Ctrl+F.
const CHUNK = 120;
let pending = [], rendered = 0, lastCtx = null;

/**
 * Renders the atenciones table body (first chunk only; the rest streams in).
 * @param {object[]} data   already filtered + sorted
 * @param {number}   total  size of the unfiltered dataset
 * @param {{ sicsById: Map, sicsByRun: Map }} ctx
 */
export function rowSelector(id) {
  return `#tbody tr[data-id="${CSS.escape(String(id))}"]`;
}

export function renderTable(data, total, ctx = { sicsById: new Map(), sicsByRun: new Map() }) {
  const tbody = document.getElementById('tbody');
  pending = data; rendered = 0; lastCtx = ctx;
  updateCount(total);

  if (!data.length) {
    // Dos vacíos distintos: sin datos cargados (la página quedaba en blanco) y
    // sin coincidencias para los filtros. Cada uno dice qué hacer.
    tbody.innerHTML = Number(total)
      ? `<tr><td colspan="${COLUMN_COUNT}" class="empty"><div class="empty-state"><b>Sin atenciones para estos filtros</b>Prueba con otro período o quita algún filtro.</div></td></tr>`
      : `<tr><td colspan="${COLUMN_COUNT}" class="empty"><div class="empty-state"><b>Carga los datos para ver tus atenciones</b>Pulsa «Cargar datos» arriba a la derecha: se traen la agenda y, si está activada, la ficha clínica del período elegido.</div></td></tr>`;
    return;
  }
  tbody.innerHTML = '';
  appendChunk();
}

// Antes: «120 de 289 de 289 registros». Ahora cada número tiene su palabra.
function updateCount(total = null) {
  const el = document.getElementById('countRow');
  if (total !== null) el.dataset.total = total;
  const all = Number(el.dataset.total ?? pending.length);
  const matching = pending.length;
  const shown = rendered < matching ? `${rendered} en pantalla · ` : '';
  const conteo = matching < all ? `${matching} de ${all} atenciones` : `${all} ${all === 1 ? 'atención' : 'atenciones'}`;
  el.textContent = `${shown}${conteo}`;
}

/** Appends the next chunk. @returns {boolean} true if rows remain */
export function appendChunk() {
  if (rendered >= pending.length) return false;
  const slice = pending.slice(rendered, rendered + CHUNK);
  document.getElementById('tbody').insertAdjacentHTML('beforeend', slice.map(p => row(p, lastCtx)).join(''));
  rendered += slice.length;
  updateCount();
  return rendered < pending.length;
}

export function hasMoreRows() { return rendered < pending.length; }

/** Applies hidden-column classes to the table element. */
export function applyColumnVisibility(table, hidden) {
  for (const [id] of COLUMNS) table.classList.toggle(`hide-${id}`, hidden.has(id) && !ALWAYS_VISIBLE.has(id));
}
