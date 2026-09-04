import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sexLetter, sicRole, whenLabel, sortRecords, row } from '../src/table.js';
import { CONFIG } from '../src/config.js';

test('sexLetter reduces Rayen sex labels to one letter', () => {
  assert.equal(sexLetter('Mujer'), 'M');
  assert.equal(sexLetter('Hombre'), 'H');
  assert.equal(sexLetter('Indeterminado'), 'I');
  assert.equal(sexLetter(''), '');
});

test('whenLabel gives the weekday in words plus the hour', () => {
  assert.equal(whenLabel({ fecha8: '20260901', hora: '09:55' }), 'Martes · 09:55');
  assert.equal(whenLabel({ fecha8: '20260905', hora: '' }), 'Sábado');
  assert.equal(whenLabel({ fecha8: '', hora: '10:00' }), '10:00');
});

test('sicRole: Emití when I registered it, Recibí when I execute it or it opened my cita, Otra otherwise', () => {
  const me = CONFIG.officerId;
  const base = { registrador: { id: 1 }, ejecutor: { id: 2 } };
  assert.equal(sicRole({ ...base, registrador: { id: me } }), 'out');
  assert.equal(sicRole({ ...base, ejecutor: { id: me } }), 'in');
  assert.equal(sicRole(base, true), 'in', 'the SIC that generated my appointment counts as received');
  assert.equal(sicRole(base), 'other');
  assert.equal(sicRole({ registrador: { id: me }, ejecutor: { id: me } }), 'out', 'author wins over executor');
});

test('sortRecords sorts by date+hour and falls back to hour for ties', () => {
  const rows = [
    { id: 1, fechaAtencion: '01-09-2026', hora: '16:00' },
    { id: 2, fechaAtencion: '02-09-2026', hora: '09:00' },
    { id: 3, fechaAtencion: '01-09-2026', hora: '09:00' },
  ];
  assert.deepEqual(sortRecords(rows, 'fechaAtencion', -1).map(r => r.id), [2, 1, 3]);
  assert.deepEqual(sortRecords(rows, 'fechaAtencion', 1).map(r => r.id), [3, 1, 2]);
  const byAge = sortRecords([{ edad: 5, hora: '' }, { edad: null, hora: '' }, { edad: 40, hora: '' }], 'edad', 1);
  assert.deepEqual(byAge.map(r => r.edad), [null, 5, 40]);
});

// ── Contrato de la fila (Etapa 2, fase B) ────────────────────────────
// Cada fila tenía tres paradas de tabulación (nombre, «i», RUN) más una por
// interconsulta, y apilaba hasta cuatro SIC: 132 px de alto y cinco filas
// visibles de 289. La fila es ahora la única parada y muestra una sola SIC.
const sic = (id, especialidad, extra = {}) => ({
  id, fecha: '01-08-2026', estado: 'Atendida', especialidad, grupo: 'atendida', cie10: '', diagnostico: '',
  registrador: { id: 1, nombre: 'Dra. X' }, ejecutor: { id: 2, nombre: '' }, contrarreferencias: [], ...extra,
});
const paciente = extra => ({
  id: 'c1', fechaAtencion: '03-09-2026', fecha8: '20260903', hora: '08:00', nombre: 'Rosa Ejemplo', runStr: '6.543.210-2', run: '65432102',
  edad: 79, sexo: 'Mujer', razon: 'Control', tipoAtencion: 'Control Salud', estado: 'Confirmado', diagnosticos: [], note: '', ...extra,
});
const ctx = (origin, others) => ({
  sicsById: new Map(origin ? [[origin.id, origin]] : []),
  sicsByRun: new Map([['65432102', [...(origin ? [origin] : []), ...others]]]),
});

test('la fila es la única parada de tabulación: sus controles internos quedan fuera del orden', () => {
  const html = row(paciente({ icSIC: 10 }), ctx(sic(10, 'Reumatología'), [sic(11, 'Cardiología')]));
  assert.match(html, /^<tr [^>]*tabindex="-1"/, 'la fila entra al roving tabindex (la primera pasa a 0 al pintar)');
  assert.doesNotMatch(html, /tabindex="0"/, 'nombre, «i», RUN y SIC no deben ser paradas propias');
  assert.match(html, /class="run copy-run"[^>]*tabindex="-1"/, 'el RUN sigue siendo botón para el ratón');
});

test('la celda de interconsultas muestra una sola SIC y agrupa las demás en «+n» con su detalle', () => {
  const origin = sic(10, 'Reumatología');
  const others = [sic(11, 'Cardiología'), sic(12, 'Dermatología'), sic(13, 'Neurología')];
  const conOrigen = row(paciente({ icSIC: 10 }), ctx(origin, others));
  assert.equal((conOrigen.match(/class="ic-line/g) ?? []).length, 1, 'con origen, sólo la SIC de origen');
  assert.match(conOrigen, /class="ic-chip bg sic-run"[^>]*>\+3</, 'las otras tres van en el chip');
  assert.match(conOrigen, /data-tip="Cardiología · Atendida&#10;|data-tip="Cardiología · Atendida\n/, 'el chip lista lo que agrupa');

  const sinOrigen = row(paciente(), ctx(null, others));
  assert.equal((sinOrigen.match(/class="ic-line/g) ?? []).length, 1, 'sin origen, la primera del paciente');
  assert.match(sinOrigen, />\+2</);

  const sinSIC = row(paciente(), ctx(null, []));
  assert.doesNotMatch(sinSIC, /ic-line|sic-run/);
});
