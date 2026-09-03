import { esc, sicClass, fillSelect, $ } from './dom.js';
import { CONFIG, SIC_GRUPO, SIC_PRIORIDAD } from './config.js';
import { isMine } from './sic.js';

let expanded = new Set();

/** Applies the IC tab filter controls to the SIC list. */
export function filterSICs(sics) {
  const q     = $('sicSearch').value.trim().toLowerCase();
  const grupo = $('sicGrupo').value;
  const esp   = $('sicEsp').value;
  const quien = $('sicQuien').value;
  const cr    = $('sicContra').value;

  return sics.filter(s =>
    (!grupo || s.grupo === grupo) &&
    (!esp   || s.especialidad === esp) &&
    (!quien || (quien === 'mias'     ? isMine(s)
              : quien === 'emitidas' ? s.registrador.id === CONFIG.officerId
              : quien === 'recibidas' ? s.ejecutor.id === CONFIG.officerId
              : true)) &&
    (!cr    || (cr === 'si' ? s.contrarreferencias.length > 0 : s.contrarreferencias.length === 0)) &&
    (!q || [s.paciente.nombre, s.paciente.runStr, s.especialidad, s.diagnostico, s.cie10, s.fundamentos, s.registrador.nombre, s.ejecutor.nombre, String(s.id)]
      .some(v => String(v ?? '').toLowerCase().includes(q)))
  );
}

export function buildSICFilters(sics) {
  fillSelect($('sicEsp'), [...new Set(sics.map(s => s.especialidad).filter(Boolean))].sort());
}

function summary(all, shown) {
  const counts = Object.fromEntries(Object.keys(SIC_GRUPO).map(k => [k, 0]));
  for (const s of all) counts[s.grupo] = (counts[s.grupo] ?? 0) + 1;
  const mine = all.filter(isMine).length;
  const withCR = all.filter(s => s.contrarreferencias.length).length;
  const ges = all.filter(s => s.esAuge).length;
  const oldPending = all.filter(s => ['pendiente', 'enviada'].includes(s.grupo) && s.antiguedadDias > 60).length;
  return [
    [all.length, 'Total SIC'],
    [mine, 'Mías'],
    [counts.pendiente, 'Pendientes'],
    [counts.enviada, 'En curso'],
    [counts.atendida, 'Atendidas'],
    [counts.cerrada, 'Cerradas'],
    [counts.fallida, 'Fallidas'],
    [withCR, 'Con contrarref.'],
    [ges, 'GES'],
    [oldPending, '> 60 días sin resolver'],
  ].map(([n, l]) => `<div class="stat"><div class="stat-n">${n}</div><div class="stat-l">${l}</div></div>`).join('')
  + (shown !== all.length ? `<div class="stat stat-muted"><div class="stat-n">${shown}</div><div class="stat-l">Filtradas</div></div>` : '');
}

function prioBadge(p) {
  const lbl = SIC_PRIORIDAD[p] ?? `P${p}`;
  return `<span class="prio prio-${p}" data-tip="Prioridad ${p}">${esc(lbl)}</span>`;
}

function detailRow(s) {
  const cr = s.contrarreferencias.length
    ? s.contrarreferencias.map(c => `<li>${c.fecha} · ${esc(c.profesional)} (${esc(c.especialidad)}) · ${esc(c.establecimiento)}</li>`).join('')
    : '<li class="muted">Sin contrarreferencia registrada</li>';
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
        <h4>Paciente</h4>
        <p>${esc(p.nombre)}${p.runStr ? ` · ${p.runStr}` : ''}<br>
           ${[p.sexo, p.edad, p.prevision].filter(Boolean).map(esc).join(' · ')}<br>
           ${p.telefono ? `☎ ${esc(p.telefono)}` : ''} ${p.direccion ? `· ${esc(p.direccion)}` : ''}<br>
           <span class="muted">${esc(p.tipoUsuario)}</span></p>
        <h4>Derivación</h4>
        <p>Motivo: ${esc(s.motivo) || '—'}<br>
           Problema de salud: ${esc(s.problemaSalud) || '—'}<br>
           ${esc(s.origen)} (${esc(s.especialidadOrigen)}) → ${esc(s.destino)} (${esc(s.especialidad)})<br>
           Solicitante: ${esc(s.registrador.nombre) || '—'}<br>
           Ejecutor: ${esc(s.ejecutor.nombre) || '—'}<br>
           Creada: ${esc(s.fechaCreacion)}${s.fechaEnvio ? ` · Enviada: ${esc(s.fechaEnvio)}` : ''}${s.fechaCita ? ` · Cita: ${esc(s.fechaCita)}` : ''}</p>
        <h4>Contrarreferencia</h4>
        <ul class="cr-list">${cr}</ul>
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
  const cr   = s.contrarreferencias.length ? `<span class="badge bc" data-tip="Contrarreferencia recibida">CR</span>` : '';
  const ges  = s.esAuge ? `<span class="badge bges">GES</span>` : '';
  const mine = isMine(s) ? `<span class="mine" data-tip="Registrada o ejecutada por ti">★</span>` : '';
  const age  = s.antiguedadDias > 60 && ['pendiente', 'enviada'].includes(s.grupo) ? 'age-old' : '';
  return `<tr class="sic-row ${open ? 'open' : ''}" data-id="${s.id}">
    <td><span class="caret">${open ? '▾' : '▸'}</span> <strong>${esc(s.fecha)}</strong><br><small class="run">#${s.id}</small></td>
    <td class="num ${age}">${s.antiguedadDias}</td>
    <td>${mine}${esc(s.paciente.nombre)}${s.paciente.runStr ? `<br><small class="run">${s.paciente.runStr}</small>` : ''}</td>
    <td class="wrap">${esc(s.especialidad)}<br><small class="muted">${esc(s.motivo)}</small></td>
    <td class="wrap">${s.cie10 ? `<b class="cie">${esc(s.cie10)}</b> ` : ''}${esc(s.diagnostico)}</td>
    <td>${prioBadge(s.prioridad)}</td>
    <td><span class="badge ${sicClass(s.grupo)}" data-tip="${esc(s.estado)}">${esc(s.estado)}</span></td>
    <td>${ges} ${cr}</td>
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
