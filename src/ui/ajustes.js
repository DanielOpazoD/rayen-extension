import { changePin, readMeta } from '../io/crypto-store.js';
import { toast } from './toast.js';
import { applyNetPrefs } from '../io/http.js';
import { CONFIG } from '../core/config.js';
import { humanError } from '../core/errors.js';
import { savePrefs, clearAllCaches, clearEverything } from '../io/cache.js';
import { diffWatched } from '../io/watch.js';
import { esc, $, targetOf, closestOf } from './dom.js';
import { state, setData, setPrefs, on } from '../io/state.js';
import { initMenu, setStatus } from './ui.js';
import { armRefresh, cargarFuturas, handleFetch } from './loader.js';
import { getToken } from '../io/auth.js';
import { reconciliarCitas } from '../io/historial.js';
import { hisConectar, hisOlvidar, hisCreds } from '../io/his-session.js';

/** Preferences and local-data controls. */

let lockCtl = null;

function buildWatchList() {
  const { watchEsp } = state.prefs;
  const esp = [...new Set([...state.sics.map(s => s.especialidad), ...watchEsp])].filter(Boolean).sort();
  if (!esp.length) return;
  $('watchList').innerHTML = esp.map(e =>
    `<label class="${watchEsp.includes(e) ? 'on' : ''}"><input type="checkbox" data-esp="${esc(e)}" ${watchEsp.includes(e) ? 'checked' : ''}> ${esc(e)}</label>`).join('');
}

function fillSettings() {
  const { refreshMin, umbrales } = state.prefs;
  $('setRefresh').value = String(refreshMin);
  $('setLock').value    = String(lockCtl?.minutes ?? 15);
  $('setRetention').value = String(state.prefs.retentionMonths ?? CONFIG.retentionMonths);
  $('setAutoLoad').checked = state.prefs.autoLoad !== false;
  $('setNetTimeout').value = String(state.prefs.netTimeoutSec ?? 20);
  $('setFuturas').value = String(state.prefs.futurasDias ?? CONFIG.futurasDias);
  $('setNueva').value = String(umbrales.nuevaDias);
  $('setCita').value = String(umbrales.citaDias); $('setControl').value = String(umbrales.controlDias);
}

/** Login del HIS de Hanga Roa en Preferencias: guarda la credencial cifrada e inicia sesión. */
async function initHisLogin() {
  const form = $('hisForm');
  if (!form) return;
  const status = $('hisStatus'), user = $('hisUser'), pass = $('hisPass'), connect = $('hisConnect'), forget = $('hisForget');
  const pintar = (msg, tone = '') => { status.textContent = msg; status.className = `his-status ${tone}`; };

  try {
    const creds = await hisCreds();
    if (creds.user) { user.value = creds.user; forget.hidden = false; pintar(`Guardado: ${creds.user}. Se verifica al abrir un paciente en la red del hospital.`, 'ok'); }
  } catch { /* sin prefs aún */ }

  form.addEventListener('submit', async e => {
    e.preventDefault();
    const u = user.value.trim(), p = pass.value;
    if (!u || !p) { pintar('Escribe el RUT (sin DV) y la contraseña.', 'warn'); return; }
    connect.disabled = true;
    pintar('Conectando al HIS…');
    try {
      const r = await hisConectar(u, p);
      pass.value = '';
      if (r.ok) { pintar('Conectado al HIS.', 'ok'); forget.hidden = false; }
      else pintar(r.error || 'no se pudo conectar', 'bad');
    } catch (err) {
      pintar(`No se pudo conectar: ${humanError(err, 'HIS')}`, 'bad');
    } finally { connect.disabled = false; }
  });

  forget.addEventListener('click', async () => {
    await hisOlvidar();
    user.value = ''; pass.value = ''; forget.hidden = true;
    pintar('Credenciales del HIS olvidadas.');
  });
}

