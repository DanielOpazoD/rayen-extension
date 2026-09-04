/**
 * Traduce un error técnico a una frase para quien usa la aplicación.
 *
 * «Failed to fetch», «HTTP 500 /Citas/…» o «TypeError» hablan al programador.
 * La persona que ve la pantalla necesita saber tres cosas: con quién no se pudo
 * hablar, si es cosa de la sesión o de la red, y qué hacer. Nunca se muestra un
 * stack ni una ruta interna.
 *
 * Es independiente de los transportes: reconoce sus errores de sesión por el
 * nombre de la clase (AuthError, LabAuthError, SyslabAuthError) sin importarlos.
 */
const GENERIC = 'Ocurrió un error inesperado. Inténtalo de nuevo.';

function frase(texto) {
  const t = String(texto).replace(/\s+/g, ' ').trim().slice(0, 160);
  if (!t) return '';
  const conMayuscula = t[0].toUpperCase() + t.slice(1);
  return /[.!?…]$/.test(conMayuscula) ? conMayuscula : `${conMayuscula}.`;
}

/**
 * @param {unknown} err       lo que se atrapó (Error, string, nada…)
 * @param {string}  origen    con quién se hablaba: «Eloisa», «SysLab», «el portal del Hospital Salvador»
 */
export function humanError(err, origen = 'el servidor') {
  if (err == null) return GENERIC;
  const msg = typeof err === 'string' ? err : String(err.message ?? '');
  const clase = err?.constructor?.name ?? '';

  if (/AuthError$/.test(clase)) {
    // Los errores de sesión de SysLab ya vienen redactados para la persona.
    if (msg && !/^\d{3}$/.test(msg) && !/^HTTP/i.test(msg)) return frase(msg);
    return `La sesión de ${origen} no está iniciada o venció. Abre ${origen} e inicia sesión.`;
  }
  if (/failed to fetch|networkerror|network request failed|load failed|ERR_(CONNECTION|NAME|INTERNET|NETWORK)|fetch failed/i.test(msg)) {
    return `No se pudo conectar con ${origen}. Revisa la conexión o la red del hospital.`;
  }
  if (/abort|timeout|timed out|no respondió/i.test(msg)) {
    return `${cap(origen)} no respondió a tiempo. Inténtalo de nuevo.`;
  }
  const http = msg.match(/HTTP\s*(\d{3})/i);
  if (http) {
    const code = Number(http[1]);
    if (code === 401 || code === 403) return `La sesión de ${origen} no está iniciada o venció. Abre ${origen} e inicia sesión.`;
    if (code === 404) return `${cap(origen)} no encontró lo solicitado (código 404).`;
    if (code >= 500) return `${cap(origen)} tuvo un error interno (código ${code}). Inténtalo más tarde.`;
    return `${cap(origen)} respondió con un error (código ${code}).`;
  }
  if (/origen no permitido/i.test(msg)) return 'La extensión bloqueó una petición a un sitio no autorizado.';
  // Un error del propio motor de JavaScript nunca es una frase para la persona.
  if (/^(TypeError|ReferenceError|SyntaxError|RangeError)$/.test(clase)) return GENERIC;
  return frase(msg) || GENERIC;
}

const cap = s => s.replace(/^el /, 'El ').replace(/^la /, 'La ').replace(/^(\p{Ll})/u, c => c.toUpperCase());
