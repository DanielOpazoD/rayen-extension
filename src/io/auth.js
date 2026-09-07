import { CONFIG } from '../core/config.js';

/**
 * Returns the Rayen Bearer token, reading it directly from the
 * Eloisa tab's localStorage. Falls back to chrome.storage.session.
 * @returns {Promise<string|null>}
 */
let rejected = null; // último token que Eloisa rechazó con 401/403: no se vuelve a entregar hasta la próxima carga
/** Una carga nueva vuelve a dar una oportunidad al token de la pestaña (puede haber cambiado tras iniciar sesión). */
export function forgetRejectedToken() { rejected = null; }

export async function getToken() {
  try {
    const tabs = await chrome.tabs.query({ url: `${CONFIG.base}/*` });
    if (tabs.length > 0) {
      const [result] = await chrome.scripting.executeScript({
        // Mundo aislado: localStorage es del origen y se lee igual, pero la
        // página ya no puede interceptar la lectura del token.
        target: { tabId: tabs[0].id },
        func: () => {
          try {
            return JSON.parse(localStorage.getItem('userSession') || '{}').accessToken ?? null;
          } catch {
            return null;
          }
        },
      });
      if (result?.result) {
        if (result.result === rejected) return null; // la pestaña sigue mostrando el token muerto
        rejected = null;
        chrome.storage.session.set({ rayenToken: result.result });
        return result.result;
      }
    }
  } catch {
    // Eloisa tab not found — fall through to cached token
  }

  return new Promise(resolve =>
    chrome.storage.session.get('rayenToken', d => resolve(d.rayenToken && d.rayenToken !== rejected ? d.rayenToken : null))
  );
}

/**
 * Borra la copia del token en storage.session. Se llama al recibir 401/403:
 * seguir entregando un token que Eloisa ya rechazó sólo produce más 401.
 */
export async function invalidateToken(token = null) {
  if (token) rejected = token;
  try { await new Promise(resolve => chrome.storage.session.remove('rayenToken', () => resolve())); }
  catch { /* sin chrome (pruebas) o sin storage.session: no hay nada que borrar */ }
}

/**
 * El objeto de sesión de Eloisa tal como lo guarda su web, sin los valores
 * secretos: de ahí sale la identidad del profesional y del nodo. Se lee en el
 * mundo aislado, igual que el token, para que la página no pueda interceptarlo.
 * @returns {Promise<object|null>} null si no hay pestaña de Eloisa o no se pudo leer
 */
export async function leerSesionEloisa() {
  try {
    const tabs = await chrome.tabs.query({ url: `${CONFIG.base}/*` });
    if (!tabs.length) return null;
    const [result] = await chrome.scripting.executeScript({
      target: { tabId: tabs[0].id },
      func: () => {
        const SECRETO = /token|password|contrasena|clave|secret|refresh/i;
        const limpiar = (nodo, nivel = 0) => {
          if (!nodo || typeof nodo !== 'object' || nivel > 6) return undefined;
          if (Array.isArray(nodo)) return nodo.slice(0, 20).map(x => (x && typeof x === 'object' ? limpiar(x, nivel + 1) : x));
          const out = {};
          for (const [k, v] of Object.entries(nodo)) {
            if (SECRETO.test(k)) continue;                       // el token no sale de aquí
            out[k] = v && typeof v === 'object' ? limpiar(v, nivel + 1) : v;
          }
          return out;
        };
        try { return limpiar(JSON.parse(localStorage.getItem('userSession') || '{}')) ?? null; }
        catch { return null; }
      },
    });
    return result?.result ?? null;
  } catch {
    return null; // sin pestaña de Eloisa, sin permisos o fuera de la extensión
  }
}
