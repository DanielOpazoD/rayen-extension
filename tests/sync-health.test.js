import { beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { installFakeChrome } from './helpers/fake-chrome.js';
import {
  beginSyncSource, failRunningSyncSources, finishSyncSource, loadSyncHealth,
  recoverStaleSyncSources,
} from '../src/io/sync-health.js';
import { hasRetryableSync, pendingSyncItems } from '../src/core/sync-rules.js';
import { syncOverview } from '../src/ui/sync-status.js';

beforeEach(() => installFakeChrome());

test('a partial source keeps its previous full success and exposes retry items', async () => {
  await finishSyncSource('agenda', { attemptedAt: 100, completedAt: 200, networkCount: 2, hasData: true });
  await beginSyncSource('agenda', 300);
  await finishSyncSource('agenda', {
    attemptedAt: 300, completedAt: 400, networkCount: 1, hasData: true,
    failedItems: ['20260901', '20260901', '20260902'], error: true,
  });

  const health = await loadSyncHealth();
  assert.equal(health.agenda.status, 'partial');
  assert.equal(health.agenda.lastSuccessAt, 200);
  assert.deepEqual([...pendingSyncItems(health, 'agenda')], ['20260901', '20260902']);
  assert.equal(hasRetryableSync(health), true);
});

test('a successful retry clears pending items and advances the last success', async () => {
  await finishSyncSource('historial', {
    attemptedAt: 100, completedAt: 200, failedItems: ['20260901'], hasData: true, error: true,
  });
  await finishSyncSource('historial', {
    attemptedAt: 300, completedAt: 400, networkCount: 1, hasData: true,
  });

  const health = await loadSyncHealth();
  assert.equal(health.historial.status, 'ok');
  assert.equal(health.historial.lastSuccessAt, 400);
  assert.deepEqual(health.historial.failedItems, []);
  assert.equal(hasRetryableSync(health), false);
});

test('disabled history remains distinct from an error', async () => {
  await finishSyncSource('historial', { disabled: true, attemptedAt: 100, completedAt: 100 });
  const health = await loadSyncHealth();
  assert.equal(health.historial.status, 'disabled');
  assert.equal(syncOverview(health).tone, 'neutral');
});

test('an outage without a usable snapshot is an error, not a partial success', async () => {
  await finishSyncSource('sics', {
    failedItems: ['reintento de red'], hasData: false, error: true,
  });
  const health = await loadSyncHealth();
  assert.equal(health.sics.status, 'error');
  assert.equal(syncOverview(health).tone, 'bad');
});

test('a cancellation after the final successful item does not invent pending work', async () => {
  await finishSyncSource('agenda', {
    networkCount: 1, hasData: true, cancelled: true, failedItems: [],
  });
  const health = await loadSyncHealth();
  assert.equal(health.agenda.status, 'ok');
  assert.equal(hasRetryableSync(health), false);
});

test('an interrupted running source becomes retryable with its planned dates', async () => {
  await beginSyncSource('agenda', 100, ['20260901', '20260902'], 'op-1');
  await failRunningSyncSources('op-1');
  const health = await loadSyncHealth();
  assert.equal(health.agenda.status, 'error');
  assert.deepEqual(health.agenda.failedItems, ['20260901', '20260902']);
  assert.equal(hasRetryableSync(health), true);
});

test('failure cleanup affects only sources owned by that operation', async () => {
  await beginSyncSource('agenda', 100, ['20260901'], 'agenda-op');
  await beginSyncSource('sics', 100, ['llamadas pendientes'], 'sic-op');
  await failRunningSyncSources('agenda-op');
  const health = await loadSyncHealth();
  assert.equal(health.agenda.status, 'error');
  assert.equal(health.sics.status, 'running');
});

test('a persisted running marker becomes retryable after its lease expires', async () => {
  await beginSyncSource('agenda', 100, ['20260901'], 'old-op');
  await recoverStaleSyncSources(100 + 60 * 60_000 + 1);
  const health = await loadSyncHealth();
  assert.equal(health.agenda.status, 'error');
  assert.deepEqual(health.agenda.failedItems, ['20260901']);
});

test('overview never presents a partial or failed source as healthy', () => {
  assert.deepEqual(syncOverview({
    agenda: { status: 'ok', failedItems: [] },
    historial: { status: 'disabled', failedItems: [] },
    sics: { status: 'cached', failedItems: [] },
  }), {
    text: 'Al día · sin ficha', tone: 'ok', pending: 0,
  });
  assert.equal(syncOverview({ agenda: { status: 'ok', failedItems: [] } }).tone, 'neutral');
  assert.equal(syncOverview({ agenda: { status: 'partial', failedItems: ['20260901'] } }).tone, 'warn');
  assert.equal(syncOverview({ agenda: { status: 'error', failedItems: ['red'] } }).tone, 'bad');
  assert.equal(syncOverview({ agenda: { status: 'running', failedItems: [] } }).tone, 'info');
});
