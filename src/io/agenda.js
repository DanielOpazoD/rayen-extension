/**
 * Una petición de agenda: las citas del oficial en un día.
 *
 * El endpoint acepta `FechaHoraInicio` y `FechaHoraTermino`, pero Eloisa
 * devuelve sólo el día de inicio: verificado en tres capturas donde se pidió
 * un rango de dos días y volvió uno solo. Por eso cada día es una llamada,
 * tanto para el período cargado como para la agenda futura.
 */
import { CONFIG } from '../core/config.js';
import { apiGet, rayenParams, run } from './http.js';

/**
 * @param {string} token
 * @param {string} date8  YYYYMMDD
 * @param {{ signal?: AbortSignal }} [opts]
 * @returns {Promise<object[]|null|undefined>} null si falló (nunca una lista
 *   vacía, para no confundir un día caído con un día sin citas); undefined si
 *   se canceló: eso no es un fallo y no se cuenta como tal.
 */
export async function fetchCitasDia(token, date8, { signal = undefined } = {}) {
  const params = rayenParams([
    ['FechaHoraInicio',  `${date8} 000000`],
    ['FechaHoraTermino', `${date8} 235959`],
    ['IdsDeRecursos',    CONFIG.officerId],
    ['EsAnulado', 2],
    ['EsGrupal',  2],
    ['TraerLlamadosPaciente', true],
    ['TraerTeleconsulta',     true],
  ]);
  try {
    const data = await apiGet(token, `/API/api/rayen/Citas/ListaPacientesCitados/${CONFIG.nodeId}/${params}`, { signal: signal ?? run.controller.signal });
    return Array.isArray(data) ? data : null;
  } catch (err) {
    return err?.name === 'CancelledError' ? undefined : null; // AuthError ya marcó session.expired
  }
}
