/**
 * Búsqueda de exámenes en los dos laboratorios, sin DOM.
 *
 * Guarda el RUT buscado, el token de ejecución que descarta respuestas
 * tardías o canceladas, y los resultados; avisa por callbacks de cada
 * cambio. La pestaña Laboratorio sólo pinta. Antes todo esto vivía mezclado
 * con el DOM en un módulo de 860 líneas sin una sola prueba unitaria.
 */
import { buscarOrdenesPorRut, normalizeOrden, ordersMatchRut } from './lab-api.js';
import { buscarExamenesPorRut, normalizeSyslabExam } from './syslab-api.js';
import { normalizePatientRutBody, rutInputAmbiguous } from './lab-analytics.js';

/**
 * SysLab no admite filtro de fechas en el servidor: devuelve todas las órdenes
 * del RUT. Para que ambas tablas muestren el mismo período, el rango se aplica
 * sobre lo que ya llegó. Sin fecha legible no se oculta: es peor perder un examen.
 */
export function withinRange(fechaDdMmAaaa, desde, hasta) {
  if (!desde && !hasta) return true;
  const m = String(fechaDdMmAaaa || '').match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return true;
  const iso = `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  if (desde && iso < desde) return false;
  if (hasta && iso > hasta) return false;
  return true;
}

/**
 * @param {object} [deps]
 * @param {(rut: string, range: {desde?: string, hasta?: string}) => Promise<object[]>} [deps.fetchHsr]
 * @param {(rutBody: string) => Promise<object[]>} [deps.fetchHhr]
 * @param {(patch: {searching?: boolean, rutBody?: string, rutDisplay?: string}) => void} [deps.onState]
 * @param {(r: object) => void} [deps.onHsr]  {status:'ok'|'empty'|'mismatch'|'auth'|'error', results, message?, error?}
 * @param {(r: object) => void} [deps.onHhr]  {status:'ok'|'empty'|'auth'|'error', results, ocultas?, error?}
 */
export function createLabSearch({
  fetchHsr = (rut, range) => buscarOrdenesPorRut(rut, range),
  fetchHhr = (rutBody, range) => buscarExamenesPorRut(rutBody, { signal: range.signal }),
  onState = () => {}, onHsr = () => {}, onHhr = () => {},
} = {}) {
  let run = 0;
  let searching = false;
  let rutBody = '';
  let rutDisplay = '';
  let hsr = [];
  let hhr = [];
  let controller = null; // aborta de verdad las peticiones de la búsqueda en curso

  const setSearching = on => { searching = on; onState({ searching: on }); };

  async function searchHsr(token, rut, range) {
    try {
      const raw = await fetchHsr(rut, { desde: range.desde || undefined, hasta: range.hasta || undefined, signal: range.signal });
      if (token !== run) return;
      if (!Array.isArray(raw) || raw.length === 0) { hsr = []; onHsr({ status: 'empty', results: hsr }); return; }
      if (!ordersMatchRut(raw, rutBody)) { hsr = []; onHsr({ status: 'mismatch', results: hsr }); return; }
      hsr = raw.map(normalizeOrden);
      onHsr({ status: 'ok', results: hsr, message: raw[0]?.mensajeBusqueda || '' });
    } catch (error) {
      if (token !== run) return;
      hsr = [];
      onHsr({ status: error?.name === 'LabAuthError' ? 'auth' : 'error', results: hsr, error });
    }
  }

  async function searchHhr(token, range) {
    try {
      const raw = await fetchHhr(rutBody, { signal: range.signal });
      if (token !== run) return;
      if (!Array.isArray(raw) || raw.length === 0) { hhr = []; onHhr({ status: 'empty', results: hhr }); return; }
      const todas = raw.map(normalizeSyslabExam);
      hhr = todas.filter(o => withinRange(o.fecha, range.desde, range.hasta));
      onHhr({ status: 'ok', results: hhr, ocultas: todas.length - hhr.length });
    } catch (error) {
      if (token !== run) return;
      hhr = [];
      onHhr({ status: error?.name === 'SyslabAuthError' ? 'auth' : 'error', results: hhr, error });
    }
  }

  /**
   * Inicia una búsqueda. Devuelve `{ rejected: 'ambiguous' }` sin tocar nada
   * cuando el RUT no trae verificador (7 u 8 dígitos sin guion pueden ser dos
   * personas); si no, `{ done }`, una promesa que resuelve `{ superseded }`.
   */
  function start(rutInput, range = {}) {
    const rut = String(rutInput || '').trim();
    if (!rut) return { rejected: 'empty' };
    if (rutInputAmbiguous(rut)) return { rejected: 'ambiguous' };
    // El verificador se quita sólo si de verdad lo es: cortar el último
    // carácter a ciegas mutila el RUT de quien lo escribe sin verificador.
    rutBody = normalizePatientRutBody(rut);
    rutDisplay = rut;
    hsr = []; hhr = [];
    controller?.abort();
    controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const scoped = { ...range, signal: controller?.signal };
    const token = ++run;
    onState({ rutBody, rutDisplay });
    setSearching(true);
    const done = Promise.allSettled([searchHsr(token, rut, scoped), searchHhr(token, scoped)]).then(() => {
      if (token !== run) return { superseded: true }; // otra búsqueda tomó el relevo, o se canceló
      setSearching(false);
      return { superseded: false };
    });
    return { done };
  }

  /** Invalida la búsqueda en curso: lo que llegue después se descarta por el token. */
  function cancel() {
    run += 1;
    controller?.abort();
    setSearching(false);
  }

  /** ¿Lo escrito en el campo ya no es lo que hay en pantalla? */
  const isStale = input => Boolean(rutDisplay) && normalizePatientRutBody(String(input || '')) !== rutBody;

  function reset() {
    run += 1;
    controller?.abort();
    searching = false;
    rutBody = ''; rutDisplay = ''; hsr = []; hhr = [];
    onState({ searching: false, rutBody, rutDisplay });
  }

  return {
    start, cancel, isStale, reset,
    get searching() { return searching; },
    get rut() { return { body: rutBody, display: rutDisplay }; },
    get results() { return { hsr, hhr }; },
  };
}
