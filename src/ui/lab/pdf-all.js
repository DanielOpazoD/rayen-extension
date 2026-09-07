/**
 * Un solo archivo con los informes de los dos hospitales: todos los que haya, o
 * sólo los que estén marcados.
 *
 * Lo que se dice al terminar importa tanto como el archivo. Antes se contaba
 * «2 no se pudo incluir» sin decir por qué, y el motivo casi siempre era que
 * uno de los dos portales no tenía sesión iniciada: quien mirara el PDF veía
 * los seis informes de Hanga Roa y ninguno del Salvador, sin saber si es que no
 * existían. Ahora se agrupa el motivo por hospital y se nombra.
 */
import { $ } from '../dom.js';
import { humanError } from '../../core/errors.js';
import { mergePdfs } from '../pdf-merge.js';

const HOSPITAL = { HSR: 'del Salvador', HHR: 'de Hanga Roa' };
const plural = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`;

/**
 * @param {{source: 'HSR'|'HHR', puedeImprimir: boolean, loadBytes: () => Promise<Uint8Array>}[]} entries
 * @param {{rutDisplay: string, progreso: (texto: string) => void}} opts
 */
export async function downloadPdfs(entries, { rutDisplay, progreso }) {
  const msg = $('labError');
  const conInforme = entries.filter(e => e.puedeImprimir);
  const sinInforme = entries.length - conInforme.length;
  if (!conInforme.length) {
    msg.textContent = entries.length
      ? 'Ninguna de las órdenes marcadas tiene todavía un informe que descargar.'
      : 'No hay ningún informe que incluir.';
    msg.className = 'lab-msg error';
    return;
  }

  msg.textContent = '';
  progreso(`0/${conInforme.length}…`);
  try {
    const { bytes, merged, failed, pages, failures } = await mergePdfs(
      conInforme.map(e => e.loadBytes),
      (done, total) => progreso(`${done}/${total}…`)
    );
    if (!bytes) throw new Error(failures[0]?.error?.message || 'Ningún informe se pudo incluir.');

    // El nombre lleva el RUT que se buscó, no lo que haya en el campo: editarlo
    // sin volver a buscar guardaba los informes de A como «laboratorio-<RUT de B>».
    savePdf(bytes, `laboratorio-${rutDisplay.replace(/[^0-9kK-]/g, '') || 'informes'}.pdf`);

    const partes = [`PDF con ${plural(merged, 'informe', 'informes')} (${pages} pág.).`];
    if (failed) partes.push(motivos(failures, conInforme));
    if (sinInforme) partes.push(`${plural(sinInforme, 'orden marcada', 'órdenes marcadas')} aún sin informe.`);
    msg.textContent = partes.join(' ');
    msg.className = failed || sinInforme ? 'lab-msg error' : 'lab-msg info';
  } catch (err) {
    msg.textContent = `No se pudo generar el PDF. ${humanError(err, 'el laboratorio')}`;
    msg.className = 'lab-msg error';
  }
}

/**
 * pdf-lib habla en inglés y al programador («No PDF header found»). Cuando lo
 * que llegó no era un PDF suele ser la página de inicio de sesión del portal, y
 * eso sí se puede resolver: hay que decirlo así, no dejar pasar el mensaje de
 * la biblioteca.
 */
const NO_ES_PDF = /pdf (header|document)|failed to parse|is encrypted/i;
const PORTAL = { HSR: 'ProactiveLIS', HHR: 'SysLab' };
const razonDe = (error, source) => NO_ES_PDF.test(error.message)
  ? `${PORTAL[source]} no devolvió un PDF (suele ser su página de inicio de sesión)`
  : humanError(error, PORTAL[source]).replace(/\.$/, '');

/** «2 informes del Salvador quedaron fuera: SysLab pide iniciar sesión.» */
function motivos(failures, entries) {
  const porHospital = new Map();
  for (const { index, error } of failures) {
    const source = entries[index]?.source ?? 'HSR';
    if (!porHospital.has(source)) porHospital.set(source, { n: 0, razones: new Set() });
    const grupo = porHospital.get(source);
    grupo.n += 1;
    grupo.razones.add(razonDe(error, source));
  }
  return [...porHospital].map(([source, { n, razones }]) =>
    `${plural(n, 'informe', 'informes')} ${HOSPITAL[source]} ${n === 1 ? 'quedó' : 'quedaron'} fuera: ${[...razones].join(' · ')}.`
  ).join(' ');
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
