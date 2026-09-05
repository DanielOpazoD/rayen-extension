import { syslabStatus, syslabSearchByRut, resolveSyslabLink, syslabReportBytes, resetSyslabSession, SYSLAB_BASE } from './syslab-http.js';

import { normalizeRutBody, examRowsMatchRut } from '../core/lab-analytics.js';

export { resetSyslabSession, syslabReportBytes, SYSLAB_BASE, normalizeRutBody, examRowsMatchRut };

export async function checkSyslabSession() {
  resetSyslabSession();
  await syslabStatus();
  return true;
}

/**
 * @param {string} rutBody
 * @param {object} [opts]
 * @param {AbortSignal} [opts.signal]
 */
export async function buscarExamenesPorRut(rutBody, { signal } = {}) {
  const body = normalizeRutBody(rutBody);
  if (!/^\d{5,9}$/.test(body)) throw new Error('RUT sin dígito verificador no válido.');

  const exams = await syslabSearchByRut(body, { signal });
  if (!examRowsMatchRut(exams, body)) {
    throw new Error('SysLab devolvió órdenes que no corresponden al RUN consultado.');
  }
  return exams;
}

export function normalizeSyslabExam(raw) {
  return {
    id: String(raw.id),
    fecha: raw.date || '',
    hora: raw.time || '',
    nombrePaciente: raw.patientName || '',
    procedencia: raw.origin || '',
    examenes: Array.isArray(raw.exams) ? raw.exams : [],
    link: raw.link || null,
    puedeImprimir: Boolean(raw.link),
  };
}

export function syslabPdfUrl(link) {
  if (!link) throw new Error('Sin enlace al informe');
  return resolveSyslabLink(link);
}