export function init({ lock }) {
  lockCtl = lock;
  $('btnReconciliar').addEventListener('click', async () => {
    const btn = $('btnReconciliar');
    btn.disabled = true;
    setStatus('Reconciliando fechas de atención con Eloisa…', 'idle');
    try {
      const token = await getToken();
      if (!token) { setStatus('Sin sesión en Eloisa: inicia sesión y vuelve a intentarlo.', 'warn'); return; }
      const { revisadas, resueltas } = await reconciliarCitas(token);
      if (resueltas) await handleFetch();
      setStatus(revisadas
        ? `Reconciliación: ${resueltas} de ${revisadas} atenciones quedaron con su cita exacta.`
        : 'Reconciliación: no había atenciones pendientes de resolver.', resueltas || !revisadas ? 'ok' : 'warn');
    } catch (err) {
      setStatus(`No se pudo reconciliar. ${humanError(err, 'Eloisa')}`, 'err');
    } finally { btn.disabled = false; }
  });
  $('pinChangeForm').addEventListener('submit', async e => {
    e.preventDefault();
    if (!(await readMeta())) { toast('Sin cifrado en este modo (arnés): no hay PIN que cambiar.', { tone: 'info' }); return; }
    const [viejo, nuevo, nuevo2] = ['pinOld', 'pinNew', 'pinNew2'].map(id => $(id).value.trim());
    if (nuevo !== nuevo2) { toast('Los dos PIN nuevos no coinciden.', { tone: 'bad' }); return; }
    try { await changePin(viejo, nuevo); ['pinOld', 'pinNew', 'pinNew2'].forEach(id => { $(id).value = ''; }); toast('PIN cambiado: todo volvió a cifrarse.'); }
    catch (err) { toast(err?.name === 'PinError' ? 'El PIN actual no es correcto.' : `No se pudo cambiar el PIN: ${err?.message ?? err}`, { tone: 'bad' }); }
  });
  initMenu('btnSettings', 'settingsMenu', 'settingsWrap', () => { fillSettings(); buildWatchList(); });
  initHisLogin();
  // Bajo 1100 px la cabecera pliega período, ficha, exportar y preferencias tras «⋯».
  initMenu('btnMore', 'hdrMore', 'hdrWrap');

  $('settingsMenu').addEventListener('change', async e => {
    const t = targetOf(e);
    if (t.id === 'setRefresh') {
      setPrefs({ refreshMin: Number(t.value) });
      if (state.allData.length) armRefresh();
      await savePrefs({ refreshMin: state.prefs.refreshMin });
    }
    if (t.id === 'setLock') {
      const m = Number(t.value);
      lockCtl?.setMinutes(m);
      if (lockCtl) lockCtl.minutes = m;
      await savePrefs({ lockMin: m });
    }
    if (t.id === 'setStartTab') await savePrefs({ startTab: t.value });
    if (t.id === 'setAutoLoad') { setPrefs({ autoLoad: t.checked }); await savePrefs({ autoLoad: t.checked }); }
    if (t.id === 'setFuturas') {
      const dias = Number(t.value);
      setPrefs({ futurasDias: dias });
      await savePrefs({ futurasDias: dias });
      // Se aplica al momento: quitarlas vacía el calendario, ponerlas lo llena sin recargar la agenda.
      await cargarFuturas({ force: true });
    }
    if (t.id === 'setNetTimeout') {
      const sec = Number(t.value) || 20;
      setPrefs({ netTimeoutSec: sec });
      applyNetPrefs(state.prefs);
      await savePrefs({ netTimeoutSec: sec });
    }
    if (t.id === 'setRetention') {
      const m = Number(t.value) || CONFIG.retentionMonths;
      setPrefs({ retentionMonths: m });
      await savePrefs({ retentionMonths: m });
    }
    if (['setNueva', 'setCita', 'setControl'].includes(t.id)) {
      const umbrales = { nuevaDias: +$('setNueva').value || 1, citaDias: +$('setCita').value || 0, controlDias: +$('setControl').value || 0 };
      setPrefs({ umbrales }, { rerender: true });
      await savePrefs({ umbrales });
    }
    const cb = /** @type {HTMLInputElement|null} */ (t.closest('input[data-esp]'));
    if (cb) {
      const esp = cb.dataset.esp, cur = state.prefs.watchEsp;
      const watchEsp = cb.checked ? [...new Set([...cur, esp])] : cur.filter(x => x !== esp);
      cb.closest('label').classList.toggle('on', cb.checked);
      setPrefs({ watchEsp });
      await savePrefs({ watchEsp });
      let novedades = null;
      try { novedades = await diffWatched(state.sics, watchEsp); } catch { novedades = null; }
      setData({ novedades });
    }
  });

  $('clearMenu').addEventListener('click', async e => {
    const b = closestOf(e, 'button[data-clear]');
    if (!b) return;
    const all = b.dataset.clear === 'all';
    const msg = all
      ? '¿Borrar TODOS los datos de la extensión?\n\nAgenda, ficha clínica, interconsultas, NOTAS, preferencias y el token de sesión. No se puede deshacer.'
      : '¿Borrar el caché local (agenda, ficha clínica e interconsultas)?\n\nLas notas y preferencias se conservan.';
    if (!confirm(msg)) return;
    if (all && !confirm('Última confirmación: se borrarán también tus notas por paciente. ¿Continuar?')) return;
    try {
      if (all) await clearEverything(); else await clearAllCaches();
      $('settingsMenu').classList.remove('open');
      $('btnSettings').setAttribute('aria-expanded', 'false');
      setData({ allData: [], team: {}, sics: [], novedades: null });
      setStatus(all ? 'Todos los datos borrados.' : 'Caché borrado. Pulsa Actualizar para recargar desde la red.', 'idle');
    } catch (err) {
      setStatus(`No se pudo borrar. ${humanError(err, 'Chrome')}`, 'err');
    }
  });

  on('data', () => { if (state.allData.length) $('clearWrap').style.display = ''; });
}
