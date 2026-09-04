import { esc, sicTone, stateDot, fillSelect, $ } from './dom.js';
import { CONFIG, SIC_GRUPO, prioridadInfo } from './config.js';
import { isMine } from './sic.js';
import { resolveRange, inRange } from './period.js';

let expanded = new Set();
let sortKey = 'fecha8', sortDir = -1;

const GRUPO_ORDER = { pendiente: 0, enviada: 1, atendida: 2, cerrada: 3, fallida: 4 };
const SORT_VALUE = {
  fecha8:       s => s.fecha8 || '',
  dias:         s => s.antiguedadDias ?? 0,
  paciente:     s => s.paciente.nombre.toLowerCase(),
  especialidad: s => s.especialidad.toLowerCase(),
  prioridad:    s => s.prioridad ?? 9,
  estado:       s => (GRUPO_ORDER[s.grupo] ?? 9) * 100 + (s.estadoId ?? 0),
  solicitante:  s => (s.registrador.nombre || '').toLowerCase(),
};

/** Sets the sort column; clicking the same column flips direction. @returns {{key, dir}} */
export function setSICSort(key) {
  if (!SORT_VALUE[key]) return { key: sortKey, dir: sortDir };
  sortDir = key === sortKey ? -sortDir : (key === 'fecha8' || key === 'dias' ? -1 : 1);
  sortKey = key;
  return { key: sortKey, dir: sortDir };
}

export function sortSICs(list) {
  const get = SORT_VALUE[sortKey];
  return list.slice().sort((a, b) => {
    const va = get(a), vb = get(b);
    return (va < vb ? -1 : va > vb ? 1 : 0) * sortDir || b.id - a.id;
  });
}

/** Applies the IC tab filter controls to the SIC list. */
export function filterSICs(sics) {
  const q     = $('sicSearch').value.trim().toLowerCase();
  const grupo = $('sicGrupo').value;
  const esp   = $('sicEsp').value;
  const quien = $('sicQuien').value;
  const ges   = $('sicGes').value;
  const prio  = $('sicPrio').value;
  const { from8, to8 } = resolveRange({ periodo: $('sicPer').value || 'todo', desde: $('sicDesde').value, hasta: $('sicHasta').value });

  return sics.filter(s =>
    inRange(s.fecha8, from8, to8) &&
    (!ges   || (ges === 'si' ? s.esAuge : !s.esAuge)) &&
    (!prio  || String(s.prioridad) === prio) &&
    (!grupo || s.grupo === grupo) &&
    (!esp   || s.especialidad === esp) &&
    (!quien || (quien === 'mias'     ? isMine(s)
              : quien === 'emitidas' ? s.registrador.id === CONFIG.officerId
              : quien === 'recibidas' ? s.ejecutor.id === CONFIG.officerId
              : true)) &&
    (!q || [s.paciente.nombre, s.paciente.runStr, s.especialidad, s.diagnostico, s.cie10, s.fundamentos,
            s.registrador.nombre, s.ejecutor.nombre, String(s.id)]
      .some(v => String(v ?? '').toLowerCase().includes(q)))
  );
}

export function buildSICFilters(sics) {
  fillSelect($('sicEsp'), [...new Set(sics.map(s => s.especialidad).filter(Boolean))].sort());
}

/** Tiles double as filters: clicking one applies it. */
function summary(all, shown) {
  const counts = Object.fromEntries(Object.keys(SIC_GRUPO).map(k => [k, 0]));
  for (const s of all) counts[s.grupo] = (counts[s.grupo] ?? 0) + 1;

  const tile = (n, l, filtro = null, cls = '') =>
    `<div class="stat ${cls} ${filtro ? 'stat-click' : ''}"${filtro ? ` data-filter="${esc(filtro)}" role="button" tabindex="0" data-tip="Filtrar por esto"` : ''}>` +
    `<div class="stat-n">${n}</div><div class="stat-l">${esc(l)}</div></div>`;

  return [
    tile(all.length, 'Total SIC', 'reset'),
    tile(all.filter(isMine).length, 'Mías', 'quien:mias'),
    tile(counts.pendiente, 'Pendientes', 'grupo:pendiente'),
    tile(counts.enviada, 'En curso', 'grupo:enviada'),
    tile(counts.atendida + counts.cerrada, 'Atendidas', 'grupo:atendida'),
  ].join('')
  + (shown !== all.length ? `<div class="stat stat-muted"><div class="stat-n">${shown}</div><div class="stat-l">Filtradas</div></div>` : '');
}

/** Raw priority code + the inference explained on hover — never a made-up label. */
function prioBadge(p) {
  const { code, hint } = prioridadInfo(p);
  return `<span class="prio prio-${p}" data-tip="${esc(hint)}">${esc(code)}</span>`;
}

