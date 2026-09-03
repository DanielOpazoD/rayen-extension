import { fillSelect, $ } from './dom.js';
import { dateToInt } from './parser.js';

export function buildStats(allData, team = {}) {
  const t    = allData.length;
  const cp   = allData.filter(p => p.estado === 'Completado').length;
  const ns   = allData.filter(p => /presentó/i.test(p.estado)).length;
  const esp  = allData.filter(p => p.origen === 'ficha').length;
  const ic   = allData.filter(p => p.esIC).length;
  const dx   = allData.filter(p => p.diagnosticos?.length).length;
  const ges  = allData.filter(p => p.diagnosticos?.some(d => d.esAuge)).length;
  const urg  = allData.filter(p => p.esUrgencia).length;
  const dias = new Set(allData.map(p => p.fechaAtencion)).size;
  const ages = allData.map(p => Number(p.edad)).filter(n => Number.isFinite(n));
  const avgE = ages.length ? Math.round(ages.reduce((a, b) => a + b, 0) / ages.length) : 0;
  const fem  = allData.filter(p => /mujer|femen/i.test(p.sexo)).length;
  const teamTotal = Object.values(team).reduce((a, d) => a + d.total, 0);

  $('statsBar').innerHTML = [
    [t,         'Total'],
    [cp,        'Completadas'],
    [ns,        'Inasistentes'],
    [esp,       'Sin cita / espontáneas'],
    [ic,        'Interconsultas'],
    [dx,        'Con diagnóstico'],
    [ges,       'GES'],
    [urg,       'Urgencias'],
    [dias,      'Días'],
    [avgE+' a', 'Edad prom.'],
    [fem,       'Mujeres'],
    [t - fem,   'Hombres'],
    ...(teamTotal ? [[teamTotal.toLocaleString('es-CL'), 'Equipo HHR']] : []),
  ].map(([n, l]) => `<div class="stat"><div class="stat-n">${n}</div><div class="stat-l">${l}</div></div>`)
   .join('');
}

/** Refills every filter select from the data, preserving the current selection. */
export function buildFilters(allData) {
  const fechas  = [...new Set(allData.map(p => p.fechaAtencion))].sort((a, b) => dateToInt(b) - dateToInt(a));
  const dias    = ['Lun','Mar','Mié','Jue','Vie','Sáb','Dom'].filter(d => allData.some(p => p.diaSemana === d));
  const sexos   = [...new Set(allData.map(p => p.sexo).filter(Boolean))].sort();
  const estados = [...new Set(allData.map(p => p.estado).filter(Boolean))].sort();
  const prevs   = [...new Set(allData.map(p => p.prevision).filter(Boolean))].sort();
  const tipos   = [...new Set(allData.map(p => p.tipoAtencion).filter(Boolean))].sort();
  const prest   = [...new Set(allData.flatMap(p => (p.prestadores ?? []).map(x => x.nombre)).filter(Boolean))].sort();

  fillSelect($('filtFecha'),  fechas);
  fillSelect($('filtDia'),    dias);
  fillSelect($('filtSexo'),   sexos);
  fillSelect($('filtEstado'), estados);
  fillSelect($('filtPrev'),   prevs);
  fillSelect($('filtTipo'),   tipos);
  fillSelect($('filtPrest'),  prest);
}

/**
 * Applies the Atenciones filter controls.
 * @param {object[]} allData
 * @param {{ sicsByRun: Map<string, object[]> }} ctx  loaded SICs, for the "paciente con SIC" filter
 */
export function filterRecords(allData, ctx = { sicsByRun: new Map() }) {
  const s  = $('search').value.toLowerCase();
  const f  = $('filtFecha').value;
  const d  = $('filtDia').value;
  const sx = $('filtSexo').value;
  const e  = $('filtEstado').value;
  const pr = $('filtPrev').value;
  const tp = $('filtTipo').value;
  const pt = $('filtPrest').value;
  const ic = $('filtIC').value;
  const dx = $('filtDx').value;

  return allData.filter(p =>
    (!s  || [p.nombre, p.ap, p.am, p.runStr, p.run, ...(p.diagnosticos ?? []).map(x => x.nombre)]
             .some(v => String(v ?? '').toLowerCase().includes(s))) &&
    (!f  || p.fechaAtencion === f) &&
    (!d  || p.diaSemana === d) &&
    (!sx || p.sexo === sx) &&
    (!e  || p.estado === e) &&
    (!pr || p.prevision === pr) &&
    (!tp || p.tipoAtencion === tp) &&
    (!pt || (p.prestadores ?? []).some(x => x.nombre === pt)) &&
    (!ic || (ic === 'cita'     ? p.esIC
          : ic === 'emiti'    ? (p.run && (ctx.sicsByRun.get(p.run) ?? []).some(s => s.registrador.id === ctx.officerId))
          : ic === 'recibi'   ? (p.esIC || (p.run && (ctx.sicsByRun.get(p.run) ?? []).some(s => s.ejecutor.id === ctx.officerId)))
          : ic === 'paciente' ? (p.run && (ctx.sicsByRun.get(p.run)?.length ?? 0) > 0)
          : ic === 'no'       ? !p.esIC && !(p.run && ctx.sicsByRun.get(p.run)?.length)
          : true)) &&
    (!dx || (dx === 'ges' ? p.diagnosticos?.some(x => x.esAuge)
          : dx === 'con' ? p.diagnosticos?.length > 0
          : dx === 'sin' ? !(p.diagnosticos?.length)
          : dx === 'urg' ? p.esUrgencia : true))
  );
}
