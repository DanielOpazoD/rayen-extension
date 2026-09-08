import { identidad } from './identidad.js';
import { esc } from './text.js';
import { esMiaAtencion } from './sic-rules.js';
import { SECTION_LABELS } from './ficha.js';
import { whenLabel } from './labels.js';
import { signosVitalesLista } from './his-ficha.js';

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

// «Médico», «Médico Cirujano», «Médico Internista»… pero no «Técnico Paramédico»
// ni «Tecnólogo Médico».
export const isMedico = p => /m[eé]dic/i.test(p.instrumento ?? '') && !/t[eé]cnic|param[eé]dic|tecn[oó]log/i.test(p.instrumento ?? '');

const MEDICAL_TYPE = /m[eé]dic|morbilidad|urgencia|cirug|anestes|traumat|ginec|obstet|pediatr|internist|psiquiatr|control\s+(?:cr[oó]nico|salud)/i;
const NON_MEDICAL_TYPE = /kinesi|nutric|odont|dental|matron|enfermer|psic[oó]log|taller|fonoaud|terapeuta|trabaj|social|param[eé]dic|podolog/i;

/**
 * Medicina = atendida por un profesional médico (medicina general, interna,
 * cirugía, ginecología, pediatría, anestesia, traumatología…); Otros = matrona,
 * kinesiología, nutrición, odontología, talleres… Decide por el instrumento
 * del prestador; sin prestadores, por el tipo de atención.
 */
export function isMedicalVisit(v) {
  const pres = v?.prestadores ?? [];
  if (pres.length) return pres.some(isMedico);
  const tipo = String(v?.tipoAtencion ?? '');
  if (NON_MEDICAL_TYPE.test(tipo)) return false;
  return MEDICAL_TYPE.test(tipo);
}

/**
 * @param {object[]} visits   ficha visits (with prestadores) or agenda records
 * @param {'todos'|'medicos'|'yo'} scope
 * @param {number} officerId
 */
