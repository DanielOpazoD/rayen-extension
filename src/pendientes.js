import { CONFIG } from './config.js';
import { dateToInt, localDateStr } from './parser.js';

/**
 * Rules over data the extension already has on disk. Each one must be able to
 * say what fired, on what field and since when — a rule that cannot explain
 * itself does not belong in a clinical tool.
 *
 * Interconsultas at Hospital Hanga Roa are internal (origin and destination are
 * both node 5576): the specialist is in the same building. That makes a missing
 * contrarreferencia a documentation gap, not a logistics one.
 */

const DAY = 86_400_000;

function daysSince(fecha8, hoy8) {
  if (!fecha8 || fecha8.length !== 8) return null;
  const a = new Date(+fecha8.slice(0, 4), +fecha8.slice(4, 6) - 1, +fecha8.slice(6, 8));
  const b = new Date(+hoy8.slice(0, 4), +hoy8.slice(4, 6) - 1, +hoy8.slice(6, 8));
  return Math.round((b - a) / DAY);
}

/** "DD-MM-YYYY" or "DD-MM-YYYY HH:mm" → YYYYMMDD */
function toDate8(s = '') {
  const m = String(s).match(/^(\d{2})-(\d{2})-(\d{4})/);
  return m ? `${m[3]}${m[2]}${m[1]}` : '';
}

const mine = s => s.registrador.id === CONFIG.officerId || s.ejecutor.id === CONFIG.officerId;
const rol  = s => s.registrador.id === CONFIG.officerId ? 'emitida por ti' : 'a resolver por ti';

/**
 * @param {object[]} allData  agenda + ficha records
 * @param {object[]} sics
 * @param {{ hoy?: Date, umbrales?: object, soloMias?: boolean }} opts
 * @returns {object[]} pendientes, most urgent first
 */
export function computePendientes(allData, sics = [], opts = {}) {
  const hoy8 = localDateStr(opts.hoy ?? new Date());
  const U = { ...CONFIG.pendientes, ...(opts.umbrales ?? {}) };
  const soloMias = opts.soloMias !== false;
  const out = [];

  // ── 1. Atendida sin contrarreferencia ─────────────────────────
  // 75% of attended SIC had none in the captured quarter. The wording must stay
  // honest: Rayen has no record — the report may well have arrived by another route.
  for (const s of sics) {
    if (!['atendida', 'cerrada'].includes(s.grupo)) continue;
    if (soloMias && !mine(s)) continue;
    if (s.contrarreferencias.length) continue;
    const dias = s.antiguedadDias ?? daysSince(s.fecha8, hoy8) ?? 0;
    if (dias < U.crDias) continue;
    out.push({
      tipo: 'cr-faltante', severidad: 2, dias, sicId: s.id, run: s.paciente.run,
      paciente: s.paciente.nombre,
      titulo: `Sin contrarreferencia · ${s.especialidad}`,
      detalle: `Atendida (${s.estado}), ${rol(s)}. Rayen no registra contrarreferencia.`,
      nota: 'Puede haber llegado por otra vía (correo, papel, conversación).',
    });
  }

  // ── 2. SIC que nunca salió del hospital ───────────────────────
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

  // ── 3. Cita pasada y la SIC sigue sin cerrarse ────────────────
  for (const s of sics) {
    if (![3, 4].includes(s.estadoId)) continue;    // agendada / confirmada
    if (soloMias && !mine(s)) continue;
    const cita8 = toDate8(s.fechaCita);
    const dias = daysSince(cita8, hoy8);
    if (dias === null || dias < U.citaDias) continue;
    out.push({
      tipo: 'cita-pasada', severidad: 1, dias, sicId: s.id, run: s.paciente.run,
      paciente: s.paciente.nombre,
      titulo: `Cita pasada sin resolver · ${s.especialidad}`,
      detalle: `La cita era el ${s.fechaCita} y la solicitud sigue «${s.estado}».`,
    });
  }

  // ── 4. Control que él mismo pidió, vencido y sin cita posterior ──
  // OrdenAtencionInterna comes free with the day-level ficha; nothing extra is fetched.
  const porPaciente = new Map();
  for (const r of allData) {
    const k = r.run || r.nombre;
    if (!porPaciente.has(k)) porPaciente.set(k, []);
    porPaciente.get(k).push(r);
  }
  const vistos = new Set();
  for (const r of allData) {
    for (const c of r.proximoControl ?? []) {
      if (!c.fecha8 || c.descartada) continue;
      const dias = daysSince(c.fecha8, hoy8);
      if (dias === null || dias < U.controlDias) continue;
      const clave = `${r.run || r.nombre}|${c.id}`;
      if (vistos.has(clave)) continue;
      vistos.add(clave);
      // Any later appointment counts as the control having happened
      const posterior = (porPaciente.get(r.run || r.nombre) ?? [])
        .some(x => x.fecha8 && x.fecha8 > c.fecha8);
      if (posterior) continue;
      out.push({
        tipo: 'control-vencido', severidad: 1, dias, recordId: r.id, run: r.run,
        paciente: r.nombre,
        titulo: 'Control vencido sin agendar',
        detalle: `${c.motivo || 'Control'} — sugerido para ${c.fecha} y sin atención posterior.`,
      });
    }
  }

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

export const TIPO_LABEL = {
  'cr-faltante':     'Sin contrarreferencia',
  'sic-nueva':       'Interconsultas sin cursar',
  'cita-pasada':     'Citas pasadas sin resolver',
  'control-vencido': 'Controles vencidos',
};

export { dateToInt };
