const LAB_ORIGIN = 'https://examenesusuarios.hsalvador.cl';

export class LabAuthError extends Error {
  constructor() {
    super('Sesión de ProactiveLIS no encontrada');
    this.name = 'LabAuthError';
  }
}

export const labSession = { expired: false };
export function resetLabSession() { labSession.expired = false; }

function resolveLabUrl(path) {
  const url = new URL(path, LAB_ORIGIN);
  if (url.origin !== LAB_ORIGIN) throw new Error(`Origen no permitido: ${url.origin}`);
  return url.href;
}

// Sin límite, una búsqueda contra un portal colgado dejaba «Buscando…» para
// siempre. Veinte segundos, como cada paso de SysLab; el mensaje lo pone humanError.
const LAB_TIMEOUT_MS = 20_000;

async function labRequest(path, init = {}) {
  const res = await fetch(resolveLabUrl(path), {
    ...init,
    credentials: 'include',
    signal: init.signal ?? AbortSignal.timeout(LAB_TIMEOUT_MS),
  });
  const ct = res.headers.get('content-type') || '';
  if (res.redirected && new URL(res.url).pathname.startsWith('/Login')) {
    labSession.expired = true;
    throw new LabAuthError();
  }
  if (res.ok && ct.includes('text/html')) {
    const snippet = await res.clone().text();
    if (snippet.includes('Acceso Usuario') || snippet.includes('Login/IngresoUsuarios')) {
      labSession.expired = true;
      throw new LabAuthError();
    }
  }
  if (!res.ok) throw new Error(`HTTP ${res.status} ${path}`);
  return res;
}

export async function labGet(path, init = {}) {
  return (await labRequest(path, init)).json();
}

export async function labBlob(path) {
  return (await labRequest(path)).blob();
}

export { LAB_ORIGIN };
