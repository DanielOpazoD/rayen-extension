/**
 * Modelo analítico del laboratorio: identidad del paciente, saneamiento de
 * lotes y construcción de la comparación y las tendencias.
 *
 * Port de `extension/lab-viewer.js` del proyecto HHR.
 *
 * La clave de fila de la comparación es `sección|analito|unidad`: dos analitos
 * con el mismo nombre pero distinta sección o unidad ocupan filas distintas.
 * Eso es lo que impide que un sodio en orina se muestre en la misma línea que
 * un sodio en sangre.
 */

import {
  cleanText, comparisonToken, findingAlert, isSystemicTrendEligible,
  normalizeAnalysisName, parseMeasurement, referenceBounds,
} from './lab-parser.js';
import { isExcludedFromComparison, comparisonSortIndex } from './lab-specimen.js';
import {
  resolveMicrobiologyCategoriesForExam, resolveMicrobiologyCategoryForFinding,
  collectMicrobiologyFinding, buildMicrobiologyEntriesForExam,
} from './lab-microbiology.js';

/** Orden clínico de lectura. Lo que no está aquí va después, alfabético. */
export const IMPORTANT_ANALYSES = [
  'Recuento Leucocitos', 'Hemoglobina', 'Hematocrito', 'VCM', 'HCM',
  'Recuento de Plaquetas', 'Segmentados', 'Linfocitos', 'Proteina C Reactiva',
  'VHS', 'Creatinina', 'Nitrogeno Ureico', 'Uremia', 'Sodio', 'Potasio',
  'Cloro', 'HCO3', 'Calcio', 'Fosforo', 'pH', 'pCO2', 'pO2', 'Lactato',
  'ASAT/GOT', 'ALAT/GPT', 'GGT', 'Fosfatasa Alcalina', 'Bilirrubinas',
  'Protrombina', 'TTPK', 'INR', 'Albumina', 'Proteinas Totales', 'Troponina',
  'Dimero', 'CK Total', 'Magnesio', 'TSH', 'T4L', 'Acido Urico', 'Glicemia',
  'Hb glicosilada', 'Colesterol Total', 'LDL', 'HDL', 'TG', 'RAC', 'RPC',
];

export const MAX_SELECTED_EXAMS = 24;

/** Cuerpo del RUT: sin puntos, sin dígito verificador, sólo dígitos. */
export function normalizeRutBody(value) {
  return cleanText(value).replace(/\./g, '').replace(/-.*$/, '').replace(/\D/g, '');
}

/**
 * Cuerpo del RUT de un paciente cuando el dígito verificador puede venir pegado
 * y sin guion. Se valida con módulo 11: si el último carácter es un DV correcto
 * se descarta; si no, el valor completo era el cuerpo.
 */
/**
 * Un RUT escrito sólo con dígitos y sin guion es ambiguo cuando tiene 7 u 8:
 * puede ser un cuerpo completo sin verificador o un cuerpo más corto con él.
 * `normalizePatientRutBody` lo resolvía por módulo 11, que acierta por azar una
 * de cada once veces y entonces busca a otra persona en SysLab, donde las filas
 * sólo se cotejan entre sí. Con 9 dígitos no hay duda (los cuerpos tienen 8
 * como máximo) y con K o guion el verificador es explícito.
 */
export function rutInputAmbiguous(value) {
  const raw = cleanText(value).toUpperCase();
  if (raw.includes('-') || raw.endsWith('K')) return false;
  return /^\d{7,8}$/.test(raw.replace(/\D/g, ''));
}

export function normalizePatientRutBody(value) {
  const raw = cleanText(value).toUpperCase();
  if (raw.includes('-')) return normalizeRutBody(raw);
  const compact = raw.replace(/[^0-9K]/g, '');
  if (!/^\d{6,8}[0-9K]$/.test(compact)) return normalizeRutBody(raw);
  const body = compact.slice(0, -1);
  let sum = 0;
  let multiplier = 2;
  for (let index = body.length - 1; index >= 0; index -= 1) {
    sum += Number(body[index]) * multiplier;
    multiplier = multiplier === 7 ? 2 : multiplier + 1;
  }
  const remainder = 11 - (sum % 11);
  const verifier = remainder === 11 ? '0' : remainder === 10 ? 'K' : String(remainder);
  return verifier === compact.slice(-1) ? body : normalizeRutBody(raw);
}

