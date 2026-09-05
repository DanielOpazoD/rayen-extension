import { loadPrefs, DEFAULT_PREFS } from './src/io/cache.js';
import { applyNetPrefs } from './src/io/http.js';
import { initPanel, syncNote } from './src/ui/patient-panel.js';
import { initPalette } from './src/ui/palette.js';
import { initLock } from './src/ui/lock.js';
import { $, initTooltips, initTablist, activateOnKey } from './src/ui/dom.js';
import { state, setPrefs, on, setLoadedMonths } from './src/io/state.js';
import { remeasure } from './src/ui/ui.js';
import { registerTabs, writeNote, addNoteEntry, editNoteEntry, openPatient, patientList } from './src/ui/actions.js';
import { CONFIG } from './src/core/config.js';
import { patientKey } from './src/io/notes.js';
import * as loader from './src/ui/loader.js';
import * as ajustes from './src/ui/ajustes.js';
import * as hoy from './src/ui/tabs/hoy.js';
import * as atenciones from './src/ui/tabs/atenciones.js';
import * as pacientes from './src/ui/tabs/pacientes.js';
import * as estadisticas from './src/ui/tabs/estadisticas.js';
import * as interconsultas from './src/ui/tabs/interconsultas.js';
import * as laboratorio from './src/ui/tabs/laboratorio.js';
import * as explorador from './src/ui/tabs/explorador.js';

/**
 * Composition root. Data lives in state.js; each tab wires its own DOM and
 * subscribes to 'data' / 'notes'. Nothing here knows how a tab renders.
 */

const prefs = await loadPrefs().catch(() => ({ ...DEFAULT_PREFS }));
setPrefs({
  refreshMin: Number.isFinite(+prefs.refreshMin) ? +prefs.refreshMin : 15,
  watchEsp:   Array.isArray(prefs.watchEsp) && prefs.watchEsp.length ? prefs.watchEsp : [...CONFIG.watchEspecialidades],
  umbrales:   prefs.umbrales && typeof prefs.umbrales === 'object' ? { ...CONFIG.pendientes, ...prefs.umbrales } : { ...CONFIG.pendientes },
  netTimeoutSec: Number.isFinite(+prefs.netTimeoutSec) && +prefs.netTimeoutSec >= 5 ? +prefs.netTimeoutSec : 20,
  retentionMonths: Number.isFinite(+prefs.retentionMonths) && +prefs.retentionMonths > 0 ? +prefs.retentionMonths : CONFIG.retentionMonths,
});
setLoadedMonths(prefs.months);
applyNetPrefs(state.prefs);

// Tabs: click or ←/→ (WAI-ARIA tablist, roving tabindex)
const showTab = initTablist(document.querySelector('.tabs'), name => {
  document.querySelectorAll('.tab-pane').forEach(p => p.classList.toggle('active', p.id === `tab-${name}`));
  if (name === 'hoy')            hoy.refresh();
  if (name === 'pacientes')      pacientes.onShow();
  if (name === 'interconsultas') interconsultas.ensureSICs();
  if (name === 'laboratorio')    laboratorio.onShow();
  if (name === 'explorador')     explorador.renderExtras();
  remeasure();
}, 'tab');
registerTabs(showTab);

loader.init(prefs);
hoy.init();
atenciones.init(prefs);
pacientes.init();
estadisticas.init();
interconsultas.init();
laboratorio.init();
explorador.init();

const lockMin = Number.isFinite(+prefs.lockMin) ? +prefs.lockMin : 15;
const lock = initLock({ minutes: lockMin }); // patient data on screen; blur it when idle
lock.minutes = lockMin;
ajustes.init({ lock });

initPanel({
  saveNote: writeNote,                      // the panel has no path of its own
  addNote: addNoteEntry, editNote: editNoteEntry, // diario de notas
  onNavigate(dir, current) {                // ‹ › and ←/→ walk the table's order
    const list = patientList();
    const i    = list.findIndex(p => patientKey(p) === patientKey(current));
    const next = list[i + dir];
    if (next) openPatient(next);
  },
  labItems: run => laboratorio.labItemsForRun(run), // el informe con IA ve el laboratorio ya analizado
  onLabSearch(run, sexo) {                  // Lab button → switch tab and search
    showTab('laboratorio');
    laboratorio.searchFromPatient(run, sexo);
  },
});
on('notes', syncNote);                      // undo from a toast must reach the open panel
initPalette(patientList, openPatient);
initTooltips();
activateOnKey($('mainTable'));    // Enter/Space on sortable headers, patient names, SIC lines
activateOnKey($('pacBody'));      // Enter/Space on a patient row or its RUN
activateOnKey($('sicBody'));      // Enter/Space expands a SIC row
activateOnKey($('todayContent')); // Enter/Space opens a patient from Hoy
if (prefs.startTab && prefs.startTab !== 'hoy') showTab(prefs.startTab);
