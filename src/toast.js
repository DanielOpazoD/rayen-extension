/**
 * Transient confirmation. Actions that succeed silently — a file that
 * downloads, a RUN copied, a note saved — leave the user guessing; a two
 * second line removes the doubt without demanding a click.
 */
let host = null;

function ensure() {
  if (host) return host;
  host = document.createElement('div');
  host.id = 'toasts';
  host.setAttribute('role', 'status');
  host.setAttribute('aria-live', 'polite');
  document.body.appendChild(host);
  return host;
}

/**
 * @param {string} msg
 * @param {{ tone?: 'ok'|'bad'|'info', ms?: number }} opts
 */
export function toast(msg, { tone = 'ok', ms = 2400 } = {}) {
  const el = document.createElement('div');
  el.className = `toast toast-${tone}`;
  el.textContent = msg;
  ensure().appendChild(el);
  // Let the browser paint the initial state before transitioning in
  requestAnimationFrame(() => el.classList.add('in'));
  setTimeout(() => {
    el.classList.remove('in');
    setTimeout(() => el.remove(), 200);
  }, ms);
}

/** Copies text and reports the outcome. @returns {Promise<boolean>} */
export async function copyToClipboard(text, label = 'Copiado') {
  try {
    await navigator.clipboard.writeText(text);
    toast(`${label}: ${text}`);
    return true;
  } catch {
    toast('No se pudo copiar al portapapeles', { tone: 'bad' });
    return false;
  }
}
