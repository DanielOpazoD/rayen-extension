import { esc, stateDot, sicTone, $ } from './dom.js';
import { localDateStr, dateToInt } from './parser.js';
import { patientKey } from './notes.js';
import { sicRole } from './table.js';

/** SIC groups that still need someone to act on them. */
const OPEN_GROUPS = new Set(['pendiente', 'enviada']);
const DOW = ['domingo','lunes','martes','miércoles','jueves','viernes','sábado'];
const MONTH = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
const ROL_LABEL = { out: 'Emití', in: 'Recibí', other: 'Otra' };

/** "martes 2 de septiembre" */
function longDate(d8) {
  if (d8.length !== 8) return '';
  const d = new Date(+d8.slice(0, 4), +d8.slice(4, 6) - 1, +d8.slice(6, 8));
  return `${DOW[d.getDay()]} ${d.getDate()} de ${MONTH[d.getMonth()]}`;
}

// ── Novedades: what moved in the watched streams ───────────────

function novedadesHTML({ cambios, firstRun, desde, vigiladas }, especialidades) {
  const esp = especialidades.join(' · ');
  if (firstRun) {
    return `<section class="brief">
      <h3 class="brief-h">Novedades <span>${esc(esp)}</span></h3>
      <div class="brief-empty">Vigilancia iniciada: se seguirán ${vigiladas} ${vigiladas === 1 ? 'interconsulta' : 'interconsultas'} de estas especialidades.
        Cuando alguna cambie de estado aparecerá aquí en la próxima carga.</div></section>`;
  }
  if (!cambios.length) {
    const cuando = desde ? new Date(desde).toLocaleString('es-CL', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }) : '';
    return `<section class="brief">
      <h3 class="brief-h">Novedades <span>${esc(esp)}</span></h3>
      <div class="brief-empty">Sin cambios en ${vigiladas} interconsultas vigiladas${cuando ? ` desde el ${cuando}` : ''}.</div></section>`;
  }
  return `<section class="brief">
    <h3 class="brief-h">Novedades <span>${esc(esp)} · ${cambios.length}</span></h3>
    ${cambios.map(c => `
      <div class="nov nov-${c.tipo} sic-link" data-sic="${c.id}" role="button" tabindex="0" data-tip="Abrir en Interconsultas">
        <span class="nov-tag">${esc(c.label)}</span>
        <span class="nov-pac">${esc(c.paciente)}</span>
        <span class="nov-esp">${esc(c.especialidad)}</span>
        <span class="nov-mov">${c.antes ? `${esc(c.antes)} → ` : ''}<b>${esc(c.ahora)}</b></span>
      </div>`).join('')}
  </section>`;
}

// ── Agenda ─────────────────────────────────────────────────────

function context(rec, allData, sics) {
  const key = patientKey(rec);
  const past = allData
    .filter(r => patientKey(r) === key && r.id !== rec.id)
    .sort((a, b) => dateToInt(b.fechaAtencion) - dateToInt(a.fechaAtencion));

  const dx = new Map();
  for (const v of past) for (const d of v.diagnosticos ?? []) {
    const k = d.clasificacion || d.nombre;
    if (!k || /no informado/i.test(k)) continue;
    if (!dx.has(k)) dx.set(k, { ...d, fecha: v.fechaAtencion });
  }
  const open = (rec.run ? sics.filter(s => s.paciente.run === rec.run) : [])
    .filter(s => OPEN_GROUPS.has(s.grupo))
    .sort((a, b) => b.antiguedadDias - a.antiguedadDias);

  return { dx: [...dx.values()].slice(0, 6), open: open.slice(0, 4), visitas: past.length };
}

