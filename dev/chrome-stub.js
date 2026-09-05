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
// El arnés guarda en claro (datos sintéticos); con ?pin=1 se prueba la pantalla de PIN y el cifrado.
globalThis.__RAYEN_DEV_PLAIN = !new URLSearchParams(globalThis.location?.search ?? '').has('pin');

const realFetch = globalThis.fetch.bind(globalThis);

// ── Ficha clínica en el arnés ──
// Por defecto se sirve una ficha sintética por paciente (dev/ficha-fixture.js).
// Con `?ficha=off` todo lo de Eloisa responde 503, para probar el camino honesto
// de la ficha caída. Si hay capturas anonimizadas reales en dev/fixtures/
// (manifest.json), sustituyen a la sintética endpoint por endpoint.
let ficha = null;            // { byRunBody, byId }
const captures = {};         // { master, historial, antecedentes, programas, vigencias, riesgo, ram } → datos
let fichaMode = 'synthetic'; // 'synthetic' | 'off'
const DELAY_MS = 80;         // que se vea el esqueleto, como en la red real

export function setFichaResponses(responses) { ficha = responses; }
export function setFichaMode(mode) { fichaMode = mode; }
export async function loadCaptures(base = new URL('./fixtures/', import.meta.url)) {
  try {
    const manifest = await (await realFetch(new URL('manifest.json', base))).json();
    for (const [endpoint, file] of Object.entries(manifest)) {
      const cap = await (await realFetch(new URL(file, base))).json();
      if (cap && 'datos' in cap) captures[endpoint] = cap.datos;
    }
  } catch { /* sin capturas: sintético */ }
  return Object.keys(captures);
}

const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });
const later = res => new Promise(resolve => setTimeout(() => resolve(res), DELAY_MS));

function routeEloisa(url, init) {
  if (fichaMode === 'off' || !ficha) return json('dev: sin red', 503);
  const path = new URL(url).pathname.toLowerCase();
  const idDe = re => { const m = path.match(re); return m ? Number(m[1]) : null; };
  const m = path.match(/\/inscripcion\/usuarioapsrut\/([0-9k]+)\//);
  if (m) {
    const body = m[1].replace(/[^0-9]/g, '').slice(0, -1);
    const rec = captures.master ?? ficha.byRunBody.get(body);
    return rec ? json([rec]) : json([], 200);
  }
  if (path.endsWith('/fichaclinica/historialatencion')) {
    const id = (() => { try { return JSON.parse(init?.body ?? '{}').IdUsuario; } catch { return null; } })();
    return json(captures.historial ?? ficha.byId.get(id)?.historial ?? []);
  }
  const receta = idDe(/\/farmacia\/receta\/id=(\d+)/);
  if (receta != null) return json({ Resultado: [ficha.byReceta.get(receta)].filter(Boolean), MonthLimit: 0 });
  const rutas = [
    [/\/fichaclinica\/recuperarantecedentes\/(\d+)/, 'antecedentes'],
    [/\/historialusuarioapsenprogramasalud\/idusuarioaps=(\d+)/, 'programas'],
    [/\/vigenciaexamenesusuario\/(\d+)/, 'vigencias'],
    [/\/riesgomultimorbilidad\/idusuarioaps=(\d+)/, 'riesgo'],
    [/\/eventoadverso\/alertaram\/(\d+)/, 'ram'],
  ];
  for (const [re, key] of rutas) {
    const id = idDe(re);
    if (id != null) return json(captures[key] ?? ficha.byId.get(id)?.[key] ?? (key === 'antecedentes' ? {} : []));
  }
  return json('dev: sin red', 503);
}

// Nada sale de la máquina: Eloisa se enruta; los laboratorios (HSR, SysLab) responden 503 en local,
// salvo que un recorrido de Playwright declare `globalThis.__RAYEN_DEV_NET = 'mock'` porque los simula con sus rutas.
const OFFLINE = ['https://examenesusuarios.hsalvador.cl', 'http://10.4.69.90'];
globalThis.fetch = (url, init) => {
  const u = String(url);
  if (u.startsWith('https://clinicohangaroa.eloisa.cl')) return later(routeEloisa(u, init));
  if (OFFLINE.some(o => u.startsWith(o)) && globalThis.__RAYEN_DEV_NET !== 'mock') return later(json('dev: sin red', 503));
  return realFetch(url, init);
};

/** Pre-populates chrome.storage.local (call before app.js is imported). */
export function seed(obj) {
  for (const [k, v] of Object.entries(obj)) mem.local.set(k, v);
}
