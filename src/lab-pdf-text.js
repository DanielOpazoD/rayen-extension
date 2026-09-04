/**
 * Extracción de texto de informes PDF con pdf.js.
 *
 * Un informe de laboratorio es una tabla, y el parser espera líneas del tipo
 * «Analito: valor unidad rango». pdf.js entrega fragmentos sueltos con
 * coordenadas, así que hay que reconstruir las filas.
 *
 * Tres detalles que parecen menores y no lo son:
 *
 * 1. Hay que aplicar la matriz del viewport de la página. pdf.js entrega las
 *    coordenadas en el sistema original del PDF; en un informe declarado con
 *    `/Rotate 90` eso pega en una sola línea celdas que pertenecen a columnas
 *    distintas, y la fila deja de ser interpretable.
 * 2. Estos PDF traen artefactos de codificación: «ó» llega como «¢» y «º» como
 *    «°». Sin corregirlo, «Nitr¢geno Ureico» no coincide con ningún alias y el
 *    analito desaparece sin ningún error.
 * 3. El dos puntos puede venir separado de su etiqueta («RUN : 123»). Se
 *    normaliza a «RUN: 123», sin tocar las horas, que no llevan espacio.
 *
 * pdf.js pesa ~1,8 MB entre biblioteca y worker, así que se importa sólo cuando
 * se pide un análisis.
 */

let modulePromise = null;

function loadPdfJs() {
  if (!modulePromise) {
    modulePromise = import('../vendor/pdf.min.mjs').then(module => {
      module.GlobalWorkerOptions.workerSrc = new URL('../vendor/pdf.worker.min.mjs', import.meta.url).href;
      return module;
    }).catch(error => {
      modulePromise = null; // Un fallo de carga no debe envenenar el siguiente intento.
      throw error;
    });
  }
  return modulePromise;
}

function looksLikePdf(bytes) {
  if (!bytes || bytes.length < 4) return false;
  return String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3]) === '%PDF';
}

/** Corrige los artefactos de codificación y normaliza espacios y saltos. */
export function normalizePdfText(text) {
  return String(text || '')
    .replace(/¢/g, 'ó')
    .replace(/°/g, 'o')
    .replace(/[ \t]+/g, ' ')
    .replace(/\r/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function transformPoint(itemTransform, viewportTransform) {
  const x = itemTransform[4] ?? 0;
  const y = itemTransform[5] ?? 0;
  if (!viewportTransform) return { x, y };
  return {
    x: (viewportTransform[0] ?? 0) * x + (viewportTransform[2] ?? 0) * y + (viewportTransform[4] ?? 0),
    y: (viewportTransform[1] ?? 0) * x + (viewportTransform[3] ?? 0) * y + (viewportTransform[5] ?? 0),
  };
}

/**
 * Reconstruye las líneas visuales a partir de los fragmentos de pdf.js.
 *
 * Con la matriz del viewport aplicada, la coordenada vertical crece hacia
 * abajo; sin ella, hacia arriba. De ahí que el orden dependa de si se recibió.
 *
 * @param {Array} items fragmentos de `getTextContent()`
 * @param {Array|Float32Array} [viewportTransform] matriz de `getViewport({scale:1})`
 * @returns {string[]} una cadena por fila visual
 */
export function groupPdfTextItemsIntoLines(items, viewportTransform) {
  const positioned = (Array.isArray(items) ? items : [])
    .filter(item =>
      item && typeof item === 'object' &&
      typeof item.str === 'string' && item.str.trim().length > 0 &&
      (Array.isArray(item.transform) || item.transform instanceof Float32Array))
    .map(item => ({ text: item.str.trim(), ...transformPoint(item.transform, viewportTransform) }));

  const lines = [];
  for (const item of positioned) {
    // Dos unidades de tolerancia: los fragmentos de una misma fila rara vez
    // comparten la coordenada exacta.
    const existing = lines.find(line => Math.abs(line.y - item.y) <= 2);
    if (existing) existing.tokens.push({ text: item.text, x: item.x });
    else lines.push({ y: item.y, tokens: [{ text: item.text, x: item.x }] });
  }

  return lines
    .sort((a, b) => (viewportTransform ? a.y - b.y : b.y - a.y))
    .map(line => line.tokens
      .sort((a, b) => a.x - b.x)
      .map(token => token.text)
      .join(' ')
      .replace(/\s+:\s*/g, ': ')
      .replace(/ {2,}/g, ' ')
      .trim())
    .filter(Boolean);
}

/**
 * Bytes de un PDF → texto plano con las filas reconstruidas.
 * @param {Uint8Array} bytes
 * @returns {Promise<string>}
 */
export async function pdfBytesToText(bytes) {
  if (!looksLikePdf(bytes)) throw new Error('El archivo no es un PDF.');
  const pdfjs = await loadPdfJs();
  // slice() porque pdf.js se apropia del buffer que recibe.
  const doc = await pdfjs.getDocument({
    data: bytes.slice(),
    useWorkerFetch: false,
    isEvalSupported: false,
  }).promise;

  const pages = [];
  try {
    for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber += 1) {
      const page = await doc.getPage(pageNumber);
      const content = await page.getTextContent();
      const viewport = page.getViewport({ scale: 1 });
      pages.push(groupPdfTextItemsIntoLines(content.items, viewport.transform).join('\n'));
    }
    return normalizePdfText(pages.join('\n\n'));
  } finally {
    await doc.destroy();
  }
}
