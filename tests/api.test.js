import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { installFakeChrome } from './helpers/fake-chrome.js';
import { CONFIG } from '../src/core/config.js';
import { isMutableAppointmentStatus, loadData } from '../src/io/api.js';
import { cancelRun } from '../src/io/http.js';
import { dateRange, localDateStr } from '../src/core/parser.js';

/**
 * loadData is the orchestrator: cache-first, honest about failures, stops on a
 * dead session, cooperative on cancel. These run it against a scripted fetch.
 */
let fake, calls;
const rawCita = (id, d8, estado = 'Completado') => ({
  Id: id, FechaHoraInicio: `${d8} 090000`, Tag: { Nombre: estado }, TipoDeAtencion: { Nombre: 'Consulta' },
  UsuarioAps: { Id: 1, Rut: '17752753K', NombreFormateado: 'Ana Prueba', FechaDeNacimiento: '19800101 000000', Sexo: { Nombre: 'Mujer' } },
});
const rawAtencion = (id, d8) => ({
  Id: id, IdCita: 0, Fecha: `${d8} 091500`, RutPaciente: '17752753K', NombreCompleto: 'Ana Prueba',
  FechaNacimiento: '19800101 000000', IdSexo: 2, TipoDeAtencion: 'Consulta',
  Diagnosticos: [], Actividades: [],
  FuncionariosPrestadores: [{ Id: 99, NombreCompleto: 'Otro Profesional', NombreInstrumento: 'Médico' }],
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
  assert.equal(res.sync.agenda.status, 'partial');
  assert.ok(res.sync.agenda.failedItems.includes(today8));
  assert.equal(res.sessionExpired, false, 'a 500 is not an expired session');
  assert.equal(res.records.length, 1, "today's cached rows survive a failed refresh");
});

test('retryOnly requests the pending agenda date and clears its warning after recovery', async () => {
  const dates = window1m();
  fake.local.set(CONFIG.cacheKey, { fetchedDates: dates, records: [], extra: {}, savedAt: 1 });
  scriptFetch(() => new Response('boom', { status: 500 }));
  await loadData(1, () => {}, { historial: false });

  const fetchedDates = [];
  scriptFetch(url => { fetchedDates.push(dayOf(url)); return []; });
  const res = await loadData(1, () => {}, { historial: false, retryOnly: true });

  assert.deepEqual(fetchedDates, [today8]);
  assert.equal(res.sync.agenda.status, 'ok');
  assert.deepEqual(res.sync.agenda.failedItems, []);
});

test('an agenda retry that closes a mutable historical appointment also refreshes its history', async () => {
  const dates = window1m();
  const staleDate = dates[0];
  fake.local.set(CONFIG.cacheKey, {
    fetchedDates: dates,
    records: [{ id: 7, fecha8: staleDate, run: '17752753K', estado: 'Iniciada', nombre: 'Ana Prueba' }],
    extra: {}, savedAt: 1,
  });
  fake.local.set(CONFIG.historialKey, {
    fetchedDates: dates, records: [rawAtencion(70, staleDate)], extra: { team: {} }, savedAt: 1,
  });
  fake.local.set(CONFIG.syncKeys.agenda, {
    source: 'agenda', status: 'partial', failedItems: [staleDate], lastSuccessAt: 1,
  });
  fake.local.set(CONFIG.syncKeys.historial, {
    source: 'historial', status: 'ok', failedItems: [], lastSuccessAt: 1,
  });

  const historyDates = [];
  scriptFetch((url, _n, init) => {
    if (url.includes('HistorialAtencion')) {
      historyDates.push(JSON.parse(init.body).FechaInicio.slice(0, 8));
      return [rawAtencion(71, staleDate)];
    }
    return [rawCita(7, staleDate, 'Completado')];
  });
  const res = await loadData(1, () => {}, { historial: true, retryOnly: true });

  assert.deepEqual(historyDates, [staleDate]);
  assert.equal(res.sync.agenda.status, 'ok');
  assert.equal(res.sync.historial.status, 'ok');
  assert.ok(fake.local.get(CONFIG.historialKey).records.some(record => record.id === 71));
});

test('a recovered agenda date refreshes history even when no appointment was cached before', async () => {
  const dates = window1m();
  const recoveredDate = dates[0];
  fake.local.set(CONFIG.cacheKey, { fetchedDates: dates, records: [], extra: {}, savedAt: 1 });
  fake.local.set(CONFIG.historialKey, { fetchedDates: dates, records: [], extra: { team: {} }, savedAt: 1 });
  fake.local.set(CONFIG.syncKeys.agenda, {
    source: 'agenda', status: 'partial', failedItems: [recoveredDate], lastSuccessAt: 1,
  });
  fake.local.set(CONFIG.syncKeys.historial, {
    source: 'historial', status: 'ok', failedItems: [], lastSuccessAt: 1,
  });

  const historyDates = [];
  scriptFetch((url, _n, init) => {
    if (url.includes('HistorialAtencion')) {
      historyDates.push(JSON.parse(init.body).FechaInicio.slice(0, 8));
      return [rawAtencion(72, recoveredDate)];
    }
    return [rawCita(8, recoveredDate, 'Completado')];
  });
  const res = await loadData(1, () => {}, { historial: true, retryOnly: true });

  assert.deepEqual(historyDates, [recoveredDate]);
  assert.equal(res.sync.historial.status, 'ok');
  assert.ok(fake.local.get(CONFIG.historialKey).records.some(record => record.id === 72));
});

