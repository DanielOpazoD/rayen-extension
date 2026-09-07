import { humanError } from '../core/errors.js';
import { formatRun } from '../core/parser.js';
import { recordDesdeMaster } from '../core/ficha.js';
import { getToken } from '../io/auth.js';
import { buscarPacientePorRun } from '../io/ficha-load.js';
import { state, setNote, sicsByRun, contacts } from '../io/state.js';
import { saveNote, restoreNote, patientKey, addNote, updateNote, attachNotes } from '../io/notes.js';
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
    const notas = await saveNote(record, after);
    setNote(record, notas[0]?.text ?? '', notas);
    const undo = before
      ? { label: 'Deshacer', onClick: async () => {
            const restored = await restoreNote(record, before);
            setNote(record, restored[0]?.text ?? '', restored);
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

/** Diario: añade una nota con fecha. */
export async function addNoteEntry(record, text) {
  if (!String(text ?? '').trim()) return false;
  try {
    const notas = await addNote(record, text);
    setNote(record, notas[0]?.text ?? '', notas);
    toast('Nota añadida');
    return true;
  } catch (err) {
    toast(`No se pudo guardar la nota. ${humanError(err, 'Chrome')}`, { tone: 'bad' });
    return false;
  }
}

/** Diario: edita (o elimina, si queda vacía) la entrada `at`. */
export async function editNoteEntry(record, at, text) {
  try {
    const notas = await updateNote(record, at, text);
    setNote(record, notas[0]?.text ?? '', notas);
    toast(String(text ?? '').trim() ? 'Nota actualizada' : 'Nota eliminada', { tone: 'ok' });
    return true;
  } catch (err) {
    toast(`No se pudo guardar la nota. ${humanError(err, 'Chrome')}`, { tone: 'bad' });
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
  // También entre las citas futuras: sus tarjetas se abren igual que las de una jornada pasada.
  const rec = state.allData.find(p => String(p.id) === String(id)) ?? state.futuras.find(p => String(p.id) === String(id));
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
/**
 * Lleva a la pestaña Interconsultas y muestra una solicitud (por id) o las de un paciente (por RUN).
 * @param {object} q
 * @param {string|number} [q.id]
 * @param {string} [q.run]
 */
export function jumpToSIC({ id, run }) {
  showTab('interconsultas');
  const q = id ? String(id) : (sicsByRun().get(run)?.[0]?.paciente.runStr ?? run);
  document.dispatchEvent(new CustomEvent('rayen:goto-sic', { detail: { id: id ? Number(id) : null, q } }));
}

/**
 * Abre la ficha de cualquier paciente del nodo por su RUN, esté o no entre mis
 * atenciones. El panel carga después la ficha completa como con cualquier otro.
 * No lanza: devuelve el mensaje que la pestaña muestra junto al campo.
 * @param {string} entrada  lo que se escribió, con o sin puntos y guion
 * @returns {Promise<{ ok: boolean, mensaje: string }>}
 */
export async function abrirFichaPorRun(entrada) {
  const { run, runStr, dvOk } = formatRun(entrada);
  if (!run) return { ok: false, mensaje: 'Escribe un RUN completo, con su dígito verificador.' };
  // Sin esta comprobación, un dígito mal tecleado se vería como «no existe».
  if (!dvOk) return { ok: false, mensaje: `${runStr} no cuadra con su dígito verificador.` };
  let token = null;
  try { token = await getToken(); } catch { /* fuera de la extensión */ }
  if (!token) return { ok: false, mensaje: 'Sin sesión en Eloisa: inicia sesión y vuelve a intentarlo.' };
  try {
    const master = await buscarPacientePorRun(token, run);
    if (!master) return { ok: false, mensaje: `Eloisa no devolvió a nadie con RUN ${runStr} en este nodo.` };
    // Las notas se traen antes de abrir: un panel con la nota vacía se guardaría encima de la que ya existe.
    const [record] = await attachNotes([recordDesdeMaster(master)]);
    openPanel(record, { allData: state.allData, sics: state.sics, contacts: contacts() });
    return { ok: true, mensaje: '' };
  } catch (err) {
    return { ok: false, mensaje: humanError(err, 'Eloisa') };
  }
}
