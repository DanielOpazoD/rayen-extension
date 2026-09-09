/**
 * Transporte del HIS del Hospital de Hanga Roa (https://his.hospitalhangaroa.cl).
 *
 * A diferencia de Eloisa (Bearer) y de SysLab (se conduce una pestaña), el HIS
 * es PHP clásico con sesión por COOKIE. La extensión se autentica ella misma:
 * `POST /hishhr/acceso1.php` con login (RUT sin DV) y password, y luego sigue
 * consultando con `credentials: 'include'`. Por eso necesita permiso de host
 * para `https://his.hospitalhangaroa.cl/*` (manifest).
 *
 * Guardián de origen: como en Eloisa, la petición sólo sale a
 * `his.hospitalhangaroa.cl`. La contraseña nunca viaja a otro sitio.
 *
 * NOTA de verificación: que Chrome envíe la cookie de sesión del HIS en un
 * fetch desde la extensión (SameSite) hay que comprobarlo en vivo; si no lo
 * hace, el plan B es conducir una pestaña del HIS, como con SysLab. Los pasos
 * (login, referer) están portados del proyecto RCE VISOR, que ya los resolvió.
 *
 * SEGUNDA NOTA, sin comprobar en vivo: el RCE VISOR mandaba `Referer` al pedir
 * PURG0005/PAMB0005. Desde `fetch` esa cabecera es prohibida —el navegador la
 * controla— así que aquí NO se manda. Si el HIS condiciona esas páginas al
 * Referer, la lectura de la ficha fallará en la red del hospital y habrá que
 * conducir una pestaña, como en SysLab. Hay que probarlo allá.
 */
import { parseConsficha, esLogin } from '../core/his-parse.js';
import { parseFichaHis, contarPares } from '../core/his-ficha.js';

const HIS_ORIGIN = 'https://his.hospitalhangaroa.cl';
const HIS_BASE = `${HIS_ORIGIN}/hishhr`;

/** Resuelve una ruta relativa/absoluta y garantiza que apunta al HIS. */
export function resolveHisUrl(pathOrUrl) {
  const url = new URL(String(pathOrUrl ?? ''), `${HIS_BASE}/`);
  if (url.origin !== HIS_ORIGIN) throw new Error(`Origen no permitido: ${url.origin}`);
  return url.href;
}

/**
 * GET/POST al HIS con la cookie de sesión. Devuelve `{ status, ok, text }`.
 * No se fijan Referer/Origin/User-Agent: el navegador los controla y `fetch`
 * los ignoraría; sólo se pasa Content-Type en los POST de formulario.
 */
/**
 * @param {string} pathOrUrl
 * @param {{ method?: string, body?: string|null, form?: boolean, signal?: AbortSignal }} [opts]
 */
async function hisFetch(pathOrUrl, { method = 'GET', body = null, form = false, signal } = {}) {
  const res = await fetch(resolveHisUrl(pathOrUrl), {
    method,
    credentials: 'include',
    cache: 'no-store',
    headers: form ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {},
    body,
    signal,
  });
  return { status: res.status, ok: res.ok, text: await res.text() };
}

// ── Login ──────────────────────────────────────────────────

/**
 * Extrae del HTML el form de login: su `action` y sus campos ocultos. Se
 * prefiere el form que tenga password+login. Regex, como el resto (el HTML del
 * HIS es un template PHP estable).
 * @returns {{ action: string, hidden: Record<string,string> }}
 */
