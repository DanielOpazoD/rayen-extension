import { CONFIG } from '../core/config.js';

/**
 * Returns the Rayen Bearer token, reading it directly from the
 * Eloisa tab's localStorage. Falls back to chrome.storage.session.
 * @returns {Promise<string|null>}
 */
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
        chrome.storage.session.set({ rayenToken: result.result });
        return result.result;
      }
    }
  } catch {
    // Eloisa tab not found — fall through to cached token
  }

  return new Promise(resolve =>
    chrome.storage.session.get('rayenToken', d => resolve(d.rayenToken ?? null))
  );
}

/**
 * Borra la copia del token en storage.session. Se llama al recibir 401/403:
 * seguir entregando un token que Eloisa ya rechazó sólo produce más 401.
 */
export async function invalidateToken() {
  try { await new Promise(resolve => chrome.storage.session.remove('rayenToken', () => resolve())); }
  catch { /* sin chrome (pruebas) o sin storage.session: no hay nada que borrar */ }
}
