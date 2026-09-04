import { CONFIG } from '../core/config.js';
import { humanError } from '../core/errors.js';
import { savePrefs, clearAllCaches, clearEverything } from '../io/cache.js';
import { diffWatched } from '../io/watch.js';
import { esc, $ } from './dom.js';
import { state, setData, setPrefs, on } from '../io/state.js';
import { initMenu, setStatus } from './ui.js';
import { armRefresh } from './loader.js';

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
  $('setNueva').value = umbrales.nuevaDias;
  $('setCita').value = umbrales.citaDias; $('setControl').value = umbrales.controlDias;
}

export function init({ lock }) {
  lockCtl = lock;
  initMenu('btnSettings', 'settingsMenu', 'settingsWrap', () => { fillSettings(); buildWatchList(); });
  // Bajo 1100 px la cabecera pliega período, ficha, exportar y preferencias tras «⋯».
  initMenu('btnMore', 'hdrMore', 'hdrWrap');

  $('settingsMenu').addEventListener('change', async e => {
    const t = e.target;
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
    const cb = t.closest('input[data-esp]');
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
    const b = e.target.closest('button[data-clear]');
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
