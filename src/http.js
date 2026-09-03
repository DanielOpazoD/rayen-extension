import { CONFIG } from './config.js';

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
  const res = await fetch(resolveUrl(path), {
    ...init,
    headers: { Authorization: `Bearer ${token}`, ...(init.headers ?? {}) },
  });
  if (res.status === 401 || res.status === 403) {
    session.expired = true;
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