function parseExamDate(date, time) {
  const match = cleanText(date).match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!match) return 0;
  const timeMatch = cleanText(time).match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  return new Date(
    Number(match[3]), Number(match[2]) - 1, Number(match[1]),
    timeMatch ? Number(timeMatch[1]) : 0,
    timeMatch ? Number(timeMatch[2]) : 0,
    timeMatch && timeMatch[3] ? Number(timeMatch[3]) : 0
  ).getTime();
}

/** Normaliza y ordena la lista de órdenes, de la más reciente a la más antigua. */
export function sanitizeExamList(exams) {
  return (Array.isArray(exams) ? exams : [])
    .filter(exam => exam && /^\d+$/.test(String(exam.id || '')))
    .map(exam => ({
      id: String(exam.id),
      date: cleanText(exam.date),
      time: cleanText(exam.time),
      patientName: cleanText(exam.patientName),
      origin: cleanText(exam.origin),
      exams: (Array.isArray(exam.exams) ? exam.exams : []).slice(0, 80).map(cleanText).filter(Boolean),
    }))
    .sort((a, b) => parseExamDate(b.date, b.time) - parseExamDate(a.date, a.time))
    .slice(0, 100);
}

/**
 * Toda fila debe pertenecer al RUN consultado. Si una sola no coincide se
 * rechaza el lote entero: mostrar exámenes de otro paciente es peor que no
 * mostrar nada.
 */
export function examRowsMatchRut(exams, expectedRutBody) {
  const expected = normalizeRutBody(expectedRutBody);
  return /^\d{5,9}$/.test(expected) && Array.isArray(exams) &&
    exams.every(exam => exam && normalizeRutBody(exam.rutBody) === expected);
}

/**
 * Componentes crudos que sobran cuando el informe ya trae la razón.
 *
 * Si viene RPC, la proteinuria y la creatininuria sueltas sólo añaden ruido: lo
 * que el clínico interpreta es el cociente. Se decide por informe, no
 * globalmente, porque un informe puede traer la razón y otro no.
 */
function suppressedRatioComponents(findings) {
  const nombres = new Set(findings.map(f => f.analysis));
  const firmas = findings.map(f => comparisonToken(`${f.section} ${f.analysis}`));
  const suppressed = new Set();
  if (nombres.has('RPC') || firmas.some(s => s.includes('proteinuria/creatininuria'))) {
    suppressed.add('Creatininuria');
    suppressed.add('Proteinuria');
  }
  if (nombres.has('RAC') || firmas.some(s => s.includes('albumina/creatinuria'))) {
    suppressed.add('Creatininuria');
    suppressed.add('Microalbuminuria');
  }
  return suppressed;
}

/**
 * ¿Qué fracción sérica de bilirrubina es este hallazgo? `null` si no es
 * ninguna: una bilirrubina urinaria conserva su propia fila y su muestra.
 */
function bilirubinFraction(finding) {
  const token = comparisonToken(finding.analysis);
  if (!token.includes('bilirrubina')) return null;
  if (!isSystemicTrendEligible(finding)) return null;
  if (token.includes('indirecta')) return 'indirecta';
  if (token.includes('directa')) return 'directa';
  if (token.includes('total')) return 'total';
  return null;
}

/**
 * Junta bilirrubina total, directa e indirecta en una fila «T/D/I».
 *
 * La celda fusionada conserva la alerta y la referencia de sus componentes: si
 * cualquiera de las tres está fuera de rango, la fila se marca. Antes se fijaba
 * `alert: false` y se borraba la referencia, con lo que una bilirrubina de 15,4
 * —ictericia franca— se pintaba como un valor normal mientras la cabecera
 * seguía contándola entre las alteradas.
 *
 * La unidad y la sección salen de los propios hallazgos, no de una constante:
 * inventarlas era afirmar algo que el informe no dijo.
 */
