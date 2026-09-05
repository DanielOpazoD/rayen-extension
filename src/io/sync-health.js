import { CONFIG } from '../core/config.js';
import { storageGet, storageSet } from './cache.js';

import { SYNC_SOURCES } from '../core/sync-rules.js';

function assertSource(source) {
  if (!SYNC_SOURCES.includes(source)) throw new Error(`Fuente de sincronización desconocida: ${source}`);
}

function uniqueItems(items = []) {
  return [...new Set([...items].filter(Boolean).map(String))].sort();
}

/** Reads only operational metadata: timestamps, counters and failed date/call labels. */
export async function loadSyncHealth() {
  const rows = await Promise.all(SYNC_SOURCES.map(source => storageGet(CONFIG.syncKeys[source])));
  return Object.fromEntries(SYNC_SOURCES.map((source, i) => [source, rows[i] ?? null]));
}

export async function beginSyncSource(source, attemptedAt = Date.now(), plannedItems = [], operationId = null) {
  assertSource(source);
  const previous = (await storageGet(CONFIG.syncKeys[source])) ?? {};
  const next = { ...previous, source, status: 'running', attemptedAt, inFlightItems: uniqueItems(plannedItems), operationId };
  await storageSet(CONFIG.syncKeys[source], next);
  return next;
}

/** Converts durable "running" markers left by an exception into retryable failures. */
export async function failRunningSyncSources(operationId) {
  if (!operationId) return;
  const health = await loadSyncHealth();
  await Promise.all(SYNC_SOURCES.map(async source => {
    const current = health[source];
    if (current?.status !== 'running' || current.operationId !== operationId) return;
    const failedItems = current.inFlightItems?.length
      ? current.inFlightItems
      : (current.failedItems?.length ? current.failedItems : ['reintento de fuente']);
    await finishSyncSource(source, {
      attemptedAt: current.attemptedAt,
      failedItems,
      hasData: current.hasData,
      error: true,
      operationId,
    });
  }));
}

/** Recovers only old durable markers; active loads get a generous one-hour lease. */
export async function recoverStaleSyncSources(now = Date.now(), maxAgeMs = 60 * 60_000) {
  const health = await loadSyncHealth();
  await Promise.all(SYNC_SOURCES.map(async source => {
    const current = health[source];
    if (current?.status !== 'running' || now - current.attemptedAt <= maxAgeMs) return;
    const failedItems = current.inFlightItems?.length
      ? current.inFlightItems
      : (current.failedItems?.length ? current.failedItems : ['reintento de fuente']);
    await finishSyncSource(source, {
      attemptedAt: current.attemptedAt,
      failedItems,
      hasData: current.hasData,
      error: true,
      operationId: current.operationId,
    });
  }));
}

/**
 * Completes one source without erasing its last fully successful network sync.
 * failedItems are date strings or generic call labels, never patient identifiers.
 * @param {string} source
 * @param {object} [outcome]
 * @param {number} [outcome.attemptedAt]
 * @param {number} [outcome.completedAt]
 * @param {string[]} [outcome.failedItems]
 * @param {number} [outcome.networkCount]
 * @param {number} [outcome.cacheCount]
 * @param {boolean} [outcome.hasData]
 * @param {boolean} [outcome.disabled]
 * @param {boolean} [outcome.error]
 * @param {boolean} [outcome.cancelled]  la corrida se cortó a mano: lo que faltó queda pendiente, no fallido
 * @param {string|null} [outcome.operationId]
 */
export async function finishSyncSource(source, {
  attemptedAt = Date.now(), completedAt = Date.now(), failedItems = [],
  networkCount = 0, cacheCount = 0, hasData = false,
  disabled = false, error = false, cancelled = false, operationId = null,
} = {}) {
  assertSource(source);
  const previous = (await storageGet(CONFIG.syncKeys[source])) ?? {};
  if (previous.operationId && operationId && previous.operationId !== operationId) return previous;
  const pending = uniqueItems(failedItems);
  let status;
  if (disabled) status = 'disabled';
  else if (error && !hasData) status = 'error';
  else if (pending.length || error) status = 'partial';
  else if (!networkCount) status = 'cached';
  else status = 'ok';

  const next = {
    source,
    cancelled, // la persona cortó la corrida: lo pendiente no es un fallo
    status,
    attemptedAt,
    completedAt,
    lastSuccessAt: status === 'ok' ? completedAt : (previous.lastSuccessAt ?? null),
    failedItems: pending,
    networkCount,
    cacheCount,
    hasData: Boolean(hasData),
  };
  await storageSet(CONFIG.syncKeys[source], next);
  return next;
}
