/**
 * Respaldo cifrado del centro de contraseñas: un fichero para llevarse los
 * accesos a otro equipo sin que ninguna clave aparezca nunca en pantalla.
 *
 * Va cifrado con su PROPIA frase de paso, no con el PIN: el fichero sale de la
 * máquina y el PIN son seis dígitos, que se rompen a fuerza bruta en nada. La
 * frase es libre y se pide larga; sobre ella se derivan 600 000 iteraciones de
 * PBKDF2, el doble que el almacén local, porque este fichero puede acabar en un
 * pendrive o en un correo y hay que suponer que alguien lo tendrá con tiempo.
 *
 * Que el respaldo se pierda no cuesta nada: las credenciales siguen guardadas y
 * funcionando en el equipo. Sólo deja de poder llevárselas.
 */

const FORMATO = 'rayen-cred-respaldo';
const VERSION = 1;
const ITERACIONES = 600_000;
const MIN_ITER = 100_000, MAX_ITER = 2_000_000;
const enc = new TextEncoder(), dec = new TextDecoder();
const subtle = () => globalThis.crypto.subtle;

const toB64 = u8 => { let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode(...u8.subarray(i, i + 0x8000)); return btoa(s); };
const fromB64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));

export class RespaldoError extends Error {
  constructor(mensaje) { super(mensaje); this.name = 'RespaldoError'; }
}

/** La frase se pide larga porque es lo único que protege un fichero que viaja. */
export const fraseValida = f => String(f ?? '').length >= 12;

async function derivar(frase, salt, iteraciones) {
  const base = await subtle().importKey('raw', enc.encode(String(frase)), 'PBKDF2', false, ['deriveKey']);
  return subtle().deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations: iteraciones },
    base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'],
  );
}

/**
 * Cifra las credenciales en un objeto listo para escribir a fichero.
 * @param {object} credenciales  el volcado crudo del almacén
 * @param {string} frase
 */
export async function crearRespaldo(credenciales, frase) {
  if (!fraseValida(frase)) throw new RespaldoError('La frase del respaldo necesita al menos 12 caracteres.');
  const salt = globalThis.crypto.getRandomValues(new Uint8Array(16));
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
  const k = await derivar(frase, salt, ITERACIONES);
  const ct = new Uint8Array(await subtle().encrypt({ name: 'AES-GCM', iv }, k, enc.encode(JSON.stringify(credenciales))));
  return {
    formato: FORMATO, version: VERSION, iteraciones: ITERACIONES,
    creado: new Date().toISOString(),
    salt: toB64(salt), iv: toB64(iv), ct: toB64(ct),
  };
}

/**
 * Descifra un respaldo. Distingue «esto no es un respaldo» de «la frase no es
 * la correcta»: son dos errores que la persona arregla de formas distintas.
 * @returns {Promise<object>} las credenciales crudas
 */
export async function abrirRespaldo(fichero, frase) {
  const r = fichero;
  if (!r || typeof r !== 'object' || r.formato !== FORMATO) {
    throw new RespaldoError('Ese fichero no es un respaldo de contraseñas de Rayen.');
  }
  // `typeof` a propósito: con `r.version > VERSION` a secas, una versión que no
  // fuera número («muchas») pasaba el control y se interpretaba igual.
  if (typeof r.version !== 'number' || !Number.isInteger(r.version) || r.version < 1) {
    throw new RespaldoError('El respaldo está incompleto o dañado.');
  }
  if (r.version > VERSION) throw new RespaldoError('El respaldo viene de una versión más nueva de la extensión.');
  if (typeof r.salt !== 'string' || typeof r.iv !== 'string' || typeof r.ct !== 'string') {
    throw new RespaldoError('El respaldo está incompleto o dañado.');
  }
  // Las iteraciones las dice el fichero, así que hay que acotarlas: un respaldo
  // manipulado con mil millones congelaba la pestaña, y con cero reventaba con
  // un error de WebCrypto en crudo.
  const iteraciones = r.iteraciones ?? ITERACIONES;
  if (!Number.isInteger(iteraciones) || iteraciones < MIN_ITER || iteraciones > MAX_ITER) {
    throw new RespaldoError('El respaldo declara un cifrado fuera de lo aceptable.');
  }
  let salt, iv, ct;
  try { salt = fromB64(r.salt); iv = fromB64(r.iv); ct = fromB64(r.ct); }
  catch { throw new RespaldoError('El respaldo está incompleto o dañado.'); }

  const k = await derivar(frase, salt, iteraciones);
  let plano;
  try {
    plano = await subtle().decrypt({ name: 'AES-GCM', iv }, k, ct);
  } catch {
    throw new RespaldoError('La frase no abre este respaldo.');
  }
  let datos;
  try { datos = JSON.parse(dec.decode(plano)); }
  catch { throw new RespaldoError('El respaldo no contiene credenciales.'); }
  if (!datos || typeof datos !== 'object' || Array.isArray(datos)) {
    throw new RespaldoError('El respaldo no contiene credenciales.');
  }
  return datos;
}
