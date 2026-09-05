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
 *  - Segunda pasada, independiente de los nombres ya conocidos: RUN pegado al
 *    estilo Rayen (dígito verificador válido), teléfonos en cualquier formato,
 *    fechas dentro del texto (desplazadas), personas tras «Dr.», «Sra.», «hija»
 *    o en claves por subcadena (MedicoTratante, NombreCompletoPaciente).
 *  - Al final, los mismos detectores recorren el resultado: si algo queda,
 *    `verificado` es false, `restos` dice qué, y la interfaz no descarga ni copia.
 *
 * Lo que NO puede detectar: un nombre de tercero escrito en texto libre sin
 * tratamiento ni parentesco delante («coordinar con Carolina»). La interfaz lo dice.
 */
import { computeDv } from './parser.js';

const STRONG_NAME_KEY = /^(nombres?|nombrecompleto|nombreformateado|nombresocial|nombrealqueresponde|apellidos?|apellidopaterno|apellidomaterno|nombre(usuario|funcionario|paciente|profesional|solicitante|registrador|medico|prestador|madre|padre|tutor|acompanante|representante|responsable|contacto|cuidador)|usuario(creacion|modificacion|ingreso|registro)|funcionario|prestador|solicitante|registrador|medico|profesional|responsable|acompanante|tutor|representante|madre|padre|paciente|cuidador)$/i;
const PERSON_SIBLING = /apellido|^rut$|^run$|fechadenacimiento|fechanacimiento|^sexo$|instrumento|profesion|esprestador|idfuncionario|idusuario|nombrecompleto/i;
const RUT_KEY = /rut|^run$|^dv$|documento|pasaporte/i; // «numDocumentoCompleto» (ProactiveLIS) también
const ADDRESS_KEY = /direccion|domicilio|^calle|villa|poblacion|numerocasa|^depto|georef|latitud|longitud/i;
const CONTACT_KEY = /telefono|fono|celular|movil|email|correo|mail$/i;
const SECRET_KEY = /token|authorization|password|clave$/i;
const ID_KEY = /^(id|guid)|(id|guid)$|^codigo(de)?familia|numero(de)?ficha|^ficha$|^numeroreceta$|^numeroorden$|^folio/i;
// Claves con «nombre/apellido» que no son catálogo, y claves de rol con valor que parece una persona.
const CATALOG_NAME_KEY = /nombre(examen|prestacion|especialidad|instrumento|programa|articulo|establecimiento|nodo|tipo|prevision|sector|comuna|categoria|clasificacion|estado|diagnostico|motivo|actividad|farmaco|medicamento|receta|unidad|servicio|area|centro|sistema|social|alqueresponde)/i;
const NAME_SUBSTRING_KEY = /nombre|apellido/i;
const ROLE_KEY = /medico|tratante|funcionario|prestador|profesional|solicitante|registrador|responsable|paciente|usuario|titular|tutor|acompanante|cuidador|madre|padre|hijo|hija|conyuge|pareja|contacto|emisor|receptor|derivador/i;
// Persona en texto: tratamiento o parentesco seguido de una a cuatro palabras con mayúscula inicial.
const CUES = ['dr', 'dra', 'sr', 'sra', 'srta', 'don', 'doña', 'paciente', 'hija', 'hijo', 'madre', 'padre', 'esposa', 'esposo', 'marido', 'mujer', 'hermana', 'hermano', 'nieta', 'nieto', 'abuela', 'abuelo', 'cuidadora', 'cuidador', 'familiar', 'acompañante', 'enfermera', 'enfermero', 'matrona', 'kinesióloga', 'kinesiólogo', 'psicóloga', 'psicólogo', 'nutricionista', 'tens', 'técnico', 'tecnico', 'colega'];
// Sin el indicador «i»: con él, \p{Lu} también casaría minúsculas y la expresión se tragaba la frase entera.
const cueAlt = CUES.map(w => `[${w[0].toUpperCase()}${w[0]}]${w.slice(1)}`).join('|');
const CUE_RE = new RegExp(`\\b(?:${cueAlt})\\.?\\s+((?:(?:de|del|la|las|los|y)\\s+)?\\p{Lu}\\p{Ll}{2,}(?:[\\s-]+(?:(?:de|del|la|las|los|y)\\s+)?\\p{Lu}\\p{Ll}{2,}){0,3})`, 'gu');
// RUN pegado como lo escribe Rayen: 7–8 dígitos y verificador válido (módulo 11); así una fecha o un id no pasan por RUN.
const RUT_LOOSE_RE = /(?<![\d.-])(\d{7,8})[-\s]?([\dkK])(?![\d-])/g;
// El fijo exige separador tras el prefijo: sin él, «20260901» (una fecha) parecía un fijo de Santiago.
const PHONE_RE2 = /(?:\(?\+?56\)?[\s.-]?)?(?:9[\s.-]?\d{4}[\s.-]?\d{4}|(?:32|2)[\s.-]\d{3}[\s.-]?\d{4})\b|\b56\d{9}\b/g;
const TEXT_DATE_RE = /\b(\d{1,2})([/-])(\d{1,2})\2(\d{4})\b|\b((?:19|20)\d{2})(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])\b/g;
const looksLikePerson = s => { const w = String(s).replace(/^(dr|dra|sr|sra|srta|don|doña)\.?\s+/i, '').trim().split(/\s+/); return w.length >= 2 && w.length <= 5 && w.every(x => /^\p{Lu}\p{L}+$/u.test(x) || STOP.has(x.toLowerCase())); };
const rutValido = (body, dv) => computeDv(body) === dv.toUpperCase();
const STOP = new Set(['de', 'del', 'la', 'las', 'los', 'el', 'y', 'e', 'van', 'von', 'da', 'do', 'dos', 'san', 'sra', 'sr', 'dr', 'dra']);

