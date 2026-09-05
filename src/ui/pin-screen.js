/**
 * Pantalla de PIN (ADR 0001): al arrancar, crea el PIN la primera vez o lo
 * pide; tras el bloqueo por inactividad, lo vuelve a pedir. Mientras está
 * puesta, nada más es alcanzable. En el arnés (`__RAYEN_DEV_PLAIN`) no aparece.
 */
import { targetOf } from './dom.js';
import { readMeta, createPin, unlockWith, migratePlain, pinValido, hasKey } from '../io/crypto-store.js';

const LOCK = '<svg viewBox="0 0 24 24"><rect x="4" y="10" width="16" height="11" rx="2.5"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/><circle cx="12" cy="15.5" r="1.3"/></svg>';
const SLOTS = Array.from({ length: 6 }, () => '<span class="pin-slot"></span>').join('');

/** Seis casillas que reflejan cuántos dígitos hay y cuál es la siguiente; el input real va encima, invisible. */
function bindSlots(input) {
  const slots = [...input.parentElement.querySelectorAll('.pin-slot')];
  const paint = () => {
    const n = input.value.length, focused = document.activeElement === input;
    slots.forEach((s, i) => { s.classList.toggle('filled', i < n); s.classList.toggle('active', focused && i === Math.min(n, 5)); });
  };
  input.addEventListener('input', () => { input.value = input.value.replace(/\D/g, '').slice(0, 6); paint(); input.dispatchEvent(new CustomEvent('pin-change', { bubbles: true })); });
  input.addEventListener('focus', paint); input.addEventListener('blur', paint);
  paint();
}

let el = null;
function ensureEl() {
  if (el) return el;
  el = document.createElement('div');
  el.id = 'pinScreen';
  el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); el.setAttribute('aria-labelledby', 'pinTitle');
  el.innerHTML = `
    <form class="lock-box pin-box" id="pinForm" autocomplete="off" novalidate>
      <div class="pin-emblem" aria-hidden="true">${LOCK}</div>
      <div class="pin-brand">Rayen Atenciones · Hospital Hanga Roa</div>
      <h2 id="pinTitle"></h2>
      <p id="pinText"></p>
      <label class="pin-field" for="pinInput"><span class="pin-label">PIN</span>
        <span class="pin-slots" data-for="pinInput">${SLOTS}<input id="pinInput" type="password" inputmode="numeric" pattern="[0-9]{6}" maxlength="6" autocomplete="off" aria-describedby="pinMsg"></span></label>
      <label class="pin-field" id="pinConfirmWrap" for="pinConfirm" hidden><span class="pin-label">Repite el PIN</span>
        <span class="pin-slots" data-for="pinConfirm">${SLOTS}<input id="pinConfirm" type="password" inputmode="numeric" pattern="[0-9]{6}" maxlength="6" autocomplete="off"></span></label>
      <div class="pin-msg" id="pinMsg" role="alert"></div>
      <button class="btn btn-primary pin-btn" id="pinBtn" type="submit"></button>
      <div class="pin-foot" id="pinFoot"></div>
    </form>`;
  for (const input of el.querySelectorAll('.pin-slots input')) bindSlots(input);
  document.body.appendChild(el);
  return el;
}

/** Muestra la pantalla y resuelve cuando la clave está en memoria. */
function pedir({ crear }) {
  const box = ensureEl();
  box.hidden = false;
  const $ = id => box.querySelector('#' + id);
  $('pinTitle').textContent = crear ? 'Crea un PIN de seis dígitos' : 'Desbloquear';
  $('pinText').textContent = crear
    ? 'Los datos de pacientes se guardan cifrados con este PIN en este perfil de Chrome. Si lo olvidas, se pierden la caché y tus notas: no hay recuperación.'
    : 'Los datos están cifrados. Escribe tu PIN para continuar.';
  $('pinConfirmWrap').hidden = !crear;
  $('pinBtn').textContent = crear ? 'Crear PIN y continuar' : 'Desbloquear';
  $('pinFoot').textContent = crear ? 'Seis dígitos. Se pedirá al abrir la extensión y tras el bloqueo por inactividad.' : 'Cifrado en este perfil de Chrome · ADR 0001';
  $('pinMsg').textContent = ''; $('pinMsg').classList.remove('info'); $('pinInput').value = ''; $('pinConfirm').value = '';
  for (const i of [$('pinInput'), $('pinConfirm')]) i.dispatchEvent(new Event('input'));
  const shielded = () => ['topbar', 'mainContent', 'patientPanel', 'panelBackdrop', 'lockScreen'].map(id => document.getElementById(id)).filter(Boolean);
  for (const n of shielded()) n.inert = true;
  setTimeout(() => $('pinInput').focus(), 0);
  return new Promise(resolve => {
    const form = $('pinForm');
    // Al sexto dígito: crear → pasa a la confirmación; desbloquear → envía solo.
    const onChange = e => {
      if (targetOf(e).value.length !== 6 || $('pinBtn').disabled) return;
      if (crear && targetOf(e) === $('pinInput')) $('pinConfirm').focus();
      else if (!crear) form.requestSubmit();
    };
    const onSubmit = async e => {
      e.preventDefault();
      const pin = $('pinInput').value.trim();
      if (!pinValido(pin)) { $('pinMsg').textContent = 'Seis dígitos, sin letras.'; return; }
      if (crear && pin !== $('pinConfirm').value.trim()) { $('pinMsg').textContent = 'Los dos PIN no coinciden.'; return; }
      $('pinBtn').disabled = true; $('pinMsg').classList.add('info'); $('pinMsg').textContent = crear ? 'Cifrando…' : 'Comprobando…';
      try {
        if (crear) { await createPin(pin); await migratePlain(); }
        else await unlockWith(pin);
        form.removeEventListener('submit', onSubmit);
        form.removeEventListener('pin-change', onChange);
        box.hidden = true;
        for (const n of shielded()) n.inert = false;
        resolve();
      } catch (err) {
        $('pinMsg').classList.remove('info');
        $('pinMsg').textContent = err?.name === 'PinError' ? 'PIN incorrecto.' : `No se pudo continuar: ${err?.message ?? err}`;
        $('pinInput').value = ''; $('pinInput').dispatchEvent(new Event('input')); $('pinInput').focus();
        form.classList.remove('shake'); void form.offsetWidth; form.classList.add('shake');
      } finally { $('pinBtn').disabled = false; }
    };
    form.addEventListener('submit', onSubmit);
    form.addEventListener('pin-change', onChange);
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
