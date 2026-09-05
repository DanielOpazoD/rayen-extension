// Renders the report stored by src/export.js → exportPDF() and, with ?print=1,
// opens the print dialog so the user can save it as PDF. No inline scripts
// (MV3 CSP), no libraries.
(async () => {
  const out = document.getElementById('report');
  let data = null;
  try {
    data = await new Promise((res, rej) =>
      chrome.storage.session.get('rayen_report', d => chrome.runtime.lastError ? rej(chrome.runtime.lastError) : res(d.rayen_report)));
  } catch (e) {
    out.textContent = `No se pudo leer el reporte: ${e.message}`;
    return;
  }
  if (!data?.fragment) {
    out.textContent = 'No hay reporte pendiente. Genera uno desde la extensión con Exportar → PDF.';
    return;
  }
  document.getElementById('reportCss').textContent = data.css ?? '';
  out.innerHTML = data.fragment; // built by the extension itself from escaped values
  chrome.storage.session.remove('rayen_report', () => void chrome.runtime.lastError); // PHI: en memoria y borrado al abrir
  document.getElementById('btnPrint').addEventListener('click', () => window.print());
  if (new URLSearchParams(location.search).get('print') === '1') {
    setTimeout(() => window.print(), 300);
  }
})();
