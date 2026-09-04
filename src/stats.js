import { fillSelect, $ } from './dom.js';
import { dateToInt } from './parser.js';
import { resolveRange, inRange } from './period.js';
import { decodeMultiValue } from './multi-select.js';

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
  const unicos = new Set(allData.map(p => p.run || p.nombre)).size;
  const citas  = allData.filter(p => p.origen === 'cita').length;
  const pc = (n, d) => d ? `${Math.round(100 * n / d)}%` : '—';

  $('statsBar').innerHTML = [
    [t,               'Atenciones'],
    [unicos,          'Pacientes únicos'],
    [dias,            'Días con atención'],
    [dias ? (t / dias).toFixed(1) : '—', 'Atenciones / día'],
    [cp,              `Completadas · ${pc(cp, citas)}`],
    [ns,              `Inasistencias · ${pc(ns, citas)}`],
    [esp,             `Espontáneas · ${pc(esp, t)}`],
    [urg,             `Urgencias · ${pc(urg, t)}`],
    [dx,              `Con diagnóstico · ${pc(dx, t)}`],
    [ges,             `GES · ${pc(ges, t)}`],
    [ic,              `Citas por IC · ${pc(ic, citas)}`],
    [avgE + ' a',     'Edad promedio'],
    [fem,             `Mujeres · ${pc(fem, t)}`],
    [t - fem,         `Hombres · ${pc(t - fem, t)}`],
    ...(teamTotal ? [[teamTotal.toLocaleString('es-CL'), `Equipo HHR · yo ${pc(t, teamTotal)}`]] : []),
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
  fillSelect($('filtPrest'),  prest);
  return { tipos };
}

/** Reads the filter controls into a plain object (see applyFilters). */
function readFilters() {
  return {
    q:      $('search').value.trim().toLowerCase(),
    fecha:  $('filtFecha').value,
    dia:    $('filtDia').value,
    sexo:   $('filtSexo').value,
    estado: $('filtEstado').value,
    prev:   $('filtPrev').value,
    tipo:   decodeMultiValue($('filtTipo').value),
    prest:  $('filtPrest').value,
    ic:     $('filtIC').value,
    dx:     $('filtDx').value,
    periodo: $('filtPer').value || 'todo',
    desde:  $('filtDesde').value,
    hasta:  $('filtHasta').value,
  };
}

const EMPTY_CTX = { sicsByRun: new Map(), officerId: 0 };

/**
 * Pure filter — no DOM — so it can be unit-tested.
 * @param {object[]} allData
 * @param {ReturnType<typeof readFilters>} f   empty string = no filter
 * @param {{ sicsByRun: Map<string, object[]>, officerId: number }} ctx
 */
export function applyFilters(allData, f, ctx = EMPTY_CTX) {
  const { from8, to8 } = resolveRange(f, ctx.hoy);
  const sicsOf = p => (p.run ? ctx.sicsByRun.get(p.run) : null) ?? [];
  const icMatch = p => {
    switch (f.ic) {
      case '':         return true;
      case 'cita':     return !!p.esIC;
      case 'emiti':    return sicsOf(p).some(s => s.registrador.id === ctx.officerId);
      case 'recibi':   return !!p.esIC || sicsOf(p).some(s => s.ejecutor.id === ctx.officerId);
      case 'paciente': return sicsOf(p).length > 0;
      case 'no':       return !p.esIC && sicsOf(p).length === 0;
      default:         return true;
    }
  };
  const dxMatch = p => {
    switch (f.dx) {
      case '':    return true;
      case 'con': return (p.diagnosticos?.length ?? 0) > 0;
      case 'sin': return !(p.diagnosticos?.length);
      case 'ges': return !!p.diagnosticos?.some(x => x.esAuge);
      case 'urg': return !!p.esUrgencia;
      default:    return true;
    }
  };

  return allData.filter(p =>
    // La clasificación entra en la búsqueda porque es con lo que se rotulan las
    // barras de diagnóstico: filtrar por ella devolvía cero filas.
    (!f.q      || [p.nombre, p.ap, p.am, p.runStr, p.run, p.note, ...(p.diagnosticos ?? []).flatMap(x => [x.nombre, x.clasificacion])]
                    .some(v => String(v ?? '').toLowerCase().includes(f.q))) &&
    inRange(p.fecha8, from8, to8) &&
    (!f.fecha  || p.fechaAtencion === f.fecha) &&
    (!f.dia    || p.diaSemana === f.dia) &&
    (!f.sexo   || p.sexo === f.sexo) &&
    (!f.estado || p.estado === f.estado) &&
    (!f.prev   || p.prevision === f.prev) &&
    (!f.tipo?.length || (Array.isArray(f.tipo) ? f.tipo.includes(p.tipoAtencion) : p.tipoAtencion === f.tipo)) &&
    (!f.prest  || (p.prestadores ?? []).some(x => x.nombre === f.prest)) &&
    icMatch(p) && dxMatch(p)
  );
}

/** Applies the Atenciones filter controls. */
export function filterRecords(allData, ctx) {
  return applyFilters(allData, readFilters(), ctx);
}
