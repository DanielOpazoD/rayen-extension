import { CONFIG } from './config.js';
import { storageGet, storageSet } from './cache.js';

/** @returns {Promise<Record<string, string>>} map of patientKey → note text */
async function allNotes() {
  return (await storageGet(CONFIG.notesKey)) ?? {};
}

/**
 * Stable key for a patient: the RUN (with DV) when known, otherwise
 * surname + DOB. Exported so the panel and the notes agree.
 */
export function patientKey(record) {
  if (record.run) return `run_${record.run}`;
  return `${record.ap || record.nombre}|${record.am}|${record.dob}`.toLowerCase();
}

/**
 * @param {object} record
 * @param {string} text - empty string removes the note
 */
export async function saveNote(record, text) {
  const notes = await allNotes();
  const key = patientKey(record);
  if (text.trim()) notes[key] = text.trim();
  else delete notes[key];
  await storageSet(CONFIG.notesKey, notes);
}

/**
 * Restores a previous note verbatim. Used by the undo offer, so a deletion is
 * never final until the toast is gone.
 */
export async function restoreNote(record, text) {
  await saveNote(record, text);
}

/** Attaches a `note` property to each record from the stored notes. */
export async function attachNotes(records) {
  const notes = await allNotes();
  return records.map(r => ({ ...r, note: notes[patientKey(r)] ?? '' }));
}
