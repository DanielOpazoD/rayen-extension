/**
 * Cifrado en reposo de todo lo que la extensión guarda en chrome.storage.local
 * (ADR 0001, opción B): AES-GCM 256 con clave derivada por PBKDF2 de un PIN de
 * seis dígitos. La clave vive sólo en memoria de esta pestaña; el PIN, en la
 * cabeza de la persona. Olvidarlo equivale a perder la caché y las notas.
 *
 * Sin PIN creado (meta ausente) el almacenamiento queda en claro: es el modo
 * de las pruebas y del arnés; la aplicación real exige crear el PIN al arrancar.
 */
export const META_KEY = 'rayen_crypto_v1';
let ITERACIONES = 300_000;
/** Sólo para pruebas: derivar 300 000 veces varias veces por prueba tarda segundos y ahoga al resto. */
export function setIteracionesParaPruebas(n) { ITERACIONES = n; }
const COMPROBACION = 'rayen-ok';
const enc = new TextEncoder(), dec = new TextDecoder();

export class LockedError extends Error { constructor() { super('Los datos están cifrados y la sesión no tiene la clave'); this.name = 'LockedError'; } }
export class PinError extends Error { constructor() { super('PIN incorrecto'); this.name = 'PinError'; } }

let key = null;
export const hasKey = () => key !== null;
export function clearKey() { key = null; }

const subtle = () => globalThis.crypto.subtle;
const toB64 = u8 => { let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode(...u8.subarray(i, i + 0x8000)); return btoa(s); };
const fromB64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
const raw = {
  get: k => new Promise((res, rej) => chrome.storage.local.get(k, d => chrome.runtime?.lastError ? rej(new Error(chrome.runtime.lastError.message)) : res(k === null ? d : d[k]))),
  set: (k, v) => new Promise((res, rej) => chrome.storage.local.set({ [k]: v }, () => chrome.runtime?.lastError ? rej(new Error(chrome.runtime.lastError.message)) : res())),
};

async function derive(pin, saltB64, iteraciones = ITERACIONES) {
  const base = await subtle().importKey('raw', enc.encode(String(pin)), 'PBKDF2', false, ['deriveKey']);
  return subtle().deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt: fromB64(saltB64), iterations: iteraciones }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}
async function encryptWith(k, value) {
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await subtle().encrypt({ name: 'AES-GCM', iv }, k, enc.encode(JSON.stringify(value))));
  return { __enc: 1, iv: toB64(iv), ct: toB64(ct) };
}
async function decryptWith(k, blob) {
  const pt = await subtle().decrypt({ name: 'AES-GCM', iv: fromB64(blob.iv) }, k, fromB64(blob.ct));
  return JSON.parse(dec.decode(pt));
}

export const isEncrypted = v => Boolean(v && typeof v === 'object' && v.__enc === 1 && typeof v.ct === 'string');
export const pinValido = pin => /^\d{6}$/.test(String(pin ?? ''));

/** Meta del cifrado en disco: sal y una comprobación cifrada. null = nunca se creó un PIN. */
export const readMeta = () => raw.get(META_KEY).then(m => (m && m.salt && m.check ? m : null));

export async function createPin(pin) {
  if (!pinValido(pin)) throw new Error('El PIN son seis dígitos');
  const salt = toB64(globalThis.crypto.getRandomValues(new Uint8Array(16)));
  const k = await derive(pin, salt);
  await raw.set(META_KEY, { salt, iteraciones: ITERACIONES, check: await encryptWith(k, COMPROBACION), creado: Date.now() });
  key = k;
}

export async function unlockWith(pin) {
  const meta = await readMeta();
  if (!meta) throw new Error('No hay PIN creado');
  const k = await derive(pin, meta.salt, meta.iteraciones ?? ITERACIONES); // las de la meta: un PIN creado con otro coste sigue abriendo
  try { if (await decryptWith(k, meta.check) !== COMPROBACION) throw new PinError(); }
  catch { throw new PinError(); }
  key = k;
}

export async function encryptValue(value) { if (!key) throw new LockedError(); return encryptWith(key, value); }
export async function decryptValue(blob) { if (!key) throw new LockedError(); return decryptWith(key, blob); }

/** Todo lo que estaba en claro pasa a cifrado (primer arranque con PIN). Devuelve cuántas claves migró. */
export async function migratePlain() {
  if (!key) throw new LockedError();
  const all = await raw.get(null);
  let n = 0;
  for (const [k, v] of Object.entries(all)) {
    if (k === META_KEY || isEncrypted(v)) continue;
    await raw.set(k, await encryptWith(key, v)); n++;
  }
  return n;
}

/** Cambia el PIN: comprueba el actual, deriva el nuevo y vuelve a cifrar todo. */
export async function changePin(actual, nuevo) {
  await unlockWith(actual);
  if (!pinValido(nuevo)) throw new Error('El PIN son seis dígitos');
  const salt = toB64(globalThis.crypto.getRandomValues(new Uint8Array(16)));
  const k2 = await derive(nuevo, salt);
  const all = await raw.get(null);
  for (const [k, v] of Object.entries(all)) {
    if (k === META_KEY) continue;
    const plain = isEncrypted(v) ? await decryptWith(key, v) : v;
    await raw.set(k, await encryptWith(k2, plain));
  }
  await raw.set(META_KEY, { salt, iteraciones: ITERACIONES, check: await encryptWith(k2, COMPROBACION), creado: Date.now() });
  key = k2;
}
