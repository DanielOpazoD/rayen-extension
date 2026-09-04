/**
 * Fusión de varios informes PDF en un solo documento.
 *
 * pdf-lib pesa ~500 KB, así que se carga sólo cuando se pide una fusión y no
 * en cada apertura de la aplicación. La biblioteca es local (`vendor/`): la CSP
 * de la extensión no permite cargarla desde una CDN.
 */

let libraryPromise = null;

function loadPdfLib() {
  if (!libraryPromise) {
    libraryPromise = new Promise((resolve, reject) => {
      if (globalThis.PDFLib) return resolve(globalThis.PDFLib);
      const script = document.createElement('script');
      script.src = 'vendor/pdf-lib.min.js';
      script.onload = () => globalThis.PDFLib
        ? resolve(globalThis.PDFLib)
        : reject(new Error('pdf-lib se cargó sin exponer su API.'));
      script.onerror = () => reject(new Error('No se pudo cargar pdf-lib.'));
      document.head.appendChild(script);
    }).catch(error => {
      libraryPromise = null; // Un fallo de carga no debe envenenar el siguiente intento.
      throw error;
    });
  }
  return libraryPromise;
}

/**
 * Fusiona los PDF que entreguen `loaders` en el orden recibido.
 *
 * Un informe que falle no cancela el resto, pero se cuenta y se devuelve: quien
 * llama debe decir cuántos quedaron fuera. Un PDF clínico incompleto que se
 * presenta como completo es peor que uno que declara lo que le falta.
 *
 * @param {Array<() => Promise<Uint8Array>>} loaders
 * @param {(done: number, total: number) => void} [onProgress]
 * @returns {Promise<{bytes: Uint8Array|null, merged: number, failed: number, pages: number}>}
 */
export async function mergePdfs(loaders, onProgress) {
  const { PDFDocument } = await loadPdfLib();
  const output = await PDFDocument.create();
  const total = loaders.length;
  let merged = 0;
  let failed = 0;

  for (const load of loaders) {
    try {
      const source = await PDFDocument.load(await load(), { ignoreEncryption: true });
      const pages = await output.copyPages(source, source.getPageIndices());
      pages.forEach(page => output.addPage(page));
      merged += 1;
    } catch (_error) {
      failed += 1;
    }
    if (onProgress) onProgress(merged + failed, total);
  }

  return {
    bytes: merged > 0 ? await output.save() : null,
    merged,
    failed,
    pages: output.getPageCount(),
  };
}
