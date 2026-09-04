import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { installFakeChrome } from './helpers/fake-chrome.js';
import { CONFIG } from '../src/config.js';
import { loadSICs } from '../src/sic.js';
import { cancelRun, resetRun } from '../src/http.js';
import { setPrefs } from '../src/state.js';
import { pruneByRetention } from '../src/sic.js';

/**
 * loadSICs hace tres listados y baja los detalles por grupos. (El cruce de
 * contrarreferencias se retiró con el PR #7: era un metadato administrativo.)
 * Se ejercita contra un fetch guionizado.
 */
let calls;
function scriptFetch(handler) {
  calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push(String(url));
    const r = handler(String(url), init);
    if (r instanceof Response) return r;
    return new Response(JSON.stringify(r), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
}
const fail = () => new Response('boom', { status: 500 });
const ME = CONFIG.officerId;

const rawSic = id => ({
  NumeroSolicitud: id, FechaHora: '01-08-2026', Prioridad: 2, Estado: 'Atendido', IdEstado: 5, AntiguedadDias: 33,
  SolicitudInterconsulta: {
    FechaHora: '20260801 090000', IdFuncionarioRegistrador: ME, IdFuncionarioEjecutor: 9,
    NombreFuncionarioRegistrador: 'Opazo', NombreFuncionarioEjecutor: 'Otro',
    UsuarioAps: { NombreCompletoPaciente: 'Paciente Uno', Rut: '1K' },
  },
});

/** Guion base: los tres listados devuelven los mismos ids; detalles según `over`. */
function guion({ ids = [21450486], detailFail = false } = {}) {
  return url => {
    if (url.includes('IdsSolicitudesInterconsultasGet')) return ids;
    if (url.includes('SolicitudInterconsultaDerivacionPorIds')) return detailFail ? fail() : ids.map(rawSic);
    return [];
  };
}

beforeEach(() => { installFakeChrome(); });

test('carga completa: lista y detalle en dos pasos', async () => {
  scriptFetch(guion());
  const res = await loadSICs('tok', 3);
  assert.equal(res.failed, 0);
  assert.equal(res.fromCache, false);
  assert.equal(res.sics.length, 1);
});

test('un grupo de detalles que falla se cuenta y conserva la instantánea completa anterior', async () => {
  const cached = { records: [{ id: 1, fecha8: '20260701', contrarreferencias: [] }], savedAt: 1, months: 3 };
  globalThis.chrome.storage.local.set({ [CONFIG.sicKey]: cached });
  scriptFetch(guion({ detailFail: true }));
  const res = await loadSICs('tok', 3);
  assert.ok(res.failed > 0);
  assert.equal(res.staleFallback, true, 'una lista parcial no reemplaza la completa');
  assert.equal(res.fromCache, true);
  assert.deepEqual(res.sics, cached.records);
});

test('sin instantánea previa, una carga parcial se entrega marcada como parcial y no se guarda', async () => {
  scriptFetch(guion({ detailFail: true }));
  const res = await loadSICs('tok', 3);
  assert.ok(res.failed > 0);
  assert.equal(res.fromCache, false);
  const stored = await new Promise(r => globalThis.chrome.storage.local.get(CONFIG.sicKey, d => r(d[CONFIG.sicKey])));
  assert.equal(stored, undefined, 'una carga fallida no debe persistirse como si estuviera completa');
});

// Una cancelación de la agenda deja `run.cancelled` en true y nadie lo repone
// hasta la siguiente carga completa. loadSICs debe declarar la carga como
// parcial y cancelada, no devolverla como si estuviera entera.
test('una carga cancelada se declara parcial y cancelada', async () => {
  scriptFetch(guion({ ids: [1, 2, 3] }));
  cancelRun();
  try {
    const res = await loadSICs('tok', 3);
    assert.equal(res.cancelled, true, 'quien la reciba debe saber que fue interrumpida');
    assert.equal(res.fromCache, false);
    // Lo que importa: una carga cancelada nunca se persiste como instantánea completa.
    const stored = await new Promise(r => globalThis.chrome.storage.local.get(CONFIG.sicKey, d => r(d[CONFIG.sicKey])));
    assert.equal(stored, undefined, 'una carga cancelada no debe guardarse como completa');
  } finally {
    resetRun();
  }
});

test('dentro del TTL se sirve desde caché sin tocar la red', async () => {
  globalThis.chrome.storage.local.set({ [CONFIG.sicKey]: { records: [{ id: 5 }], savedAt: Date.now(), months: 6 } });
  scriptFetch(() => { throw new Error('no debería llamarse'); });
  const res = await loadSICs('tok', 3);
  assert.equal(res.fromCache, true);
  assert.equal(calls.length, 0);
});

// Balance 4: el almacén de interconsultas (con teléfono y dirección) no se
// podaba por la retención elegida; agenda y ficha sí.
test('las interconsultas guardadas se podan con la retención de Preferencias', async () => {
  setPrefs({ retentionMonths: 3 });
  const hoy = new Date();
  const reciente = `${hoy.getFullYear()}${String(hoy.getMonth() + 1).padStart(2, '0')}${String(hoy.getDate()).padStart(2, '0')}`;
  const kept = pruneByRetention([{ id: 1, fecha8: '20200101' }, { id: 2, fecha8: reciente }, { id: 3 }]);
  assert.deepEqual(kept.map(r => r.id), [2, 3], 'la vieja se va; sin fecha se conserva por prudencia');

  globalThis.chrome.storage.local.set({ [CONFIG.sicKey]: { records: [{ id: 1, fecha8: '20200101' }, { id: 2, fecha8: reciente }], savedAt: Date.now(), months: 6 } });
  scriptFetch(() => { throw new Error('no debería llamarse'); });
  const res = await loadSICs('tok', 3);
  assert.equal(res.fromCache, true);
  assert.deepEqual(res.sics.map(r => r.id), [2], 'desde caché también se aplica la retención');
  setPrefs({ retentionMonths: 13 });
});
