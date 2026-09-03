import { CONFIG } from './config.js';
import { contactsFromSICs } from './sic.js';
import { computePendientes } from './pendientes.js';
import { patientKey } from './notes.js';

/**
 * The one place data lives. Tabs read from here and subscribe to two events:
 *   'data'   — allData / team / sics / prefs that affect them changed
 *   'notes'  — one patient's note changed (detail: the record)
 * Anything that can be computed from the data is a memoized function below,
 * not a second copy that could drift.
 */
export const state = {
  allData: [],
  team: {},
  sics: [],
  novedades: null,         // change memory for the watched specialties
  rendered: [],            // the atenciones table's current order (‹ ›, palette)
  loadedMonths: 6,
  prefs: {
    watchEsp: [...CONFIG.watchEspecialidades],
    umbrales: { ...CONFIG.pendientes },
    refreshMin: 15,
  },
  version: 0,
};

const bus = new EventTarget();
export function on(evt, fn)      { bus.addEventListener(evt, e => fn(e.detail)); }
export function emit(evt, detail) { bus.dispatchEvent(new CustomEvent(evt, { detail })); }

/** Replaces data wholesale and tells every tab. Pass only what changed. */
export function setData({ allData, team, sics, novedades } = {}) {
  if (allData)   state.allData = allData;
  if (team)      state.team = team;
  if (sics)      state.sics = sics;
  if (novedades !== undefined) state.novedades = novedades;
  state.version++;
  emit('data');
}

/** Prefs that feed a derived value (umbrales, watchEsp) must re-render; the rest just persist. */
export function setPrefs(patch, { rerender = false } = {}) {
  Object.assign(state.prefs, patch);
  state.version++;
  if (rerender) emit('data');
}

/** Same note on every row of that patient, then one event. */
export function setNote(record, text) {
  const key = patientKey(record);
  for (const p of state.allData) if (patientKey(p) === key) p.note = text;
  record.note = text;
  state.version++;
  emit('notes', record);
}

function memo(fn) {
  let at = -1, val;
  return () => { if (at !== state.version) { val = fn(); at = state.version; } return val; };
}

const sicsById  = memo(() => new Map(state.sics.map(s => [s.id, s])));
export const sicsByRun = memo(() => {
  const m = new Map();
  for (const s of state.sics) {
    if (!s.paciente.run) continue;
    if (!m.has(s.paciente.run)) m.set(s.paciente.run, []);
    m.get(s.paciente.run).push(s);
  }
  return m;
});
export const contacts   = memo(() => contactsFromSICs(state.sics));
export const pendientes = memo(() => state.allData.length
  ? computePendientes(state.allData, state.sics, { umbrales: state.prefs.umbrales }) : []);

/** What table.js and stats.js need to resolve a record's SICs. */
export const tableCtx = () => ({ sicsById: sicsById(), sicsByRun: sicsByRun(), officerId: CONFIG.officerId });
