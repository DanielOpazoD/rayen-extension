/**
 * Transient confirmation, optionally with one action.
 *
 * A toast that can carry "Deshacer" turns a destructive action into a
 * reversible one without a modal: the app acts immediately and keeps the door
 * open for a few seconds. The bar underneath shows how long that door stays
 * open, and hovering the toast pauses it — the user is looking at it, so the
 * clock should wait.
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

const reduced = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/**
 * @param {string} msg
 * @param {{ tone?:'ok'|'bad'|'info', ms?:number, action?:{label:string, onClick:()=>void} }} opts
 * @returns {{ dismiss: () => void }}
 */
export function toast(msg, { tone = 'ok', ms = 2600, action = null } = {}) {
  const el = document.createElement('div');
  el.className = `toast toast-${tone}${action ? ' has-action' : ''}`;

  const text = document.createElement('span');
  text.className = 'toast-msg';
  text.textContent = msg;
  el.appendChild(text);

  if (action) {
    const btn = document.createElement('button');
    btn.className = 'toast-act';
    btn.textContent = action.label;
    btn.addEventListener('click', () => { dismiss(); action.onClick(); });
    el.appendChild(btn);
  }

  const life = action ? Math.max(ms, 6000) : ms;   // an offer needs time to be taken
  const bar = document.createElement('i');
  bar.className = 'toast-bar';
  bar.style.animationDuration = `${life}ms`;
  el.appendChild(bar);

  ensure().appendChild(el);
  requestAnimationFrame(() => el.classList.add('in'));

  let timer = setTimeout(dismiss, life);
  let done = false;

  // Reading it should not cost you the offer
  el.addEventListener('mouseenter', () => { clearTimeout(timer); el.classList.add('paused'); });
  el.addEventListener('mouseleave', () => {
    if (done) return;
    el.classList.remove('paused');
    timer = setTimeout(dismiss, 2000);
  });

  function dismiss() {
    if (done) return;
    done = true;
    clearTimeout(timer);
    el.classList.remove('in');
    setTimeout(() => el.remove(), reduced() ? 0 : 200);
  }
  return { dismiss };
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

/**
 * Confirms an action in place: the element briefly becomes a check.
 * Cheaper to notice than a toast because it happens where you clicked.
 */
export function flashOk(el, label = '✓ copiado') {
  if (!el || el.dataset.flashing) return;
  const original = el.textContent;
  el.dataset.flashing = '1';
  el.classList.add('flash-ok');
  el.textContent = label;
  setTimeout(() => {
    el.textContent = original;
    el.classList.remove('flash-ok');
    delete el.dataset.flashing;
  }, 1100);
}
