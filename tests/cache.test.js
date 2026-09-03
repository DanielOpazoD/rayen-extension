import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { installFakeChrome } from './helpers/fake-chrome.js';
import { CONFIG } from '../src/config.js';
import { storageGet, storageSet, loadStore, saveStore, pruneStore, dropDay, clearAllCaches, clearEverything, loadPrefs, savePrefs } from '../src/cache.js';

let fake;
beforeEach(() => { fake = installFakeChrome(); });

test('storageGet/Set round-trip and surface runtime.lastError as a rejection', async () => {
  await storageSet('k', { a: 1 });
  assert.deepEqual(await storageGet('k'), { a: 1 });
  assert.equal(await storageGet('nope'), undefined);
  fake.ctl.failNext = 'QUOTA_BYTES exceeded';
  await assert.rejects(storageSet('k', {}), /QUOTA_BYTES/);
});

test('loadStore: empty disk gives an empty but complete store', async () => {
  const s = await loadStore('x');
  assert.equal(s.key, 'x');
  assert.equal(s.fetchedDates.size, 0);
  assert.equal(s.records.size, 0);
  assert.deepEqual(s.extra, {});
  assert.equal(s.savedAt, 0);
});

test('saveStore marks dates, upserts by id and persists the disk shape', async () => {
  const s = await loadStore('x');
  await saveStore(s, ['20260901'], [{ id: 1, fecha8: '20260901', v: 'a' }]);
  await saveStore(s, ['20260902'], [{ id: 1, fecha8: '20260901', v: 'b' }, { id: 2, fecha8: '20260902' }]);
  const disk = fake.local.get('x');
  assert.deepEqual(disk.fetchedDates, ['20260901', '20260902']);
  assert.equal(disk.records.length, 2, 'id 1 was replaced, not duplicated');
  assert.equal(disk.records.find(r => r.id === 1).v, 'b');
  assert.ok(disk.savedAt > 0);
  const again = await loadStore('x');
  assert.equal(again.records.get(2).fecha8, '20260902');
});

test('pruneStore drops dates, records and team aggregates older than the cutoff', async () => {
  const s = await loadStore('x');
  s.fetchedDates = new Set(['20250101', '20260801']);
  s.records = new Map([[1, { id: 1, fecha8: '20250101' }], [2, { id: 2, fecha8: '20260801' }], [3, { id: 3 }]]);
  s.extra.team = { '20250101': {}, '20260801': {} };
  pruneStore(s, '20260101');
  assert.deepEqual([...s.fetchedDates], ['20260801']);
  assert.deepEqual([...s.records.keys()], [2, 3], 'a record without fecha8 is kept');
  assert.deepEqual(Object.keys(s.extra.team), ['20260801']);
});

test('dropDay removes one day so it can be re-inserted', async () => {
  const s = await loadStore('x');
  await saveStore(s, ['20260901', '20260902'], [{ id: 1, fecha8: '20260901' }, { id: 2, fecha8: '20260902' }]);
  dropDay(s, '20260901');
  assert.equal(s.fetchedDates.has('20260901'), false);
  assert.deepEqual([...s.records.keys()], [2]);
});

test('clearAllCaches keeps notes and prefs but removes data and synchronization metadata', async () => {
  for (const k of [CONFIG.cacheKey, CONFIG.historialKey, CONFIG.sicKey, ...Object.values(CONFIG.syncKeys), CONFIG.notesKey, CONFIG.prefsKey]) await storageSet(k, { k });
  await clearAllCaches();
  assert.deepEqual([...fake.local.keys()].sort(), [CONFIG.notesKey, CONFIG.prefsKey].sort());
  await clearEverything();
  assert.equal(fake.local.size, 0);
  assert.equal(fake.session.size, 0, 'the session token goes too');
});

test('loadPrefs merges stored values over defaults; savePrefs patches', async () => {
  const d = await loadPrefs();
  assert.equal(d.months, 6);
  assert.equal(d.startTab, 'hoy');
  assert.equal(d.watchEsp, null);
  await savePrefs({ months: 12 });
  await savePrefs({ dense: true });
  const p = await loadPrefs();
  assert.equal(p.months, 12, 'the second patch did not erase the first');
  assert.equal(p.dense, true);
  assert.equal(p.refreshMin, 15, 'defaults survive');
});
