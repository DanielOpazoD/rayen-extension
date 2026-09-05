import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computePendientes, resumirPendientes } from '../src/core/pendientes.js';
import { computeCambios } from '../src/io/watch.js';
import { CONFIG } from '../src/core/config.js';

const ME = CONFIG.officerId;
const HOY = new Date(2026, 8, 3);           // 03-09-2026

function sic(over = {}) {
  return {
    id: 1, fecha: '01-08-2026', fecha8: '20260801', fechaCita: '', antiguedadDias: 33,
    estado: 'Atendido', estadoId: 5, grupo: 'atendida', especialidad: 'Reumatología',
    prioridad: 2,
    paciente: { nombre: 'Paciente Uno', run: '1K', runStr: '1-K' },
    registrador: { id: ME, nombre: 'Opazo Damiani Daniel' }, ejecutor: { id: 9, nombre: 'Pérez Tuki Ana María' },
    ...over,
  };
}
const tipos = ps => ps.map(p => p.tipo);

// ── Regla 1: nunca cursada ─────────────────────────────────────

test('marca la SIC que sigue en «Nueva» pasado el umbral', () => {
  const p = computePendientes([], [sic({ estadoId: 13, estado: 'Nueva', grupo: 'pendiente', antiguedadDias: 30 })], { hoy: HOY });
  assert.deepEqual(tipos(p), ['sic-nueva']);
});

// ── Regla 2: cita pasada ───────────────────────────────────────

test('marca la cita ya pasada con la solicitud aún abierta', () => {
  const p = computePendientes([], [sic({ estadoId: 4, estado: 'Con Cita Confirmada', grupo: 'enviada', fechaCita: '01-08-2026 10:30' })], { hoy: HOY });
  assert.deepEqual(tipos(p), ['cita-pasada']);
  assert.equal(p[0].dias, 33);
});

test('no marca una cita futura', () => {
  const p = computePendientes([], [sic({ estadoId: 4, grupo: 'enviada', fechaCita: '30-09-2026 10:30' })], { hoy: HOY });
  assert.deepEqual(tipos(p), []);
});

// ── Regla 3: control vencido ───────────────────────────────────

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
    sic({ id: 1, estadoId: 13, estado: 'Nueva', grupo: 'pendiente', antiguedadDias: 40 }),
    sic({ id: 2, estadoId: 13, estado: 'Nueva', grupo: 'pendiente', antiguedadDias: 90 }),
  ], { hoy: HOY });
  assert.deepEqual(tipos(p), ['sic-nueva', 'sic-nueva', 'control-vencido']);
  assert.deepEqual(p.slice(0, 2).map(x => x.dias), [90, 40], 'lo más antiguo primero');
  const g = resumirPendientes(p);
  assert.deepEqual(g.map(x => x.tipo), ['sic-nueva', 'control-vencido']);
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

test('detecta cambios de estado, cita y SIC nueva', () => {
  const antes = computeCambios([sic({ id: 1 }), sic({ id: 2, estadoId: 13, estado: 'Nueva', grupo: 'pendiente' })], ESP, {}).next;
  const ahora = [
    sic({ id: 1, fechaCita: '04-09-2026 10:00' }),
    sic({ id: 2, estadoId: 5, estado: 'Atendido', grupo: 'atendida' }),
    sic({ id: 3 }),
  ];
  const { cambios } = computeCambios(ahora, ESP, antes);
  assert.deepEqual(cambios.map(c => c.tipo), ['nueva', 'estado', 'cita']);
  assert.equal(cambios[1].antes, 'Nueva');
  assert.equal(cambios[1].ahora, 'Atendido');
  assert.match(cambios[2].ahora, /04-09-2026/);
});

test('solo vigila las especialidades elegidas', () => {
  const otra = sic({ id: 9, especialidad: 'Dermatología' });
  const r = computeCambios([otra], ESP, { 9: { estadoId: 13, estado: 'Nueva', grupo: 'pendiente', cita: '' } });
  assert.deepEqual(r.cambios, []);
  assert.equal(r.vigiladas, 0);
});

test('sin cambios reales no reporta nada', () => {
  const s = [sic()];
  const snap = computeCambios(s, ESP, {}).next;
  assert.deepEqual(computeCambios(s, ESP, snap).cambios, []);
});

