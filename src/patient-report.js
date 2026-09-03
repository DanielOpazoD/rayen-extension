import { esc } from './dom.js';
import { CONFIG } from './config.js';
import { SECTION_LABELS } from './ficha.js';
import { whenLabel } from './table.js';

/**
 * Printable clinical history for one patient, built from the same data the
 * panel shows. Scope decides which atenciones go in; interconsultas and
 * recetas ride along for the "completo" report.
 */

export const SCOPE_LABEL = Object.freeze({
  todos:    'Atenciones · todos los profesionales',
  medicos:  'Atenciones · solo médicos',
  yo:       'Atenciones · solo mías',
  ic:       'Interconsultas del paciente',
  completo: 'Historia completa',
});

const isMedico = p => /m[eé]dic/i.test(p.instrumento ?? '');
const isMine   = (v, officerId) => (v.prestadores ?? []).some(p => p.id === officerId);

/**
 * @param {object[]} visits   ficha visits (with prestadores) or agenda records
 * @param {'todos'|'medicos'|'yo'} scope
 * @param {number} officerId
 */
export function filterVisitsByScope(visits, scope, officerId = CONFIG.officerId) {
  if (scope === 'todos') return visits;
  return visits.filter(v => {
    const pres = v.prestadores ?? [];
    // Agenda-only rows carry no prestadores: they are the officer's own agenda
    if (!pres.length) return scope === 'yo' || scope === 'medicos';
    return scope === 'yo' ? isMine(v, officerId) : pres.some(isMedico);
  });
}

const REPORT_CSS = `
  body{font-size:12px;max-width:820px}
  h1{font-size:20px;color:#14614a}
  h2{font-size:13px;text-transform:uppercase;letter-spacing:.08em;color:#666f74;margin:22px 0 8px;padding-bottom:4px;border-bottom:1px solid #e4e7e7}
  .meta{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:4px 16px;font-size:11px;color:#4b5358;margin:8px 0 4px}
  .meta b{display:block;color:#98a1a6;font-size:9px;text-transform:uppercase;letter-spacing:.06em}
  .visit{border:1px solid #e4e7e7;border-radius:6px;padding:9px 12px;margin-bottom:8px;break-inside:avoid}
  .visit.mine{border-left:3px solid #1a7f5f}
  .vh{display:flex;gap:10px;align-items:baseline;flex-wrap:wrap;margin-bottom:3px}
  .vh b{font-size:13px}
  .vh .t{color:#4b5358}
  .who{font-size:10px;color:#666f74;margin-bottom:5px}
  .dx{margin:2px 0 2px 8px;padding-left:8px;border-left:2px solid #d7dcdf}
  .sec{margin-top:6px}
  .sec-l{font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:#666f74}
  .sec p{white-space:pre-wrap;margin:1px 0 0;color:#2d3338}
  .item{margin-left:8px;padding-left:8px;border-left:2px solid #d7dcdf}
  .item small{display:block;color:#666f74}
  .sic{border:1px solid #e4e7e7;border-radius:6px;padding:9px 12px;margin-bottom:8px;break-inside:avoid}
  .ges{background:#1a7f5f;color:#fff;font-size:9px;padding:0 4px;border-radius:3px;margin-left:4px}
  .muted{color:#98a1a6}
  .foot{margin-top:24px;padding-top:8px;border-top:1px solid #e4e7e7;font-size:10px;color:#666f74}
  @media print{@page{size:portrait;margin:14mm}}
`;

function visitHTML(v, officerId) {
  const mine = isMine(v, officerId);
  const who  = (v.prestadores ?? []).map(p => `${p.nombre}${p.instrumento ? ` (${p.instrumento})` : ''}`).join(', ');
  const secs = Object.entries(v.sections ?? {});
  return `<div class="visit ${mine ? 'mine' : ''}">
    <div class="vh"><b>${esc(v.fechaAtencion)}</b><span class="muted">${esc(whenLabel(v))}</span><span class="t">${esc(v.tipoAtencion || v.razon || '')}</span>${v.esUrgencia ? '<span class="muted">· urgencia</span>' : ''}</div>
    ${who ? `<div class="who">${esc(who)}</div>` : ''}
    ${(v.diagnosticos ?? []).map(d => `<div class="dx">${esc(d.nombre)}${d.clasificacion && d.clasificacion !== d.nombre ? ` <span class="muted">· ${esc(d.clasificacion)}</span>` : ''}${d.certeza ? ` <span class="muted">(${esc(d.certeza)})</span>` : ''}${d.esAuge ? '<span class="ges">GES</span>' : ''}</div>`).join('')}
    ${v.anamnesis?.motivo   ? `<div class="sec"><span class="sec-l">Motivo de consulta</span><p>${esc(v.anamnesis.motivo)}</p></div>` : ''}
    ${v.anamnesis?.historia ? `<div class="sec"><span class="sec-l">Historia / evolución</span><p>${esc(v.anamnesis.historia)}</p></div>` : ''}
    ${secs.map(([id, items]) => `<div class="sec"><span class="sec-l">${esc(SECTION_LABELS[id] ?? id)}</span>` +
        items.map(it => `<div class="item">${esc(it.label)}${it.suspendido ? ' <span class="muted">(suspendido)</span>' : ''}${it.details?.length ? `<small>${esc(it.details.join(' · '))}</small>` : ''}</div>`).join('') + `</div>`).join('')}
    ${(v.actividades ?? []).length ? `<div class="sec"><span class="sec-l">Actividades</span><p>${v.actividades.map(a => esc(a.descripcion || a.codigo)).join(' · ')}</p></div>` : ''}
  </div>`;
}

