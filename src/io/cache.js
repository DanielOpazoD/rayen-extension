import { CONFIG } from '../core/config.js';

// ── chrome.storage.local wrappers that surface runtime.lastError ─

function lastErr() {
  const e = chrome.runtime?.lastError;
  return e ? new Error(e.message) : null;
}

export function storageGet(key) {
  return new Promise((resolve, reject) =>
    chrome.storage.local.get(key, data => {
      const err = lastErr();
      err ? reject(err) : resolve(data[key]);
    })
  );
}

export function storageSet(key, value) {
  return new Promise((resolve, reject) =>
    chrome.storage.local.set({ [key]: value }, () => {
      const err = lastErr();
      err ? reject(err) : resolve();
    })
  );
}

function storageRemove(keys) {
  return new Promise((resolve, reject) =>
    chrome.storage.local.remove(keys, () => {
      const err = lastErr();
      err ? reject(err) : resolve();
    })
  );
}

// ── Date-keyed record stores ───────────────────────────────────
// Shape on disk: { fetchedDates: string[], records: object[], extra: object, savedAt: number }

/**
 * @returns {Promise<{ key, fetchedDates: Set<string>, records: Map<id, record>, extra: object, savedAt: number }>}
 */
export async function loadStore(key) {
  const raw = (await storageGet(key)) ?? {};
  return {
    key,
    fetchedDates: new Set(raw.fetchedDates ?? []),
    records:      new Map((raw.records ?? []).map(r => [r.id, r])),
    extra:        raw.extra ?? {},
    savedAt:      raw.savedAt ?? 0,
  };
}

/**
 * Marks `dates` as fetched, upserts `newRecords`, persists.
 * Callers must only pass dates whose fetch actually succeeded — a failed day
 * must stay un-fetched so the next load retries it.
 */
export async function saveStore(store, dates = [], newRecords = []) {
  dates.forEach(d => store.fetchedDates.add(d));
  newRecords.forEach(r => store.records.set(r.id, r));
  store.savedAt = Date.now();
  await storageSet(store.key, {
    fetchedDates: [...store.fetchedDates],
    records:      [...store.records.values()],
    extra:        store.extra,
    savedAt:      store.savedAt,
  });
}

/** Drops everything dated before `minDate8` (YYYYMMDD). Does not persist by itself. */
export function pruneStore(store, minDate8) {
  for (const d of [...store.fetchedDates]) if (d < minDate8) store.fetchedDates.delete(d);
  for (const [id, r] of store.records) if ((r.fecha8 ?? '99999999') < minDate8) store.records.delete(id);
  if (store.extra.team) {
    for (const d of Object.keys(store.extra.team)) if (d < minDate8) delete store.extra.team[d];
  }
}

/** Removes every record for a given day (used before re-inserting today's data). */
export function dropDay(store, date8) {
  for (const [id, r] of store.records) if (r.fecha8 === date8) store.records.delete(id);
  store.fetchedDates.delete(date8);
}

/**
 * Clears all data caches (citas, ficha clínica, SIC). Notes and prefs are kept.
 * Incluye el informe pendiente de impresión: es una historia clínica completa
 * que sólo se borraba si la pestaña de impresión llegaba a abrirse.
 */
export async function clearAllCaches() {
  await storageRemove([CONFIG.cacheKey, CONFIG.historialKey, CONFIG.sicKey, ...Object.values(CONFIG.syncKeys), 'rayen_report']);
}

/** Wipes everything the extension stored: caches, notes, prefs, pending report and the session token. */
export async function clearEverything() {
  await new Promise((resolve, reject) =>
    chrome.storage.local.clear(() => { const err = lastErr(); err ? reject(err) : resolve(); })
  );
  try { await chrome.storage.session.clear(); } catch { /* session storage may be unavailable */ }
}

// ── Prefs ──────────────────────────────────────────────────────

export const DEFAULT_PREFS = Object.freeze({
  historial: true, months: 6, dense: false, hiddenCols: [], retentionMonths: 13,
  refreshMin: 15, lockMin: 15, startTab: 'hoy',
  netTimeoutSec: 20,   // espera máxima por petición; la ficha completa espera el triple
  watchEsp: null,      // null = CONFIG.watchEspecialidades
  umbrales: null,      // null = CONFIG.pendientes
  sortCol: 'fechaAtencion', sortDir: -1,
});

export async function loadPrefs() {
  return { ...DEFAULT_PREFS, ...((await storageGet(CONFIG.prefsKey)) ?? {}) };
}

export async function savePrefs(patch) {
  const cur = await loadPrefs();
  await storageSet(CONFIG.prefsKey, { ...cur, ...patch });
}
