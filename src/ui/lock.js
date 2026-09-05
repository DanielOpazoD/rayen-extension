/**
 * Inactivity lock. There are patient names, RUNs and diagnoses on screen and
 * the machine is shared in practice, so after a few idle minutes the content is
 * blurred behind an overlay until the user comes back.
 *
 * Con cifrado activo (ADR 0001) el bloqueo descarta la clave de memoria y
 * «Continuar» pide el PIN: sin él no se vuelve a leer nada del disco. Lo que
 * ya está pintado sigue bajo el velo inerte; no es un cierre de sesión.
 */
import { clearKey, readMeta } from '../io/crypto-store.js';
import { askPin } from './pin-screen.js';

const EVENTS = ['pointerdown', 'keydown', 'wheel', 'touchstart'];

export function initLock({ minutes = 15 } = {}) {
  const el = document.createElement('div');
  el.id = 'lockScreen';
  el.hidden = true;
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-modal', 'true');
  el.innerHTML = `
    <div class="lock-box">
      <div class="pin-emblem" aria-hidden="true"><svg viewBox="0 0 24 24"><rect x="4" y="10" width="16" height="11" rx="2.5"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/><circle cx="12" cy="15.5" r="1.3"/></svg></div>
      <h2>Pantalla bloqueada</h2>
      <p>Se ocultaron los datos de pacientes por inactividad.</p>
      <button class="btn btn-primary" id="lockBtn">Continuar</button>
    </div>`;
  document.body.appendChild(el);

  let timer = null;
  const locked = () => !el.hidden;
  // Todo lo que no es la pantalla de bloqueo queda inerte mientras dura: sin
  // foco, sin clics, sin lectores de pantalla. Antes sólo se tapaba con un velo.
  // El panel de paciente y su velo también: están fuera de <main>.
  const shielded = () => ['topbar', 'mainContent', 'patientPanel', 'panelBackdrop'].map(id => document.getElementById(id)).filter(Boolean);

  const lock = () => {
    if (locked()) return;
    el.hidden = false;
    for (const node of shielded()) node.inert = true;
    el.querySelector('#lockBtn').focus();
    readMeta().then(meta => { if (meta) clearKey(); }); // con PIN creado, el disco queda ilegible hasta escribirlo
  };

  const arm = () => {
    clearTimeout(timer);
    if (minutes > 0) timer = setTimeout(lock, minutes * 60_000);
  };

  const unlock = () => {
    el.hidden = true;
    for (const node of shielded()) node.inert = false;
    arm();
  };

  el.querySelector('#lockBtn').addEventListener('click', async () => { await askPin(); unlock(); });
  // While locked, interaction must go through the button — do not re-arm on it
  for (const ev of EVENTS) {
    document.addEventListener(ev, () => { if (!locked()) arm(); }, { capture: true, passive: true });
  }
  // Los atajos globales (⌘K, «/», ←/→ del panel) escuchan en `document` y no
  // saben del bloqueo. Con el velo puesto, una tecla abría la paleta con doce
  // pacientes por encima. Se cortan aquí, en fase de captura, antes de que
  // lleguen a nadie.
  //
  // Se cortan también las que llegan con el foco en el propio botón de
  // desbloqueo: ⌘K desde ahí abría la paleta igual. Sólo pasan las teclas que
  // el botón necesita para operarse.
  document.addEventListener('keydown', e => {
    if (!locked()) return;
    const allowed = el.contains(e.target) && ['Enter', ' ', 'Tab'].includes(e.key) && !e.metaKey && !e.ctrlKey;
    if (!allowed) { e.stopImmediatePropagation(); e.preventDefault(); }
  }, { capture: true });
  // Locking on hide would fire on every tab switch; only re-arm when coming back
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && !locked()) arm();
  });

  arm();
  /** 0 disables the lock; any other value re-arms with the new timeout. */
  const setMinutes = m => { minutes = Number(m) || 0; clearTimeout(timer); if (minutes > 0) arm(); };
  return { lock, unlock, isLocked: locked, setMinutes };
}
