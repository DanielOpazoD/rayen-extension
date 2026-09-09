/**
 * Los sistemas cuyo acceso guarda el centro de contraseñas, y qué puede hacer
 * la extensión con cada uno.
 *
 * `entrada` es la parte honesta de este catálogo: decir «guardada» no significa
 * que la extensión pueda entrar sola. Hoy sólo puede en los sistemas que
 * aceptan un POST de login y devuelven una cookie que Chrome vuelve a mandar
 * desde `chrome-extension://`. Donde no puede, la interfaz lo dice y abre el
 * sitio en vez de fingir un botón que no hace nada.
 *
 *   'silenciosa'    — la extensión inicia sesión por HTTP, sin pestañas.
 *   'por-construir' — el transporte existe y admitiría login silencioso, pero
 *                     ese POST todavía no está escrito.
 *   'pestana'       — imposible en silencio: hay que conducir una pestaña.
 *   'sin-transporte'— aún no hay integración; la credencial se guarda y espera.
 */

/**
 * @typedef {object} SistemaCred
 * @property {string} id
 * @property {string} nombre
 * @property {string} usuarioLabel  qué se escribe en «usuario» (varía por sistema)
 * @property {'silenciosa'|'por-construir'|'pestana'|'sin-transporte'} entrada
 * @property {string} [nota]  por qué no puede entrar sola, cuando no puede
 * @property {string} [url]   dónde inicia sesión el usuario, si le toca a él
 */

/** @type {readonly SistemaCred[]} */
export const SISTEMAS = Object.freeze([
  {
    id: 'rce',
    nombre: 'RCE · HIS Hanga Roa',
    usuarioLabel: 'RUT sin dígito verificador',
    entrada: 'silenciosa',
    url: 'https://his.hospitalhangaroa.cl/hishhr/',
  },
  {
    id: 'lab-hhr',
    nombre: 'Laboratorio HHR · SysLab',
    usuarioLabel: 'Usuario de SysLab',
    entrada: 'pestana',
    // Medido, no supuesto: SysLab va por HTTP plano y sus cookies (PHP 7.1) no
    // llevan SameSite=None, que además exige Secure. Chrome no las manda en un
    // fetch desde la extensión, así que un login silencioso dejaría una sesión
    // que no sirve para la siguiente petición.
    nota: 'SysLab va por HTTP y sus cookies no viajan a la extensión: la sesión se inicia en su pestaña.',
    url: 'http://10.4.69.90/syslab/',
  },
  {
    id: 'lab-hsr',
    nombre: 'Laboratorio Hospital Salvador',
    usuarioLabel: 'Usuario del portal',
    entrada: 'por-construir',
    nota: 'El portal sí admitiría login silencioso; falta escribir ese paso contra su formulario real.',
    url: 'https://examenesusuarios.hsalvador.cl/',
  },
  {
    id: 'mmrad',
    nombre: 'MMRAD · Imágenes',
    usuarioLabel: 'Usuario',
    entrada: 'sin-transporte',
    nota: 'Integración pendiente: la credencial queda guardada y esperando.',
  },
  {
    id: 'biopsias',
    nombre: 'Biopsias · Anatomía patológica',
    usuarioLabel: 'Usuario',
    entrada: 'sin-transporte',
    nota: 'Integración pendiente: la credencial queda guardada y esperando.',
  },
]);

export const sistemaPorId = id => SISTEMAS.find(s => s.id === id) ?? null;
export const ID_SISTEMAS = Object.freeze(SISTEMAS.map(s => s.id));

/**
 * Estado de una credencial para la interfaz. Nunca incluye la clave: este
 * módulo no la ve ni la devuelve, sólo describe en qué situación está.
 *
 * `caducada` existe para no repetir una credencial que el sistema ya rechazó:
 * varios portales del hospital bloquean la cuenta tras unos cuantos intentos,
 * así que un rechazo detiene los reintentos hasta que la persona la reescriba.
 *
 * @param {{usuario?: string, clave?: string, caducadaEn?: number, guardadaEn?: number}|null} guardada
 * @returns {{estado:'sin-guardar'|'guardada'|'caducada', usuario:string, guardadaEn:number|null, caducadaEn:number|null}}
 */
export function estadoCredencial(guardada) {
  // Usuario Y clave: con sólo el usuario se pintaba «guardada» y se ofrecía
  // «Iniciar sesión», que después decía que no había acceso guardado.
  if (!guardada?.usuario || !guardada?.clave) {
    return { estado: 'sin-guardar', usuario: '', guardadaEn: null, caducadaEn: null };
  }
  return {
    estado: guardada.caducadaEn ? 'caducada' : 'guardada',
    usuario: guardada.usuario,
    guardadaEn: guardada.guardadaEn ?? null,
    caducadaEn: guardada.caducadaEn ?? null,
  };
}

/** ¿Tiene sentido ofrecer «Iniciar sesión» para este sistema y este estado? */
export function puedeEntrarSola(sistema, estado) {
  return sistema?.entrada === 'silenciosa' && estado === 'guardada';
}
