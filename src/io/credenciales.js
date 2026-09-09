/**
 * Centro de contraseñas: un solo sitio para los accesos a los sistemas del
 * hospital, cifrados con el PIN como todo lo demás (ADR 0001).
 *
 * Dos reglas de forma, que son las que hacen que esto sea un centro y no otro
 * montón de preferencias:
 *
 *  1. **Sólo se escriben.** `listar()` devuelve estado y usuario, nunca la
 *     clave. La única función que la lee es `credencialPara()`, y existe para
 *     que un transporte inicie sesión, no para pintarla. Esto protege de quien
 *     mira la pantalla en un pasillo; no es un muro criptográfico frente a
 *     quien ya tiene el PIN, porque la extensión necesita descifrarla para
 *     mandarla al formulario.
 *  2. **Viven en su propia llave** (`rayen_cred_v1`), no mezcladas con las
 *     preferencias de interfaz. Así un volcado de preferencias no las arrastra
 *     y el saneo de registros tiene un blanco claro.
 *
 * Un rechazo del sistema marca la credencial caducada y detiene los reintentos
 * automáticos: repetir una clave ya rechazada es la vía rápida a que el
 * hospital bloquee la cuenta.
 */
import { storageGet, storageSet, loadPrefs, savePrefs } from './cache.js';
import { hasKey, readMeta, LockedError } from './crypto-store.js';
import { ID_SISTEMAS, estadoCredencial } from '../core/credenciales-catalogo.js';
import { crearRespaldo, abrirRespaldo } from './credenciales-respaldo.js';

const LLAVE = 'rayen_cred_v1';

/**
 * Lee el almacén. NO se traga los errores: `storageGet` fallando devolvía antes
 * `{}`, y como cada escritura es leer-modificar-escribir, un fallo de lectura
 * seguido de un guardado borraba las otras cuatro credenciales.
 * @returns {Promise<Record<string, {usuario:string, clave:string, guardadaEn:number, caducadaEn?:number, motivo?:string}>>}
 */
async function leerTodo() {
  const v = await storageGet(LLAVE);
  return v && typeof v === 'object' && !Array.isArray(v) ? v : {};
}

async function escribirTodo(datos) {
  // Valla explícita: `storageSet` cifra sólo si hay clave en memoria, y el
  // bloqueo por inactividad la borra. Sin esto, guardar con la sesión bloqueada
  // dejaba las contraseñas en claro encima de las que sí estaban cifradas.
  //
  // La condición es «hay PIN creado pero no está en memoria», no «no hay clave»:
  // sin PIN creado (arnés y pruebas) todo el almacenamiento va en claro por
  // diseño, y exigirla ahí dejaba el centro inservible en el arnés.
  if (!hasKey() && await readMeta()) throw new LockedError();
  return storageSet(LLAVE, datos);
}

/**
 * Las escrituras van en fila. Son leer-modificar-escribir sobre una sola llave:
 * dos a la vez perdían una, y —peor— un rechazo en vuelo podía marcar caducada
 * la contraseña buena que la persona acababa de escribir.
 * @type {Promise<any>}
 */
let cola = Promise.resolve();
function enFila(fn) {
  const siguiente = cola.then(fn, fn);
  cola = siguiente.catch(() => {});
  return siguiente;
}

/**
 * Las credenciales del RCE vivían en las preferencias (`hisUser`/`hisPass`).
 * Se mudan solas la primera vez, para que nadie tenga que volver a escribirlas,
 * y se borran de su sitio antiguo para que no queden dos copias.
 */
export async function migrarDesdePrefs() {
  const p = /** @type {any} */ (await loadPrefs().catch(() => ({})));
  if (!p?.hisUser || !p?.hisPass) return false;
  const datos = await leerTodo();
  if (!datos.rce) {
    datos.rce = { usuario: p.hisUser, clave: p.hisPass, guardadaEn: Date.now() };
    await escribirTodo(datos);
  }
  await savePrefs({ hisUser: '', hisPass: '' });
  return true;
}

/**
 * Qué hay guardado, sin claves. Lo que pinta la interfaz.
 * @returns {Promise<Record<string, ReturnType<typeof estadoCredencial>>>}
 */
export async function listar() {
  const datos = await leerTodo();
  return Object.fromEntries(ID_SISTEMAS.map(id => [id, estadoCredencial(datos[id] ?? null)]));
}

/**
 * Guarda (o reemplaza) el acceso a un sistema. Guardar de nuevo levanta la
 * marca de caducada: es exactamente lo que la persona acaba de arreglar.
 */