function card(rec, allData, sics) {
  const { dx, open, visitas } = context(rec, allData, sics);
  const done = /Completado|presentó/i.test(rec.estado);

  const dxHTML = dx.length
    ? dx.map(d => `<div>${esc(d.nombre)}${d.esAuge ? ' <span class="bges">GES</span>' : ''} <span class="muted">· ${d.fecha}</span></div>`).join('')
    : `<div class="none">${visitas ? 'Sin diagnósticos registrados' : 'Primera atención contigo'}</div>`;

  const icHTML = open.length
    ? open.map(s => `<div><span class="rol rol-${sicRole(s)}">${ROL_LABEL[sicRole(s)]}</span> ${esc(s.especialidad)} ` +
        `${stateDot(s.estado, { tone: sicTone(s.grupo), small: true })} <span class="muted">· ${s.antiguedadDias} d</span></div>`).join('')
    : `<div class="none">Sin interconsultas abiertas</div>`;

  return `
    <article class="tcard ${done ? 'done' : ''}">
      <div class="tcard-h pat-link" data-id="${esc(rec.id)}" role="button" tabindex="0" data-tip="Abrir ficha completa">
        <span class="thora">${rec.hora || '—'}</span>
        <span class="tname"><b>${esc(rec.nombre)}</b><span>${esc(rec.runStr)}${rec.edad != null ? ` · ${rec.edad} a` : ''}</span></span>
        <span class="ttipo">${esc(rec.tipoAtencion || rec.razon)}</span>
        ${stateDot(rec.estado)}
      </div>
      <div class="tcard-b">
        <div class="tblock"><h5>Diagnósticos previos</h5>${dxHTML}</div>
        <div class="tblock"><h5>Interconsultas abiertas</h5>${icHTML}</div>
        ${rec.note ? `<div class="tnote"><b>Nota:</b> ${esc(rec.note)}</div>` : ''}
      </div>
    </article>`;
}

/**
 * The morning brief: what changed in the watched streams and who is on today's
 * agenda with their background. Overdue loops live in Pacientes, not here.
 *
 * @param {object[]} allData
 * @param {object[]} sics
 * @param {{ novedades?: object, especialidades?: string[], dia8?: string }} extra
 *   dia8 shows a chosen day instead of today (no fallback to the last day with data).
 * @returns {string} the day actually shown (YYYYMMDD)
 */
export function renderToday(allData, sics = [], extra = {}) {
  const el = $('todayContent');
  if (!allData.length) {
    el.innerHTML = `<div class="today-empty"><b>Carga los datos para ver la jornada</b>La agenda de hoy y los cambios recientes en tus interconsultas.</div>`;
    return;
  }

  const hoy = localDateStr(new Date());
  let dia = extra.dia8 || hoy;
  let rows = allData.filter(r => r.fecha8 === dia);
  if (!rows.length && !extra.dia8) {
    const past = [...new Set(allData.map(r => r.fecha8).filter(d => d && d < hoy))].sort().pop();
    if (past) { dia = past; rows = allData.filter(r => r.fecha8 === past); }
  }
  rows.sort((a, b) => String(a.hora).localeCompare(String(b.hora)));

  const pend = rows.filter(r => !/Completado|presentó/i.test(r.estado)).length;
  const esHoy = dia === hoy;

  const brief = extra.novedades ? novedadesHTML(extra.novedades, extra.especialidades ?? []) : '';

  const agenda = rows.length
    ? `<div class="today-h">
         <h2>${esHoy ? 'Hoy' : extra.dia8 ? 'Jornada' : 'Última jornada'} · ${longDate(dia)}</h2>
         <span>${rows.length} ${rows.length === 1 ? 'atención' : 'atenciones'}${pend ? ` · ${pend} sin cerrar` : ''}${esHoy || extra.dia8 ? '' : ' · hoy no hay agenda cargada'}</span>
       </div>` + rows.map(r => card(r, allData, sics)).join('')
    : `<div class="today-empty"><b>Sin atenciones el ${longDate(dia)}</b>${extra.dia8 ? 'Usa las flechas para moverte de día.' : 'No hay citas ni atenciones en el período cargado.'}</div>`;

  el.innerHTML = brief + agenda;
  return dia;
}
