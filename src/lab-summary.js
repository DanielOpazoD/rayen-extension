/**
 * Resumen clínico compacto: la línea que el médico copia y pega en la evolución.
 *
 * Port de `src/features/laboratory/controllers/labSummaryController.ts` del
 * proyecto HHR. El formato es el que se dicta en la visita:
 *
 *   Laboratorio (08/04/2026 14:00): Hb 13,0 HTO 40% RGB 7.500 Creat 1,0 Na 140 PCR 57 mg/L
 *
 * Tres reglas del formato que no son adorno:
 *
 * 1. El orden lo fija `SUMMARY_ABBREVIATIONS`, no los datos. Un resumen que
 *    sigue el orden del informe obliga a releerlo; uno que sigue el orden de
 *    dictado se lee de corrido.
 * 2. Las unidades universales se omiten y las ambiguas se imprimen. «PCR 57»
 *    sin unidad puede ser normal (mg/dL) o una sepsis (mg/L).
 * 3. Si nada calza con una sigla, se cae a nombre completo + valor antes que
 *    devolver vacío: un cultivo o un examen raro también hay que poder pegarlo.
 *
 * Lo que este resumen NO puede hacer es imprimir un analito de orina o de LCR
 * bajo una sigla de sangre. Ver `buildReportSummary`.
 */

import { SUMMARY_ABBREVIATIONS } from './lab-catalog.js';
import { isLabComparisonEligible } from './lab-specimen.js';
import {
  cleanText, comparisonToken, findingAlert, isSystemicTrendEligible,
  normalizeAnalysisName, parseMeasurement,
} from './lab-parser.js';

/** Tope del modo literal: un resumen más largo deja de ser resumen. */
const MAX_LITERAL_PARTS = 12;

const SCALED_UNIT_REGEX = /^(?:x|×)\s*10\s*\^?\s*(\d+)/i;

/** Miles con punto, como se dicta en Chile, sin depender del ICU del entorno. */
const groupThousands = value => String(value).replace(/\B(?=(\d{3})+(?!\d))/g, '.');

/**
 * Deshace la notación x10^N del contador hematológico: «7,5 x10^3» se dicta
 * como 7.500. Devuelve null si la unidad no es escalada.
 *
 * Un resultado con comparador («<0,01») no se multiplica: mil veces un «menor
 * que» sigue siendo un «menor que», y perder el símbolo convierte un límite de
 * detección en una cifra que el laboratorio nunca afirmó.
 */
function scaledValue(finding) {
  const match = SCALED_UNIT_REGEX.exec(cleanText(finding.unit));
  if (!match) return null;
  const measurement = parseMeasurement(finding.result, finding);
  if (!measurement || measurement.comparator !== '=') return null;
  return groupThousands(Math.round(measurement.value * 10 ** Number(match[1])));
}

/** La unidad sin el factor de escala ya aplicado al valor: «x10^3/uL» → «uL». */
const scaleFreeUnit = unit => cleanText(unit).replace(SCALED_UNIT_REGEX, '').replace(/^\//, '');

const isAltered = finding =>
  typeof finding.alert === 'boolean' ? finding.alert : findingAlert(finding);

const mark = (text, finding, markAlerts) =>
  markAlerts && isAltered(finding) ? `${text}*` : text;

/** Sigla + valor, con el sufijo y la unidad que pida la configuración. */
function abbreviatedPart(finding, config, markAlerts) {
  const scaled = config.multiplyExponent ? scaledValue(finding) : null;
  let text = `${config.abbr} ${scaled || finding.result}`;
  if (config.suffix) text += config.suffix;
  if (config.showUnit) {
    const unit = scaleFreeUnit(finding.unit);
    if (unit) text += ` ${unit}`;
  }
  return mark(text, finding, markAlerts);
}

/** Nombre completo + valor, para lo que no tiene sigla. */
function literalPart(finding, markAlerts) {
  const scaled = scaledValue(finding);
  const rest = scaled ? scaleFreeUnit(finding.unit) : cleanText(finding.unit);
  const unit = scaled ? (rest ? `/${rest}` : '') : rest;
  const text = `${finding.analysis} ${scaled || finding.result}${unit ? ` ${unit}` : ''}`;
  return mark(text, finding, markAlerts);
}

/** «08/04/2026 14:00». La hora se recorta a HH:MM y desaparece si no viene. */
function reportHeading(report) {
  const date = cleanText(report && report.date);
  const time = cleanText(report && report.time).slice(0, 5);
  return [date, time].filter(Boolean).join(' ');
}

/**
 * Resumen de un informe, con la forma que devuelve `buildAnalysis`:
 * `{date, time, findings}`.
 *
 * Sólo los hallazgos sistémicos optan a una sigla. Un «Leucocitos» de sedimento
 * urinario, un sodio urinario o un pH de LCR calzarían con RGB, Na y pH, y en un
 * texto que se pega en la ficha eso es un dato falso que nadie puede detectar
 * después: la línea no dice de qué muestra salió. El original de HHR normalizaba
 * el nombre SIN la sección, con lo que el leucocito urinario se volvía «Recuento
 * Leucocitos» y se imprimía como recuento hematológico; aquí se normaliza con la
 * sección y además se exige muestra sistémica.
 *
 * @param {{date?: string, time?: string, findings?: Array}} report
 * @param {{markAlerts?: boolean}} [options] `markAlerts` agrega «*» a los
 *   valores fuera de rango; por omisión el texto es idéntico al de HHR.
 * @returns {string} La línea lista para pegar, o '' si no hay nada que decir.
 */
export function buildReportSummary(report, options = {}) {
  const markAlerts = Boolean(options.markAlerts);
  const findings = (Array.isArray(report && report.findings) ? report.findings : [])
    .filter(finding => finding && cleanText(finding.result))
    .map(finding => ({ ...finding, analysis: normalizeAnalysisName(finding.analysis, finding.section) }))
    .filter(finding => finding.analysis);

  const parts = [];
  const used = new Set();
  for (const [pattern, config] of SUMMARY_ABBREVIATIONS) {
    const token = comparisonToken(pattern);
    const finding = findings.find(candidate =>
      !candidate.qualitative &&
      !used.has(candidate.analysis) &&
      isSystemicTrendEligible(candidate) &&
      // Segunda red, para el informe que no rotula la muestra: un sedimento
      // urinario informado «25 x campo» pasaba el corte anterior y se pegaba
      // en la ficha como «RGB 25», es decir, una leucocitosis inexistente.
      isLabComparisonEligible(candidate) &&
      comparisonToken(candidate.analysis).includes(token));
    if (!finding) continue;
    used.add(finding.analysis);
    parts.push(abbreviatedPart(finding, config, markAlerts));
  }

  const body = parts.length
    ? parts
    : findings.slice(0, MAX_LITERAL_PARTS).map(finding => literalPart(finding, markAlerts));
  if (!body.length) return '';
  return `Laboratorio (${reportHeading(report)}): ${body.join(' ')}`;
}

/**
 * Un resumen por informe, del más reciente al más antiguo — el mismo orden en
 * que `buildAnalysis` entrega `reports`, que es como se lee una evolución.
 *
 * @param {{reports?: Array}} analysis Modelo de `buildAnalysis`.
 * @param {{markAlerts?: boolean}} [options]
 * @returns {string} Una línea por informe, o '' si no hay ninguno con datos.
 */
export function buildAnalysisSummary(analysis, options = {}) {
  return (Array.isArray(analysis && analysis.reports) ? analysis.reports : [])
    .map(report => buildReportSummary(report, options))
    .filter(Boolean)
    .join('\n');
}
