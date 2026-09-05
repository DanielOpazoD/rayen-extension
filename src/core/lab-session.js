/**
 * Estado de sesión de los dos laboratorios, sin DOM.
 *
 * El módulo decide qué se muestra («HSR conectado», «HHR: abre SysLab…») y
 * cuándo volver a comprobar; quien lo usa entrega las comprobaciones y una
 * función que pinta. Así la política —ventana de caché, qué error es de
 * sesión y cuál de red— se prueba en node, y la pestaña sólo escribe texto.
 */
import { humanError } from './errors.js';

/** Texto y tono para un origen a partir del resultado de su comprobación. */
export function sessionState(source, outcome) {
  const name = source === 'hsr' ? 'HSR' : 'HHR';
  if (outcome.checking) return { status: 'checking', text: 'Verificando…' };
  if (outcome.ok) return { status: 'ok', text: `${name} conectado` };
  const err = outcome.error;
  if (!err) return { status: 'expired', text: `${name} sin sesión`, href: outcome.href };
  if (source === 'hhr' && err.name === 'SyslabAuthError') {
    return { status: 'expired', text: `${name}: ${humanError(err, 'SysLab')}`, href: outcome.href };
  }
  if (source === 'hhr') return { status: 'expired', text: `${name}: ${humanError(err, 'SysLab')}` };
  return { status: 'expired', text: `${name} no responde`, title: humanError(err, 'el portal del Hospital Salvador') };
}

/**
 * @param {object} deps
 * @param {() => Promise<boolean>} deps.checkHsr   true = sesión válida; false = sin sesión; lanza si no responde
 * @param {() => Promise<void>}    deps.checkHhr   resuelve con sesión; lanza SyslabAuthError o error de red
 * @param {() => void} [deps.resetHsr]  limpia la marca de «sesión vencida» del transporte
 * @param {() => void} [deps.resetHhr]
 * @param {{ hsr: string, hhr: string }} deps.links  a dónde abrir para iniciar sesión
 * @param {(source: 'hsr'|'hhr', state: object) => void} deps.paint
 * @param {number} [deps.cacheMs]  ventana en que una comprobación reciente se reutiliza
 * @param {() => number} [deps.now]  reloj inyectable (pruebas)
 */
export function createSessionMonitor({ checkHsr, checkHhr, resetHsr, resetHhr, links, paint, cacheMs = 5000, now = () => Date.now() }) {
  let last = { at: 0, result: null };

  async function refreshHsr() {
    paint('hsr', sessionState('hsr', { checking: true }));
    try {
      const ok = await checkHsr();
      if (ok) resetHsr?.();
      paint('hsr', sessionState('hsr', { ok, href: links.hsr }));
      return ok;
    } catch (error) {
      paint('hsr', sessionState('hsr', { error, href: links.hsr }));
      return false;
    }
  }

  async function refreshHhr() {
    paint('hhr', sessionState('hhr', { checking: true }));
    try {
      await checkHhr();
      resetHhr?.();
      paint('hhr', sessionState('hhr', { ok: true }));
      return true;
    } catch (error) {
      paint('hhr', sessionState('hhr', { error, href: links.hhr }));
      return false;
    }
  }

  /**
   * Comprueba ambas, reutilizando el resultado durante `cacheMs`. Abrir el
   * laboratorio desde el panel del paciente dispara la comprobación por dos
   * caminos a la vez y la de SysLab inyecta un script en la pestaña del
   * usuario: sin esta ventana un clic costaba cuatro comprobaciones.
   */
  let inflight = null;
  function check() {
    const t = now();
    if (last.result && t - last.at < cacheMs) return Promise.resolve(last.result);
    // Dos llamadas simultáneas (panel del paciente + pestaña) comparten la
    // misma comprobación: la caché sólo se llenaba al resolver, y mientras
    // tanto SysLab recibía cuatro inyecciones por un clic.
    if (inflight) return inflight;
    inflight = Promise.all([refreshHsr(), refreshHhr()])
      .then(([hsr, hhr]) => { last = { at: t, result: { hsr, hhr } }; return last.result; })
      .finally(() => { inflight = null; });
    return inflight;
  }

  const invalidate = () => { last = { at: 0, result: null }; };
  return { check, refreshHsr, refreshHhr, invalidate };
}
