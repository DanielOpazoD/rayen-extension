/**
 * Inactivity lock. There are patient names, RUNs and diagnoses on screen and
 * the machine is shared in practice, so after a few idle minutes the content is
 * blurred behind an overlay until the user comes back.
 *
 * It is a privacy screen, not authentication: it hides the data from whoever
 * walks past, and the real protection remains the OS session.
 */
const EVENTS = ['pointerdown', 'keydown', 'wheel', 'touchstart'];

export function initLock({ minutes = 15 } = {}) {
  const el = document.createElement('div');
  el.id = 'lockScreen';
  el.hidden = true;
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-modal', 'true');
  el.innerHTML = `
    <div class="lock-box">
      <span class="mark" aria-hidden="true"></span>
      <h2>Pantalla bloqueada</h2>
      <p>Se ocultaron los datos de pacientes por inactividad.</p>
      <button class="btn btn-primary" id="lockBtn">Continuar</button>
    </div>`;
  document.body.appendChild(el);

  let timer = null;
  const locked = () => !el.hidden;

  const lock = () => {
    if (locked()) return;
    el.hidden = false;
    el.querySelector('#lockBtn').focus();
  };

  const arm = () => {
    clearTimeout(timer);
    if (minutes > 0) timer = setTimeout(lock, minutes * 60_000);
  };

  const unlock = () => {
    el.hidden = true;
    arm();
  };

  el.querySelector('#lockBtn').addEventListener('click', unlock);
  // While locked, interaction must go through the button — do not re-arm on it
  for (const ev of EVENTS) {
    document.addEventListener(ev, () => { if (!locked()) arm(); }, { capture: true, passive: true });
  }
  // Locking on hide would fire on every tab switch; only re-arm when coming back
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && !locked()) arm();
  });

  arm();
  /** 0 disables the lock; any other value re-arms with the new timeout. */
  const setMinutes = m => { minutes = Number(m) || 0; clearTimeout(timer); if (minutes > 0) arm(); };
  return { lock, unlock, isLocked: locked, setMinutes };
}
