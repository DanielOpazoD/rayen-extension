import { identidad } from '../core/identidad.js';
import { getToken } from './auth.js';
import { resolveUrl } from './http.js';
import { CITA_KNOWN_FIELDS } from '../core/parser.js';

const N = identidad.nodeId, O = identidad.officerId;
const RYC = '/API/api/rayen/ReferenciaYContrarreferencia';

/** Endpoints verified in the Ficha Clínica HAR (2026-09-02), plus a few to probe. */
export const QUICK_LINKS = [
  { label: 'Citas del día (agenda)',
    url: `/API/api/rayen/Citas/ListaPacientesCitados/${N}/FechaHoraInicio=${'{YYYYMMDD}'}%20000000;FechaHoraTermino=${'{YYYYMMDD}'}%20235959;IdsDeRecursos=${O};EsAnulado=2;EsGrupal=2;TraerLlamadosPaciente=true;TraerTeleconsulta=true` },
  { label: 'Historial atención (POST — usar desde pestaña Atenciones)',
    url: `/API/api/rayen/FichaClinica/HistorialAtencion` },
  { label: 'IDs SIC emitidas (nodo origen)',
    url: `${RYC}/IdsSolicitudesInterconsultasGet?paramsFiltro=ORIGEN=SOLICITUD_INTERCONSULTA;BUSQUEDAINICIAL=false;TIPOSOLICITUD=1;FECHAINICIO={YYYYMMDD}%20000000;FECHATERMINO={YYYYMMDD}%20235900;CAMPOORDEN=2;ESTADOSSOLICITUDES=13%2C25%2C26%2C28%2C30;IDNODOORIGEN=${N}` },
  { label: 'IDs SIC recibidas (nodo destino)',
    url: `${RYC}/IdsSolicitudesInterconsultasGet?paramsFiltro=ORIGEN=RECEPCION_CONTRALOR;BUSQUEDAINICIAL=false;TIPOSOLICITUD=1;FECHAINICIO={YYYYMMDD}%20000000;FECHATERMINO={YYYYMMDD}%20235900;CAMPOORDEN=2;ESTADOSSOLICITUDES=2%2C3%2C4%2C5%2C15%2C18%2C19%2C20;IDNODODESTINO=${N}` },
  { label: 'Detalle SIC (reemplaza {ids})',
    url: `${RYC}/SolicitudInterconsultaDerivacionPorIds/Ids={ids};TIPOSOLICITUD=1;TraerDocumentos=true` },
  { label: 'Estados SIC (origen)',     url: `${RYC}/EstadosDerivacion/SOLICITUD_INTERCONSULTA/1` },
  { label: 'Estados SIC (contralor)',  url: `${RYC}/EstadosDerivacion/RECEPCION_CONTRALOR/1` },
  { label: 'Especialidades SIC origen', url: `${RYC}/EspecialidadSICEstablecimientoOrigenMultibrowser/IDNODOORIGEN=${N}/1` },
  { label: 'Profesionales del nodo',   url: `/API/api/rayen/general/FuncionarioPrestadorMini/idNodo=${N};esPrestador=1` },
  { label: 'Sectores',                 url: `/API/api/rayen/general/sector/idNodo=${N}` },
  { label: 'Parámetros Rayen',         url: `/API/api/rayen/administracion/parametrosRayen/IdNodo=${N}` },
  { label: 'Hora del servidor',        url: `/API/api/rayen/servidor/fechaHora` },
];

/**
 * Fetches a Rayen API URL with the session token. Only the Eloisa origin is
 * allowed — the token is never sent anywhere else.
 * @returns {Promise<{ ok: boolean, status: number, data: any, raw: string }>}
 */
export async function explorerFetch(relativeOrAbsoluteUrl) {
  const token = await getToken();
  if (!token) return { ok: false, status: 0, data: null, raw: 'Sin sesión activa.' };

  let url;
  try { url = resolveUrl(relativeOrAbsoluteUrl); }
  catch (err) { return { ok: false, status: 0, data: null, raw: String(err.message) }; }

  try {
    const res  = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    const raw  = await res.text();
    let data   = null;
    try { data = JSON.parse(raw); } catch { /* not JSON */ }
    return { ok: res.ok, status: res.status, data, raw };
  } catch (err) {
    return { ok: false, status: 0, data: null, raw: String(err) };
  }
}

/** Summarises top-level cita fields the parser does not map yet, from raw samples. */
export function summarizeExtraFields(rawCitas) {
  const counts = {};
  for (const c of rawCitas) {
    for (const [k, v] of Object.entries(c ?? {})) {
      if (CITA_KNOWN_FIELDS.has(k)) continue;
      counts[k] ??= { count: 0, sample: null };
      counts[k].count++;
      if (counts[k].sample === null && v !== null && v !== undefined && v !== '' && v !== 0 && v !== false) counts[k].sample = v;
    }
  }
  return Object.entries(counts)
    .sort((a, b) => b[1].count - a[1].count)
    .map(([k, { count, sample }]) => ({ key: k, count, sample }));
}
