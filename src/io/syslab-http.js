/**
 * Transporte de SysLab (portal interno del Hospital Hanga Roa).
 *
 * SysLab es un portal PHP con navegación por estado: la búsqueda por RUT no es
 * una URL consultable, sino una secuencia de clics y envíos de formulario que el
 * servidor sigue por sesión. Además sus cookies (PHP 7.1, HTTP) no llevan
 * SameSite=None, así que Chrome no las envía en un fetch desde
 * chrome-extension://. Por eso no usamos fetch para buscar: conducimos la
 * pestaña SysLab que el usuario ya tiene abierta y leemos su DOM.
 */

const SYSLAB_ORIGIN = 'http://10.4.69.90';
const SYSLAB_BASE = 'http://10.4.69.90/syslab/';
const NAV_TIMEOUT_MS = 20_000;

class SyslabAuthError extends Error {
  constructor(message) {
    super(message || 'Sin sesión de SysLab');
    this.name = 'SyslabAuthError';
  }
}

const syslabSession = { expired: false };
export function resetSyslabSession() { syslabSession.expired = false; }

export function resolveSyslabLink(link) {
  const url = new URL(String(link || ''), SYSLAB_BASE);
  if (url.origin !== SYSLAB_ORIGIN) throw new Error(`Origen no permitido: ${url.origin}`);
  return url.href;
}

/**
 * Puede haber varias pestañas de SysLab abiertas y sólo algunas con sesión.
 * Se prueban todas y se usa la primera autenticada, en vez de suponer que la
 * primera que devuelve Chrome es la correcta.
 */
async function findAuthenticatedTab() {
  if (!globalThis.chrome?.tabs?.query) {
    throw new SyslabAuthError('La extensión no tiene acceso a las pestañas.');
  }
  const tabs = await chrome.tabs.query({ url: `${SYSLAB_ORIGIN}/syslab/*` });
  if (!tabs.length) {
    throw new SyslabAuthError('abre SysLab en una pestaña e inicia sesión');
  }
  for (const tab of tabs) {
    let status;
    try {
      status = await inject(tab.id, probeStatus);
    } catch (_error) {
      continue; // Pestaña inaccesible (descargada o navegando); se prueba la siguiente.
    }
    if (!status.loginRequired) return { tabId: tab.id, status };
  }
  syslabSession.expired = true;
  throw new SyslabAuthError(tabs.length > 1
    ? `ninguna de las ${tabs.length} pestañas de SysLab tiene sesión iniciada`
    : 'SysLab pide iniciar sesión');
}

const INJECT_TIMEOUT_MS = 25_000;

async function inject(tabId, func, args = []) {
  // Un script que no vuelve (pestaña colgada, portal caído) dejaba «Todos los
  // PDF» y «Analizar» esperando para siempre; la navegación ya tenía límite.
  let timer;
  const results = await Promise.race([
    chrome.scripting.executeScript({ target: { tabId }, func, args }),
    new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('SysLab no respondió a tiempo.')), INJECT_TIMEOUT_MS); }),
  ]).finally(() => clearTimeout(timer));
  const value = results?.[0]?.result;
  if (!value) throw new Error('SysLab no respondió en la pestaña.');
  if (value.error) throw new Error(value.error);
  return value;
}

function waitForLoad(tabId) {
  return new Promise((resolve, reject) => {
    const done = (fn, arg) => {
      clearTimeout(timer);
      chrome.tabs.onUpdated.removeListener(listener);
      fn(arg);
    };
    const listener = (id, info) => {
      if (id === tabId && info.status === 'complete') done(resolve);
    };
    const timer = setTimeout(
      () => done(reject, new Error('SysLab demoró demasiado en cargar.')),
      NAV_TIMEOUT_MS
    );
    chrome.tabs.onUpdated.addListener(listener);
  });
}

// ── Pasos inyectados en la pestaña SysLab (deben ser autocontenidos) ──

function probeStatus() {
  return {
    loginRequired: Boolean(document.querySelector('input[name="password"], input[type="password"]')),
    hasRutInput: Boolean(document.querySelector('input[name="rut"]')),
    url: location.href,
  };
}

