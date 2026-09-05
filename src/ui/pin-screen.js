/**
 * Pantalla de PIN (ADR 0001): al arrancar, crea el PIN la primera vez o lo
 * pide; tras el bloqueo por inactividad, lo vuelve a pedir. Mientras está
 * puesta, nada más es alcanzable. En el arnés (`__RAYEN_DEV_PLAIN`) no aparece.
 */
import { readMeta, createPin, unlockWith, migratePlain, pinValido, hasKey } from '../io/crypto-store.js';

let el = null;
function ensureEl() {
  if (el) return el;
  el = document.createElement('div');
  el.id = 'pinScreen';
  el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); el.setAttribute('aria-labelledby', 'pinTitle');
  el.innerHTML = `
    <form class="lock-box pin-box" id="pinForm" autocomplete="off">
      <span class="mark" aria-hidden="true"></span>
      <h2 id="pinTitle"></h2>
      <p id="pinText"></p>
      <label class="pin-field">PIN <input id="pinInput" type="password" inputmode="numeric" pattern="[0-9]{6}" maxlength="6" autocomplete="off" aria-describedby="pinMsg"></label>
      <label class="pin-field" id="pinConfirmWrap" hidden>Repite el PIN <input id="pinConfirm" type="password" inputmode="numeric" pattern="[0-9]{6}" maxlength="6" autocomplete="off"></label>
      <div class="pin-msg" id="pinMsg" role="alert"></div>
      <button class="btn btn-primary" id="pinBtn" type="submit"></button>
    </form>`;
  document.body.appendChild(el);
  return el;
}

/** Muestra la pantalla y resuelve cuando la clave está en memoria. */
function pedir({ crear }) {
  const box = ensureEl();
  box.hidden = false;
  const $ = id => box.querySelector('#' + id);
  $('pinTitle').textContent = crear ? 'Crea un PIN de seis dígitos' : 'PIN';
  $('pinText').textContent = crear
    ? 'Los datos de pacientes se guardan cifrados con este PIN en este perfil de Chrome. Si lo olvidas, se pierden la caché y tus notas: no hay recuperación.'
    : 'Los datos están cifrados. Escribe tu PIN para continuar.';
  $('pinConfirmWrap').hidden = !crear;
  $('pinBtn').textContent = crear ? 'Crear PIN y continuar' : 'Desbloquear';
  $('pinMsg').textContent = ''; $('pinInput').value = ''; $('pinConfirm').value = '';
  const shielded = () => ['topbar', 'mainContent', 'patientPanel', 'panelBackdrop', 'lockScreen'].map(id => document.getElementById(id)).filter(Boolean);
  for (const n of shielded()) n.inert = true;
  setTimeout(() => $('pinInput').focus(), 0);
  return new Promise(resolve => {
    const form = $('pinForm');
    const onSubmit = async e => {
      e.preventDefault();
      const pin = $('pinInput').value.trim();
      if (!pinValido(pin)) { $('pinMsg').textContent = 'Seis dígitos, sin letras.'; return; }
      if (crear && pin !== $('pinConfirm').value.trim()) { $('pinMsg').textContent = 'Los dos PIN no coinciden.'; return; }
      $('pinBtn').disabled = true; $('pinMsg').textContent = crear ? 'Cifrando…' : 'Comprobando…';
      try {
        if (crear) { await createPin(pin); await migratePlain(); }
        else await unlockWith(pin);
        form.removeEventListener('submit', onSubmit);
        box.hidden = true;
        for (const n of shielded()) n.inert = false;
        resolve();
      } catch (err) {
        $('pinMsg').textContent = err?.name === 'PinError' ? 'PIN incorrecto.' : `No se pudo continuar: ${err?.message ?? err}`;
        $('pinInput').value = ''; $('pinInput').focus();
      } finally { $('pinBtn').disabled = false; }
    };
    form.addEventListener('submit', onSubmit);
  });
}

/** Al arrancar: crea el PIN si no existe, o lo pide. */
export async function ensurePin() {
  if (globalThis.__RAYEN_DEV_PLAIN) return;
  const meta = await readMeta();
  await pedir({ crear: !meta });
}

/** Tras el bloqueo: si hay cifrado, pide el PIN; si no (arnés), no hace nada. */
export async function askPin() {
  if (hasKey()) return;
  const meta = await readMeta();
  if (!meta) return;
  await pedir({ crear: false });
}
