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
  runtime: { lastError: undefined, getURL: p => new URL(p, ROOT).href, getManifest: () => ({ version: 'dev' }) },
  storage: { local: area(mem.local), session: area(mem.session) },
  tabs:    { query: async q => (syslab && String(q?.url ?? '').startsWith('http://10.4.69.90') ? [{ id: 7, url: 'http://10.4.69.90/syslab/index.php' }] : []),
             create: async ({ url }) => window.open(url, '_blank'), update: async () => {} },
  scripting: { executeScript: async ({ func, args }) => [{ result: syslabStep(func, args) }] },
  action:  { setBadgeText() {}, setBadgeBackgroundColor() {}, setTitle() {} },
};

// ── SysLab en el arnés ──
// SysLab no se consulta por HTTP: la extensión conduce una pestaña ajena y lee
// su DOM. Aquí se simula ese transporte —no el DOM— para poder recorrer en el
// navegador lo que necesita los dos hospitales a la vez: marcar todo, el PDF
// único y el análisis mezclado. El lector real de esa página se prueba aparte,
// contra su HTML, en `e2e/syslab.spec.js`.
let syslab = null; // null = sin pestaña de SysLab; si no, { exams: [...] }
export function setSyslab(estado) { syslab = estado; }
const PDF_SINTETICO = 'JVBERi0xLjQKMSAwIG9iago8PC9UeXBlL0NhdGFsb2cvUGFnZXMgMiAwIFI+PgplbmRvYmoKMiAwIG9iago8PC9UeXBlL1BhZ2VzL0tpZHNbMyAwIFJdL0NvdW50IDE+PgplbmRvYmoKMyAwIG9iago8PC9UeXBlL1BhZ2UvUGFyZW50IDIgMCBSL01lZGlhQm94WzAgMCAzMDAgMzAwXS9SZXNvdXJjZXM8PC9Gb250PDwvRjEgNCAwIFI+Pj4+L0NvbnRlbnRzIDUgMCBSPj4KZW5kb2JqCjQgMCBvYmoKPDwvVHlwZS9Gb250L1N1YnR5cGUvVHlwZTEvQmFzZUZvbnQvSGVsdmV0aWNhPj4KZW5kb2JqCjUgMCBvYmoKPDwvTGVuZ3RoIDQ4Pj5zdHJlYW0KQlQgL0YxIDE0IFRmIDMwIDE1MCBUZCAoSW5mb3JtZSBzaW50ZXRpY28pIFRqIEVUCmVuZHN0cmVhbQplbmRvYmoKeHJlZgowIDYKMDAwMDAwMDAwMCA2NTUzNSBmIAowMDAwMDAwMDA5IDAwMDAwIG4gCjAwMDAwMDAwNTQgMDAwMDAgbiAKMDAwMDAwMDEwNSAwMDAwMCBuIAowMDAwMDAwMjE3IDAwMDAwIG4gCjAwMDAwMDAyODAgMDAwMDAgbiAKdHJhaWxlcgo8PC9TaXplIDYvUm9vdCAxIDAgUj4+CnN0YXJ0eHJlZgozNzUKJSVFT0YK';

function syslabStep(func, args = []) {
  if (!syslab) return { error: 'dev: sin pestaña de SysLab' };
  // Se distingue el paso por su nombre, no por su código: no hay compilación
  // que lo renombre, y una simulación que dependiera del texto se quedaría
  // muda en cuanto se editara una línea del lector.
  switch (func?.name) {
    case 'probeStatus':
      return { loginRequired: false, hasRutInput: true, url: 'http://10.4.69.90/syslab/index.php' };
    case 'stepPrepareSearch':
      return { navigated: false };
    case 'stepSubmitSearch':
      return /^\d{5,9}$/.test(String(args[0] ?? '')) ? { navigated: false } : { error: 'dev: RUT no válido' };
    case 'stepReadResults':
      return { exams: syslab.exams ?? [] };
    case 'stepFetchReport':
      return { base64: PDF_SINTETICO };
    default:
      return { error: `dev: paso de SysLab no simulado (${func?.name || 'anónimo'})` };
  }
}

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