function stepPrepareSearch() {
  const clean = v => String(v == null ? '' : v).replace(/\s+/g, ' ').trim();
  if (document.querySelector('input[name="password"], input[type="password"]')) {
    return { loginRequired: true };
  }
  if (document.querySelector('input[name="rut"]')) return { navigated: false };
  const pattern = /b[úu]squeda\s+por\s+rut|\brut\b/i;
  const target = Array.from(
    document.querySelectorAll('input[type="submit"], input[type="button"], button, a')
  ).find(el => pattern.test(clean(/** @type {HTMLInputElement} */ (el).value || el.textContent)));
  if (!target) return { error: 'No se encontró la opción «Búsqueda por RUT» en SysLab.' };
  setTimeout(() => /** @type {HTMLElement} */ (target).click(), 0);
  return { navigated: true };
}

function stepSubmitSearch(rutBody) {
  const clean = v => String(v == null ? '' : v).replace(/\s+/g, ' ').trim();
  if (document.querySelector('input[name="password"], input[type="password"]')) {
    return { loginRequired: true };
  }
  const input = /** @type {HTMLInputElement|undefined} */ (document.querySelector('input[name="rut"]') ||
    Array.from(/** @type {NodeListOf<HTMLInputElement>} */ (document.querySelectorAll('input[type="text"]')))
      .find(field => !/usuario/i.test(field.name || '')));
  if (!input || !/^\d{5,9}$/.test(rutBody)) {
    return { error: 'El formulario de búsqueda por RUT no está disponible.' };
  }
  input.focus();
  input.value = rutBody;
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));

  const form = input.closest('form');
  const pattern = /aceptar|buscar|consultar/i;
  const controls = Array.from(
    /** @type {NodeListOf<HTMLInputElement>} */ ((form || document).querySelectorAll('input[type="submit"], input[type="button"], button, a'))
  );
  const submit = controls.find(el => pattern.test(clean(el.value || el.textContent))) ||
    controls.find(el => /submit/i.test(el.type || ''));
  if (!submit && !form) return { error: 'No se pudo enviar la búsqueda por RUT en SysLab.' };
  setTimeout(() => {
    if (submit) submit.click();
    else if (typeof form.requestSubmit === 'function') form.requestSubmit();
    else form.submit();
  }, 0);
  return { navigated: true };
}

function stepReadResults() {
  const clean = v => String(v == null ? '' : v).replace(/\s+/g, ' ').trim();
  if (document.querySelector('input[name="password"], input[type="password"]')) {
    return { loginRequired: true };
  }
  const exams = [];
  for (const row of document.querySelectorAll('table.narrow tr')) {
    const cells = row.querySelectorAll('td');
    if (cells.length < 6) continue;
    const anchor = cells[0].querySelector('a');
    const id = clean(anchor ? anchor.textContent : cells[0].textContent);
    const rawLink = anchor && anchor.getAttribute('href');
    if (!/^\d+$/.test(id) || !rawLink) continue;
    let link;
    try {
      const url = new URL(rawLink, location.href);
      if (url.origin !== 'http://10.4.69.90') continue;
      if (!/\/detalleexamenes\.php$/i.test(url.pathname)) continue;
      link = url.href;
    } catch (_error) {
      continue;
    }
    const dateParts = String(cells[1].innerHTML || '').split(/<br\s*\/?\s*>/i);
    const rutMatch = clean(cells[2].textContent).match(/\d[\d.]*/);
    exams.push({
      id,
      link,
      date: clean(dateParts[0] || cells[1].textContent),
      time: clean((dateParts[1] || '').replace(/<[^>]+>/g, '')),
      rutBody: rutMatch ? rutMatch[0].replace(/\D/g, '') : '',
      patientName: clean(cells[3].textContent),
      origin: clean(cells[4].textContent),
      exams: Array.from(cells[5].querySelectorAll('.mitabla tr td'))
        .map(cell => clean(cell.textContent).replace(/\((?:V|P)\)/g, '').trim())
        .filter(Boolean),
    });
  }
  return { exams };
}

/**
 * Descarga un informe dentro de la pestaña SysLab, donde la petición es
 * same-origin y lleva la cookie de sesión. `detalleexamenes.php` a veces
 * devuelve HTML que envuelve o enlaza el PDF real, así que se sigue un nivel.
 */
