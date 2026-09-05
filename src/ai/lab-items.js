/**
 * Del modelo analítico de laboratorio (`buildAnalysis`) a los ítems que
 * entiende el registro clínico. Sólo si el análisis es del mismo paciente:
 * el RUN del análisis viene de la búsqueda que produjo las tablas.
 */
import { normalizeRutBody } from '../core/lab-analytics.js';

const fecha8De = s => {
  const m = /^(\d{2})[-/](\d{2})[-/](\d{4})/.exec(s ?? '');
  return m ? `${m[3]}${m[2]}${m[1]}` : null;
};
const fechaDe = s => { const m = /^(\d{2})[-/](\d{2})[-/](\d{4})/.exec(s ?? ''); return m ? `${m[1]}-${m[2]}-${m[3]}` : (s ?? ''); };

/**
 * @param {object|null} analysis — resultado de buildAnalysis (reports, sourceByExamId)
 * @param {string} analysisRutBody — cuerpo del RUT de la búsqueda que produjo el análisis
 * @param {string} run — RUN del paciente del panel (con o sin formato)
 */
export function labItemsFromAnalysis(analysis, analysisRutBody, run) {
  if (!analysis?.reports?.length || !run) return [];
  if (normalizeRutBody(analysisRutBody) !== normalizeRutBody(run)) return [];
  const out = [];
  for (const r of analysis.reports) {
    for (const f of r.findings ?? []) {
      out.push({
        fecha: fechaDe(r.date), fecha8: fecha8De(r.date), examen: r.label ?? '',
        analito: f.analysis, valor: f.result, unidad: f.unit ?? '', referencia: f.refValue ?? '',
        flag: f.alert ? (f.flag || 'anormal') : '',
        fuente: analysis.sourceByExamId?.[r.examId] ? `laboratorio-${String(analysis.sourceByExamId[r.examId]).toLowerCase()}` : 'laboratorio',
      });
    }
  }
  return out;
}
