/**
 * Diagnóstico de una carga: sólo recuentos, ningún dato de paciente.
 *
 * Existe para validar en la red del hospital lo que el arnés no puede probar
 * con datos sintéticos: que el cruce agenda–historial deja cada atención en el
 * día de su cita, que ninguna queda suelta en un día que no trabajo, y que la
 * agenda futura llegó entera. El texto que produce no lleva nombres, RUN,
 * diagnósticos ni fechas de nadie, así que se puede pegar en una conversación.
 */
import { DOW_LABEL } from './config.js';
import { diasEntre, date8FromDMY, toDate8 } from './dates.js';

const DIAS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

/** «05-09-2026 11:40» */
function sello(hoy) {
  const p = n => String(n).padStart(2, '0');
  return `${p(hoy.getDate())}-${p(hoy.getMonth() + 1)}-${hoy.getFullYear()} ${p(hoy.getHours())}:${p(hoy.getMinutes())}`;
}

/**
 * @param {object} [datos]
 * @param {object[]} [datos.allData]        agenda cruzada con la ficha
 * @param {object[]} [datos.futuras]        citas ya agendadas después de hoy
 * @param {object} [datos.futurasEstado]    { dias, hasta8, failed }
 * @param {object[]} [datos.sics]
 * @param {object[]} [datos.pendientes]
 * @param {number} [datos.meses]            período cargado
 * @param {Record<string, number>} [datos.syncPendiente]  ítems pendientes por fuente
 * @param {string} [datos.version]
 * @param {Date} [datos.hoy]
 */
export function diagnosticoCarga({
  allData = [], futuras = [], futurasEstado = null, sics = [], pendientes = [],
  meses = 0, syncPendiente = {}, version = '', hoy = new Date(),
} = {}) {
  const porDia = Object.fromEntries(DIAS.map(d => [d, 0]));
  const cruce = { mismoDia: 0, exacta: 0, estimada: 0, sinAtencion: 0, sueltas: 0 };
  let urgencias = 0, conDesfase = 0, maxDesfase = 0;

  for (const r of allData) {
    const dia = r.diaSemana || DOW_LABEL[3];
    if (dia in porDia) porDia[dia] += 1;
    if (r.esUrgencia) urgencias += 1;

    if (r.origen !== 'cita') cruce.sueltas += 1;
    else if (!r.atencionId) cruce.sinAtencion += 1;
    else if (r.cruceEstimado) cruce.estimada += 1;
    else if (r.fechaRegistro) cruce.exacta += 1;
    else cruce.mismoDia += 1;

    if (r.fechaRegistro) {
      conDesfase += 1;
      const d = Math.abs(diasEntre(r.fecha8, date8FromDMY(r.fechaRegistro)) ?? 0);
      if (d > maxDesfase) maxDesfase = d;
    }
  }

  return {
    version, fecha: sello(hoy), hoy8: toDate8(hoy), meses,
    atenciones: { total: allData.length, porDia, urgencias },
    cruce,
    registro: { conDesfase, maxDesfase },
    futuras: futurasEstado
      ? { total: futuras.length, dias: futurasEstado.dias ?? 0, hasta8: futurasEstado.hasta8 ?? '', fallidos: futurasEstado.failed ?? 0 }
      : null,
    interconsultas: { total: sics.length, pendientes: pendientes.length },
    syncPendiente: Object.fromEntries(Object.entries(syncPendiente).filter(([, n]) => n > 0)),
  };
}

const fmt8 = d8 => (/^\d{8}$/.test(d8 ?? '') ? `${d8.slice(6)}-${d8.slice(4, 6)}-${d8.slice(0, 4)}` : '—');

/** El diagnóstico como texto plano, listo para pegar. */
export function formatearDiagnostico(d) {
  const { atenciones: a, cruce: c, registro: reg } = d;
  const dias = DIAS.map(k => `${k.toLowerCase()} ${a.porDia[k]}`).join(' · ');
  const sync = Object.entries(d.syncPendiente).map(([k, n]) => `${k} ${n}`).join(' · ');
  return [
    `Rayen Atenciones ${d.version} · diagnóstico ${d.fecha}`,
    `Período: ${d.meses} meses · ${a.total} atenciones · ${a.urgencias} urgencias`,
    `Por día: ${dias}`,
    `Cruce agenda–ficha: ${c.mismoDia} mismo día · ${c.exacta} cita exacta · ${c.estimada} estimadas · ${c.sinAtencion} citas sin atención · ${c.sueltas} sueltas`,
    `Ficha cerrada otro día: ${reg.conDesfase}${reg.conDesfase ? ` (máx. ${reg.maxDesfase} días)` : ''}`,
    d.futuras
      ? `Citas futuras: ${d.futuras.total} en ${d.futuras.dias} días, hasta ${fmt8(d.futuras.hasta8)}${d.futuras.fallidos ? ` · ${d.futuras.fallidos} días fallidos` : ''}`
      : 'Citas futuras: no cargadas',
    `Interconsultas: ${d.interconsultas.total} · pendientes: ${d.interconsultas.pendientes}`,
    sync ? `Sincronización pendiente: ${sync}` : 'Sincronización: sin pendientes',
  ].join('\n');
}