// Con puntos o guion: ocho dígitos seguidos son también una fecha «20260904» o un identificador.
const RUT_RE = /\b\d{1,2}\.\d{3}\.\d{3}-?[\dkK]\b|\b\d{7,8}-[\dkK]\b/g;
// Cuantificadores acotados: sin ellos, un texto largo sin «@» costaba tiempo cuadrático y congelaba la pestaña.
const EMAIL_RE = /[\w.+-]{1,64}@[\w-]{1,63}(?:\.[\w-]{1,63}){1,4}/g;
const PHONE_RE = /\+56\s?\d[\d\s]{7,14}\d|\b9\s?\d{4}\s?\d{4}\b/g;
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
  const sub = !/^nombres?$/i.test(key) && NAME_SUBSTRING_KEY.test(key) && !CATALOG_NAME_KEY.test(key);
  const rol = ROLE_KEY.test(key) && looksLikePerson(node);
  if (!strong && !weak && !sub && !rol) return;
  // «Nombre» de un catálogo ({Id, Nombre:'Mujer'}) no es una persona; por eso la regla débil exige un hermano de persona.
  if (/^nombres?$/i.test(key) && !weak && !/^nombres$/i.test(key)) return;
  for (const m of node.matchAll(CUE_RE)) for (const w of m[1].split(/[\s-]+/)) if (w.length >= 3 && !STOP.has(w.toLowerCase())) tokens.add(w);
  for (const w of node.replace(/^(dr|dra|sr|sra|don|doña)\.?\s+/i, '').split(/[\s,.;:()"'/-]+/)) {
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

  const shiftTextDate = (m, d, sep, mo, y, y8, mo8, d8) => {
    if (y8) { const t = shiftDate(`${y8}${mo8}${d8}`, days); return t ?? m; }
    const t = shiftDate(`${d.padStart(2, '0')}-${mo.padStart(2, '0')}-${y}`, days);
    return t ? t.replace(/-/g, sep) : m;
  };
  const scrubText = s => {
    let out = s, hit = false;
    for (const re of tokenRes) { const r = out.replace(re, '<nombre>'); if (r !== out) { hit = true; out = r; } }
    const r0 = out.replace(CUE_RE, (m, nombre) => { hit = true; return m.slice(0, m.length - nombre.length) + '<nombre>'; }); out = r0;
    const r1 = out.replace(RUT_RE, '<rut>'); if (r1 !== out) { informe.ruts++; out = r1; }
    const r1b = out.replace(RUT_LOOSE_RE, (m, body, dv) => rutValido(body, dv) ? '<rut>' : m); if (r1b !== out) { informe.ruts++; out = r1b; }
    const r2 = out.replace(EMAIL_RE, '<email>'); if (r2 !== out) { informe.contactos++; out = r2; }
    const r4 = out.replace(TEXT_DATE_RE, shiftTextDate); if (r4 !== out) { informe.fechas++; out = r4; }
    const r3 = out.replace(PHONE_RE, '<fono>').replace(PHONE_RE2, '<fono>'); if (r3 !== out) { informe.contactos++; out = r3; }
    if (hit) informe.textos++;
    return out.replace(/<nombre>(?:\s+<nombre>)+/g, '<nombre>'); // «Rosa Tuki» es una persona, no dos marcadores
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
    const sub = !/^nombres?$/i.test(key) && NAME_SUBSTRING_KEY.test(key) && !CATALOG_NAME_KEY.test(key);
    const rol = ROLE_KEY.test(key) && looksLikePerson(s);
    if ((strong && !(/^nombre$/i.test(key) && !weak)) || weak || sub || rol) {
      if (!s.trim()) return s;
      informe.nombres++;
      return /apellido/i.test(key) ? '<apellido>' : '<nombre>';
    }
    const shifted = shiftDate(s, days);
    if (shifted !== null) { if (shifted !== s) informe.fechas++; return shifted; }
    return scrubText(s);
  };

  const out = walk(data);
  const restos = detectarRestos(out, tokens, tokenRes);
  return { data: out, informe, verificado: restos.length === 0, restos };
}

/**
 * Comprobación final con los mismos detectores, sobre el resultado entero
 * (claves incluidas): nombres conocidos, personas tras tratamiento, RUT en
 * cualquier formato, correos y teléfonos. Lo que devuelve es lo que la
 * interfaz muestra como motivo para no descargar.
 */
export function detectarRestos(out, tokens = new Set(), tokenRes = [...tokens].map(tokenRegex)) {
  const json = JSON.stringify(out);
  const restos = [];
  const hay = re => { re.lastIndex = 0; const r = re.test(json); re.lastIndex = 0; return r; }; // regex globales: sin reponer lastIndex, test() miente
  for (const [i, re] of tokenRes.entries()) if (hay(re)) restos.push([...tokens][i]);
  if ([...json.matchAll(CUE_RE)].length) restos.push('persona tras tratamiento o parentesco');
  if (hay(RUT_RE)) restos.push('RUT con formato');
  if ([...json.matchAll(RUT_LOOSE_RE)].some(m => rutValido(m[1], m[2]))) restos.push('RUT pegado');
  if (hay(EMAIL_RE)) restos.push('correo');
  if (hay(PHONE_RE) || hay(PHONE_RE2)) restos.push('teléfono');
  return [...new Set(restos)];
}

/** Resumen legible del informe, para la interfaz. */
export function resumenInforme(informe) {
  const partes = [
    [informe.nombres, 'nombres'], [informe.ruts, 'RUT'], [informe.contactos, 'contactos'], [informe.direcciones, 'direcciones'],
    [informe.identificadores, 'identificadores'], [informe.fechas, 'fechas desplazadas'], [informe.textos, 'textos con nombres'], [informe.secretos, 'secretos'],
  ].filter(([n]) => n > 0).map(([n, l]) => `${n} ${l}`);
  return partes.length ? partes.join(' · ') : 'nada que anonimizar';
}
