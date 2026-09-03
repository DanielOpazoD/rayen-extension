import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { installFakeChrome } from './helpers/fake-chrome.js';
import { CONFIG } from '../src/config.js';
import { isMutableAppointmentStatus, loadData } from '../src/api.js';
import { cancelRun } from '../src/http.js';
import { dateRange, localDateStr } from '../src/parser.js';

/**
 * loadData is the orchestrator: cache-first, honest about failures, stops on a
 * dead session, cooperative on cancel. These run it against a scripted fetch.
 */
let fake, calls;
const rawCita = (id, d8, estado = 'Completado') => ({
  Id: id, FechaHoraInicio: `${d8} 090000`, Tag: { Nombre: estado }, TipoDeAtencion: { Nombre: 'Consulta' },
  UsuarioAps: { Id: 1, Rut: '17752753K', NombreFormateado: 'Ana Prueba', FechaDeNacimiento: '19800101 000000', Sexo: { Nombre: 'Mujer' } },
});
function scriptFetch(handler) {
  calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push(String(url));
    const r = handler(String(url), calls.length, init);
    if (r instanceof Response) return r;
    return new Response(JSON.stringify(r), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
}
const dayOf = url => (url.match(/FechaHoraInicio=(\d{8})/) ?? [])[1];
const today8 = localDateStr(new Date());
const window1m = () => { const f = new Date(); f.setMonth(f.getMonth() - 1); return dateRange(f, new Date()); };

beforeEach(() => { fake = installFakeChrome(); });

test('returns null without a session token and touches nothing', async () => {
  fake.session.clear();
  scriptFetch(() => []);
  assert.equal(await loadData(1, () => {}, { historial: false }), null);
  assert.equal(calls.length, 0);
});

test('cache-first: only today is re-fetched when every other day is on disk', async () => {
  const dates = window1m();
  fake.local.set(CONFIG.cacheKey, { fetchedDates: dates, records: [{ id: 7, fecha8: dates[0], nombre: 'X' }], extra: {}, savedAt: 1 });
  scriptFetch(url => dayOf(url) === today8 ? [rawCita(99, today8)] : []);
  const res = await loadData(1, () => {}, { historial: false });
  assert.equal(calls.length, 1);
  assert.equal(dayOf(calls[0]), today8);
  assert.equal(res.fromCache, dates.length - 1);
  assert.equal(res.fromNetwork, 1);
  assert.deepEqual(res.records.map(r => r.id).sort(), [7, 99]);
  assert.equal(res.failedDays, 0);
  assert.equal(res.sessionExpired, false);
});

test('a historical Iniciada appointment is re-fetched and can become Completado', async () => {
  const dates = window1m();
  const staleDate = dates[0];
  fake.local.set(CONFIG.cacheKey, {
    fetchedDates: dates,
    records: [{ id: 7, fecha8: staleDate, estado: 'Iniciada', nombre: 'Ana Prueba' }],
    extra: {}, savedAt: 1,
  });
  scriptFetch(url => dayOf(url) === staleDate ? [rawCita(7, staleDate, 'Completado')] : []);

  const res = await loadData(1, () => {}, { historial: false });

  assert.deepEqual(calls.map(dayOf).sort(), [staleDate, today8].sort());
  assert.equal(res.records.find(r => r.id === 7)?.estado, 'Completado');
});

test('the clinical history is refreshed for the same mutable historical date', async () => {
  const dates = window1m();
  const staleDate = dates[0];
  fake.local.set(CONFIG.cacheKey, {
    fetchedDates: dates,
    records: [{ id: 7, fecha8: staleDate, estado: 'Iniciada', nombre: 'Ana Prueba' }],
    extra: {}, savedAt: 1,
  });
  fake.local.set(CONFIG.historialKey, { fetchedDates: dates, records: [], extra: { team: {} }, savedAt: 1 });
  const historialDates = [];
  scriptFetch((url, _n, init) => {
    if (url.includes('HistorialAtencion')) {
      historialDates.push(JSON.parse(init.body).FechaInicio.slice(0, 8));
      return [];
    }
    return dayOf(url) === staleDate ? [rawCita(7, staleDate, 'Completado')] : [];
  });

  await loadData(1, () => {}, { historial: true });

  assert.ok(historialDates.includes(staleDate));
});

test('a failed forced history refresh remains pending after the agenda closes', async () => {
  const dates = window1m();
  const staleDate = dates[0];
  fake.local.set(CONFIG.cacheKey, {
    fetchedDates: dates,
    records: [{ id: 7, fecha8: staleDate, estado: 'Iniciada', nombre: 'Ana Prueba' }],
    extra: {}, savedAt: 1,
  });
  fake.local.set(CONFIG.historialKey, { fetchedDates: dates, records: [], extra: { team: {} }, savedAt: 1 });
  scriptFetch((url, _n, init) => {
    if (url.includes('HistorialAtencion')) {
      const date = JSON.parse(init.body).FechaInicio.slice(0, 8);
      return date === staleDate ? new Response('falló', { status: 500 }) : [];
    }
    return dayOf(url) === staleDate ? [rawCita(7, staleDate, 'Completado')] : [];
  });

  await loadData(1, () => {}, { historial: true });
  assert.equal(fake.local.get(CONFIG.historialKey).fetchedDates.includes(staleDate), false);

  const retriedHistoryDates = [];
  scriptFetch((url, _n, init) => {
    if (url.includes('HistorialAtencion')) {
      retriedHistoryDates.push(JSON.parse(init.body).FechaInicio.slice(0, 8));
      return [];
    }
    return [];
  });
  await loadData(1, () => {}, { historial: true });
  assert.ok(retriedHistoryDates.includes(staleDate));
});

test('the history retry is persisted even when that run has history disabled', async () => {
  const dates = window1m();
  const staleDate = dates[0];
  fake.local.set(CONFIG.cacheKey, {
    fetchedDates: dates,
    records: [{ id: 7, fecha8: staleDate, estado: 'Iniciada', nombre: 'Ana Prueba' }],
    extra: {}, savedAt: 1,
  });
  fake.local.set(CONFIG.historialKey, { fetchedDates: dates, records: [], extra: { team: {} }, savedAt: 1 });
  scriptFetch(url => dayOf(url) === staleDate ? [rawCita(7, staleDate, 'Completado')] : []);

  await loadData(1, () => {}, { historial: false });
  assert.equal(fake.local.get(CONFIG.historialKey).fetchedDates.includes(staleDate), false);

  const retriedHistoryDates = [];
  scriptFetch((url, _n, init) => {
    if (url.includes('HistorialAtencion')) {
      retriedHistoryDates.push(JSON.parse(init.body).FechaInicio.slice(0, 8));
      return [];
    }
    return [];
  });
  await loadData(1, () => {}, { historial: true });
  assert.ok(retriedHistoryDates.includes(staleDate));
});

test('only workflow states that may still change are treated as mutable', () => {
  for (const state of ['Iniciada', 'Iniciado', 'Confirmado', 'Agendada', 'En espera']) {
    assert.equal(isMutableAppointmentStatus(state), true, state);
  }
  for (const state of ['Completado', 'Completada', 'No se presentó', 'Cancelada']) {
    assert.equal(isMutableAppointmentStatus(state), false, state);
  }
});

test('a failed day is counted, stays un-fetched, and keeps what the cache had for it', async () => {
  const dates = window1m();
  fake.local.set(CONFIG.cacheKey, { fetchedDates: dates, records: [{ id: 5, fecha8: today8 }], extra: {}, savedAt: 1 });
  scriptFetch(() => new Response('boom', { status: 500 }));
  const res = await loadData(1, () => {}, { historial: false });
  assert.equal(res.failedDays, 1);
  assert.equal(res.sessionExpired, false, 'a 500 is not an expired session');
  assert.equal(res.records.length, 1, "today's cached rows survive a failed refresh");
});

test('401 flags the session and stops after the batch in flight', async () => {
  scriptFetch(() => new Response('', { status: 401 }));
  const res = await loadData(1, () => {}, { historial: false });
  assert.equal(res.sessionExpired, true);
  assert.ok(calls.length <= CONFIG.batchSize, `stopped after one batch (${calls.length} calls)`);
  assert.equal(fake.local.get(CONFIG.cacheKey), undefined, 'nothing was marked as fetched');
});

test('cancelRun() stops queuing batches and reports cancelled; the fetched batch is kept', async () => {
  scriptFetch((url, n) => { if (n === 1) cancelRun(); return [rawCita(1000 + n, dayOf(url))]; });
  const res = await loadData(1, () => {}, { historial: false });
  assert.equal(res.cancelled, true);
  assert.ok(calls.length <= CONFIG.batchSize);
  assert.equal(fake.local.get(CONFIG.cacheKey).fetchedDates.length, calls.length, 'the finished batch was saved');
});

test('records older than the retention window are pruned from disk on load', async () => {
  const dates = window1m();
  fake.local.set(CONFIG.cacheKey, { fetchedDates: ['20200101', ...dates], records: [{ id: 1, fecha8: '20200101' }], extra: {}, savedAt: 1 });
  scriptFetch(() => []);
  await loadData(1, () => {}, { historial: false });
  const disk = fake.local.get(CONFIG.cacheKey);
  assert.equal(disk.fetchedDates.includes('20200101'), false);
  assert.equal(disk.records.length, 0);
});

test('historial:false never POSTs to HistorialAtencion', async () => {
  scriptFetch(() => []);
  await loadData(1, () => {}, { historial: false });
  assert.equal(calls.some(u => u.includes('HistorialAtencion')), false);
});

test('progress is reported in order and ends at 100', async () => {
  scriptFetch(() => []);
  const seen = [];
  await loadData(1, (pct, phase) => seen.push([pct, phase]), { historial: false });
  assert.ok(seen.length >= 2);
  assert.equal(seen.at(-1)[0], 100);
  assert.ok(seen.every(([, p]) => p === 'citas'));
  for (let i = 1; i < seen.length; i++) assert.ok(seen[i][0] >= seen[i - 1][0], 'monotonic');
});
