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
  cr:           s => s.contrarreferencias.length ? 1 : (['atendida', 'cerrada'].includes(s.grupo) ? -1 : 0),
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
  const cr    = $('sicContra').value;
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
    (!cr    || (cr === 'si'    ? s.contrarreferencias.length > 0
              : cr === 'no'    ? s.contrarreferencias.length === 0
              : cr === 'falta' ? s.contrarreferencias.length === 0 && ['atendida','cerrada'].includes(s.grupo)
              : true)) &&
    (!q || [s.paciente.nombre, s.paciente.runStr, s.especialidad, s.diagnostico, s.cie10, s.fundamentos,
            s.registrador.nombre, s.ejecutor.nombre, String(s.id),
            ...s.contrarreferencias.map(c => c.profesional)]
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
  const atendidas = all.filter(s => ['atendida', 'cerrada'].includes(s.grupo));
  const conCR  = all.filter(s => s.contrarreferencias.length).length;
  const faltaCR = atendidas.filter(s => !s.contrarreferencias.length).length;
  const pct = atendidas.length ? Math.round(100 * faltaCR / atendidas.length) : 0;

  const tile = (n, l, filtro = null, cls = '') =>
    `<div class="stat ${cls} ${filtro ? 'stat-click' : ''}"${filtro ? ` data-filter="${esc(filtro)}" role="button" tabindex="0" data-tip="Filtrar por esto"` : ''}>` +
    `<div class="stat-n">${n}</div><div class="stat-l">${esc(l)}</div></div>`;

  return [
    tile(all.length, 'Total SIC', 'reset'),
    tile(all.filter(isMine).length, 'Mías', 'quien:mias'),
    tile(counts.pendiente, 'Pendientes', 'grupo:pendiente'),
    tile(counts.enviada, 'En curso', 'grupo:enviada'),
    tile(counts.atendida + counts.cerrada, 'Atendidas', 'grupo:atendida'),
    tile(conCR, 'Con contrarref.', 'cr:si'),
    tile(`${faltaCR}`, `Falta contrarref. · ${pct}%`, 'cr:falta', 'stat-alert'),
  ].join('')
  + (shown !== all.length ? `<div class="stat stat-muted"><div class="stat-n">${shown}</div><div class="stat-l">Filtradas</div></div>` : '');
}

/** Raw priority code + the inference explained on hover — never a made-up label. */
function prioBadge(p) {
  const { code, hint } = prioridadInfo(p);
  return `<span class="prio prio-${p}" data-tip="${esc(hint)}">${esc(code)}</span>`;
}

/** The contrarreferencia cell: the answer, its absence, or "not yet due". */
function crCell(s) {
  const c = s.contrarreferencias[0];
  if (c) {
    const extra = s.contrarreferencias.length > 1 ? ` +${s.contrarreferencias.length - 1}` : '';
    return `<span class="cr-yes" data-tip="${esc(`${c.profesional}\n${c.especialidad}\n${c.establecimiento}`)}">` +
      `<b>${esc(c.fecha)}</b>${extra}<span>${esc(c.profesional)}</span></span>`;
  }
  if (['atendida', 'cerrada'].includes(s.grupo)) {
    return `<span class="cr-missing" data-tip="La solicitud figura atendida y Rayen no registra contrarreferencia. Puede haber llegado por otra vía.">Falta</span>`;
  }
  return `<span class="muted">—</span>`;
}

function crBlock(s) {
  if (!s.contrarreferencias.length) {
    const falta = ['atendida', 'cerrada'].includes(s.grupo);
    return `<div class="cr-box ${falta ? 'miss' : ''}">
      <h4>Contrarreferencia</h4>
      <p>${falta
        ? 'La solicitud figura atendida y <b>Rayen no registra contrarreferencia</b>. Puede haber llegado por correo, en papel o de palabra: la herramienta mide el registro, no la conversación.'
        : 'Todavía no corresponde: la solicitud no está atendida.'}</p></div>`;
  }
  return `<div class="cr-box ok">
    <h4>Contrarreferencia</h4>
    ${s.contrarreferencias.map(c => `<div class="cr-item">
        <b>${esc(c.fecha)}</b> · ${esc(c.profesional)}
        <span>${esc(c.especialidad)} · ${esc(c.establecimiento)}</span>
      </div>`).join('')}
    <p class="cr-note">Rayen guarda quién y cuándo contrarrefirió, no el texto. El contenido está en el PDF de la solicitud.</p>
  </div>`;
}

function detailRow(s) {
  const p = s.paciente;
  return `<tr class="sic-detail" data-for="${s.id}"><td colspan="9">
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
        ${crBlock(s)}
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
  const mine = isMine(s) ? `<span class="mine" data-tip="Registrada o ejecutada por ti">★</span>` : '';
  const age  = s.antiguedadDias > 60 && ['pendiente', 'enviada'].includes(s.grupo) ? 'age-old' : '';
  return `<tr class="sic-row ${open ? 'open' : ''}" data-id="${s.id}" tabindex="0" aria-expanded="${open}">
    <td><span class="caret">${open ? '▾' : '▸'}</span> <strong>${esc(s.fecha)}</strong><br><small class="run">#${s.id}</small></td>
    <td class="num ${age}">${s.antiguedadDias}</td>
    <td>${mine}${esc(s.paciente.nombre)}${s.paciente.runStr ? `<br><small class="run">${s.paciente.runStr}</small>` : ''}</td>
    <td class="wrap">${esc(s.especialidad)}<br><small class="muted">${esc(s.motivo)}</small></td>
    <td class="wrap">${s.cie10 ? `<b class="cie">${esc(s.cie10)}</b> ` : ''}${esc(s.diagnostico)}${ges}</td>
    <td>${prioBadge(s.prioridad)}</td>
    <td>${stateDot(s.estado, { tone: sicTone(s.grupo) })}</td>
    <td class="cr-cell">${crCell(s)}</td>
    <td class="wrap"><small>${esc(s.registrador.nombre)}</small></td>
  </tr>` + (open ? detailRow(s) : '');
}

/**
 * Renders the Interconsultas tab.
 * @param {object[]} all    every SIC loaded
 * @param {object[]} shown  filtered subset
 */
export function renderSICTab(all, shown) {
  $('sicSummary').innerHTML = summary(all, shown.length);
  const tbody = $('sicBody');
  tbody.innerHTML = shown.length
    ? shown.map(mainRow).join('')
    : `<tr><td colspan="9" class="empty">Sin interconsultas para estos filtros.</td></tr>`;
  $('sicCount').textContent = `${shown.length} de ${all.length} solicitudes`;
}

export function toggleSIC(id) {
  expanded.has(id) ? expanded.delete(id) : expanded.add(id);
}

export function expandOnly(id) {
  expanded = new Set([id]);
}
