/**
 * Sesión y credenciales del HIS de Hanga Roa.
 *
 * Las credenciales se guardan en las preferencias, que ya se cifran con el PIN
 * (ADR 0001) — no viven en un lugar aparte. La cookie de sesión la maneja
 * Chrome; aquí sólo se guarda con qué reingresar cuando esa cookie caduca.
 */
import { hisLogin, hisAtencionesPorRut, hisFicha } from './his-http.js';
import { credencialPara, guardar, listar, marcarCaducada } from './credenciales.js';

/**
 * Las credenciales del HIS viven en el centro de contraseñas, no aquí: un solo
 * sitio cifrado para los cinco sistemas. Devuelve vacías si no hay, o si el HIS
 * las rechazó y siguen marcadas caducadas —en ese caso no se vuelven a probar
 * solas, que es lo que evita que el hospital bloquee la cuenta.
 * @returns {Promise<{ user: string, pass: string }>}
 */
export async function hisCreds() {
  const c = await credencialPara('rce');
  return { user: c?.usuario ?? '', pass: c?.clave ?? '' };
}

/** ¿Hay un acceso al HIS guardado y vigente? */
export async function hisConfigurado() {
  const e = (await listar()).rce;
  return e?.estado === 'guardada';
}

/**
 * Inicia sesión en el HIS y, si va bien, guarda las credenciales cifradas para
 * poder reingresar cuando la cookie caduque.
 * @returns {Promise<{ ok: boolean, error?: string }>}
 */
export async function hisConectar(user, pass) {
  const r = await hisLogin(user, pass);
  if (r.ok) await guardar('rce', user, pass);
  else if (r.rechazada) await marcarCaducada('rce', r.error ?? '');
  return r;
}

/**
 * Atenciones del HIS del paciente. Si la sesión caducó, reintenta una vez con
 * las credenciales guardadas. Nunca lanza: la historia del paciente no se cae
 * porque el HIS esté fuera de la red o sin sesión.
 * @param {string} rut
 * @param {{ signal?: AbortSignal }} [opts]
 * @returns {Promise<{ atenciones: import('../core/his-parse.js').AtencionHis[], error?: string }>}
 */
export async function hisLoadAtenciones(rut, { signal } = {}) {
  try {
    let r = await hisAtencionesPorRut(rut, { signal });
    if (r.authRequired) {
      // Por `reingresar`, no por `hisLogin` a pelo: es lo que comparte el intento
      // entre pacientes y marca caducada la credencial rechazada. Llamando a
      // hisLogin directamente, abrir cinco pacientes eran cinco intentos con una
      // clave que el HIS ya había rechazado — la vía rápida al bloqueo de cuenta.
      const login = await reingresar();
      if (!login.ok) return { atenciones: [], error: login.error };
      r = await hisAtencionesPorRut(rut, { signal });
      if (r.authRequired) return { atenciones: [], error: 'no se pudo reingresar al HIS' };
    }
    return { atenciones: r.atenciones };
  } catch (e) {
    return { atenciones: [], error: e?.message ? String(e.message) : 'error de red con el HIS' };
  }
}

/**
 * Reingresa al HIS con las credenciales guardadas. Lo comparten la lista de
 * atenciones y el contenido de cada ficha: los dos pueden encontrarse con la
 * cookie caducada a mitad de camino.
 * @returns {Promise<{ ok: boolean, error?: string }>}
 */
let reingresoEnCurso = null;
async function reingresar() {
  // Compartido: si el lote del informe encuentra la cookie muerta, todas sus
  // fichas esperan UN reingreso, no uno cada una. Cada hisLogin son cuatro
  // peticiones, y repetir credenciales rechazadas puede bloquear la cuenta.
  if (reingresoEnCurso) return reingresoEnCurso;
  reingresoEnCurso = (async () => {
    const { user, pass } = await hisCreds();
    if (!user || !pass) return { ok: false, error: 'sin sesión del HIS' };
    const r = await hisLogin(user, pass);
    // Sólo si el HIS DIJO que no. Un corte de red no invalida una clave buena.
    if (r.rechazada) await marcarCaducada('rce', r.error ?? '');
    return r;
  })().finally(() => { reingresoEnCurso = null; });
  return reingresoEnCurso;
}

/**
 * El contenido clínico de una atención del HIS. Como `hisLoadAtenciones`, nunca
 * lanza: una ficha que no se puede leer se cuenta y se dice, pero no tumba el
 * panel ni el resto de las fichas del lote.
 * @param {string} idCuenta
 * @param {'urgencia'|'ambulatorio'} tipoFicha
 * @param {{ signal?: AbortSignal }} [opts]
 * @returns {Promise<{ ficha?: import('../core/his-ficha.js').FichaHis, error?: string }>}
 */
export async function hisLoadFicha(idCuenta, tipoFicha, { signal } = {}) {
  try {
    let r = await hisFicha(idCuenta, tipoFicha, { signal });
    if (r.authRequired) {
      const login = await reingresar();
      if (!login.ok) return { error: login.error };
      r = await hisFicha(idCuenta, tipoFicha, { signal });
      if (r.authRequired) return { error: 'no se pudo reingresar al HIS' };
    }
    if (r.error) return { error: r.error };   // permisos o HTTP: es distinto de «vacía»
    if (r.vacia) return { error: 'el HIS no devolvió el contenido de esta ficha' };
    return { ficha: r.ficha };
  } catch (e) {
    return { error: e?.message ? String(e.message) : 'error de red con el HIS' };
  }
}

/**
 * Las fichas de varias atenciones, para el informe imprimible. En serie a
 * propósito: el HIS es un PHP con sesión por cookie y varias peticiones a la
 * vez le sientan mal. `onProgress` permite decir por dónde va, porque son
 * tantas peticiones como atenciones tenga el paciente.
 *
 * Devuelve una entrada por atención, con `ficha` o con `error`: el informe
 * imprime lo que sí llegó y declara lo que faltó, en vez de fallar entero.
 *
 * @param {import('../core/his-parse.js').AtencionHis[]} atenciones
 * @param {{ signal?: AbortSignal, onProgress?: (hechas: number, total: number) => void }} [opts]
 * @returns {Promise<Array<{ atencion: object, ficha?: object, error?: string }>>}
 */
export async function hisLoadFichas(atenciones, { signal, onProgress } = {}) {
  const lista = atenciones ?? [];
  const out = [];
  for (const a of lista) {
    if (signal?.aborted) break;
    const r = await hisLoadFicha(a.idCuenta, a.tipoFicha, { signal });
    out.push({ atencion: a, ...r });
    onProgress?.(out.length, lista.length);
  }
  return out;
}