function mergeBilirubinRow(rowsByName, bilirubinByReport) {
  if (bilirubinByReport.size === 0) return;
  const orden = ['total', 'directa', 'indirecta'];
  const primero = [...bilirubinByReport.values()]
    .flatMap(b => orden.map(k => b[k]).filter(Boolean))[0];
  const unit = primero?.unit || '';
  const section = primero?.section || 'PERFIL HEPATICO';
  const key = ['perfil hepatico', 'bilirrubinas (t/d/i)', comparisonToken(unit)].join('|');
  const row = { key, analysis: 'Bilirrubinas (T/D/I)', section, unit, values: {} };

  for (const [examId, b] of bilirubinByReport) {
    const partes = orden.map(k => b[k]);
    row.values[examId] = {
      section,
      analysis: row.analysis,
      result: partes.map(p => p ? p.result : '–').join(' / '),
      unit,
      refValue: partes.map(p => p && p.refValue ? p.refValue : '–').join(' / '),
      qualitative: false,
      alert: partes.some(p => p && p.alert),
    };
  }
  rowsByName.set(key, row);
}

function analysisSort(a, b) {
  const indexA = IMPORTANT_ANALYSES.indexOf(a);
  const indexB = IMPORTANT_ANALYSES.indexOf(b);
  if (indexA !== -1 || indexB !== -1) {
    if (indexA === -1) return 1;
    if (indexB === -1) return -1;
    return indexA - indexB;
  }
  return a.localeCompare(b, 'es');
}

function sanitizeFinding(value) {
  if (!value || typeof value !== 'object') return null;
  const section = cleanText(value.section) || 'GENERAL';
  const analysis = normalizeAnalysisName(value.analysis, section);
  const result = cleanText(value.result);
  if (!analysis || !result) return null;
  const finding = {
    section,
    analysis,
    result,
    unit: cleanText(value.unit),
    refValue: cleanText(value.refValue),
    qualitative: Boolean(value.qualitative),
  };
  // La marca del laboratorio y el grupo de referencia viajan con el hallazgo:
  // sin ellos, la matriz perdía la alerta que el informe traía impresa.
  if (value.flag) finding.flag = cleanText(value.flag);
  if (value.refGroup) finding.refGroup = cleanText(value.refGroup);
  if (value.refUncertain) finding.refUncertain = true;
  finding.alert = findingAlert(finding);
  return finding;
}

/**
 * Construye el modelo analítico completo a partir de los detalles de cada
 * informe y la lista de órdenes.
 *
 * Devuelve `{columns, comparison, trends, reports, summary}`:
 * - `columns`: una por informe, en orden cronológico.
 * - `comparison`: matriz analito × informe.
 * - `trends`: series temporales, sólo de muestras sistémicas, con al menos dos
 *   puntos medibles y comparador exacto (un «<0,01» no es un punto de gráfico).
 * - `reports`: informes del más reciente al más antiguo.
 */
