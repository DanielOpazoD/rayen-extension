/**
 * Quién soy y en qué nodo trabajo.
 *
 * De estos dos números depende casi todo lo que la aplicación llama «mío»: qué
 * atención se cruza con qué cita, qué agenda se pide, qué cuenta el calendario
 * y qué interconsultas son mías. Estuvieron escritos a mano en `config.js`, así
 * que si el identificador del profesional cambiara —otro perfil, otro
 * funcionario, un traslado de nodo— la aplicación mostraría el trabajo de otra
 * persona sin decir nada.
 *
 * Ahora `config.js` es sólo el punto de partida: al arrancar se busca la
 * identidad dentro de la sesión de Eloisa, que es quien la sabe. Si la sesión
 * no la declara, se conserva la de configuración y tanto el diagnóstico como la
 * barra de estado dicen de dónde salió; nunca se adopta un valor en silencio.
 */
import { CONFIG } from './config.js';

/**
 * Identidad en uso. Empieza en la configuración y `aplicarIdentidad` la reemplaza.
 * @type {{ officerId: number, nodeId: number, rut: string, nombre: string, origen: 'config'|'sesion'|'mixto' }}
 */
export const identidad = {
  officerId: CONFIG.officerId,
  nodeId: CONFIG.nodeId,
  rut: '',
  nombre: '',
  origen: 'config',
};

/** Un identificador de Rayen: entero positivo, venga como número o como texto. */
const esId = v => (typeof v === 'number' ? Number.isInteger(v) && v > 0 : /^\d{1,9}$/.test(String(v ?? '')) && Number(v) > 0);

// Anclados a propósito: «IdNodoOrigen» o «IdFuncionarioRegistrador» hablan de
// otra persona o de otro sitio, y adoptarlos sería peor que no buscar nada.
const CLAVE = Object.freeze({
  officerId: /^id(funcionario(prestador)?|prestador|profesional)$|^(funcionario|prestador|profesional)id$/i,
  nodeId:    /^idnodo$|^nodoid$/i,
  rut:       /^(rut|run)$/i,
  nombre:    /^nombre(completo|formateado)?$/i,
});

/**
 * Busca la identidad dentro del objeto de sesión sin conocer su forma exacta:
 * recorre por niveles, de fuera hacia dentro, y se queda con la primera clave
 * que encaja. Por niveles y no en profundidad porque una clave del primer nivel
 * describe la sesión; una enterrada, probablemente a otra cosa.
 *
 * @param {any} sesion
 * @param {{ profundidad?: number }} [opts]
 * @returns {{ officerId?: number, nodeId?: number, rut?: string, nombre?: string, rutas: Record<string,string> }}
 */
export function identidadDeSesion(sesion, { profundidad = 5 } = {}) {
  const hallado = /** @type {Record<string, any>} */ ({});
  const rutas = /** @type {Record<string, string>} */ ({});
  const cola = [{ nodo: sesion, ruta: '', nivel: 0 }];
  while (cola.length) {
    const { nodo, ruta, nivel } = cola.shift();
    if (!nodo || typeof nodo !== 'object' || nivel > profundidad) continue;
    for (const [k, v] of Object.entries(nodo)) {
      const camino = ruta ? `${ruta}.${k}` : k;
      if (v && typeof v === 'object') { cola.push({ nodo: v, ruta: camino, nivel: nivel + 1 }); continue; }
      for (const [campo, re] of Object.entries(CLAVE)) {
        if (hallado[campo] !== undefined || !re.test(k)) continue;
        if (campo === 'officerId' || campo === 'nodeId') {
          if (!esId(v)) continue;
          hallado[campo] = Number(v);
        } else {
          const s = String(v ?? '').trim();
          if (!s) continue;
          hallado[campo] = s;
        }
        rutas[campo] = camino;
      }
    }
  }
  return { ...hallado, rutas };
}

/**
 * Adopta lo que declare la sesión y deja lo demás como estaba.
 * @param {any} sesion
 * @returns {{ officerId: number, nodeId: number, rut: string, nombre: string,
 *   origen: string, rutas: Record<string,string>, cambio: boolean, antes: {officerId:number, nodeId:number} }}
 */
export function aplicarIdentidad(sesion) {
  const h = identidadDeSesion(sesion);
  const antes = { officerId: identidad.officerId, nodeId: identidad.nodeId };
  if (h.officerId) identidad.officerId = h.officerId;
  if (h.nodeId) identidad.nodeId = h.nodeId;
  identidad.rut = h.rut ?? '';
  identidad.nombre = h.nombre ?? '';
  identidad.origen = h.officerId && h.nodeId ? 'sesion' : (h.officerId || h.nodeId) ? 'mixto' : 'config';
  return {
    ...identidad, rutas: h.rutas, antes,
    cambio: identidad.officerId !== antes.officerId || identidad.nodeId !== antes.nodeId,
  };
}

/** Vuelve a la identidad de configuración (pruebas, y «Eliminar todo»). */
export function restablecerIdentidad() {
  identidad.officerId = CONFIG.officerId;
  identidad.nodeId = CONFIG.nodeId;
  identidad.rut = '';
  identidad.nombre = '';
  identidad.origen = 'config';
}
