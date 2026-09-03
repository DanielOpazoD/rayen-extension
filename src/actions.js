import { state, setNote, sicsByRun, contacts } from './state.js';
import { saveNote, restoreNote, patientKey } from './notes.js';
import { openPanel } from './patient-panel.js';
import { toast, copyToClipboard, flashOk } from './toast.js';
import { setStatus } from './ui.js';

/** User actions more than one tab triggers. Each one is the single path for its effect. */

let selectTab = null;
export function registerTabs(fn) { selectTab = fn; }
export function showTab(name) { selectTab?.(name); }

/**
 * The only way a note gets written. Undo is what makes the editors safe:
 * nothing asks "are you sure?", the toast holds the door open instead.
 */
export async function writeNote(record, text) {
  const before = record.note ?? '';
  const after  = text.trim();
  if (before === after) return true;
  try {
    await saveNote(record, after);
    setNote(record, after);
    const undo = before
      ? { label: 'Deshacer', onClick: async () => {
            await restoreNote(record, before);
            setNote(record, before);
            toast('Nota restaurada');
          } }
      : null;
    toast(after ? 'Nota guardada' : 'Nota eliminada', { tone: after ? 'ok' : 'info', action: undo });
    return true;
  } catch (err) {
    setStatus(`No se pudo guardar la nota: ${err.message}`, 'err');
    toast('No se pudo guardar la nota', { tone: 'bad' });
    return false;
  }
}

/** Deduped patients in the order the table shows them — for ‹ › and the palette. */
export function patientList() {
  const seen = new Set(), out = [];
  for (const r of (state.rendered.length ? state.rendered : state.allData)) {
    const k = patientKey(r);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(r);
  }
  return out;
}

export function openPatient(record) {
  const list = patientList();
  const key  = patientKey(record);
  const i    = list.findIndex(p => patientKey(p) === key);
  openPanel(record, { allData: state.allData, sics: state.sics, contacts: contacts(), pos: i >= 0 ? { i, n: list.length } : null });
}

export function openPatientById(id) {
  const rec = state.allData.find(p => String(p.id) === String(id));
  if (rec) openPatient(rec);
}

export function openPatientByRun(run) {
  const rec = state.allData.find(p => p.run === run);
  if (rec) openPatient(rec);
  else toast('Ese paciente no tiene atenciones tuyas en el período cargado.', { tone: 'info' });
}

/** Click on a `.copy-run`: confirm in place, fall back to a toast. */
export function copyRun(el) {
  navigator.clipboard.writeText(el.dataset.run)
    .then(() => flashOk(el, '✓ copiado'))
    .catch(() => copyToClipboard(el.dataset.run, 'RUN copiado'));
}

/** Jump to one SIC (by id) or to every SIC of a patient (by RUN). The IC tab listens. */
export function jumpToSIC({ id, run }) {
  showTab('interconsultas');
  const q = id ? String(id) : (sicsByRun().get(run)?.[0]?.paciente.runStr ?? run);
  document.dispatchEvent(new CustomEvent('rayen:goto-sic', { detail: { id: id ? Number(id) : null, q } }));
}