// Agenda por día (citas futuras): el arnés la sirve como Eloisa, un día por petición.
let citasPorDia = new Map();
export function setCitasPorDia(map) { citasPorDia = map; }
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
  const cit = path.match(/\/citas\/listapacientescitados\/\d+\/fechahorainicio=(\d{8})/);
  if (cit) return json(citasPorDia.get(cit[1]) ?? []);
  const m = path.match(/\/inscripcion\/usuarioapsrut\/([0-9k]+)\//);
  if (m) {
    const body = m[1].slice(0, -1).replace(/[^0-9]/g, ''); // el DV va al final y puede ser «k»: se quita antes de filtrar dígitos
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

// ── HIS de Hanga Roa en el arnés ──
// El HIS sí se enruta (la extensión lo consulta por fetch, no por pestaña). Se
// simula el login y el historial por RUT (consficha), para recorrer el bloque
// del HIS en el panel sin tocar la red del hospital.
const htmlResp = (s, status = 200) => new Response(s, { status, headers: { 'content-type': 'text/html' } });
const HIS_LOGIN_FORM = '<form action="acceso1.php"><input name="login"><input type="password" name="password"></form>';
const HIS_CONSFICHA = `<table><tr><th>Fecha de Atención</th><th>Tipo</th><th>Servicio</th><th>Ver</th></tr>
  <tr><td>18-05-2026</td><td>AMB Cardiología</td><td>CARDIOLOGIA</td><td><span onclick="window.open('PAMB0005.php?id=501&noprint=1')">Ver</span></td></tr>
  <tr><td>02-02-2026</td><td>URGENCIA</td><td>URGENCIA ADULTOS</td><td><span onclick="window.open('PURG0005.php?id=502&print=1')">Ver</span></td></tr></table>`;
// El contenido de una ficha (PURG0005 urgencia / PAMB0005 ambulatorio): pares
// <b>ETIQUETA:</b>VALOR, y la tabla de signos vitales sólo en urgencia. Datos
// inventados, como todo el arnés.
const HIS_FICHA_URG = `<html><body>
  <div><b>NOMBRES:</b> PACIENTE EJEMPLO HIS</div>
  <div><b>RUT:</b> 11.111.111-1</div>
  <div><b>EDAD:</b> 58</div>
  <div><b>MÉDICO:</b> DR. EJEMPLO URGENCIA</div>
  <div><b>FECHA ATENCIÓN:</b> 02-02-2026</div>
  <div><b>MOTIVO CONSULTA:</b><br>Dolor torácico opresivo de 2 horas.</div>
  <div><b>ANAMNESIS:</b><br>Refiere dolor retroesternal irradiado a brazo izquierdo.</div>
  <div><b>EXAMEN FÍSICO:</b><br>Yugulares planas, ruidos cardíacos rítmicos.</div>
  <div><b>HIPOTESIS DIAGNÓSTICA:</b><br>Síndrome coronario agudo a descartar.</div>
  <div><b>INDICACIONES MÉDICAS / PLAN DE TTO:</b><br>Reposo absoluto.<br>ECG seriado cada 6 horas.</div>
  <div><b>DIAGNÓSTICO PRI:</b> Dolor torácico en estudio</div>
  <div><b>CONDICIÓN CIERRE ATENCIÓN:</b> Estable</div>
  <div><b>DESTINO:</b> Observación</div>
  <table><tr><th>HORA</th><th>F.C.</th><th>P. SISTOLICA</th><th>P. DIASTOLICA</th><th>SAT. O2</th></tr>
  <tr><td>14:20</td><td>88</td><td>145</td><td>90</td><td>96</td></tr></table>
</body></html>`;
const HIS_FICHA_AMB = `<html><body>
  <div><b>NOMBRES:</b> PACIENTE EJEMPLO HIS</div>
  <div><b>RUT:</b> 11.111.111-1</div>
  <div><b>EDAD:</b> 58</div>
  <div><label><b>MÉDICO:</b></label><input name="medico" value="DRA. EJEMPLO CARDIOLOGA"></div>
  <div><b>FECHA ATENCIÓN:</b> 18-05-2026</div>
  <div><b>TIPO ATENCIÓN:</b> AMB Cardiología</div>
  <div><b>ANAMNESIS:</b><br>Control de hipertensión, asintomático.</div>
  <div><b>INDICACIONES:</b><br>Continuar losartán. Control en 6 meses.</div>
  <div><b>DIAGNÓSTICO PRI:</b> Hipertensión arterial esencial</div>
</body></html>`;
let hisLogged = false;
/** Pre-siembra el HIS (para ?his=1): credencial guardada + sesión activa. */
export function setHis({ user = '12345678' } = {}) {
  hisLogged = true;
  const prefs = mem.local.get('rayen_prefs_v1') ?? {};
  mem.local.set('rayen_prefs_v1', { ...prefs, hisUser: user, hisPass: 'dev' });
}
function routeHis(url, init) {
  const path = new URL(url).pathname.toLowerCase();
  const method = init?.method ?? 'GET';
  if (path.endsWith('/acceso1.php') && method === 'POST') {
    const body = new URLSearchParams(init?.body ?? '');
    if (body.get('login') && body.get('password')) { hisLogged = true; return htmlResp("<script>window.location='menu.php'</script>"); }
    return htmlResp("<script>alert('Usuario o clave incorrecta')</script>");
  }
  if (path.endsWith('/menu.php')) return htmlResp('menu');
  if (path.endsWith('/ateurg022.php')) return hisLogged ? htmlResp('<table>atenciones del día</table>') : htmlResp(HIS_LOGIN_FORM);
  if (path.endsWith('/purg0005.php')) return hisLogged ? htmlResp(HIS_FICHA_URG) : htmlResp(HIS_LOGIN_FORM);
  if (path.endsWith('/pamb0005.php')) return hisLogged ? htmlResp(HIS_FICHA_AMB) : htmlResp(HIS_LOGIN_FORM);
  if (path.endsWith('/consficha000.php')) return method === 'POST' && hisLogged ? htmlResp(HIS_CONSFICHA) : htmlResp(hisLogged ? '<form>rut</form>' : HIS_LOGIN_FORM);
  return htmlResp(HIS_LOGIN_FORM);
}

// Nada sale de la máquina: Eloisa y el HIS se enrutan; los laboratorios (HSR, SysLab)
// responden 503 en local, salvo que un recorrido de Playwright declare
// `globalThis.__RAYEN_DEV_NET = 'mock'` porque los simula con sus rutas.
const OFFLINE = ['https://examenesusuarios.hsalvador.cl', 'http://10.4.69.90'];
globalThis.fetch = (url, init) => {
  const u = String(url);
  if (u.startsWith('https://clinicohangaroa.eloisa.cl')) return later(routeEloisa(u, init));
  if (u.startsWith('https://his.hospitalhangaroa.cl')) return later(routeHis(u, init));
  if (OFFLINE.some(o => u.startsWith(o)) && globalThis.__RAYEN_DEV_NET !== 'mock') return later(json('dev: sin red', 503));
  return realFetch(url, init);
};

/** Pre-populates chrome.storage.local (call before app.js is imported). */
export function seed(obj) {
  for (const [k, v] of Object.entries(obj)) mem.local.set(k, v);
}
