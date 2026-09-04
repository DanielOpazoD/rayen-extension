import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createLabSearch, withinRange } from '../src/lab-search.js';

// La búsqueda vivía en la pestaña, mezclada con el DOM: el token que descarta
// respuestas tardías, la cancelación y el filtro de período no tenían prueba.
const RUT = '11.957.001-8';
const orden = over => ({ numDocumentoCompleto: '0119570018', OrdenEncryptada: 'abc', FechaOrden: '/Date(1756800000000)/', NumeroOrden: 1, ...over });
const examen = (date = '01/09/2026') => ({ id: '7', date, time: '08:00', rutBody: '11957001', patientName: 'X', origin: 'MED', exams: [], link: 'detalleexamenes.php?x=7' });
const later = (ms, value) => new Promise(r => setTimeout(() => r(value), ms));

function harness(over = {}) {
  const events = { state: [], hsr: [], hhr: [] };
  const s = createLabSearch({
    fetchHsr: async () => [orden()], fetchHhr: async () => [examen()],
    onState: p => events.state.push(p), onHsr: r => events.hsr.push(r), onHhr: r => events.hhr.push(r),
    ...over,
  });
  return { s, events };
}

test('withinRange filtra por período y no oculta lo que no tiene fecha legible', () => {
  assert.equal(withinRange('15/08/2026', '2026-08-01', '2026-08-31'), true);
  assert.equal(withinRange('15/07/2026', '2026-08-01', ''), false);
  assert.equal(withinRange('', '2026-08-01', '2026-08-31'), true);
  assert.equal(withinRange('15/08/2026', '', ''), true);
});

test('un RUT sin verificador se rechaza antes de tocar la red', async () => {
  let fetched = 0;
  const { s } = harness({ fetchHsr: async () => { fetched++; return []; }, fetchHhr: async () => { fetched++; return []; } });
  assert.deepEqual(s.start('11957001'), { rejected: 'ambiguous' });
  assert.deepEqual(s.start('  '), { rejected: 'empty' });
  assert.equal(fetched, 0);
});

test('una búsqueda completa entrega resultados por origen y deja el RUT buscado', async () => {
  const { s, events } = harness();
  const out = s.start(RUT, {});
  assert.equal(s.searching, true);
  assert.deepEqual(await out.done, { superseded: false });
  assert.equal(s.searching, false);
  assert.deepEqual(s.rut, { body: '11957001', display: RUT });
  assert.equal(events.hsr.at(-1).status, 'ok');
  assert.equal(events.hhr.at(-1).status, 'ok');
  assert.equal(s.results.hsr.length, 1);
  assert.equal(s.results.hhr.length, 1);
});

test('la respuesta tardía de una búsqueda reemplazada se descarta', async () => {
  let n = 0;
  const { s, events } = harness({ fetchHsr: async () => (++n === 1 ? later(60, [orden({ NumeroOrden: 'vieja' })]) : [orden({ NumeroOrden: 'nueva' })]) });
  const primera = s.start(RUT);
  const segunda = s.start(RUT);
  assert.deepEqual(await primera.done, { superseded: true });
  assert.deepEqual(await segunda.done, { superseded: false });
  await later(80);
  assert.deepEqual(events.hsr.filter(r => r.status === 'ok').map(r => r.results[0].numero), ['nueva'], 'la respuesta vieja no llega a pintarse');
});

test('cancelar invalida la búsqueda en curso y apaga «buscando»', async () => {
  const { s, events } = harness({ fetchHsr: async () => later(50, [orden()]), fetchHhr: async () => later(50, [examen()]) });
  const out = s.start(RUT);
  s.cancel();
  assert.equal(s.searching, false);
  assert.deepEqual(await out.done, { superseded: true });
  assert.equal(events.hsr.length, 0, 'lo que llegó tras cancelar no se entrega');
});

test('el Salvador que responde con otro RUN se marca como discordante y no se muestra', async () => {
  const { s, events } = harness({ fetchHsr: async () => [orden({ numDocumentoCompleto: '0165432109' })] });
  await s.start(RUT).done;
  assert.equal(events.hsr.at(-1).status, 'mismatch');
  assert.deepEqual(s.results.hsr, []);
});

test('SysLab se filtra por período aquí y se informa cuántas quedan fuera', async () => {
  const { s, events } = harness({ fetchHhr: async () => [examen('01/09/2026'), examen('01/01/2020')] });
  await s.start(RUT, { desde: '2026-01-01', hasta: '' }).done;
  const r = events.hhr.at(-1);
  assert.equal(r.status, 'ok');
  assert.equal(r.results.length, 1);
  assert.equal(r.ocultas, 1);
});

test('un error de sesión se distingue de uno de red', async () => {
  const { s, events } = harness({
    fetchHsr: async () => { throw Object.assign(new Error(), { name: 'LabAuthError' }); },
    fetchHhr: async () => { throw new TypeError('Failed to fetch'); },
  });
  await s.start(RUT).done;
  assert.equal(events.hsr.at(-1).status, 'auth');
  assert.equal(events.hhr.at(-1).status, 'error');
});

test('isStale detecta que lo escrito ya no es lo buscado; reset lo borra todo', async () => {
  const { s } = harness();
  await s.start(RUT).done;
  assert.equal(s.isStale('11.957.001-8'), false);
  assert.equal(s.isStale('16.940.645-6'), true);
  s.reset();
  assert.deepEqual(s.rut, { body: '', display: '' });
  assert.deepEqual(s.results, { hsr: [], hhr: [] });
  assert.equal(s.isStale('16.940.645-6'), false, 'sin búsqueda no hay nada desfasado');
});

// Balance 5: tres mutantes que sobrevivían. Cada test falla si se quita la
// guarda correspondiente.
test('reset en vuelo: nada de lo que llegue después se entrega', async () => {
  const { s, events } = harness({ fetchHsr: async () => later(40, [orden()]), fetchHhr: async () => later(40, [examen()]) });
  const out = s.start(RUT);
  s.reset();
  assert.deepEqual(await out.done, { superseded: true });
  await later(60);
  assert.equal(events.hsr.length + events.hhr.length, 0);
  assert.deepEqual(events.state.at(-1), { searching: false, rutBody: '', rutDisplay: '' });
});

test('un error tardío de una búsqueda reemplazada se descarta', async () => {
  let n = 0;
  const { s, events } = harness({ fetchHsr: async () => (++n === 1 ? later(40).then(() => { throw new Error('boom'); }) : [orden()]) });
  const primera = s.start(RUT);
  const segunda = s.start(RUT);
  await Promise.all([primera.done, segunda.done]);
  await later(60);
  assert.deepEqual(events.hsr.map(r => r.status), ['ok'], 'el error de la primera no se pinta sobre la segunda');
});

test('la búsqueda reemplazada no apaga «buscando» mientras la nueva sigue en curso', async () => {
  let n = 0;
  const { s } = harness({ fetchHsr: async () => later(++n === 1 ? 10 : 80, [orden()]), fetchHhr: async () => [examen()] });
  const primera = s.start(RUT);
  const segunda = s.start(RUT);
  await primera.done;
  assert.equal(s.searching, true, 'la primera terminó, pero la segunda sigue');
  await segunda.done;
  assert.equal(s.searching, false);
});

test('cancelar aborta de verdad las peticiones en curso', async () => {
  let seen = null;
  const { s } = harness({ fetchHsr: async (rut, range) => { seen = range.signal; return later(80, [orden()]); } });
  s.start(RUT);
  assert.equal(seen?.aborted, false);
  s.cancel();
  assert.equal(seen.aborted, true);
});