test('una interconsulta rechazada es un pendiente con decisión, no una «cerrada» silenciosa', () => {
  const sic = { id: 9, estadoId: 7, estado: 'Rechazada por est. destino', especialidad: 'Reumatología', fecha8: '20260801', antiguedadDias: 34,
    paciente: { run: '1-9', nombre: 'Paciente Prueba Dos' }, registrador: { id: CONFIG.officerId }, ejecutor: { id: 0 } };
  const out = computePendientes([], [sic], { hoy: new Date(2026, 8, 4) });
  assert.equal(out.length, 1); assert.equal(out[0].tipo, 'sic-rechazada'); assert.equal(out[0].severidad, 2);
  assert.match(out[0].titulo, /rechazada · Reumatología/); assert.match(out[0].detalle, /emitida por ti/);
  assert.equal(computePendientes([], [{ ...sic, registrador: { id: 1 } }], { hoy: new Date(2026, 8, 4) }).length, 0, 'sólo las mías');
  assert.equal(computePendientes([], [{ ...sic, antiguedadDias: 300 }], { hoy: new Date(2026, 8, 4) }).length, 0, 'a los 300 días ya no es una decisión pendiente');
});

test('el umbral de días es inclusivo: justo en el umbral ya es pendiente, un día antes no', () => {
  const sic = d => ({ id: 1, estadoId: 13, estado: 'Nueva', especialidad: 'X', fecha8: '20260801', antiguedadDias: d, paciente: { run: '1-9', nombre: 'Paciente Prueba Dos' }, registrador: { id: CONFIG.officerId }, ejecutor: { id: 0 } });
  assert.equal(computePendientes([], [sic(21)], { hoy: new Date(2026, 8, 4) }).length, 1);
  assert.equal(computePendientes([], [sic(20)], { hoy: new Date(2026, 8, 4) }).length, 0);
});

// ── Bordes que la mutación mostró sin defender (Stryker, 05-09-2026: pendientes.js 76 %) ──

test('cada regla dice quién debe actuar y respeta «solo mías» salvo que se pida lo contrario', () => {
  const ajena = { registrador: { id: 77, nombre: 'Pérez Tuki Ana María' }, ejecutor: { id: 78, nombre: 'Riroroko Haoa Luis' } };
  const nueva = sic({ estadoId: 13, estado: 'Nueva', grupo: 'pendiente', antiguedadDias: 30 });
  assert.match(computePendientes([], [nueva], { hoy: HOY })[0].detalle, /emitida por ti/);
  assert.match(computePendientes([], [sic({ ...nueva, registrador: { id: 77 }, ejecutor: { id: ME } })], { hoy: HOY })[0].detalle, /a resolver por ti/);
  assert.deepEqual(computePendientes([], [sic({ ...nueva, ...ajena })], { hoy: HOY }), [], 'la de otro no es mía');
  assert.equal(computePendientes([], [sic({ ...nueva, ...ajena })], { hoy: HOY, soloMias: false }).length, 1, 'salvo que se pida ver todas');
  const citaPasada = sic({ estadoId: 4, estado: 'Con Cita Confirmada', grupo: 'enviada', fechaCita: '01-08-2026 10:30' });
  assert.equal(computePendientes([], [sic({ ...citaPasada, ...ajena })], { hoy: HOY }).length, 0);
  assert.equal(computePendientes([], [sic({ ...citaPasada, ...ajena })], { hoy: HOY, soloMias: false }).length, 1);
  assert.equal(computePendientes([], [sic({ ...citaPasada, estadoId: 5 })], { hoy: HOY }).length, 0, 'sólo agendada (3) o confirmada (4) cuentan como cita pasada');
  assert.equal(computePendientes([], [sic({ ...citaPasada, estadoId: 3 })], { hoy: HOY }).length, 1);
});

