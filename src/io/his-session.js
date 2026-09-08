/**
 * Sesión y credenciales del HIS de Hanga Roa.
 *
 * Las credenciales se guardan en las preferencias, que ya se cifran con el PIN
 * (ADR 0001) — no viven en un lugar aparte. La cookie de sesión la maneja
 * Chrome; aquí sólo se guarda con qué reingresar cuando esa cookie caduca.
 */
import { savePrefs, loadPrefs } from './cache.js';
import { hisLogin, hisAtencionesPorRut } from './his-http.js';

/** @returns {Promise<{ user: string, pass: string }>} credenciales guardadas (vacías si no hay) */
export async function hisCreds() {
  const p = /** @type {any} */ (await loadPrefs());
  return { user: p.hisUser ?? '', pass: p.hisPass ?? '' };
}

/** ¿Hay un usuario del HIS guardado? */
export async function hisConfigurado() {
  return Boolean((await hisCreds()).user);
}

/**
 * Inicia sesión en el HIS y, si va bien, guarda las credenciales cifradas para
 * poder reingresar cuando la cookie caduque.
 * @returns {Promise<{ ok: boolean, error?: string }>}
 */
export async function hisConectar(user, pass) {
  const r = await hisLogin(user, pass);
  if (r.ok) await savePrefs({ hisUser: user, hisPass: pass });
  return r;
}

/** Olvida las credenciales guardadas (la cookie del navegador la cierra el HIS aparte). */
export async function hisOlvidar() {
  await savePrefs({ hisUser: '', hisPass: '' });
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
      const { user, pass } = await hisCreds();
      if (!user || !pass) return { atenciones: [], error: 'sin sesión del HIS' };
      const login = await hisLogin(user, pass);
      if (!login.ok) return { atenciones: [], error: login.error };
      r = await hisAtencionesPorRut(rut, { signal });
      if (r.authRequired) return { atenciones: [], error: 'no se pudo reingresar al HIS' };
    }
    return { atenciones: r.atenciones };
  } catch (e) {
    return { atenciones: [], error: e?.message ? String(e.message) : 'error de red con el HIS' };
  }
}
