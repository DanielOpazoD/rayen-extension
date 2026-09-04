import { CONFIG } from '../core/config.js';
import { storageGet, storageSet } from './cache.js';

/**
 * Notas clínicas por paciente, como diario: cada entrada con fecha, editable.
 * En almacenamiento: `patientKey → { entries: [{ at, text }] }`, la más nueva
 * primero. Las notas antiguas (un texto suelto) se leen como una sola entrada
 * sin fecha. Para el resto de la aplicación, `record.note` sigue siendo la
 * última nota y `record.notas` el diario completo.
 */

/** @returns {Promise<Record<string, {entries: Array<{at: string|null, text: string}>}|string>>} */
async function allNotes() {
  return (await storageGet(CONFIG.notesKey)) ?? {};
}

const toEntries = value => {
  if (!value) return [];
  if (typeof value === 'string') return value.trim() ? [{ at: null, text: value.trim() }] : [];
  return Array.isArray(value.entries) ? value.entries.filter(e => e && String(e.text || '').trim()) : [];
};

/**
 * Stable key for a patient: the RUN (with DV) when known, otherwise
 * surname + DOB. Exported so the panel and the notes agree.
 */
export function patientKey(record) {
  if (record.run) return `run_${record.run}`;
  return `${record.ap || record.nombre}|${record.am}|${record.dob}`.toLowerCase();
}

async function writeEntries(key, entries) {
  const notes = await allNotes();
  if (entries.length) notes[key] = { entries };
  else delete notes[key];
  await storageSet(CONFIG.notesKey, notes);
  return entries;
}

/** Diario del paciente, la entrada más nueva primero. */
export async function noteEntries(record) {
  return toEntries((await allNotes())[patientKey(record)]);
}

/**
 * Reemplaza el texto de la última nota (o la crea si no hay). Es lo que usa la
 * celda Notas de la tabla y el deshacer; vacío elimina esa última nota.
 * @returns {Promise<Array>} el diario actualizado
 */
export async function saveNote(record, text) {
  const key = patientKey(record);
  const entries = toEntries((await allNotes())[key]);
  const t = String(text ?? '').trim();
  if (!t) return writeEntries(key, entries.slice(1));
  if (entries.length) entries[0] = { ...entries[0], text: t };
  else entries.unshift({ at: new Date().toISOString(), text: t });
  return writeEntries(key, entries);
}

/** Añade una entrada nueva con fecha; devuelve el diario. */
export async function addNote(record, text, at = new Date().toISOString()) {
  const t = String(text ?? '').trim();
  const key = patientKey(record);
  const entries = toEntries((await allNotes())[key]);
  if (!t) return entries;
  return writeEntries(key, [{ at, text: t }, ...entries]);
}

/** Edita la entrada `at` (vacío la elimina); devuelve el diario. */
export async function updateNote(record, at, text) {
  const key = patientKey(record);
  const entries = toEntries((await allNotes())[key]);
  const t = String(text ?? '').trim();
  const i = entries.findIndex(e => (e.at ?? null) === (at ?? null));
  if (i < 0) return entries;
  if (!t) entries.splice(i, 1);
  else entries[i] = { ...entries[i], text: t };
  return writeEntries(key, entries);
}

/**
 * Restores a previous note verbatim. Used by the undo offer, so a deletion is
 * never final until the toast is gone.
 */
export async function restoreNote(record, text) {
  return saveNote(record, text);
}

/** Attaches `note` (la última) and `notas` (el diario) to each record. */
export async function attachNotes(records) {
  const notes = await allNotes();
  return records.map(r => {
    const notas = toEntries(notes[patientKey(r)]);
    return { ...r, note: notas[0]?.text ?? '', notas };
  });
}