test('los umbrales son inclusivos y configurables: cita pasada, rechazada y control vencido', () => {
  const dia = n => { const d = new Date(HOY); d.setDate(d.getDate() - n); return `${String(d.getDate()).padStart(2, '0')}-${String(d.getMonth() + 1).padStart(2, '0')}-${d.getFullYear()}`; };
  const conCita = n => sic({ estadoId: 4, estado: 'Con Cita Confirmada', grupo: 'enviada', fechaCita: `${dia(n)} 10:30` });
  assert.equal(computePendientes([], [conCita(5)], { hoy: HOY, umbrales: { citaDias: 5 } }).length, 1, 'justo en el umbral');
  assert.equal(computePendientes([], [conCita(4)], { hoy: HOY, umbrales: { citaDias: 5 } }).length, 0, 'un día antes no');
  const rechazada = n => sic({ estadoId: 7, estado: 'Rechazada', grupo: 'rechazada', antiguedadDias: n });
  assert.equal(computePendientes([], [rechazada(90)], { hoy: HOY }).length, 1, 'a los 90 días aún exige decisión');
  assert.equal(computePendientes([], [rechazada(91)], { hoy: HOY }).length, 0, 'a los 91 ya es historia');
  assert.equal(computePendientes([], [rechazada(31)], { hoy: HOY, umbrales: { rechazadaDias: 30 } }).length, 0, 'el umbral se puede acortar');
  const d8 = n => { const d = new Date(HOY); d.setDate(d.getDate() - n); return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`; };
  const rec = (fecha8, control) => ({ id: 1, run: '1K', nombre: 'Paciente Uno', fecha8, proximoControl: control ? [{ id: 5, fecha8: d8(control), fecha: dia(control), motivo: 'Control', descartada: false }] : [] });
  assert.equal(computePendientes([rec(d8(30), 3)], [], { hoy: HOY, umbrales: { controlDias: 3 } }).length, 1, 'control vencido justo en el umbral');
  assert.equal(computePendientes([rec(d8(30), 2)], [], { hoy: HOY, umbrales: { controlDias: 3 } }).length, 0);
});

test('control vencido: una atención el mismo día del control no lo da por hecho, y el mismo control en dos filas cuenta una vez', () => {
  const rec = (id, fecha8) => ({ id, run: '1K', nombre: 'Paciente Uno', fecha8, proximoControl: [{ id: 5, fecha8: '20260810', fecha: '10-08-2026', motivo: 'Control con exámenes', descartada: false }] });
  const mismoDia = computePendientes([rec(1, '20260701'), { id: 2, run: '1K', nombre: 'Paciente Uno', fecha8: '20260810', proximoControl: [] }], [], { hoy: HOY });
  assert.equal(mismoDia.length, 1, 'la atención del mismo día no es «posterior»');
  assert.equal(mismoDia[0].titulo, 'Control vencido sin agendar');
  assert.match(mismoDia[0].detalle, /Control con exámenes — sugerido para 10-08-2026/);
  const duplicado = computePendientes([rec(1, '20260701'), rec(2, '20260701')], [], { hoy: HOY });
  assert.equal(duplicado.length, 1, 'el mismo control (mismo id) en dos registros del paciente es un solo pendiente');
});

test('títulos y detalles exactos de cada tipo, y el resumen etiqueta los tipos conocidos', () => {
  const p = computePendientes(
    [{ id: 1, run: '1K', nombre: 'Paciente Uno', fecha8: '20260701', proximoControl: [{ id: 5, fecha8: '20260810', fecha: '10-08-2026', motivo: '', descartada: false }] }],
    [sic({ estadoId: 13, estado: 'Nueva', grupo: 'pendiente', antiguedadDias: 30 }), sic({ id: 2, estadoId: 7, estado: 'Rechazada', grupo: 'rechazada', antiguedadDias: 10 }),
     sic({ id: 3, estadoId: 4, estado: 'Con Cita Confirmada', grupo: 'enviada', fechaCita: '01-08-2026 10:30' })],
    { hoy: HOY });
  const porTipo = Object.fromEntries(p.map(x => [x.tipo, x]));
  assert.equal(porTipo['sic-nueva'].titulo, 'Interconsulta sin cursar · Reumatología');
  assert.equal(porTipo['sic-rechazada'].titulo, 'Interconsulta rechazada · Reumatología');
  assert.match(porTipo['sic-rechazada'].detalle, /Estado «Rechazada» \(emitida por ti\)\. Decide/);
  assert.equal(porTipo['cita-pasada'].titulo, 'Cita pasada sin resolver · Reumatología');
  assert.equal(porTipo['cita-pasada'].detalle, 'La cita era el 01-08-2026 10:30 y la solicitud sigue «Con Cita Confirmada».');
  assert.match(porTipo['control-vencido'].detalle, /^Control — sugerido para 10-08-2026/, 'sin motivo, dice «Control»');
  const resumen = resumirPendientes([...p, { tipo: 'otro-tipo', dias: 1 }]);
  assert.deepEqual(resumen.map(r => r.titulo), ['Interconsultas sin cursar', 'Interconsultas rechazadas', 'Citas pasadas sin resolver', 'Controles vencidos', 'otro-tipo']);
});
