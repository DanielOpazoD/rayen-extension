import { labGet, labBlob, resetLabSession, LAB_ORIGIN } from './lab-http.js';
import { fmtIso } from '../core/dates.js';
import { normalizePatientRutBody } from '../core/lab-analytics.js';

export { resetLabSession, LAB_ORIGIN };

/**
 * Ventana por omisión de la búsqueda por RUT.
 *
 * Un año dejaba fuera exámenes reales: un paciente con órdenes de junio y
 * noviembre de 2025 consultado en septiembre de 2026 sólo mostraba las de
 * noviembre. El portal ofrece por omisión un rango de ~20 meses.
 */
export const DEFAULT_YEARS_BACK = 2;

/**
 * Check whether the user has an active ProactiveLIS session by trying a
 * no-side-effect GET. Returns true/false without throwing.
 */
export async function checkLabSession() {
  try {
    resetLabSession();
    const res = await fetch(`${LAB_ORIGIN}/BuscarOrdenes`, {
      credentials: 'include',
      redirect: 'follow',
      signal: AbortSignal.timeout(20_000), // sin esto la píldora quedaba en «Verificando…» para siempre
    });
    if (!res.ok) return false;
    const url = new URL(res.url);
    if (url.pathname.startsWith('/Login')) return false;
    const text = await res.text();
    return !text.includes('Acceso Usuario');
  } catch (err) {
    // «Sin sesión» y «no responde» son cosas distintas: la red o el tiempo
    // límite se propagan para que la píldora diga «no disponible».
    if (err?.name === 'TimeoutError' || err?.name === 'AbortError' || /fetch|network/i.test(err?.message ?? '')) throw err;
    return false;
  }
}

/**
 * Search lab orders by RUT.
 * @param {string} rut  formatted RUT (e.g. "16.940.645-6")
 * @param {object} [opts]
 * @param {string} [opts.desde]  yyyy-MM-dd (defaults to 1 year ago)
 * @param {string} [opts.hasta]  yyyy-MM-dd (defaults to today)
 * @param {AbortSignal} [opts.signal]
 * @returns {Promise<Array>} array of order view-models
 */
export async function buscarOrdenesPorRut(rut, { desde, hasta, signal } = {}) {
  if (!hasta) {
    const d = new Date();
    hasta = fmtIso(d);
  }
  if (!desde) {
    const d = new Date();
    d.setFullYear(d.getFullYear() - DEFAULT_YEARS_BACK);
    desde = fmtIso(d);
  }
  const params = new URLSearchParams({
    tipoBusqueda: '1',
    tipoDocumento: '1',
    rutPaciente: rut,
    // El portal envía `false` cuando la búsqueda por RUT debe respetar el rango
    // explícito `desde`/`hasta` (verificado en tráfico real, 03-09-2026). Con
    // `true` el servidor descartaba el rango y devolvía cero órdenes para
    // pacientes que sí tenían exámenes.
    rangofecharut: 'false',
    procedencia: '-1',
    subprocedencia: '-1',
    prestacion: '-1',
    numeroOrden: '-1',
    desde,
    hasta,
    verConDoc: 'false',
  });
  return labGet(`/BuscarOrdenes/buscarOrdenes?${params}`, { signal });
}

/**
 * Get the PDF report for an order as a Blob.
 * Only works when CantPrtValidadas > 0.
 * @param {string} ordenEncryptada — base64 encrypted order ID
 * @returns {Promise<Blob>}
 */
export async function informeResultado(ordenEncryptada) {
  return labBlob(`/informes/InformeResultado?Ord=${encodeURIComponent(ordenEncryptada)}`);
}

/**
 * Cuerpo del RUT que declara una orden de ProactiveLIS.
 *
 * El portal emite el documento relleno con ceros a la izquierda y con el dígito
 * verificador pegado: el RUT 11.957.001-8 llega como «0119570018».
 */
export function ordenRutBody(orden) {
  const doc = String((orden && (orden.numDocumentoCompleto || orden.rut)) || '')
    .replace(/[^0-9kK]/g, '')
    .replace(/^0+/, '');
  return doc.length >= 2 ? normalizePatientRutBody(doc) : '';
}

/**
 * Toda orden devuelta debe pertenecer al RUN consultado.
 *
 * Hanga Roa ya tenía esta comprobación; Salvador no, y sin ella una respuesta
 * atrasada de otro paciente podía pintarse bajo el RUT que estuviera en
 * pantalla. Si una sola orden no coincide se rechaza el lote entero: mostrar
 * exámenes de otra persona es peor que no mostrar ninguno.
 */
export function ordersMatchRut(ordenes, expectedRutBody) {
  const expected = normalizePatientRutBody(expectedRutBody);
  if (!/^\d{5,9}$/.test(expected) || !Array.isArray(ordenes)) return false;
  const declarados = ordenes.map(ordenRutBody);
  // Una orden sin documento no puede desmentirse. Si ninguna lo trae, se
  // acepta el lote; si el resto sí lo declara, la que no lo trae desentona y
  // el lote entero se rechaza: no se muestra lo que no se puede atribuir.
  const conDocumento = declarados.filter(Boolean);
  if (conDocumento.length && conDocumento.length !== declarados.length) return false;
  return conDocumento.every(declarado => declarado === expected);
}

// ── Parsing helpers ──

function parseDotNetDate(str) {
  if (!str) return null;
  const m = /\/Date\((-?\d+)/.exec(str);
  return m ? new Date(+m[1]) : null;
}

/** Normalize a ProactiveLIS order into a flat, usable shape. */
export function normalizeOrden(raw) {
  const pac = raw.Paciente || {};
  return {
    ordenId: raw.OrdenId,
    numero: raw.NumeroOrden,
    fecha: parseDotNetDate(raw.FechaOrden),
    fechaStr: raw.FechaOrden,
    rut: raw.numDocumentoCompleto,
    nombrePaciente: pac.NombreCompletoPaciente || '',
    sexo: pac.Sexo,
    procedencia: raw.Procedencia?.Descripcion || '',
    subProcedencia: raw.usaSubProcedencia ? raw.ProcedenciaDetalle?.Descripcion || '' : '',
    areas: raw.AreasString || '',
    totalPrestaciones: raw.CantidadPrtValidadas?.cantPrtOrdenes ?? 0,
    validadas: raw.CantidadPrtValidadas?.CantPrtValidadas ?? 0,
    rechazadas: raw.CantidadPrtValidadas?.CantPrtRechazadas ?? 0,
    prestaciones: (raw.ListadoPrestacionesEstado || []).map(p => ({
      nombre: p.NombrePrestacion,
      estado: (p.EstadoPrestacion || '').trim(),
      color: p.ColorEstadoPrest,
      fechaValidacion: p.FechaValidacion || '',
      derivacion: p.DestinoDerivacion || '',
    })),
    contieneDocumentos: raw.contieneDocumentos || false,
    ordenEncryptada: raw.OrdenEncryptada,
    puedeImprimir: (raw.CantidadPrtValidadas?.CantPrtValidadas ?? 0) > 0,
    _raw: raw,
  };
}