function sicHTML(s) {
  return `<div class="sic">
    <div class="vh"><b>${esc(s.fecha)}</b><span class="t">${esc(s.especialidad)}</span><span class="muted">· ${esc(s.estado)} · SIC #${s.id}</span>${s.esAuge ? '<span class="ges">GES</span>' : ''}</div>
    <div class="who">Solicitó ${esc(s.registrador?.nombre || '—')}${s.ejecutor?.nombre ? ` · Ejecutor ${esc(s.ejecutor.nombre)}` : ''}${s.motivo ? ` · ${esc(s.motivo)}` : ''}</div>
    ${s.diagnostico ? `<div class="dx">${s.cie10 ? `<b>${esc(s.cie10)}</b> ` : ''}${esc(s.diagnostico)}</div>` : ''}
    ${s.fundamentos ? `<div class="sec"><span class="sec-l">Fundamentos clínicos</span><p>${esc(s.fundamentos)}</p></div>` : ''}
    ${s.examenes ? `<div class="sec"><span class="sec-l">Exámenes realizados</span><p>${esc(s.examenes)}</p></div>` : ''}
  </div>`;
}

/**
 * @param {{ record, visits, sics, ficha }} cur  the panel's current patient
 * @param {keyof SCOPE_LABEL} scope
 * @returns {{ fragment: string, css: string }}
 */
export function buildPatientReport(cur, scope) {
  const { record, ficha } = cur;
  const officerId = CONFIG.officerId;
  const m = ficha?.master;
  const hasFicha = !!ficha?.visits?.length;
  const source = hasFicha ? ficha.visits : cur.visits;
  const desde  = source.length ? source[source.length - 1].fechaAtencion : '';

  const meta = `<div class="meta">
    <div><b>RUN</b>${esc(record.runStr || '—')}</div>
    <div><b>Nacimiento</b>${esc(m?.dob || record.dob || '—')}${record.edad != null ? ` · ${record.edad} años` : ''}</div>
    <div><b>Sexo</b>${esc(m?.sexo || record.sexo || '—')}</div>
    <div><b>Previsión</b>${esc(m?.prevision || record.prevision || '—')}</div>
    ${m?.ficha ? `<div><b>N° ficha</b>${esc(m.ficha)}</div>` : ''}
    ${m?.telefonos ? `<div><b>Teléfono</b>${esc(m.telefonos)}</div>` : ''}
  </div>`;

  const parts = [];
  const wantVisits = scope !== 'ic';
  const wantIC     = scope === 'ic' || scope === 'completo';
  const wantRx     = scope === 'completo';

  if (wantVisits) {
    const sc = scope === 'completo' ? 'todos' : scope;
    const vis = filterVisitsByScope(source, sc, officerId);
    parts.push(`<h2>${esc(SCOPE_LABEL[sc])} · ${vis.length}</h2>` +
      (vis.length ? vis.map(v => visitHTML(v, officerId)).join('') : `<p class="muted">Sin atenciones en este alcance.</p>`));
  }

  if (wantIC) {
    const sics = cur.sics ?? [];
    const deriv = (ficha?.visits ?? []).flatMap(v => (v.sections?.derivaciones ?? []).map(d => ({ fecha: v.fechaAtencion, label: d.label, details: d.details })));
    parts.push(`<h2>Interconsultas · ${sics.length}</h2>` +
      (sics.length ? sics.map(sicHTML).join('') : `<p class="muted">Sin interconsultas en el período cargado.</p>`) +
      (deriv.length ? `<h2>Derivaciones registradas en atenciones · ${deriv.length}</h2>` +
        deriv.map(d => `<div class="item"><b>${esc(d.fecha)}</b> · ${esc(d.label)}${d.details?.length ? ` <span class="muted">· ${esc(d.details.join(' · '))}</span>` : ''}</div>`).join('') : ''));
  }

  if (wantRx) {
    const f = ficha?.antecedentes?.farmacos ?? [];
    const withRx = (ficha?.visits ?? []).filter(v => v.sections?.prescripciones || v.sections?.recetas);
    parts.push(`<h2>Fármacos en uso · ${f.length}</h2>` +
      (f.length ? f.map(x => `<div class="item">${esc(x.label)}<small>${esc([x.posologia, x.estado ? `receta ${x.estado.toLowerCase()}` : '', x.fecha].filter(Boolean).join(' · '))}</small></div>`).join('') : `<p class="muted">Sin fármacos en uso registrados.</p>`) +
      (withRx.length ? `<h2>Recetas por atención · ${withRx.length}</h2>` + withRx.map(v =>
        `<div class="visit"><div class="vh"><b>${esc(v.fechaAtencion)}</b><span class="muted">${esc((v.prestadores ?? []).map(p => p.nombre).join(', '))}</span></div>` +
        [...(v.sections.recetas ?? []), ...(v.sections.prescripciones ?? [])].map(it => `<div class="item">${esc(it.label)}${it.details?.length ? `<small>${esc(it.details.join(' · '))}</small>` : ''}</div>`).join('') + `</div>`).join('') : ''));
  }

  const fragment =
    `<h1>${esc(record.nombre)}</h1>` + meta +
    `<p class="sub">${esc(SCOPE_LABEL[scope])} · ${hasFicha ? `ficha electrónica desde ${esc(desde)}` : 'solo agenda del Dr. Opazo (ficha no cargada)'} · generado ${new Date().toLocaleString('es-CL')}</p>` +
    parts.join('') +
    `<div class="foot">Fuente: Rayen/Eloisa, Hospital Hanga Roa. Documento de trabajo del Dr. Daniel Opazo Damiani; contiene datos clínicos del paciente.</div>`;

  return { fragment, css: REPORT_CSS };
}