export function parseLoginForm(html) {
  const attr = (tag, name) => {
    const m = new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|(\\S+))`, 'i').exec(tag);
    return m ? (m[1] ?? m[2] ?? m[3] ?? '') : '';
  };
  const forms = [];
  for (const fm of String(html ?? '').matchAll(/<form\b([^>]*)>([\s\S]*?)<\/form>/gi)) {
    const inputs = new Set();
    /** @type {Record<string, string>} */
    const hidden = {};
    for (const im of fm[2].matchAll(/<input\b([^>]*)>/gi)) {
      const name = attr(im[1], 'name');
      if (!name) continue;
      inputs.add(name);
      if ((attr(im[1], 'type') || 'text').toLowerCase() === 'hidden') hidden[name] = attr(im[1], 'value');
    }
    forms.push({ action: attr(fm[1], 'action'), hidden, inputs });
  }
  const elegido =
    forms.find(f => f.inputs.has('password') && f.inputs.has('login')) ||
    forms.find(f => f.inputs.has('password')) ||
    forms.find(f => f.inputs.has('login')) ||
    forms.find(f => /acceso1/i.test(f.action)) ||
    forms[0];
  return elegido ? { action: elegido.action, hidden: elegido.hidden } : { action: '', hidden: {} };
}

const accionLogin = raw => {
  if (!raw) return '/hishhr/acceso1.php';
  if (/^https?:/i.test(raw)) return new URL(raw).pathname;
  if (raw.startsWith('/')) return raw;
  return `/hishhr/${raw.replace(/^\.?\//, '')}`;
};

/**
 * Inicia sesión en el HIS con RUT (sin DV) y contraseña.
 * @param {string} user  RUT sin dígito verificador
 * @param {string} password
 * `rechazada` distingue «el HIS dijo que no» de «el HIS no contestó». Sólo lo
 * primero invalida lo guardado; por un corte de red no se puede obligar a la
 * persona a reescribir una contraseña que estaba bien.
 * @returns {Promise<{ ok: boolean, error?: string, rechazada?: boolean }>}  el error es seguro de mostrar (no lleva la clave)
 */
export async function hisLogin(user, password) {
  if (!user || !password) return { ok: false, error: 'faltan credenciales' };
  let root;
  try { root = await hisFetch('/hishhr/'); }
  catch (e) { return { ok: false, error: `no se pudo contactar el HIS (${e.message})` }; }
  if (root.status !== 200) return { ok: false, error: `no se pudo cargar el login (HTTP ${root.status})` };

  const form = parseLoginForm(root.text);
  const data = new URLSearchParams({ ...form.hidden, login: user, password });
  const post = await hisFetch(accionLogin(form.action), { method: 'POST', body: data.toString(), form: true });

  if (!/window\.location|usuarioLogeado/i.test(post.text)) {
    const alerta = /alert\(['"]([^'"]{3,200})/i.exec(post.text);
    return { ok: false, rechazada: true, error: alerta ? `HIS dice: ${alerta[1]}` : 'credenciales rechazadas' };
  }
  await hisFetch('/hishhr/menu.php').catch(() => {}); // warm-up: estabiliza la sesión
  const verify = await hisFetch('/hishhr/ateurg022.php');
  if (verify.status === 200 && !esLogin(verify.text)) return { ok: true };
  return { ok: false, error: 'la sesión no persistió tras el login' };
}

/** ¿Hay sesión de HIS activa? Comprueba contra una página que el usuario sí puede ver. */
export async function hisStatus() {
  try {
    const r = await hisFetch('/hishhr/ateurg022.php');
    return { authenticated: r.status === 200 && !esLogin(r.text) };
  } catch (e) {
    return { authenticated: false, error: e.message };
  }
}

// ── Datos del paciente ─────────────────────────────────────

/**
 * Historial del paciente en el HIS por RUT (`consficha000.php`). El HIS exige el
 * RUT sin dígito verificador y `op` vacío.
 * @param {string} rut  el RUT como lo tiene la ficha (con o sin puntos/DV)
 * @param {{ signal?: AbortSignal }} [opts]
 * @returns {Promise<{ authRequired?: boolean, atenciones: import('../core/his-parse.js').AtencionHis[] }>}
 */
export async function hisAtencionesPorRut(rut, { signal } = {}) {
  // El RUT llega canónico (dígitos + DV, p. ej. «56785678k» o «56.785.678-K»):
  // el HIS pide sólo el cuerpo, sin el dígito verificador (el último carácter).
  const base = String(rut ?? '').replace(/[.\-\s]/g, '').slice(0, -1).replace(/\D/g, '');
  if (!/^\d{5,9}$/.test(base)) return { atenciones: [] };
  await hisFetch('/hishhr/consficha000.php', { signal }).catch(() => {}); // warm-up
  const data = new URLSearchParams({ url_link2: '/hishhr/', op: '', ficha: '', rut: base, pasaporte: '' });
  const res = await hisFetch('/hishhr/consficha000.php', { method: 'POST', body: data.toString(), form: true, signal });
  if (esLogin(res.text)) return { authRequired: true, atenciones: [] };
  return { atenciones: parseConsficha(res.text, String(rut)) };
}

/** URL imprimible de una ficha del HIS (para abrir en una pestaña). */
export function hisFichaUrl(idCuenta, tipoFicha) {
  const printMode = tipoFicha === 'ambulatorio' ? 'noprint=1' : 'print=1';
  const doc = tipoFicha === 'ambulatorio' ? 'PAMB0005' : 'PURG0005';
  return resolveHisUrl(`/hishhr/${doc}.php?id=${encodeURIComponent(String(idCuenta))}&${printMode}`);
}

/**
 * Contenido clínico de una ficha del HIS, ya parseado. Es la misma página que
 * abre `hisFichaUrl`, pero leída por la extensión para poder mostrarla dentro
 * de la app en vez de mandar al médico a otra pestaña.
 *
 * `contarPares` decide si la respuesta es una ficha de verdad: el HIS contesta
 * 200 con una página casi vacía cuando la sesión cayó o la ficha no es
 * accesible, y pintar esa página como si fuera una atención sería mentir.
 *
 * @param {string} idCuenta
 * @param {'urgencia'|'ambulatorio'} tipoFicha
 * @param {{ signal?: AbortSignal }} [opts]
 * @returns {Promise<{ authRequired?: boolean, vacia?: boolean, error?: string, ficha?: import('../core/his-ficha.js').FichaHis }>}
 */
export async function hisFicha(idCuenta, tipoFicha, { signal } = {}) {
  const res = await hisFetch(hisFichaUrl(idCuenta, tipoFicha), { signal });
  // El mismo orden que la referencia: sesión, permisos, estado y sólo entonces
  // «¿esto parece una ficha?». Sin la rama de permisos, una página de «No tiene
  // permisos» con cinco pares se leía como ficha vacía y la app afirmaba que el
  // HIS no había registrado contenido clínico, que es falso y distinto.
  if (esLogin(res.text)) return { authRequired: true };
  if (/No tiene permisos/i.test(res.text)) return { error: 'no tienes permisos sobre esta ficha en el HIS' };
  if (!res.ok) return { error: `el HIS respondió HTTP ${res.status}` };
  if (contarPares(res.text) < 5) return { vacia: true };
  return { ficha: parseFichaHis(res.text) };
}
