import { CONFIG } from '../core/config.js';
import { getToken } from './auth.js';
import { apiBlob } from './http.js';

export function certificadoPath(idCita) {
  return `/API/api/rayen/reporte/reportePDF/Nombre=CertificadoAtencion;IdCita=${idCita};IdNodo=${CONFIG.nodeId}`;
}

export function sicPdfPath(idSolicitud) {
  return `/API/api/rayen/Reporte/ReportePDF/Nombre=SolicitudInterconsulta;IdNodo=${CONFIG.nodeId};IdSolicitud=${idSolicitud};IdNodoQueSolicitaInforme=${CONFIG.nodeId}`;
}

/** Mirrors the exact URL Eloisa requests (note the double ";;" before IdFuncionarioPrestador). */
export function recetaPdfPath(idAtencion, idReceta, idPrestador) {
  return `/API/api/rayen/reporte/ReportePDF/Nombre=RecetaEmitida;IdNodo=${CONFIG.nodeId};IdAtencion=${idAtencion};IdReceta=${idReceta};;IdFuncionarioPrestador=${idPrestador}`;
}

/**
 * Downloads a Rayen PDF with the session token and opens it in a new tab.
 * @returns {Promise<string|null>} error message, or null on success
 */
export async function openPDF(path) {
  const token = await getToken();
  if (!token) return 'Sin sesión activa en Eloisa.';
  try {
    const blob = await apiBlob(token, path);
    if (!blob.size) return 'El servidor devolvió un PDF vacío.';
    const url = URL.createObjectURL(blob.type ? blob : new Blob([blob], { type: 'application/pdf' }));
    try { await chrome.tabs.create({ url }); }
    catch { window.open(url, '_blank'); }
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
    return null;
  } catch (err) {
    return `No se pudo obtener el PDF (${err.message}).`;
  }
}
