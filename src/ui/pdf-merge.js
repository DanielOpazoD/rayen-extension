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
      // Relativa al módulo, no al documento: con la ruta suelta el arnés la
      // pedía bajo /dev/ y el PDF único nunca se pudo probar ahí.
      script.src = new URL('../../vendor/pdf-lib.min.js', import.meta.url).href;
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
 * También se devuelve el motivo de cada fallo, con su posición en la lista.
 * Decir «2 no se pudieron incluir» sin decir que el portal pide iniciar sesión
 * deja al médico buscando un problema en el paciente que está en el papel.
 *
 * @param {Array<() => Promise<Uint8Array>>} loaders
 * @param {(done: number, total: number) => void} [onProgress]
 * @returns {Promise<{bytes: Uint8Array|null, merged: number, failed: number, pages: number,
 *   failures: Array<{index: number, error: Error}>}>}
 */
export async function mergePdfs(loaders, onProgress) {
  const { PDFDocument } = await loadPdfLib();
  const output = await PDFDocument.create();
  const total = loaders.length;
  const failures = [];
  let merged = 0;

  for (const [index, load] of loaders.entries()) {
    try {
      const source = await PDFDocument.load(await load(), { ignoreEncryption: true });
      const pages = await output.copyPages(source, source.getPageIndices());
      pages.forEach(page => output.addPage(page));
      merged += 1;
    } catch (error) {
      failures.push({ index, error: error instanceof Error ? error : new Error(String(error)) });
    }
    if (onProgress) onProgress(merged + failures.length, total);
  }

  return {
    bytes: merged > 0 ? await output.save() : null,
    merged,
    failed: failures.length,
    pages: output.getPageCount(),
    failures,
  };
}
