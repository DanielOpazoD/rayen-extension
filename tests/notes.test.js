import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { installFakeChrome } from './helpers/fake-chrome.js';
import { CONFIG } from '../src/config.js';
import { patientKey, saveNote, restoreNote, attachNotes } from '../src/notes.js';

let fake;
beforeEach(() => { fake = installFakeChrome(); });

const withRun = { run: '17752753K', ap: 'Pérez', am: 'Soto', dob: '01-01-1980', nombre: 'Ana Pérez Soto' };
const noRun   = { run: null,        ap: 'Pérez', am: 'Soto', dob: '01-01-1980', nombre: 'Ana Pérez Soto' };

test('patientKey: RUN when known, otherwise surname + DOB (case-insensitive)', () => {
  assert.equal(patientKey(withRun), 'run_17752753K');
  assert.equal(patientKey(noRun), 'pérez|soto|01-01-1980');
  assert.equal(patientKey({ ...noRun, ap: 'PÉREZ' }), patientKey(noRun));
  assert.notEqual(patientKey(withRun), patientKey(noRun), 'a RUN never collides with a name key');
});

test('saveNote trims, stores under the patient key and deletes on empty text', async () => {
  await saveNote(withRun, '  control en 30 días  ');
  assert.deepEqual(fake.local.get(CONFIG.notesKey), { run_17752753K: 'control en 30 días' });
  await saveNote(withRun, '   ');
  assert.deepEqual(fake.local.get(CONFIG.notesKey), {}, 'blank text removes the note instead of storing whitespace');
});

test('saveNote keeps other patients\' notes intact', async () => {
  await saveNote(withRun, 'a');
  await saveNote(noRun, 'b');
  await saveNote(withRun, '');
  assert.deepEqual(fake.local.get(CONFIG.notesKey), { 'pérez|soto|01-01-1980': 'b' });
});

test('restoreNote puts a deleted note back verbatim', async () => {
  await saveNote(withRun, 'original');
  await saveNote(withRun, '');
  await restoreNote(withRun, 'original');
  assert.equal(fake.local.get(CONFIG.notesKey).run_17752753K, 'original');
});

test('attachNotes decorates every record of the same patient and leaves others empty', async () => {
  await saveNote(withRun, 'nota');
  const out = await attachNotes([{ ...withRun, id: 1 }, { ...withRun, id: 2 }, { ...noRun, id: 3 }]);
  assert.deepEqual(out.map(r => r.note), ['nota', 'nota', '']);
  assert.equal(out[0].id, 1, 'records are copied, not replaced');
});
