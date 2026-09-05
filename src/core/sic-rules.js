/**
 * Reglas puras sobre interconsultas: no tocan red ni estado. Viven en core
 * para que state.js (io) y el registro clínico (ai) no dependan del cargador.
 */
import { CONFIG } from './config.js';

/** La SIC es mía si la registré o la ejecuto yo. */
export function isMine(sic, officerId = CONFIG.officerId) {
  return sic.registrador?.id === officerId || sic.ejecutor?.id === officerId;
}
/** Contact/demographic info per RUN, harvested from SIC patient payloads. */
export function contactsFromSICs(sics) {
  const map = new Map();
  for (const s of sics) {
    const p = s.paciente;
    if (!p.run) continue;
    const cur = map.get(p.run) ?? {};
    map.set(p.run, {
      telefono:    p.telefono    || cur.telefono    || '',
      direccion:   p.direccion   || cur.direccion   || '',
      prevision:   p.prevision   || cur.prevision   || '',
      tipoUsuario: p.tipoUsuario || cur.tipoUsuario || '',
      edad:        p.edad        || cur.edad        || '',
    });
  }
  return map;
}
