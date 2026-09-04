/**
 * Copia anonimizada de una respuesta de la API, para estudiar su forma sin
 * datos del paciente. Conserva la estructura, las claves, los catálogos
 * (diagnósticos, especialidades, tipos) y los intervalos entre fechas.
 *
 * Reglas:
 *  - Personas: los campos de nombre y apellido pasan a «<nombre>»/«<apellido>»,
 *    y cada palabra de esos nombres se borra también del texto libre.
 *  - RUT, correos, teléfonos y direcciones, por clave y por patrón en texto.
 *  - Identificadores: cada valor distinto se sustituye por un número
 *    correlativo, el mismo en todo el documento (las relaciones se conservan).
 *  - Fechas: todas se desplazan el mismo número de días (no se informa cuál),
 *    salvo el centinela «00010101» de Rayen.
 *  - Al final se comprueba que ningún nombre, RUT ni correo sobrevivió; si
 *    algo queda, `verificado` es false y la interfaz no descarga.
 */

const STRONG_NAME_KEY = /^(nombres?|nombrecompleto|nombreformateado|nombresocial|nombrealqueresponde|apellidos?|apellidopaterno|apellidomaterno|nombre(usuario|funcionario|paciente|profesional|solicitante|registrador|medico|prestador|madre|padre|tutor|acompanante|representante|responsable|contacto|cuidador)|usuario(creacion|modificacion|ingreso|registro)|funcionario|prestador|solicitante|registrador|medico|profesional|responsable|acompanante|tutor|representante|madre|padre|paciente|cuidador)$/i;
const PERSON_SIBLING = /apellido|^rut$|^run$|fechadenacimiento|fechanacimiento|^sexo$|instrumento|profesion|esprestador|idfuncionario|idusuario|nombrecompleto/i;
const RUT_KEY = /rut|^run$|^dv$|documentoidentidad|numerodocumento|pasaporte/i;
const ADDRESS_KEY = /direccion|domicilio|^calle|villa|poblacion|numerocasa|^depto|georef|latitud|longitud/i;
const CONTACT_KEY = /telefono|fono|celular|movil|email|correo|mail$/i;
const SECRET_KEY = /token|authorization|password|clave$/i;
const ID_KEY = /^(id|guid)|(id|guid)$|^codigo(de)?familia|numero(de)?ficha|^ficha$|^numeroreceta$|^numeroorden$|^folio/i;
const STOP = new Set(['de', 'del', 'la', 'las', 'los', 'el', 'y', 'e', 'van', 'von', 'da', 'do', 'dos', 'san', 'sra', 'sr', 'dr', 'dra']);

// Con puntos o guion: ocho dígitos seguidos son también una fecha «20260904» o un identificador.
const RUT_RE = /\b\d{1,2}\.\d{3}\.\d{3}-?[\dkK]\b|\b\d{7,8}-[\dkK]\b/g;
const EMAIL_RE = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g; // sin tragarse el punto final de la frase
const PHONE_RE = /\+56\s?\d[\d\s]{7,}\d|\b9\s?\d{4}\s?\d{4}\b/g;
const RAYEN_DATE = /^(\d{4})(\d{2})(\d{2})( \d{4,6})?$/;
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})(T[\d:.]+(Z|[+-]\d{2}:\d{2})?)?$/;
const DMY_DATE = /^(\d{2})-(\d{2})-(\d{4})( .*)?$/;

const ACCENT = { a: '[aáàä]', e: '[eéè]', i: '[iíï]', o: '[oóö]', u: '[uúü]', n: '[nñ]', c: '[cç]' };
// El token se compara sin acentos ni mayúsculas: «María» borra «MARIA» y «maría».
const tokenRegex = token => {
  const base = token.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
  const body = [...base].map(ch => ACCENT[ch] ?? (/[\p{L}\d]/u.test(ch) ? ch : `\\${ch}`)).join('');
  return new RegExp(`(?<![\\p{L}\\d])${body}(?![\\p{L}\\d])`, 'giu');
};
const isPersonObject = obj => Object.keys(obj).some(k => PERSON_SIBLING.test(k));

function shiftDate(str, days) {
  const p = n => String(n).padStart(2, '0');
  let m;
  if ((m = RAYEN_DATE.exec(str))) {
    const [, y, mo, d, rest = ''] = m;
    if (+y < 1900) return str;
    const t = new Date(Date.UTC(+y, +mo - 1, +d) - days * 864e5);
    return `${t.getUTCFullYear()}${p(t.getUTCMonth() + 1)}${p(t.getUTCDate())}${rest}`;
  }
  if ((m = ISO_DATE.exec(str))) {
    const [, y, mo, d, rest = ''] = m;
    if (+y < 1900) return str;
    const t = new Date(Date.UTC(+y, +mo - 1, +d) - days * 864e5);
    return `${t.getUTCFullYear()}-${p(t.getUTCMonth() + 1)}-${p(t.getUTCDate())}${rest}`;
  }
  if ((m = DMY_DATE.exec(str))) {
    const [, d, mo, y, rest = ''] = m;
    if (+y < 1900) return str;
    const t = new Date(Date.UTC(+y, +mo - 1, +d) - days * 864e5);
    return `${p(t.getUTCDate())}-${p(t.getUTCMonth() + 1)}-${t.getUTCFullYear()}${rest}`;
  }
  return null;
}