function detailRow(s) {
  const p = s.paciente;
  return `<tr class="sic-detail" data-for="${s.id}"><td colspan="8">
    <div class="sic-detail-grid">
      <div>
        <h4>Fundamentos clínicos</h4>
        <p>${esc(s.fundamentos) || '<span class="muted">—</span>'}</p>
        <h4>Exámenes realizados</h4>
        <p>${esc(s.examenes) || '<span class="muted">—</span>'}</p>
        ${s.hipotesis ? `<h4>Hipótesis diagnóstica</h4><p>${esc(s.hipotesis)}</p>` : ''}
        ${s.observaciones ? `<h4>Observaciones</h4><p>${esc(s.observaciones)}</p>` : ''}
        ${s.motivoCancelacion ? `<h4>Motivo cancelación</h4><p>${esc(s.motivoCancelacion)}</p>` : ''}
      </div>
      <div>
        <h4>Paciente</h4>
        <p>${esc(p.nombre)}${p.runStr ? ` · ${p.runStr}` : ''}<br>
           ${[p.sexo, p.edad, p.prevision].filter(Boolean).map(esc).join(' · ')}<br>
           ${p.telefono ? `☎ ${esc(p.telefono)}` : ''} ${p.direccion ? `· ${esc(p.direccion)}` : ''}</p>
        <h4>Derivación</h4>
        <p>Motivo: ${esc(s.motivo) || '—'}<br>
           ${esc(s.especialidadOrigen)} → ${esc(s.especialidad)}<br>
           Solicitante: ${esc(s.registrador.nombre) || '—'}<br>
           Ejecutor: ${esc(s.ejecutor.nombre) || '—'}<br>
           Creada: ${esc(s.fechaCreacion)}${s.fechaCita ? ` · Cita: ${esc(s.fechaCita)}` : ''}</p>
        <div class="sic-actions">
          <button class="btn-mini pdf-sic" data-id="${s.id}">Solicitud PDF</button>
          ${p.run ? `<button class="btn-mini pat-open" data-run="${esc(p.run)}">Ver paciente</button>` : ''}
        </div>
      </div>
    </div>
  </td></tr>`;
}

function mainRow(s) {
  const open = expanded.has(s.id);
  const ges  = s.esAuge ? `<span class="bges">GES</span>` : '';
  // Si todas las filas visibles son tuyas (filtro «Mías»), la estrella no informa nada.
  const mine = isMine(s) && !allMine ? `<span class="mine" data-tip="Registrada o ejecutada por ti">★</span>` : '';
  const age  = s.antiguedadDias > 60 && ['pendiente', 'enviada'].includes(s.grupo) ? 'age-old' : '';
  return `<tr class="sic-row ${open ? 'open' : ''}" data-id="${s.id}" tabindex="0" aria-expanded="${open}">
    <td><span class="caret">${open ? '▾' : '▸'}</span> <strong>${esc(s.fecha)}</strong><br><small class="run">#${s.id}</small></td>
    <td class="num ${age}">${s.antiguedadDias}</td>
    <td>${mine}${esc(s.paciente.nombre)}${s.paciente.runStr ? `<br><small class="run">${s.paciente.runStr}</small>` : ''}</td>
    <td class="wrap">${esc(s.especialidad)}<br><small class="muted">${esc(s.motivo)}</small></td>
    <td class="wrap">${s.cie10 ? `<b class="cie">${esc(s.cie10)}</b> ` : ''}${esc(s.diagnostico)}${ges}</td>
    <td>${prioBadge(s.prioridad)}</td>
    <td>${stateDot(s.estado, { tone: sicTone(s.grupo) })}</td>
    <td class="wrap"><small>${esc(s.registrador.nombre)}</small></td>
  </tr>` + (open ? detailRow(s) : '');
}

/**
 * Renders the Interconsultas tab.
 * @param {object[]} all    every SIC loaded
 * @param {object[]} shown  filtered subset
 */
let allMine = false;

export function renderSICTab(all, shown) {
  allMine = shown.length > 0 && shown.every(isMine);
  $('sicSummary').innerHTML = summary(all, shown.length);
  const tbody = $('sicBody');
  tbody.innerHTML = shown.length
    ? shown.map(mainRow).join('')
    : `<tr><td colspan="8" class="empty">Sin interconsultas para estos filtros.</td></tr>`;
  $('sicCount').textContent = shown.length === all.length ? `${all.length} interconsultas` : `${shown.length} de ${all.length} interconsultas`;
}

export function toggleSIC(id) {
  expanded.has(id) ? expanded.delete(id) : expanded.add(id);
}

export function expandOnly(id) {
  expanded = new Set([id]);
}
