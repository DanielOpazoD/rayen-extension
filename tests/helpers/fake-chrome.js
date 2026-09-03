/**
 * Minimal chrome.* double for tests: in-memory storage areas with the callback
 * signatures cache.js uses, plus a switch to make the next call fail through
 * runtime.lastError — the path that used to be silently ignored.
 */
export function installFakeChrome({ token = 'tok' } = {}) {
  const local = new Map(), session = new Map();
  const ctl = { failNext: null };   // string → next storage call sets runtime.lastError

  const area = m => {
    const keysOf = k => k == null ? [...m.keys()] : Array.isArray(k) ? k : typeof k === 'object' ? Object.keys(k) : [k];
    const fail = cb => { chrome.runtime.lastError = { message: ctl.failNext }; ctl.failNext = null; cb?.(); chrome.runtime.lastError = undefined; return true; };
    return {
      get(key, cb) { if (ctl.failNext) return fail(() => cb?.({})); const out = {}; for (const k of keysOf(key)) if (m.has(k)) out[k] = structuredClone(m.get(k)); cb?.(out); return Promise.resolve(out); },
      set(obj, cb) { if (ctl.failNext) return fail(cb); for (const [k, v] of Object.entries(obj)) m.set(k, structuredClone(v)); cb?.(); return Promise.resolve(); },
      remove(keys, cb) { for (const k of [].concat(keys)) m.delete(k); cb?.(); return Promise.resolve(); },
      clear(cb) { m.clear(); cb?.(); return Promise.resolve(); },
    };
  };
  const chrome = {
    runtime: { lastError: undefined },
    storage: { local: area(local), session: area(session) },
    tabs:    { query: async () => [] },
  };
  if (token) session.set('rayenToken', token);
  globalThis.chrome = chrome;
  return { local, session, ctl };
}
