import { SIC_RECHAZADA_IDS } from '../core/config.js';
import { esc, stateDot, sicTone, $ } from './dom.js';
import { dateToInt } from '../core/parser.js';
import { patientKey } from '../io/notes.js';
import { sicRole } from './table.js';

/**
 * The patient-centric lens. Everything else in the app is organised by
 * appointment, which is how Rayen stores it — but a doctor asks "who are my
 * hypertensive patients", not "which appointments had hypertension".
 *
 * Pure aggregation over data already in memory: no endpoint, no cache.
 */

const OPEN = new Set(['pendiente', 'enviada']);
const ROL = { out: 'Emití', in: 'Recibí', other: 'Otra' };

/**
 * @param {object[]} allData    atención records
 * @param {object[]} sics
 * @param {object[]} pendientes
 * @returns {object[]} one row per patient, most recently seen first
 */
export function buildPatients(allData, sics = [], pendientes = []) {
  const sicsByRun = new Map();
  for (const s of sics) {
    if (!s.paciente.run) continue;
    if (!sicsByRun.has(s.paciente.run)) sicsByRun.set(s.paciente.run, []);
    sicsByRun.get(s.paciente.run).push(s);
  }
  const pendByRun = new Map();
  for (const p of pendientes) {
    if (!p.run) continue;
    if (!pendByRun.has(p.run)) pendByRun.set(p.run, []);
    pendByRun.get(p.run).push(p);
  }

  const by = new Map();
  for (const r of allData) {
    const k = patientKey(r);
    if (!by.has(k)) by.set(k, []);
    by.get(k).push(r);
  }

  const out = [];
  for (const [key, visitas] of by) {
    visitas.sort((a, b) => dateToInt(b.fechaAtencion) - dateToInt(a.fechaAtencion) || String(b.hora).localeCompare(String(a.hora)));
    const ref = visitas[0];

    // Distinct diagnoses, most recent first, keeping the GES flag
    const dx = new Map();
    for (const v of visitas) for (const d of v.diagnosticos ?? []) {
      const n = d.clasificacion || d.nombre;
      if (!n || /no informado/i.test(n)) continue;
      if (!dx.has(n)) dx.set(n, { nombre: d.nombre || n, esAuge: !!d.esAuge, fecha: v.fechaAtencion });
      else if (d.esAuge) dx.get(n).esAuge = true;
    }
    const misSics = ref.run ? (sicsByRun.get(ref.run) ?? []) : [];
    const pend    = ref.run ? (pendByRun.get(ref.run) ?? []) : [];

    out.push({
      key,
      id:       ref.id,               // opens the panel through the usual path
      nombre:   ref.nombre,
      run:      ref.run,
      runStr:   ref.runStr,
      edad:     ref.edad,
      sexo:     ref.sexo,
      visitas:  visitas.length,
      ultima:   ref.fechaAtencion,
      ultima8:  ref.fecha8,
      dx:       [...dx.values()],
      ges:      [...dx.values()].some(d => d.esAuge),
      sics:     misSics,
      abiertas: misSics.filter(s => OPEN.has(s.grupo)),
      rechazadas: misSics.filter(s => SIC_RECHAZADA_IDS.has(s.estadoId)),
      pend,
      nota:     ref.note ?? '',
    });
  }
  out.sort((a, b) => dateToInt(b.ultima) - dateToInt(a.ultima));
  return out;
}

const SORT = {
  nombre:  p => p.nombre.toLowerCase(),
  edad:    p => p.edad ?? -1,
  visitas: p => p.visitas,
  ultima:  p => dateToInt(p.ultima),
  sics:    p => p.abiertas.length * 100 + p.sics.length,
  pend:    p => p.pend.length,
};
let sortKey = 'ultima', sortDir = -1;

export function setPatientSort(key) {
  if (!SORT[key]) return { key: sortKey, dir: sortDir };
  sortDir = key === sortKey ? -sortDir : (key === 'nombre' ? 1 : -1);
  sortKey = key;
  return { key: sortKey, dir: sortDir };
}

export function sortPatients(list) {
  const get = SORT[sortKey];
  return list.slice().sort((a, b) => {
    const va = get(a), vb = get(b);
    return (va < vb ? -1 : va > vb ? 1 : 0) * sortDir || a.nombre.localeCompare(b.nombre);
  });
}