function stepFetchReport(link) {
  const ORIGIN = 'http://10.4.69.90';
  const MAX_BYTES = 6 * 1024 * 1024;
  const allowed = value => {
    try {
      const url = new URL(String(value || ''), location.href);
      return url.origin === ORIGIN && url.pathname.startsWith('/syslab/');
    } catch (_error) {
      return false;
    }
  };
  const toBase64 = bytes => {
    let binary = '';
    for (let i = 0; i < bytes.length; i += 0x8000) {
      binary += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    }
    return btoa(binary);
  };
  const grab = async url => {
    if (!allowed(url)) throw new Error('SysLab entregó una ruta de informe no permitida.');
    const res = await fetch(url, { credentials: 'include', cache: 'no-store', redirect: 'follow', signal: AbortSignal.timeout(20_000) });
    if (!res.ok) throw new Error('SysLab respondió HTTP ' + res.status + '.');
    const buffer = await res.arrayBuffer();
    if (buffer.byteLength > MAX_BYTES) throw new Error('El informe supera el límite de 6 MB.');
    if (!buffer.byteLength) throw new Error('SysLab devolvió un informe vacío.');
    return {
      bytes: new Uint8Array(buffer),
      contentType: String(res.headers.get('content-type') || '').toLowerCase(),
      finalUrl: res.url || url,
    };
  };
  const isPdf = report => report.contentType.includes('pdf') ||
    String.fromCharCode.apply(null, report.bytes.subarray(0, 4)) === '%PDF';

  return (async () => {
    try {
      let report = await grab(link);
      if (!isPdf(report)) {
        const parsed = new DOMParser().parseFromString(
          new TextDecoder('utf-8').decode(report.bytes), 'text/html'
        );
        const el = parsed.querySelector(
          'iframe[src], embed[src], object[data], a[href*=".pdf"], a[href*="detalleexamenes.php"]'
        );
        const nested = el && (el.getAttribute('src') || el.getAttribute('data') || el.getAttribute('href'));
        if (!nested) return { error: 'El informe no contiene un PDF.' };
        const nestedUrl = new URL(nested, report.finalUrl).href;
        if (nestedUrl === report.finalUrl) return { error: 'El informe no contiene un PDF.' };
        report = await grab(nestedUrl);
        if (!isPdf(report)) return { error: 'El informe no contiene un PDF.' };
      }
      return { base64: toBase64(report.bytes) };
    } catch (error) {
      return { error: String((error && error.message) || error) };
    }
  })();
}

// ── API del transporte ──

function guardSession(step) {
  if (step.loginRequired) {
    syslabSession.expired = true;
    throw new SyslabAuthError('SysLab pide iniciar sesión.');
  }
  return step;
}

/** Comprueba que exista una pestaña SysLab con sesión iniciada. */
export async function syslabStatus() {
  return (await findAuthenticatedTab()).status;
}

/**
 * Conduce la pestaña SysLab a través de la búsqueda por RUT y lee el resultado.
 * @param {string} rutBody
 * @param {object} [opts]
 * @param {AbortSignal} [opts.signal]
 */
export async function syslabSearchByRut(rutBody, { signal } = {}) {
  // Cancelar corta la cadena de pasos: no se sigue conduciendo la pestaña del
  // usuario para una búsqueda que ya nadie espera.
  const check = () => { if (signal?.aborted) throw new DOMException('Búsqueda cancelada.', 'AbortError'); };
  const { tabId } = await findAuthenticatedTab();
  check();
  const prepared = guardSession(await inject(tabId, stepPrepareSearch));
  if (prepared.navigated) await waitForLoad(tabId);
  check();
  const submitted = guardSession(await inject(tabId, stepSubmitSearch, [rutBody]));
  if (submitted.navigated) await waitForLoad(tabId);
  check();
  return guardSession(await inject(tabId, stepReadResults)).exams;
}

/** Bytes del PDF de un informe, obtenidos con la sesión de la pestaña SysLab. */
export async function syslabReportBytes(link) {
  const { tabId } = await findAuthenticatedTab();
  const { base64 } = await inject(tabId, stepFetchReport, [resolveSyslabLink(link)]);
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export { SYSLAB_BASE };
