/**
 * Parseo del HIS del Hospital de Hanga Roa (https://his.hospitalhangaroa.cl/hishhr).
 *
 * Es un tercer origen de ficha, distinto de Eloisa (Rayen) y de los laboratorios:
 * un sistema PHP clásico. Se lee con regex, sin DOM —igual que los pasos de
 * SysLab—, para que sea autocontenido y se pueda probar en node contra el HTML
 * real. Portado del proyecto RCE VISOR (his_reports/parsers), que ya tenía
 * resuelto y probado este acceso.
 *
 * Hoy cubre el historial por RUT (`consficha000.php`): la lista de atenciones
 * del paciente en el HIS, cada una abrible como ficha imprimible
 * (PURG0005 urgencia / PAMB0005 ambulatorio).
 */

const TAG = /<[^>]+>|&nbsp;/g;
const WS = /\s+/g;
const TABLE = /<table[^>]*>([\s\S]*?)<\/table>/gi;
const ROW = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
const CELL = /<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/gi;
const LINK = /(PURG0005|PAMB0005)\.php\?id=(\d+)/i;
const FECHA_DMY = /(\d{2})-(\d{2})-(\d{4})/;

const ENTIDADES = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&#039;': "'", '&nbsp;': ' ' };
const desentidad = s => s.replace(/&(amp|lt|gt|quot|#0?39|nbsp);/g, m => ENTIDADES[m] ?? m);

/** Quita tags, entidades y colapsa espacios: el texto plano de una celda. */
export function limpiarCelda(raw) {
  return desentidad(String(raw ?? '').replace(TAG, ' ')).replace(WS, ' ').trim();
}

/** Todas las capturas del grupo 1 de una expresión global, sin compartir el lastIndex. */
function todas(re, s) {
  const out = [];
  const r = new RegExp(re.source, re.flags);
  for (let m = r.exec(s); m; m = r.exec(s)) out.push(m[1]);
  return out;
}

const tablas = s => todas(TABLE, s);
const filas = s => todas(ROW, s);
const celdas = fila => todas(CELL, fila);

/**
 * @typedef {object} AtencionHis
 * @property {string} idCuenta     id de la atención en el HIS (para abrir la ficha)
 * @property {'urgencia'|'ambulatorio'} tipoFicha
 * @property {string} rut          el RUT consultado, tal cual lo escribió el usuario
 * @property {string} fecha        ISO «YYYY-MM-DD»
 * @property {string} tipoAtencion
 * @property {string} servicio
 */

/**
 * Parsea la tabla de historial de `consficha000.php`. Columnas observadas:
 * Fecha de Atención · Tipo · Servicio · Ver Documento (link a PURG0005/PAMB0005).
 * Se toma sólo la primera tabla cuyo encabezado dice «fecha de atenci», y se
 * descartan las filas sin link (no son atenciones abribles).
 *
 * @param {string|Uint8Array} html
 * @param {string} [rut]  se propaga a cada fila
 * @returns {AtencionHis[]}
 */
export function parseConsficha(html, rut = '') {
  const s = typeof html === 'string' ? html : new TextDecoder('utf-8').decode(html);
  /** @type {AtencionHis[]} */
  const out = [];
  for (const tabla of tablas(s)) {
    if (!/fecha de atenci/i.test(tabla)) continue;
    for (const fila of filas(tabla).slice(1)) { // la primera fila es el encabezado
      const cs = celdas(fila);
      if (cs.length < 3) continue;
      const link = LINK.exec(fila);
      if (!link) continue; // sin ficha abrible: no es una atención que mostremos
      const fechaRaw = limpiarCelda(cs[0]);
      const m = FECHA_DMY.exec(fechaRaw);
      out.push({
        idCuenta: link[2],
        tipoFicha: link[1].toUpperCase() === 'PAMB0005' ? 'ambulatorio' : 'urgencia',
        rut,
        fecha: m ? `${m[3]}-${m[2]}-${m[1]}` : fechaRaw,
        tipoAtencion: limpiarCelda(cs[1]),
        servicio: limpiarCelda(cs[2]),
      });
    }
    break; // sólo la primera tabla que encaja
  }
  return out;
}

// Marcadores de «el HIS pide reiniciar sesión», en minúsculas contra los
// primeros 8 KB. Subconjunto de los del RCE VISOR: el form de login clásico y
// las dos degradaciones (alert de acceso, redirect JS al root).
const LOGIN_MARKERS = [
  'action="acceso1', "action='acceso1", '/acceso1.php',
  'name="password"', 'name="login"', 'acceso al sistema', 'iniciar sesi',
  'error de acceso. vuelva a iniciar',
  "top.window.location.href = 'https://his.hospitalhangaroa.cl/hishhr/'",
];

/** ¿Este cuerpo es el HIS pidiendo iniciar sesión (form de login o página degradada)? */
export function esLogin(html) {
  const t = String(html ?? '').slice(0, 8000).toLowerCase();
  return LOGIN_MARKERS.some(m => t.includes(m));
}

/** Nombre del origen, para el icono que distingue estas atenciones de las de Eloisa. */
export const HIS_LABEL = 'HIS Hanga Roa';

/** Las atenciones del HIS de la más reciente a la más antigua (fecha ISO comparable como texto). */
export function ordenarAtenciones(rows) {
  return [...(rows ?? [])].sort((a, b) => String(b.fecha ?? '').localeCompare(String(a.fecha ?? '')));
}
