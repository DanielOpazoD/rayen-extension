/** «Todos los PDF»: un solo archivo con los informes imprimibles de ambos hospitales. */
import { $ } from '../dom.js';
import { humanError } from '../../core/errors.js';
import { informeResultado } from '../../io/lab-api.js';
import { syslabReportBytes } from '../../io/syslab-api.js';
import { mergePdfs } from '../pdf-merge.js';

export async function downloadAllPdfs(search) {
  const btn = $('labDownloadAll');
  const msg = $('labError');
  btn.disabled = true;
  msg.textContent = '';

  const loaders = [
    ...search.results.hsr.filter(o => o.puedeImprimir).map(o => async () =>
      new Uint8Array(await (await informeResultado(o.ordenEncryptada)).arrayBuffer())),
    ...search.results.hhr.filter(o => o.puedeImprimir).map(o => () => syslabReportBytes(o.link)),
  ];

  btn.textContent = `0/${loaders.length}…`;
  try {
    const { bytes, merged, failed, pages } = await mergePdfs(loaders, (done, total) => {
      btn.textContent = `${done}/${total}…`;
    });
    if (!bytes) throw new Error('Ningún informe se pudo incluir.');

    // El nombre lleva el RUT que se buscó, no lo que haya en el campo: editarlo
    // sin volver a buscar guardaba los informes de A como «laboratorio-<RUT de B>».
    savePdf(bytes, `laboratorio-${search.rut.display.replace(/[^0-9kK-]/g, '') || 'informes'}.pdf`);
    msg.textContent = failed === 0
      ? `PDF único con ${merged} informe${merged !== 1 ? 's' : ''} (${pages} pág.).`
      : `PDF con ${merged} de ${merged + failed} informes (${pages} pág.). ${failed} no se pudo incluir.`;
    msg.className = failed === 0 ? 'lab-msg info' : 'lab-msg error';
  } catch (err) {
    msg.textContent = `No se pudo generar el PDF único. ${humanError(err, 'el laboratorio')}`;
    msg.className = 'lab-msg error';
  } finally {
    btn.disabled = false;
    btn.textContent = 'Todos los PDF';
  }
}

function savePdf(bytes, filename) {
  const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
