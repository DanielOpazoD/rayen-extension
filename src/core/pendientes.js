import { CONFIG, SIC_RECHAZADA_IDS } from './config.js';
import { diasEntre, date8FromDMY } from './dates.js';
import { isMine } from './sic-rules.js';
import { dateToInt, localDateStr } from './parser.js';

/**
 * Rules over data the extension already has on disk. Each one must be able to
 * say what fired, on what field and since when — a rule that cannot explain
 * itself does not belong in a clinical tool.
 *
 * Interconsultas at Hospital Hanga Roa are internal (origin and destination are
 * both node 5576): the specialist is in the same building.
 */

const daysSince = (fecha8, hoy8) => (String(fecha8 ?? '').length === 8 ? diasEntre(fecha8, hoy8) : null);
const toDate8 = date8FromDMY;

const mine = s => isMine(s);
const rol  = s => s.registrador.id === CONFIG.officerId ? 'emitida por ti' : 'a resolver por ti';

/**
 * @param {object[]} allData  agenda + ficha records
 * @param {object[]} sics
 * @param {{ hoy?: Date, umbrales?: object, soloMias?: boolean }} opts
 * @returns {object[]} pendientes, most urgent first
 */
/** Interconsultas que nunca salieron del hospital: siguen «Nueva» pasados `nuevaDias`. */
function sicSinCursar(sics, { hoy8, U, soloMias }) {
  const out = [];
  for (const s of sics) {
    if (s.estadoId !== 13) continue;               // Nueva
    if (soloMias && !mine(s)) continue;
    const dias = s.antiguedadDias ?? daysSince(s.fecha8, hoy8) ?? 0;
    if (dias < U.nuevaDias) continue;
    out.push({
      tipo: 'sic-nueva', severidad: 2, dias, sicId: s.id, run: s.paciente.run,
      paciente: s.paciente.nombre,
      titulo: `Interconsulta sin cursar · ${s.especialidad}`,
      detalle: `Sigue en estado «Nueva» ${dias} días después de emitida (${rol(s)}).`,
    });
  }
  return out;
}

/** Interconsulta rechazada: no está «abierta», pero exige una decisión durante `rechazadaDias`. */
function sicRechazadas(sics, { hoy8, U, soloMias }) {
  const out = [];
  for (const s of sics) {
    if (!SIC_RECHAZADA_IDS.has(s.estadoId)) continue;
    if (soloMias && !mine(s)) continue;
    const dias = s.antiguedadDias ?? daysSince(s.fecha8, hoy8) ?? 0;
    if (dias > (U.rechazadaDias ?? 90)) continue;   // pasada esa ventana ya no es una decisión pendiente, es historia
    out.push({
      tipo: 'sic-rechazada', severidad: 2, dias, sicId: s.id, run: s.paciente.run,
      paciente: s.paciente.nombre,
      titulo: `Interconsulta rechazada · ${s.especialidad}`,
      detalle: `Estado «${s.estado}» (${rol(s)}). Decide si se re-emite o se cierra.`,
    });
  }
  return out;
}

/** Cita del especialista ya pasada y la solicitud sigue agendada o confirmada. */
function citasPasadas(sics, { hoy8, U, soloMias }) {
  const out = [];
  for (const s of sics) {
    if (![3, 4].includes(s.estadoId)) continue;    // agendada / confirmada
    if (soloMias && !mine(s)) continue;
    const dias = daysSince(toDate8(s.fechaCita), hoy8);
    if (dias === null || dias < U.citaDias) continue;
    out.push({
      tipo: 'cita-pasada', severidad: 1, dias, sicId: s.id, run: s.paciente.run,
      paciente: s.paciente.nombre,
      titulo: `Cita pasada sin resolver · ${s.especialidad}`,
      detalle: `La cita era el ${s.fechaCita} y la solicitud sigue «${s.estado}».`,
    });
  }
  return out;
}

/**
 * Control que el propio médico pidió (OrdenAtencionInterna, gratis con la ficha
 * diaria), vencido y sin ninguna atención posterior del paciente.
 */
function controlesVencidos(allData, { hoy8, U }) {
  const porPaciente = new Map();
  for (const r of allData) {
    const k = r.run || r.nombre;
    if (!porPaciente.has(k)) porPaciente.set(k, []);
    porPaciente.get(k).push(r);
  }
  const vistos = new Set();
  const out = [];
  for (const r of allData) {
    for (const c of r.proximoControl ?? []) {
      if (!c.fecha8 || c.descartada) continue;
      const dias = daysSince(c.fecha8, hoy8);
      if (dias === null || dias < U.controlDias) continue;
      const clave = `${r.run || r.nombre}|${c.id}`;
      if (vistos.has(clave)) continue;
      vistos.add(clave);
      // Any later appointment counts as the control having happened
      const posterior = (porPaciente.get(r.run || r.nombre) ?? []).some(x => x.fecha8 && x.fecha8 > c.fecha8);
      if (posterior) continue;
      out.push({
        tipo: 'control-vencido', severidad: 1, dias, recordId: r.id, run: r.run,
        paciente: r.nombre,
        titulo: 'Control vencido sin agendar',
        detalle: `${c.motivo || 'Control'} — sugerido para ${c.fecha} y sin atención posterior.`,
      });
    }
  }
  return out;
}

/**
 * Las cuatro reglas de pendientes, en el orden de la tabla del README.
 * @param {object[]} allData  atenciones (agenda cruzada con historial)
 * @param {object[]} [sics]
 * @param {{ hoy?: Date, umbrales?: object, soloMias?: boolean }} [opts]
 */
export function computePendientes(allData, sics = [], opts = {}) {
  const ctx = {
    hoy8: localDateStr(opts.hoy ?? new Date()),
    U: { ...CONFIG.pendientes, ...(opts.umbrales ?? {}) },
    soloMias: opts.soloMias !== false,
  };
  const out = [...sicSinCursar(sics, ctx), ...sicRechazadas(sics, ctx), ...citasPasadas(sics, ctx), ...controlesVencidos(allData, ctx)];
  // Oldest first inside each severity: severity is the class, days is the urgency
  out.sort((a, b) => b.severidad - a.severidad || b.dias - a.dias);
  return out;
}

/** Groups pendientes by tipo, preserving order, for a compact summary. */
export function resumirPendientes(pendientes) {
  const by = new Map();
  for (const p of pendientes) {
    if (!by.has(p.tipo)) by.set(p.tipo, { tipo: p.tipo, titulo: TIPO_LABEL[p.tipo] ?? p.tipo, items: [] });
    by.get(p.tipo).items.push(p);
  }
  return [...by.values()];
}

const TIPO_LABEL = {
  'sic-nueva':       'Interconsultas sin cursar',
  'sic-rechazada':   'Interconsultas rechazadas',
  'cita-pasada':     'Citas pasadas sin resolver',
  'control-vencido': 'Controles vencidos',
};

export { dateToInt };