export function buildAnalysis(details, exams) {
  const safeExams = sanitizeExamList(exams);
  const examById = new Map(safeExams.map(exam => [exam.id, exam]));
  const reports = [];
  for (const detail of Array.isArray(details) ? details : []) {
    if (!detail) continue;
    const exam = examById.get(String(detail.examId || ''));
    if (!exam) continue;
    const findings = (Array.isArray(detail.findings) ? detail.findings : [])
      .map(sanitizeFinding).filter(Boolean).slice(0, 500);
    reports.push({
      examId: exam.id,
      date: exam.date,
      time: exam.time,
      label: `${exam.date}${exam.time ? ' ' + exam.time : ''}`,
      timestamp: parseExamDate(exam.date, exam.time),
      examNames: exam.exams,
      findings,
      error: cleanText(detail.error),
    });
  }
  reports.sort((a, b) => a.timestamp - b.timestamp);

  const columns = reports.map(report => ({
    key: report.examId,
    label: report.label,
    examNames: report.examNames,
    error: report.error,
  }));

  const rowsByName = new Map();
  const microbiology = [];
  const bilirubinByReport = new Map();

  for (const report of reports) {
    const suppressed = suppressedRatioComponents(report.findings);
    const categories = resolveMicrobiologyCategoriesForExam({ exams: report.examNames });
    const microFindings = new Map();

    for (const finding of report.findings) {
      // Si el informe trae la razón, sus componentes crudos sobran: el valor
      // con significado clínico es el cociente.
      if (suppressed.has(finding.analysis)) continue;

      if (categories.length && resolveMicrobiologyCategoryForFinding(finding, categories)) {
        collectMicrobiologyFinding(finding, categories, microFindings);
        continue; // Un cultivo no es una fila de la matriz ni un punto de tendencia.
      }

      // Las tres bilirrubinas séricas se leen juntas y van a una sola fila.
      // Sólo se desvía la que de verdad es total, directa o indirecta: una
      // «Bilirrubina» de tira reactiva urinaria no es ninguna de las tres, y
      // desviarla fabricaba una fila de perfil hepático que el informe nunca
      // midió, además de perder el dato urinario.
      const fraccion = bilirubinFraction(finding);
      if (fraccion) {
        if (!bilirubinByReport.has(report.examId)) bilirubinByReport.set(report.examId, {});
        bilirubinByReport.get(report.examId)[fraccion] = finding;
        continue;
      }

      // Sólo se descarta el ruido administrativo del catálogo. HHR además deja
      // la orina fuera de la matriz, porque su tabla no muestra la muestra de
      // origen; la de aquí sí la rotula en cada fila, así que un leucocito
      // urinario no puede leerse como hematológico y conviene conservarlo para
      // seguir una infección urinaria a lo largo del tiempo. La separación de
      // muestras se mantiene donde importa: las tendencias sistémicas.
      if (isExcludedFromComparison(finding.analysis)) continue;

      const rowKey = [finding.section, finding.analysis, finding.unit].map(comparisonToken).join('|');
      if (!rowsByName.has(rowKey)) {
        rowsByName.set(rowKey, {
          key: rowKey,
          analysis: finding.analysis,
          section: finding.section,
          unit: finding.unit,
          values: {},
        });
      }
      rowsByName.get(rowKey).values[report.examId] = finding;
    }

    if (categories.length) {
      microbiology.push(...buildMicrobiologyEntriesForExam({
        exam: { id: report.examId, exams: report.examNames },
        date: report.label,
        categories,
        findingsByCategory: microFindings,
      }));
    }
  }

  mergeBilirubinRow(rowsByName, bilirubinByReport);

  const comparison = [...rowsByName.values()]
    .sort((a, b) => comparisonSortIndex(a.analysis) - comparisonSortIndex(b.analysis) ||
      analysisSort(a.analysis, b.analysis));

  const trends = comparison.map(row => ({
    analysis: row.analysis,
    unit: row.unit,
    section: row.section,
    points: reports.map(report => {
      const finding = row.values[report.examId];
      if (!finding || !isSystemicTrendEligible(finding)) return null;
      const measurement = parseMeasurement(finding.result, finding);
      // Un «4.500» sin unidad puede ser 4,5 o 4500: no entra a la tendencia.
      if (!measurement || measurement.comparator !== '=' || measurement.ambiguous) return null;
      // El rango viaja con cada punto: puede cambiar entre informes (distinto
      // laboratorio, distinta edad), y el gráfico sólo puede dibujar la banda
      // normal cuando todos los puntos declaran el mismo.
      const bounds = referenceBounds(finding.refValue, finding);
      return {
        examId: report.examId,
        label: report.label,
        timestamp: report.timestamp,
        value: measurement.value,
        alert: finding.alert,
        refMin: bounds ? bounds.min : null,
        refMax: bounds ? bounds.max : null,
      };
    }).filter(Boolean),
  })).filter(trend => trend.points.length >= 2).slice(0, 24);

  return {
    columns,
    comparison,
    trends,
    microbiology,
    reports: reports.slice().reverse(),
    summary: {
      reportCount: reports.length,
      findingCount: reports.reduce((total, report) => total + report.findings.length, 0),
      alertCount: reports.reduce(
        (total, report) => total + report.findings.filter(finding => finding.alert).length, 0
      ),
    },
  };
}

/** Matriz de comparación como TSV, para pegar en una planilla. */
export function comparisonClipboard(analysis) {
  if (!analysis || !Array.isArray(analysis.columns)) return '';
  const lines = [['Variable', ...analysis.columns.map(column => column.label)].join('\t')];
  for (const row of Array.isArray(analysis.comparison) ? analysis.comparison : []) {
    lines.push([
      [row.analysis, row.section, row.unit].filter(Boolean).join(' · '),
      ...analysis.columns.map(column => {
        const finding = row.values && row.values[column.key];
        return finding ? `${finding.result}${finding.unit ? ' ' + finding.unit : ''}` : '--';
      }),
    ].join('\t'));
  }
  return lines.join('\n');
}
