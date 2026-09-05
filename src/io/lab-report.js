/**
 * De un informe PDF a un detalle analizable.
 *
 * Cada informe se descarga, se convierte a texto, se verifica su identidad y se
 * interpreta en hallazgos.
 *
 * Sobre la verificación de identidad: SysLab imprime una línea «Rut/Fic:» y ahí
 * la comprobación es exacta — si el RUT del informe no es el consultado, el
 * informe se rechaza. ProactiveLIS (Hospital Salvador) usa otro formato que no
 * está verificado contra informes reales, así que se intenta un patrón general
 * y, si no aparece ningún RUT legible, el detalle queda marcado
 * `rutVerified: false`. No se descarta —seguiría siendo útil— pero quien lo
 * muestre debe decir que no se pudo confirmar la identidad. Un informe sin
 * identidad confirmada presentado como confirmado es el error que hay que
 * evitar.
 */

import { pdfBytesToText } from './lab-pdf-text.js';
import { extractRutBodyFromReportText, parseReportText, cleanText } from '../core/lab-parser.js';
import { normalizeRutBody } from '../core/lab-analytics.js';

const DETAIL_CONCURRENCY = 3;

/**
 * Busca el RUT del paciente en el texto del informe.
 * Primero el formato SysLab («Rut/Fic:»), después un patrón general.
 * Devuelve '' si no hay ninguno legible.
 */
export function extractAnyRutBody(text) {
  const syslab = extractRutBodyFromReportText(text);
  if (syslab) return syslab;
  const line = String(text || '').split(/\r?\n/)
    .find(value => /\brut\b/i.test(value) && /\d{6,}/.test(value.replace(/\./g, '')));
  if (!line) return '';
  const match = cleanText(line).match(/\d[\d.]{5,}/);
  return match ? normalizeRutBody(match[0]) : '';
}

/**
 * Descarga, interpreta y verifica un informe.
 *
 * `toText` existe para poder probar la verificación de identidad sin pdf.js,
 * que necesita el navegador; en producción se usa el valor por omisión.
 *
 * @param {{examId: string, loadBytes: () => Promise<Uint8Array>, expectedRutBody: string, toText?: Function}} spec
 * @returns {Promise<{examId, rutBody, findings, rutVerified}>}
 * @throws si el informe declara un RUT distinto del consultado.
 */
export async function buildDetail({ examId, loadBytes, expectedRutBody, toText = pdfBytesToText, sexo = '' }) {
  const text = await toText(await loadBytes());
  const expected = normalizeRutBody(expectedRutBody);
  const rutBody = extractAnyRutBody(text);

  if (rutBody && expected && rutBody !== expected) {
    throw new Error(`El informe ${examId} corresponde a otro RUN.`);
  }
  return {
    examId: String(examId),
    rutBody: rutBody || expected,
    rutVerified: Boolean(rutBody && expected && rutBody === expected),
    // El sexo elige la referencia cuando el informe trae una por grupo («Mujeres: … Hombres: …»).
    findings: parseReportText(text, { sexo }),
  };
}

/**
 * Procesa varios informes con concurrencia acotada.
 *
 * Un informe que falle no cancela el resto: se devuelve su error para que la
 * interfaz pueda decir exactamente cuál quedó fuera y por qué.
 *
 * @returns {Promise<{details: Array, errors: Array<{examId, message}>}>}
 */
export async function buildDetails(specs, onProgress) {
  const details = new Array(specs.length);
  const errors = [];
  let next = 0;
  let done = 0;

  const worker = async () => {
    while (next < specs.length) {
      const index = next;
      next += 1;
      try {
        details[index] = await buildDetail(specs[index]);
      } catch (error) {
        details[index] = null;
        errors.push({
          examId: String(specs[index].examId),
          message: String((error && error.message) || error),
        });
      }
      done += 1;
      if (onProgress) onProgress(done, specs.length);
    }
  };

  await Promise.all(
    Array.from({ length: Math.min(DETAIL_CONCURRENCY, specs.length) }, worker)
  );
  return { details: details.filter(Boolean), errors };
}
