import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computePendientes, resumirPendientes } from '../src/pendientes.js';
import { computeCambios } from '../src/watch.js';
import { CONFIG } from '../src/config.js';

const ME = CONFIG.officerId;
const HOY = new Date(2026, 8, 3);           // 03-09-2026

function sic(over = {}) {
  return {
    id: 1, fecha: '01-08-2026', fecha8: '20260801', fechaCita: '', antiguedadDias: 33,
    estado: 'Atendido', estadoId: 5, grupo: 'atendida', especialidad: 'Reumatología',
    contrarreferencias: [], prioridad: 2,
    paciente: { nombre: 'Paciente Uno', run: '1K', runStr: '1-K' },
    registrador: { id: ME, nombre: 'Opazo' }, ejecutor: { id: 9, nombre: 'Otro' },
    ...over,
  };
}
const tipos = ps => ps.map(p => p.tipo);

// ── Regla 1: atendida sin contrarreferencia ────────────────────

test('marca la atendida sin contrarreferencia pasado el umbral', () => {
  const p = computePendientes([], [sic()], { hoy: HOY });
  assert.deepEqual(tipos(p), ['cr-faltante']);
  assert.equal(p[0].dias, 33);
  assert.match(p[0].nota, /otra vía/, 'la ausencia se declara como falta de registro, no de información');
});

test('no la marca si la contrarreferencia existe, ni antes del umbral', () => {
  assert.deepEqual(tipos(computePendientes([], [sic({ contrarreferencias: [{ fecha: '02-08-2026' }] })], { hoy: HOY })), []);
  assert.deepEqual(tipos(computePendientes([], [sic({ antiguedadDias: 10 })], { hoy: HOY })), []);
});

test('ignora las de otros profesionales salvo que se pidan todas', () => {
  const ajena = sic({ registrador: { id: 7, nombre: 'X' }, ejecutor: { id: 8, nombre: 'Y' } });
  assert.deepEqual(tipos(computePendientes([], [ajena], { hoy: HOY })), []);
  assert.deepEqual(tipos(computePendientes([], [ajena], { hoy: HOY, soloMias: false })), ['cr-faltante']);
});

// ── Regla 2: nunca cursada ─────────────────────────────────────

test('marca la SIC que sigue en «Nueva» pasado el umbral', () => {
  const p = computePendientes([], [sic({ estadoId: 13, estado: 'Nueva', grupo: 'pendiente', antiguedadDias: 30 })], { hoy: HOY });
  assert.deepEqual(tipos(p), ['sic-nueva']);
});

// ── Regla 3: cita pasada ───────────────────────────────────────

test('marca la cita ya pasada con la solicitud aún abierta', () => {
  const p = computePendientes([], [sic({ estadoId: 4, estado: 'Con Cita Confirmada', grupo: 'enviada', fechaCita: '01-08-2026 10:30' })], { hoy: HOY });
  assert.deepEqual(tipos(p), ['cita-pasada']);
  assert.equal(p[0].dias, 33);
});

test('no marca una cita futura', () => {
  const p = computePendientes([], [sic({ estadoId: 4, grupo: 'enviada', fechaCita: '30-09-2026 10:30' })], { hoy: HOY });
  assert.deepEqual(tipos(p), []);
});

// ── Regla 4: control vencido ───────────────────────────────────

const rec = (over = {}) => ({
  id: 100, run: '2K', nombre: 'Paciente Dos', fecha8: '20260701', fechaAtencion: '01-07-2026',
  proximoControl: [{ id: 1, motivo: 'Control con exámenes', fecha8: '20260828', fecha: '28-08-2026', descartada: false }],
  ...over,
});

test('marca el control que él mismo pidió y venció sin atención posterior', () => {
  const p = computePendientes([rec()], [], { hoy: HOY });
  assert.deepEqual(tipos(p), ['control-vencido']);
  assert.equal(p[0].dias, 6);
  assert.match(p[0].detalle, /Control con exámenes/);
});

test('no lo marca si hubo una atención posterior a la fecha sugerida', () => {
  const posterior = rec({ id: 101, fecha8: '20260901', fechaAtencion: '01-09-2026', proximoControl: [] });
  assert.deepEqual(tipos(computePendientes([rec(), posterior], [], { hoy: HOY })), []);
});

test('no lo marca si la orden fue descartada o aún no vence', () => {
  const desc = rec({ proximoControl: [{ id: 1, motivo: 'x', fecha8: '20260828', fecha: '28-08-2026', descartada: true }] });
  assert.deepEqual(tipos(computePendientes([desc], [], { hoy: HOY })), []);
  const futuro = rec({ proximoControl: [{ id: 2, motivo: 'x', fecha8: '20261106', fecha: '06-11-2026', descartada: false }] });
  assert.deepEqual(tipos(computePendientes([futuro], [], { hoy: HOY })), []);
});

// ── Orden y agrupación ─────────────────────────────────────────

test('ordena por severidad y luego por antigüedad, y agrupa por tipo', () => {
  const p = computePendientes([rec()], [
    sic({ id: 1, antiguedadDias: 40 }),
    sic({ id: 2, antiguedadDias: 90 }),
  ], { hoy: HOY });
  assert.deepEqual(tipos(p), ['cr-faltante', 'cr-faltante', 'control-vencido']);
  assert.deepEqual(p.slice(0, 2).map(x => x.dias), [90, 40], 'lo más antiguo primero');
  const g = resumirPendientes(p);
  assert.deepEqual(g.map(x => x.tipo), ['cr-faltante', 'control-vencido']);
  assert.equal(g[0].items.length, 2);
});

// ── Memoria de cambio ──────────────────────────────────────────

const ESP = ['Reumatología', 'Gastroenterología Adulto'];

test('la primera lectura registra sin inventar novedades', () => {
  const r = computeCambios([sic()], ESP, {});
  assert.equal(r.firstRun, true);
  assert.deepEqual(r.cambios, []);
  assert.equal(r.vigiladas, 1);
  assert.ok(r.next[1], 'deja la huella para la próxima comparación');
});

test('detecta contrarreferencia que llega, cambio de estado y SIC nueva', () => {
  const antes = computeCambios([sic({ id: 1 }), sic({ id: 2, estadoId: 13, estado: 'Nueva', grupo: 'pendiente' })], ESP, {}).next;
  const ahora = [
    sic({ id: 1, contrarreferencias: [{ fecha: '02-09-2026', profesional: 'Dra. X' }] }),
    sic({ id: 2, estadoId: 5, estado: 'Atendido', grupo: 'atendida' }),
    sic({ id: 3 }),
  ];
  const { cambios } = computeCambios(ahora, ESP, antes);
  assert.deepEqual(cambios.map(c => c.tipo), ['contrarreferencia', 'nueva', 'estado']);
  assert.match(cambios[0].ahora, /Dra\. X/);
  assert.equal(cambios[2].antes, 'Nueva');
  assert.equal(cambios[2].ahora, 'Atendido');
});

test('solo vigila las especialidades elegidas', () => {
  const otra = sic({ id: 9, especialidad: 'Dermatología' });
  const r = computeCambios([otra], ESP, { 9: { estadoId: 13, estado: 'Nueva', grupo: 'pendiente', cr: 0, cita: '' } });
  assert.deepEqual(r.cambios, []);
  assert.equal(r.vigiladas, 0);
});

test('sin cambios reales no reporta nada', () => {
  const s = [sic()];
  const snap = computeCambios(s, ESP, {}).next;
  assert.deepEqual(computeCambios(s, ESP, snap).cambios, []);
});
