/**
 * Just enough of the chrome.* API for app.js to boot in a plain browser tab.
 * In-memory storage, no Eloisa tab, and every request to the Eloisa origin is
 * answered with 503 locally — nothing leaves the machine.
 */
const mem = { local: new Map(), session: new Map() };

function area(m) {
  const keysOf = k => k == null ? [...m.keys()] : Array.isArray(k) ? k : typeof k === 'object' ? Object.keys(k) : [k];
  return {
    get(key, cb) {
      const out = {};
      for (const k of keysOf(key)) if (m.has(k)) out[k] = structuredClone(m.get(k));
      cb?.(out);
      return Promise.resolve(out);
    },
    set(obj, cb)     { for (const [k, v] of Object.entries(obj)) m.set(k, structuredClone(v)); cb?.(); return Promise.resolve(); },
    remove(keys, cb) { for (const k of [].concat(keys)) m.delete(k); cb?.(); return Promise.resolve(); },
    clear(cb)        { m.clear(); cb?.(); return Promise.resolve(); },
  };
}

const ROOT = new URL('../', import.meta.url).href;

globalThis.chrome = {
  runtime: { lastError: undefined, getURL: p => new URL(p, ROOT).href },
  storage: { local: area(mem.local), session: area(mem.session) },
  tabs:    { query: async () => [], create: async ({ url }) => window.open(url, '_blank'), update: async () => {} },
  action:  { setBadgeText() {}, setBadgeBackgroundColor() {}, setTitle() {} },
};
mem.session.set('rayenToken', 'dev-token');

const realFetch = globalThis.fetch.bind(globalThis);
globalThis.fetch = (url, init) =>
  String(url).startsWith('https://clinicohangaroa.eloisa.cl')
    ? Promise.resolve(new Response('dev: sin red', { status: 503 }))
    : realFetch(url, init);

/** Pre-populates chrome.storage.local (call before app.js is imported). */
export function seed(obj) {
  for (const [k, v] of Object.entries(obj)) mem.local.set(k, v);
}