export async function guardar(id, usuario, clave) {
  if (!ID_SISTEMAS.includes(id)) throw new Error(`Sistema desconocido: ${id}`);
  if (!usuario || !clave) throw new Error('Faltan usuario o contraseña');
  return enFila(async () => {
    const datos = await leerTodo();
    datos[id] = { usuario: String(usuario), clave: String(clave), guardadaEn: Date.now() };
    await escribirTodo(datos);
  });
}

export async function olvidar(id) {
  return enFila(async () => {
    const datos = await leerTodo();
    delete datos[id];
    await escribirTodo(datos);
  });
}

/** Borra las cinco de una vez (cambio de equipo, o de persona). */
export async function olvidarTodo() {
  return enFila(() => escribirTodo({}));
}

/**
 * La credencial para iniciar sesión. La usan los transportes, no la interfaz.
 * Una credencial caducada NO se entrega: mientras siga marcada, nada la vuelve
 * a probar contra el sistema, que es lo que evita el bloqueo de cuenta.
 * @returns {Promise<{usuario:string, clave:string}|null>}
 */
export async function credencialPara(id) {
  const d = (await leerTodo())[id];
  if (!d?.usuario || !d?.clave || d.caducadaEn) return null;
  return { usuario: d.usuario, clave: d.clave };
}

/**
 * El sistema rechazó la credencial. Se marca y se deja de reintentar hasta que
 * la persona la vuelva a guardar.
 */
export async function marcarCaducada(id, motivo = '', intentoDesde = Date.now()) {
  return enFila(async () => {
    const datos = await leerTodo();
    const d = datos[id];
    if (!d) return;
    // Si la persona reescribió la contraseña DESPUÉS de que empezara el intento
    // que ahora falla, este rechazo es de la clave vieja: marcarla dejaría
    // inservible la nueva y la interfaz diría «rechazada» de algo recién puesto.
    if ((d.guardadaEn ?? 0) > intentoDesde) return;
    datos[id] = { ...d, caducadaEn: Date.now(), motivo: String(motivo).slice(0, 200) };
    await escribirTodo(datos);
  });
}

/** ¿Hay algo guardado? Para no ofrecer un respaldo vacío. */
export async function hayAlguna() {
  return Object.keys(await leerTodo()).length > 0;
}

/**
 * Comprueba una entrada venida de un respaldo. Un fichero manipulado podía
 * meter objetos donde van cadenas; después `hisLogin` mandaba «[object Object]»
 * al HIS —otro intento fallido contra la cuenta— y el panel se quedaba colgado
 * con un error que ni siquiera era el suyo.
 */
function entradaValida(id, d) {
  return ID_SISTEMAS.includes(id) && d && typeof d === 'object' && !Array.isArray(d)
    && typeof d.usuario === 'string' && d.usuario.length > 0 && d.usuario.length <= 200
    && typeof d.clave === 'string' && d.clave.length > 0 && d.clave.length <= 500;
}

/**
 * Exporta el respaldo cifrado. Vive aquí, y no en la interfaz, para que el
 * objeto con las cinco contraseñas en claro no llegue nunca a la capa `ui/`.
 * @param {string} frase
 */
export async function exportarRespaldo(frase) {
  return crearRespaldo(await leerTodo(), frase);
}

/**
 * Importa un respaldo y lo FUSIONA con lo que ya hay. Reemplazar el almacén
 * entero destruía en silencio las credenciales que no vinieran en el fichero, y
 * decía «Respaldo cargado» como si todo hubiera ido bien.
 * @returns {Promise<{añadidas: number, reemplazadas: number, descartadas: number}>}
 */
export async function importarRespaldo(fichero, frase) {
  const entrantes = await abrirRespaldo(fichero, frase);
  return enFila(async () => {
    const datos = await leerTodo();
    let añadidas = 0, reemplazadas = 0, descartadas = 0;
    for (const [id, d] of Object.entries(entrantes)) {
      if (!entradaValida(id, d)) { descartadas++; continue; }
      if (datos[id]) reemplazadas++; else añadidas++;
      datos[id] = {
        usuario: d.usuario, clave: d.clave,
        guardadaEn: Number.isFinite(d.guardadaEn) ? d.guardadaEn : Date.now(),
        ...(Number.isFinite(d.caducadaEn) ? { caducadaEn: d.caducadaEn } : {}),
      };
    }
    await escribirTodo(datos);
    return { añadidas, reemplazadas, descartadas };
  });
}
