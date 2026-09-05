import { CONFIG } from '../core/config.js';
import { invalidateToken, forgetRejectedToken } from './auth.js';

const ORIGIN = new URL(CONFIG.base).origin;

/** Thrown on 401/403: the Eloisa session is gone and every further call will fail the same way. */
export class AuthError extends Error {
  constructor(status) {
    super(`Sesión de Eloisa vencida (HTTP ${status})`);
    this.name = 'AuthError';
    this.status = status;
  }
}

/**
 * Shared session state. Loaders check `session.expired` between batches so a
 * dead session stops the run after one failed call instead of 180.
 */
export const session = { expired: false };
export function resetSession() { session.expired = false; forgetRejectedToken(); }

/** Lanzado cuando la persona canceló la carga: no es un fallo de red y no se reintenta. */
export class CancelledError extends Error {
  constructor() { super('Carga cancelada'); this.name = 'CancelledError'; }
}
/** Lanzado cuando Eloisa no respondió dentro del tiempo límite de esa llamada. */
export class TimeoutError extends Error {
  constructor(ms) { super(`Eloisa no respondió en ${Math.round(ms / 1000)} s`); this.name = 'TimeoutError'; }
}

/**
 * Tiempos límite: `timeoutMs` para la agenda y la ficha diaria; `longTimeoutMs`
 * para la ficha completa de un paciente (una sola llamada de diez años).
 * Mutables: Preferencias los cambia y las pruebas los bajan.
 */
export const net = { timeoutMs: CONFIG.httpTimeoutMs, longTimeoutMs: CONFIG.fichaTimeoutMs };
/** Preferencia «espera máxima»: la ficha completa espera el triple, nunca menos que el valor por defecto. */
export function applyNetPrefs(prefs) {
  const sec = Number(prefs?.netTimeoutSec);
  if (!Number.isFinite(sec) || sec < 5) return;
  net.timeoutMs = sec * 1000;
  net.longTimeoutMs = Math.max(CONFIG.fichaTimeoutMs, sec * 3000);
}

/**
 * La carga de la agenda es lo único cancelable: sus peticiones llevan
 * `run.controller.signal` y `cancelRun()` las aborta en vuelo. Las demás
 * llamadas (ficha del panel, interconsultas, PDF) no llevan señal y no se ven
 * afectadas: cancelar una carga no rompe el resto de la aplicación.
 */
export const run = { cancelled: false, controller: new AbortController() };
export function cancelRun() { run.cancelled = true; run.controller.abort(); }
export function resetRun() { run.cancelled = false; run.controller = new AbortController(); }

/** Tiempo límite + señal opcional del llamador, sin depender de AbortSignal.any (Chrome < 116). */
function combinedSignal(ms, signal) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(new DOMException('timeout', 'TimeoutError')), ms);
  if (signal) {
    if (signal.aborted) ctl.abort(signal.reason);
    else signal.addEventListener('abort', () => ctl.abort(signal.reason), { once: true });
  }
  return { signal: ctl.signal, clear: () => clearTimeout(timer) };
}

/**
 * Resolves a relative or absolute URL and guarantees it targets the Eloisa
 * origin. The Bearer token must never leave that origin.
 * @throws {Error} when the URL points elsewhere
 */
export function resolveUrl(relativeOrAbsolute) {
  const url = new URL(relativeOrAbsolute, CONFIG.base);
  if (url.origin !== ORIGIN) throw new Error(`Origen no permitido: ${url.origin}`);
  return url.href;
}

async function request(token, path, init = {}, { timeoutMs = net.timeoutMs, signal = null } = {}) {
  const url = resolveUrl(path); // antes de tocar la red: un origen ajeno nunca recibe el token
  if (signal?.aborted) throw new CancelledError();
  const abort = combinedSignal(timeoutMs, signal);
  let res;
  try {
    res = await fetch(url, {
      ...init,
      signal: abort.signal,
      headers: { Authorization: `Bearer ${token}`, ...(init.headers ?? {}) },
    });
  } catch (err) {
    if (signal?.aborted) throw new CancelledError();
    if (err?.name === 'TimeoutError' || err?.name === 'AbortError') throw new TimeoutError(timeoutMs);
    throw err;
  } finally {
    abort.clear();
  }
  if (res.status === 401 || res.status === 403) {
    session.expired = true;
    await invalidateToken(token); // ese token ya no sirve, ni desde storage.session ni desde la pestaña
    throw new AuthError(res.status);
  }
  if (!res.ok) throw new Error(`HTTP ${res.status} ${path}`);
  return res;
}

/** GET → parsed JSON. Throws on network/HTTP error (AuthError on 401/403). */
export async function apiGet(token, path, opts) {
  return (await request(token, path, {}, opts)).json();
}

/** POST JSON body → parsed JSON. Throws on network/HTTP error (AuthError on 401/403). */
export async function apiPost(token, path, body, opts) {
  const res = await request(token, path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify(body),
  }, opts);
  return res.json();
}

/** GET → Blob (PDF, etc.). Throws on network/HTTP error (AuthError on 401/403). */
export async function apiBlob(token, path, opts) {
  return (await request(token, path, {}, opts)).blob();
}

/** Builds Rayen's `key=value;key=value` path-segment parameter list. */
export function rayenParams(pairs) {
  return pairs.map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`).join(';');
}

/** Splits an array into chunks of `size`. */
export function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}
