import { loadPrefs, DEFAULT_PREFS } from './src/cache.js';
import { initPanel, syncNote } from './src/patient-panel.js';
import { initPalette } from './src/palette.js';
import { initLock } from './src/lock.js';
import { $, initTooltips, initTablist, activateOnKey } from './src/dom.js';
import { state, setPrefs, on } from './src/state.js';
import { remeasure } from './src/ui.js';
import { registerTabs, writeNote, addNoteEntry, editNoteEntry, openPatient, patientList } from './src/actions.js';
import { CONFIG } from './src/config.js';
import { patientKey } from './src/notes.js';
import * as loader from './src/loader.js';
import * as ajustes from './src/ajustes.js';
import * as hoy from './src/tabs/hoy.js';
import * as atenciones from './src/tabs/atenciones.js';
import * as pacientes from './src/tabs/pacientes.js';
import * as estadisticas from './src/tabs/estadisticas.js';
import * as interconsultas from './src/tabs/interconsultas.js';
import * as laboratorio from './src/tabs/laboratorio.js';
import * as explorador from './src/tabs/explorador.js';

/**
 * Composition root. Data lives in state.js; each tab wires its own DOM and
 * subscribes to 'data' / 'notes'. Nothing here knows how a tab renders.
 */

const prefs = await loadPrefs().catch(() => ({ ...DEFAULT_PREFS }));
setPrefs({
  refreshMin: Number.isFinite(+prefs.refreshMin) ? +prefs.refreshMin : 15,
  watchEsp:   Array.isArray(prefs.watchEsp) && prefs.watchEsp.length ? prefs.watchEsp : [...CONFIG.watchEspecialidades],
  umbrales:   prefs.umbrales && typeof prefs.umbrales === 'object' ? { ...CONFIG.pendientes, ...prefs.umbrales } : { ...CONFIG.pendientes },
  retentionMonths: Number.isFinite(+prefs.retentionMonths) && +prefs.retentionMonths > 0 ? +prefs.retentionMonths : CONFIG.retentionMonths,
});
state.loadedMonths = prefs.months;

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