/** Recoge las palabras de los nombres de personas, para borrarlas también del texto libre. */
function collectNameTokens(node, tokens, key = '', parent = null) {
  if (Array.isArray(node)) { node.forEach(n => collectNameTokens(n, tokens, key, parent)); return; }
  if (node && typeof node === 'object') { for (const [k, v] of Object.entries(node)) collectNameTokens(v, tokens, k, node); return; }
  if (typeof node !== 'string' || !node.trim()) return;
  const strong = STRONG_NAME_KEY.test(key);
  const weak = /^nombres?$/i.test(key) && parent && isPersonObject(parent);
  if (!strong && !weak) return;
  // «Nombre» de un catálogo ({Id, Nombre:'Mujer'}) no es una persona; por eso la regla débil exige un hermano de persona.
  if (/^nombres?$/i.test(key) && !weak && !/^nombres$/i.test(key)) return;
  for (const w of node.split(/[\s,.;:()"'/-]+/)) {
    const t = w.trim();
    if (t.length >= 3 && /^\p{L}+$/u.test(t) && !STOP.has(t.toLowerCase())) tokens.add(t);
  }
}

/**
 * @param {any} data
 * @param {{ desplazamientoDias?: number }} [opts] — sólo para pruebas; por defecto el desplazamiento es aleatorio y no se informa.
 * @returns {{ data: any, informe: { nombres, ruts, contactos, direcciones, identificadores, fechas, textos, secretos }, verificado: boolean, restos: string[] }}
 */
export function anonimizar(data, opts = {}) {
  const days = opts.desplazamientoDias ?? (100 + Math.floor(Math.random() * 300));
  const tokens = new Set();
  collectNameTokens(data, tokens);
  const tokenRes = [...tokens].map(tokenRegex);
  const ids = new Map();
  let nextId = 100001;
  const informe = { nombres: 0, ruts: 0, contactos: 0, direcciones: 0, identificadores: 0, fechas: 0, textos: 0, secretos: 0 };

  const scrubText = s => {
    let out = s, hit = false;
    for (const re of tokenRes) { const r = out.replace(re, '<nombre>'); if (r !== out) { hit = true; out = r; } }
    const r1 = out.replace(RUT_RE, '<rut>'); if (r1 !== out) { informe.ruts++; out = r1; }
    const r2 = out.replace(EMAIL_RE, '<email>'); if (r2 !== out) { informe.contactos++; out = r2; }
    const r3 = out.replace(PHONE_RE, '<fono>'); if (r3 !== out) { informe.contactos++; out = r3; }
    if (hit) informe.textos++;
    return out;
  };

  const walk = (node, key = '', parent = null) => {
    if (Array.isArray(node)) return node.map(n => walk(n, key, parent));
    if (node && typeof node === 'object') { const o = {}; for (const [k, v] of Object.entries(node)) o[k] = walk(v, k, node); return o; }
    if (node === null || node === undefined || typeof node === 'boolean') return node;
    if (SECRET_KEY.test(key)) { informe.secretos++; return '<secreto>'; }
    if (RUT_KEY.test(key)) { if (node === '' || node === 0) return node; informe.ruts++; return '<rut>'; }
    if (CONTACT_KEY.test(key)) { if (node === '' || node === 0) return node; informe.contactos++; return '<contacto>'; }
    if (ADDRESS_KEY.test(key)) { if (node === '' || node === 0) return node; informe.direcciones++; return typeof node === 'number' ? 0 : '<direccion>'; }
    if (ID_KEY.test(key) && (typeof node === 'number' || /^\d+$/.test(String(node)))) {
      if (node === 0 || node === '0') return node;
      const k = String(node);
      if (!ids.has(k)) ids.set(k, nextId++);
      informe.identificadores++;
      return typeof node === 'number' ? ids.get(k) : String(ids.get(k));
    }
    if (typeof node === 'number') return node;
    const s = String(node);
    const strong = STRONG_NAME_KEY.test(key);
    const weak = /^nombres?$/i.test(key) && parent && isPersonObject(parent);
    if ((strong && !(/^nombre$/i.test(key) && !weak)) || weak) {
      if (!s.trim()) return s;
      informe.nombres++;
      return /apellido/i.test(key) ? '<apellido>' : '<nombre>';
    }
    const shifted = shiftDate(s, days);
    if (shifted !== null) { if (shifted !== s) informe.fechas++; return shifted; }
    return scrubText(s);
  };

  const out = walk(data);
  const json = JSON.stringify(out);
  const restos = [];
  for (const [i, re] of tokenRes.entries()) if (re.test(json)) restos.push([...tokens][i]);
  if (RUT_RE.test(json)) restos.push('<patrón RUT>');
  if (EMAIL_RE.test(json)) restos.push('<patrón correo>');
  return { data: out, informe, verificado: restos.length === 0, restos };
}

/** Resumen legible del informe, para la interfaz. */
export function resumenInforme(informe) {
  const partes = [
    [informe.nombres, 'nombres'], [informe.ruts, 'RUT'], [informe.contactos, 'contactos'], [informe.direcciones, 'direcciones'],
    [informe.identificadores, 'identificadores'], [informe.fechas, 'fechas desplazadas'], [informe.textos, 'textos con nombres'], [informe.secretos, 'secretos'],
  ].filter(([n]) => n > 0).map(([n, l]) => `${n} ${l}`);
  return partes.length ? partes.join(' · ') : 'nada que anonimizar';
}