export function filterVisitsByScope(visits, scope, officerId = identidad.officerId) {
  if (scope === 'todos') return visits;
  return visits.filter(v => {
    const pres = v.prestadores ?? [];
    // Agenda-only rows carry no prestadores: they are the officer's own agenda
    if (!pres.length) return scope === 'yo' || scope === 'medicos';
    return scope === 'yo' ? esMiaAtencion(v, officerId) : pres.some(isMedico);
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
  .visit.his{border-left:3px solid #98a1a6}
  .src{font-size:8px;font-weight:700;letter-spacing:.08em;color:#666f74;border:1px solid #d7dcdf;border-radius:3px;padding:0 3px;margin-left:auto}
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
  const mine = esMiaAtencion(v, officerId);
  const who  = (v.prestadores ?? []).map(p => `${p.nombre}${p.instrumento ? ` (${p.instrumento})` : ''}`).join(', ');
  const secs = Object.entries(v.sections ?? {});
  return `<div class="visit ${mine ? 'mine' : ''}">
    <div class="vh"><b>${esc(v.fechaAtencion)}</b><span class="muted">${esc(whenLabel(v))}</span><span class="t">${esc(v.tipoAtencion || v.razon || '')}</span>${v.esUrgencia ? '<span class="muted">· urgencia</span>' : ''}${v.fechaRegistro ? `<span class="muted">· registrada el ${esc(v.fechaRegistro)}</span>` : ''}</div>
    ${who ? `<div class="who">${esc(who)}</div>` : ''}
    ${(v.diagnosticos ?? []).map(d => `<div class="dx">${esc(d.nombre)}${d.clasificacion && d.clasificacion !== d.nombre ? ` <span class="muted">· ${esc(d.clasificacion)}</span>` : ''}${d.certeza ? ` <span class="muted">(${esc(d.certeza)})</span>` : ''}${d.esAuge ? '<span class="ges">GES</span>' : ''}</div>`).join('')}
    ${v.anamnesis?.motivo   ? `<div class="sec"><span class="sec-l">Motivo de consulta</span><p>${esc(v.anamnesis.motivo)}</p></div>` : ''}
    ${v.anamnesis?.historia ? `<div class="sec"><span class="sec-l">Historia / evolución</span><p>${esc(v.anamnesis.historia)}</p></div>` : ''}
    ${(v.extras ?? []).map(x => `<div class="sec"><span class="sec-l">${esc(x.label)}</span><p>${esc(x.text)}</p></div>`).join('')}
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
/**
 * Una atención del RCE (HIS de Hanga Roa) en el informe, con el mismo marcado
 * que una de Eloisa: en el papel las dos se leen igual, y el rótulo de origen
 * es lo único que las distingue.
 *
 * Una ficha que no se pudo leer se imprime igual, diciendo por qué: el informe
 * declara lo que falta en vez de callarlo, porque quien lo lee no puede saber
 * si esa atención no existía o si el HIS no contestó.
 *
 */
const cierreTexto = c => [
  c?.condicion && `Condición: ${c.condicion}`,
  c?.destino && `Destino: ${c.destino}`,
  c?.pronostico && `Pronóstico médico legal: ${c.pronostico}`,
  c?.fechaSalida && `Salida: ${[c.fechaSalida, c.horaSalida].filter(Boolean).join(' ')}`,
].filter(Boolean).join(' · ');

/** @param {{atencion: any, ficha?: any, error?: string}} entrada */
function hisVisitHTML({ atencion: a, ficha: f, error }) {
  const dx = [f?.diagnosticos?.principal, f?.diagnosticos?.secundario, f?.diagnosticos?.complementario].filter(Boolean);
  const sv = f?.signosVitales ?? {};
  // La misma lista que el panel: si divergen, el papel dice de un paciente algo
  // distinto que la pantalla.
  const svTxt = signosVitalesLista(sv).map(([l, v]) => `${l} ${v}`).join(' · ');
  const cierre = cierreTexto(f?.cierre);
  const sec = (l, t) => t ? `<div class="sec"><span class="sec-l">${esc(l)}</span><p>${esc(t)}</p></div>` : '';
  return `<div class="visit his">
    <div class="vh"><b>${esc(a.fecha)}</b>${f?.meta?.horaAtencion ? `<span class="muted">${esc(f.meta.horaAtencion)}</span>` : ''}<span class="t">${esc(a.tipoAtencion)}</span><span class="muted">· ${esc(a.servicio)}</span>${a.tipoFicha === 'urgencia' ? '<span class="muted">· urgencia</span>' : ''}<span class="src">RCE</span></div>
    ${f?.meta?.medico ? `<div class="who">${esc(f.meta.medico)}</div>` : ''}
    ${error ? `<div class="sec"><p class="muted">Ficha no leída desde el RCE: ${esc(error)}. Está en el HIS con el botón «Abrir».</p></div>` : ''}
    ${dx.map(d => `<div class="dx">${esc(d)}</div>`).join('')}
    ${sec('Motivo de consulta', f?.meta?.motivoConsulta)}
    ${sec('Anamnesis', f?.atencion?.anamnesis)}
    ${sec('Examen físico', f?.atencion?.examenFisico)}
    ${sec('Hipótesis diagnóstica', f?.atencion?.hipotesis)}
    ${sec(`Signos vitales${sv.hora ? ` · ${sv.hora}` : ''}`, svTxt)}
    ${sec('Indicaciones / plan', f?.atencion?.indicaciones)}
    ${sec('Indicaciones al alta', f?.atencion?.indicacionesAlta)}
    ${sec('Cierre', cierre)}
  </div>`;
}

/**
 * La sección del RCE. Va completa siempre: el listado del HIS no dice quién
 * atendió (eso sólo aparece al abrir cada ficha), así que filtrarla por
 * profesional sería inventar. En los alcances filtrados se advierte.
 * @param {{estado?: string, error?: string, atenciones?: any[], fichas?: Map<string, any>}|null} his
 * @param {string} scope
 */
function hisSectionHTML(his, scope) {
  const H = 'Atenciones del RCE · Hospital Hanga Roa';
  // Sin RCE configurado no hay nada que decir; pero si estaba y falló, el papel
  // lo dice. Un informe que calla una fuente caída se lee como si estuviera
  // completo, y quien lo lee no tiene cómo saber que falta media historia.
  if (!his) return '';
  if (his.estado === 'error') return `<h2>${H}</h2><p class="muted">RCE no disponible: ${esc(his.error ?? '')}. Esta historia está incompleta.</p>`;
  if (his.estado === 'cargando') return `<h2>${H}</h2><p class="muted">El listado del RCE aún no había llegado al generar este informe. Esta historia está incompleta.</p>`;
  const rows = his.atenciones ?? [];
  if (!rows.length) return `<h2>${H}</h2><p class="muted">Sin atenciones registradas en el RCE.</p>`;
  const fichas = his.fichas ?? new Map();
  const entradas = [...rows]
    .sort((a, b) => String(b.fecha).localeCompare(String(a.fecha)))
    .map(a => {
      const d = fichas.get(`${a.tipoFicha}:${a.idCuenta}`);
      return { atencion: a, ficha: d?.estado === 'ok' ? d.ficha : undefined, error: d?.estado === 'error' ? d.error : (d?.estado === 'ok' ? undefined : 'no se trajo el contenido') };
    });
  const aviso = scope === 'yo' || scope === 'medicos'
    ? `<p class="muted">El RCE va completo: su listado no dice qué profesional atendió, así que no se filtra por alcance.</p>` : '';
  return `<h2>${H} · ${entradas.length}</h2>${aviso}` +
    entradas.map(hisVisitHTML).join('');
}

export function buildPatientReport(cur, scope) {
  const { record, ficha } = cur;
  const officerId = identidad.officerId;
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
    // El RCE es el otro sistema del hospital: va en su propia sección, después
    // de las de Eloisa, para que el papel tenga la historia completa.
    parts.push(hisSectionHTML(cur.his, sc));
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