/** Pure filter, so it can be tested without the DOM. */
export function filterPatients(list, { q = '', modo = '' } = {}) {
  const s = q.trim().toLowerCase();
  return list.filter(p =>
    (!modo || (modo === 'sic'  ? p.abiertas.length > 0
             : modo === 'pend' ? p.pend.length > 0
             : modo === 'ges'  ? p.ges
             : modo === 'nota' ? !!p.nota
             : modo === 'rec'  ? p.visitas === 1
             : true)) &&
    (!s || [p.nombre, p.runStr, p.run, p.nota, ...p.dx.map(d => d.nombre)]
             .some(v => String(v ?? '').toLowerCase().includes(s)))
  );
}

function row(p) {
  const dx = p.dx.length
    ? p.dx.slice(0, 2).map(d => `<span class="pac-dx"><b>${esc(d.nombre)}</b>${d.esAuge ? ' <span class="bges">GES</span>' : ''}</span>`).join('') +
      (p.dx.length > 2 ? `<span class="pac-dx pac-more">+${p.dx.length - 2} más</span>` : '')
    : `<span class="pac-none">—</span>`;

  const sic = p.abiertas.length
    ? `<div class="pac-sic">` + p.abiertas.slice(0, 2).map(s =>
        `<span class="ic-line sic-link" data-sic="${s.id}" role="button" tabindex="0" data-tip="SIC #${s.id} · ${esc(s.estado)} · ${s.antiguedadDias} días">` +
        `<span class="rol rol-${sicRole(s)}">${ROL[sicRole(s)]}</span><span class="ic-esp">${esc(s.especialidad)}</span>` +
        stateDot(s.estado, { tone: sicTone(s.grupo), small: true }) + `</span>`).join('') +
      (p.abiertas.length > 2 ? `<span class="pac-more">+${p.abiertas.length - 2}</span>` : '') + `</div>`
    : p.rechazadas.length ? `<span class="pac-rech" data-tip="${esc(p.rechazadas.map(s => `${s.especialidad} · ${s.estado}`).join('\n'))}">${p.rechazadas.length} rechazada${p.rechazadas.length > 1 ? 's' : ''}</span>`
    : p.sics.length ? `<span class="pac-none">${p.sics.length} cerrada${p.sics.length > 1 ? 's' : ''}</span>`
    : `<span class="pac-none">—</span>`;

  const pend = p.pend.length
    ? `<span class="pac-pend" data-tip="${esc(p.pend.map(x => `${x.titulo} · ${x.dias} d`).join('\n'))}">${p.pend.length} pendiente${p.pend.length > 1 ? 's' : ''}</span>`
    : `<span class="pac-none">—</span>`;

  return `<tr class="pac-row" data-id="${esc(p.id)}" tabindex="0">
    <td><span class="pname">${esc(p.nombre)}</span>${p.runStr ? `<span class="run copy-run" data-run="${esc(p.runStr)}" role="button" tabindex="0" data-tip="Copiar RUN">${p.runStr}</span>` : ''}</td>
    <td>${p.edad ?? ''}${p.sexo ? ` <span class="muted">${esc(p.sexo[0])}</span>` : ''}</td>
    <td class="num">${p.visitas}</td>
    <td>${p.ultima}</td>
    <td class="wrap">${dx}</td>
    <td class="wrap">${sic}</td>
    <td>${pend}</td>
    <td class="wrap">${p.nota ? `<span class="pac-nota">${esc(p.nota)}</span>` : `<span class="pac-none">—</span>`}</td>
  </tr>`;
}

export function renderPatients(all, shown) {
  $('pacBody').innerHTML = shown.length
    ? shown.map(row).join('')
    : `<tr><td colspan="8" class="empty">Sin pacientes para este filtro.</td></tr>`;
  const conSic  = all.filter(p => p.abiertas.length).length;
  const conPend = all.filter(p => p.pend.length).length;
  $('pacFoot').textContent = shown.length === all.length ? `${all.length} pacientes` : `${shown.length} de ${all.length} pacientes`;
  $('pacCount').textContent = `${all.length} pacientes · ${conSic} con IC abierta · ${conPend} con pendientes`;
}

/** Columns for the CSV, mirroring what the table shows. */
export const PACIENTE_COLS = [
  ['Paciente', p => p.nombre], ['RUN', p => p.runStr], ['Edad', p => p.edad, 'n'], ['Sexo', p => p.sexo],
  ['Atenciones', p => p.visitas, 'n'], ['Última atención', p => p.ultima],
  ['Diagnósticos', p => p.dx.map(d => d.nombre).join(' | ')], ['GES', p => p.ges ? 'Sí' : 'No'],
  ['Interconsultas abiertas', p => p.abiertas.map(s => `${s.especialidad} (${s.estado})`).join(' | ')],
  ['Interconsultas totales', p => p.sics.length, 'n'],
  ['Pendientes', p => p.pend.map(x => x.titulo).join(' | ')],
  ['Nota', p => p.nota],
];
