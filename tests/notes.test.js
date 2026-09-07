import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { installFakeChrome } from './helpers/fake-chrome.js';
import { CONFIG } from '../src/core/config.js';
import { patientKey, saveNote, restoreNote, attachNotes, addNote, updateNote, noteEntries } from '../src/io/notes.js';

let fake;
beforeEach(() => { fake = installFakeChrome(); });

const withRun = { run: '56785678K', ap: 'Pérez', am: 'Soto', dob: '01-01-1980', nombre: 'Ana Pérez Soto' };
const noRun   = { run: null,        ap: 'Pérez', am: 'Soto', dob: '01-01-1980', nombre: 'Ana Pérez Soto' };

test('patientKey: RUN when known, otherwise surname + DOB (case-insensitive)', () => {
  assert.equal(patientKey(withRun), 'run_56785678K');
  assert.equal(patientKey(noRun), 'pérez|soto|01-01-1980');
  assert.equal(patientKey({ ...noRun, ap: 'PÉREZ' }), patientKey(noRun));
  assert.notEqual(patientKey(withRun), patientKey(noRun), 'a RUN never collides with a name key');
});

test('saveNote trims, stores under the patient key and deletes on empty text', async () => {
  await saveNote(withRun, '  control en 30 días  ');
  const stored = fake.local.get(CONFIG.notesKey).run_56785678K;
  assert.equal(stored.entries.length, 1);
  assert.equal(stored.entries[0].text, 'control en 30 días');
  assert.ok(stored.entries[0].at, 'la nota nueva lleva fecha');
  await saveNote(withRun, '   ');
  assert.deepEqual(fake.local.get(CONFIG.notesKey), {}, 'blank text removes the note instead of storing whitespace');
});

test('saveNote keeps other patients\' notes intact', async () => {
  await saveNote(withRun, 'a');
  await saveNote(noRun, 'b');
  await saveNote(withRun, '');
  assert.deepEqual(Object.keys(fake.local.get(CONFIG.notesKey)), ['pérez|soto|01-01-1980']);
  assert.equal(fake.local.get(CONFIG.notesKey)['pérez|soto|01-01-1980'].entries[0].text, 'b');
});

test('restoreNote puts a deleted note back verbatim', async () => {
  await saveNote(withRun, 'original');
  await saveNote(withRun, '');
  await restoreNote(withRun, 'original');
  assert.equal(fake.local.get(CONFIG.notesKey).run_56785678K.entries[0].text, 'original');
});

test('attachNotes decorates every record of the same patient and leaves others empty', async () => {
  await saveNote(withRun, 'nota');
  const out = await attachNotes([{ ...withRun, id: 1 }, { ...withRun, id: 2 }, { ...noRun, id: 3 }]);
  assert.deepEqual(out.map(r => r.note), ['nota', 'nota', '']);
  assert.equal(out[0].id, 1, 'records are copied, not replaced');
});

// Diario: varias notas con fecha, la más nueva primero; editar y eliminar por entrada.
test('addNote y updateNote llevan el diario; record.note es la última', async () => {
  await addNote(withRun, 'primera', '2026-09-01T10:00:00.000Z');
  await addNote(withRun, 'segunda', '2026-09-03T09:00:00.000Z');
  let d = await noteEntries(withRun);
  assert.deepEqual(d.map(e => e.text), ['segunda', 'primera']);
  await updateNote(withRun, '2026-09-01T10:00:00.000Z', 'primera corregida');
  d = await noteEntries(withRun);
  assert.deepEqual(d.map(e => e.text), ['segunda', 'primera corregida']);
  await updateNote(withRun, '2026-09-03T09:00:00.000Z', '   ');
  d = await noteEntries(withRun);
  assert.deepEqual(d.map(e => e.text), ['primera corregida'], 'vaciar una entrada la elimina');
  const [r] = await attachNotes([{ ...withRun, id: 1 }]);
  assert.equal(r.note, 'primera corregida');
  assert.equal(r.notas.length, 1);
});

test('una nota antigua guardada como texto se lee como una entrada sin fecha', async () => {
  globalThis.chrome.storage.local.set({ [CONFIG.notesKey]: { run_56785678K: 'nota vieja' } });
  const d = await noteEntries(withRun);
  assert.deepEqual(d, [{ at: null, text: 'nota vieja' }]);
  await addNote(withRun, 'nueva', '2026-09-04T08:00:00.000Z');
  const [r] = await attachNotes([{ ...withRun, id: 1 }]);
  assert.equal(r.note, 'nueva');
  assert.deepEqual(r.notas.map(e => e.text), ['nueva', 'nota vieja']);
});