test('401 flags the session and stops after the batch in flight', async () => {
  scriptFetch(() => new Response('', { status: 401 }));
  const res = await loadData(1, () => {}, { historial: false });
  assert.equal(res.sessionExpired, true);
  assert.ok(calls.length <= CONFIG.batchSize, `stopped after one batch (${calls.length} calls)`);
  assert.equal(fake.local.get(CONFIG.cacheKey), undefined, 'nothing was marked as fetched');
});

test('an interrupted agenda run records the clinical-history dates it did not reach', async () => {
  scriptFetch((url, n) => {
    if (n === 1) cancelRun();
    return url.includes('HistorialAtencion') ? [] : [];
  });
  const res = await loadData(1, () => {}, { historial: true });
  assert.equal(res.cancelled, true);
  assert.equal(res.sync.historial.status, 'partial', 'cancelar deja pendientes, no un error');
  assert.ok(res.sync.historial.failedItems.length > 0);
  assert.equal(calls.some(url => url.includes('HistorialAtencion')), false);
});

test('retryOnly recovers pending agenda and history dates outside the visible period', async () => {
  const old = new Date();
  old.setMonth(old.getMonth() - 2);
  const old8 = localDateStr(old);
  const dates = window1m();
  fake.local.set(CONFIG.cacheKey, {
    fetchedDates: dates, records: [{ id: 7, fecha8: old8, run: '17752753K', nombre: 'Ana Prueba' }], extra: {}, savedAt: 1,
  });
  fake.local.set(CONFIG.historialKey, { fetchedDates: dates, records: [], extra: { team: {} }, savedAt: 1 });
  for (const source of ['agenda', 'historial']) fake.local.set(CONFIG.syncKeys[source], {
    source, status: 'partial', failedItems: [old8], lastSuccessAt: 1,
  });

  const agendaDates = [], historyDates = [];
  scriptFetch((url, _n, init) => {
    if (url.includes('HistorialAtencion')) {
      historyDates.push(JSON.parse(init.body).FechaInicio.slice(0, 8));
      return [rawAtencion(77, old8)];
    }
    agendaDates.push(dayOf(url));
    return [rawCita(7, old8)];
  });
  const res = await loadData(1, () => {}, { historial: true, retryOnly: true });

  assert.deepEqual(agendaDates, [old8]);
  assert.deepEqual(historyDates, [old8]);
  assert.equal(res.sync.agenda.status, 'ok');
  assert.equal(res.sync.historial.status, 'ok');
  assert.ok(fake.local.get(CONFIG.historialKey).records.some(record => record.id === 77), 'the off-window clinical detail stays cached');
});

test('a normal shorter load preserves pending dates outside its visible window', async () => {
  const old = new Date();
  old.setMonth(old.getMonth() - 2);
  const old8 = localDateStr(old);
  const dates = window1m();
  fake.local.set(CONFIG.cacheKey, { fetchedDates: dates, records: [], extra: {}, savedAt: 1 });
  fake.local.set(CONFIG.historialKey, { fetchedDates: dates, records: [], extra: { team: {} }, savedAt: 1 });
  for (const source of ['agenda', 'historial']) fake.local.set(CONFIG.syncKeys[source], {
    source, status: 'partial', failedItems: [old8], lastSuccessAt: 1,
  });
  scriptFetch(url => url.includes('HistorialAtencion') ? [] : []);

  const res = await loadData(1, () => {}, { historial: true });

  assert.ok(res.sync.agenda.failedItems.includes(old8));
  assert.ok(res.sync.historial.failedItems.includes(old8));
  assert.equal(res.sync.agenda.status, 'partial', 'una fecha pendiente de antes, fuera de la ventana, no es un error de esta carga');
  assert.equal(res.sync.historial.status, 'partial');
});

test('turning clinical history off does not erase its pending retry dates', async () => {
  const pendingDate = window1m()[0];
  fake.local.set(CONFIG.syncKeys.historial, {
    source: 'historial', status: 'partial', failedItems: [pendingDate], lastSuccessAt: 1,
  });
  scriptFetch(() => []);

  const res = await loadData(1, () => {}, { historial: false });

  assert.equal(res.sync.historial.status, 'disabled');
  assert.deepEqual(res.sync.historial.failedItems, [pendingDate]);
});

test('a normal load retries an in-window history date even if its cache marker still exists', async () => {
  const dates = window1m();
  const pendingDate = dates[0];
  fake.local.set(CONFIG.cacheKey, { fetchedDates: dates, records: [], extra: {}, savedAt: 1 });
  fake.local.set(CONFIG.historialKey, { fetchedDates: dates, records: [], extra: { team: {} }, savedAt: 1 });
  fake.local.set(CONFIG.syncKeys.historial, {
    source: 'historial', status: 'partial', failedItems: [pendingDate], lastSuccessAt: 1,
  });
  const historyDates = [];
  scriptFetch((url, _n, init) => {
    if (url.includes('HistorialAtencion')) historyDates.push(JSON.parse(init.body).FechaInicio.slice(0, 8));
    return [];
  });

  const res = await loadData(1, () => {}, { historial: true });

  assert.ok(historyDates.includes(pendingDate));
  assert.equal(res.sync.historial.failedItems.includes(pendingDate), false);
});

test('retryOnly clears pending agenda dates that have aged outside retention', async () => {
  fake.local.set(CONFIG.syncKeys.agenda, {
    source: 'agenda', status: 'partial', failedItems: ['20200101'], lastSuccessAt: 1,
  });
  scriptFetch(() => []);

  const res = await loadData(1, () => {}, { historial: false, retryOnly: true });

  assert.deepEqual(calls, []);
  assert.deepEqual(res.sync.agenda.failedItems, []);
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
