import { CONFIG } from '../core/config.js';
import { invalidateToken } from './auth.js';

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
export function resetSession() { session.expired = false; }

/** Lanzado cuando la persona canceló la carga: no es un fallo de red y no se reintenta. */
export class CancelledError extends Error {
  constructor() { super('Carga cancelada'); this.name = 'CancelledError'; }
}
/** Lanzado cuando Eloisa no respondió dentro de `net.timeoutMs`. */
export class TimeoutError extends Error {
  constructor(ms) { super(`Eloisa no respondió en ${Math.round(ms / 1000)} s`); this.name = 'TimeoutError'; }
}

/** Límite por petición; mutable para que las pruebas lo bajen sin tocar CONFIG. */
export const net = { timeoutMs: CONFIG.httpTimeoutMs };

/**
 * Cancelación real: `cancelRun()` aborta las peticiones en vuelo (antes sólo
 * se miraba entre lotes y una red muda dejaba la carga colgada) y los
 * cargadores además comprueban `run.cancelled` antes de encolar más.
 */
export const run = { cancelled: false, controller: new AbortController() };
export function cancelRun() { run.cancelled = true; run.controller.abort(); }
export function resetRun() { run.cancelled = false; run.controller = new AbortController(); }

function requestSignal() {
  const timeout = AbortSignal.timeout(net.timeoutMs);
  return typeof AbortSignal.any === 'function' ? AbortSignal.any([run.controller.signal, timeout]) : timeout;
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

async function request(token, path, init = {}) {
  const url = resolveUrl(path); // antes de tocar la red: un origen ajeno nunca recibe el token
  if (run.cancelled) throw new CancelledError();
  let res;
  try {
    res = await fetch(url, {
      ...init,
      signal: requestSignal(),
      headers: { Authorization: `Bearer ${token}`, ...(init.headers ?? {}) },
    });
  } catch (err) {
    if (run.cancelled) throw new CancelledError();
    if (err?.name === 'TimeoutError' || err?.name === 'AbortError') throw new TimeoutError(net.timeoutMs);
    throw err;
  }
  if (res.status === 401 || res.status === 403) {
    session.expired = true;
    await invalidateToken(); // la copia en storage.session ya no sirve
    throw new AuthError(res.status);
  }
  if (!res.ok) throw new Error(`HTTP ${res.status} ${path}`);
  return res;
}

/** GET → parsed JSON. Throws on network/HTTP error (AuthError on 401/403). */
export async function apiGet(token, path) {
  return (await request(token, path)).json();
}

/** POST JSON body → parsed JSON. Throws on network/HTTP error (AuthError on 401/403). */
export async function apiPost(token, path, body) {
  const res = await request(token, path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify(body),
  });
  return res.json();
}

/** GET → Blob (PDF, etc.). Throws on network/HTTP error (AuthError on 401/403). */
export async function apiBlob(token, path) {
  return (await request(token, path)).blob();
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
