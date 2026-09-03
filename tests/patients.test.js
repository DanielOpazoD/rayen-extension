import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildPatients, filterPatients, sortPatients, setPatientSort } from '../src/patients.js';

const rec = (over = {}) => ({
  id: 1, run: '1K', runStr: '1-K', nombre: 'Ana Pérez', edad: 40, sexo: 'Mujer',
  fechaAtencion: '01-09-2026', fecha8: '20260901', hora: '10:00', note: '',
  diagnosticos: [], ap: 'Pérez', am: '', dob: '01-01-1986', ...over,
});
const sic = (over = {}) => ({
  id: 90, paciente: { run: '1K', nombre: 'Ana Pérez' }, especialidad: 'Reumatología',
  estado: 'Nueva', estadoId: 13, grupo: 'pendiente', antiguedadDias: 30,
  registrador: { id: 439550, nombre: 'Opazo' }, ejecutor: { id: 9, nombre: 'Otra' }, ...over,
});

test('buildPatients agrupa atenciones por paciente y toma la más reciente como referencia', () => {
  const p = buildPatients([
    rec({ id: 1, fechaAtencion: '01-08-2026', fecha8: '20260801' }),
    rec({ id: 2, fechaAtencion: '01-09-2026', fecha8: '20260901', note: 'control en nov' }),
    rec({ id: 3, run: '2K', runStr: '2-K', nombre: 'Luis Soto', ap: 'Soto' }),
  ]);
  assert.equal(p.length, 2, 'dos pacientes, no tres atenciones');
  const ana = p.find(x => x.run === '1K');
  assert.equal(ana.visitas, 2);
  assert.equal(ana.ultima, '01-09-2026', 'la última atención manda');
  assert.equal(ana.nota, 'control en nov');
  assert.equal(ana.id, 2, 'el id apunta a la atención más reciente, para abrir el panel');
});

test('buildPatients: diagnósticos distintos, sin repetir, marcando GES', () => {
  const p = buildPatients([
    rec({ id: 1, fechaAtencion: '01-08-2026', diagnosticos: [{ nombre: 'HTA', clasificacion: 'Hipertensión', esAuge: false }] }),
    rec({ id: 2, fechaAtencion: '01-09-2026', diagnosticos: [
      { nombre: 'HTA', clasificacion: 'Hipertensión', esAuge: true },
      { nombre: 'Asma', clasificacion: 'Asma', esAuge: false },
      { nombre: 'x', clasificacion: 'No Informado', esAuge: false },
    ] }),
  ]);
  assert.equal(p[0].dx.length, 2, '«No Informado» se descarta y HTA no se duplica');
  assert.equal(p[0].dx.find(d => d.nombre === 'HTA').esAuge, true, 'basta una vez GES para marcarlo');
  assert.equal(p[0].ges, true);
});

test('buildPatients cruza interconsultas abiertas y pendientes por RUN', () => {
  const p = buildPatients(
    [rec()],
    [sic({ id: 90 }), sic({ id: 91, grupo: 'cerrada', estadoId: 20, estado: 'Egresada' })],
    [{ run: '1K', titulo: 'Interconsulta sin cursar', dias: 40 }, { run: '9Z', titulo: 'otro', dias: 5 }],
  );
  assert.equal(p[0].sics.length, 2);
  assert.equal(p[0].abiertas.length, 1, 'solo pendiente/en curso cuentan como abiertas');
  assert.equal(p[0].pend.length, 1, 'los pendientes de otro RUN no se cuelan');
});

test('buildPatients agrupa por nombre cuando no hay RUN', () => {
  const p = buildPatients([
    rec({ id: 1, run: null, runStr: '', fechaAtencion: '01-08-2026' }),
    rec({ id: 2, run: null, runStr: '', fechaAtencion: '01-09-2026' }),
  ]);
  assert.equal(p.length, 1);
  assert.equal(p[0].visitas, 2);
});

test('filterPatients: búsqueda por nombre, RUN, nota y diagnóstico', () => {
  const list = buildPatients([
    rec({ id: 1, note: 'derivar a cardio', diagnosticos: [{ nombre: 'HTA', clasificacion: 'HTA' }] }),
    rec({ id: 2, run: '2K', runStr: '17.752.753-K', nombre: 'Luis Soto', ap: 'Soto' }),
  ]);
  assert.equal(filterPatients(list, { q: 'pérez' }).length, 1);
  assert.equal(filterPatients(list, { q: '17.752' })[0].nombre, 'Luis Soto');
  assert.equal(filterPatients(list, { q: 'cardio' })[0].run, '1K', 'la nota también se busca');
  assert.equal(filterPatients(list, { q: 'hta' })[0].run, '1K');
  assert.equal(filterPatients(list, {}).length, 2);
});

test('filterPatients: filtros rápidos', () => {
  const list = buildPatients(
    [rec({ id: 1, note: 'x', diagnosticos: [{ nombre: 'HTA', clasificacion: 'HTA', esAuge: true }] }),
     rec({ id: 2, run: '2K', runStr: '2-K', nombre: 'Luis Soto', ap: 'Soto' })],
    [sic()],
    [{ run: '1K', titulo: 'Sin CR', dias: 40 }],
  );
  assert.deepEqual(filterPatients(list, { modo: 'sic' }).map(p => p.run),  ['1K']);
  assert.deepEqual(filterPatients(list, { modo: 'pend' }).map(p => p.run), ['1K']);
  assert.deepEqual(filterPatients(list, { modo: 'ges' }).map(p => p.run),  ['1K']);
  assert.deepEqual(filterPatients(list, { modo: 'nota' }).map(p => p.run), ['1K']);
  assert.deepEqual(filterPatients(list, { modo: 'rec' }).map(p => p.run).sort(), ['1K', '2K']);
});

test('sortPatients: por defecto la última atención primero', () => {
  const list = buildPatients([
    rec({ id: 1, nombre: 'Ana Pérez', fechaAtencion: '01-09-2026' }),
    rec({ id: 2, run: '2K', runStr: '2-K', nombre: 'Beto Soto', ap: 'Soto', fechaAtencion: '05-09-2026', fecha8: '20260905' }),
  ]);
  assert.equal(sortPatients(list)[0].nombre, 'Beto Soto', 'el visto más recientemente encabeza');
});

test('setPatientSort: columna nueva fija su dirección natural; repetirla invierte', () => {
  const list = buildPatients([
    rec({ id: 1, nombre: 'Ana Pérez', fechaAtencion: '01-09-2026' }),
    rec({ id: 2, run: '2K', runStr: '2-K', nombre: 'Beto Soto', ap: 'Soto', fechaAtencion: '05-09-2026', fecha8: '20260905' }),
  ]);
  assert.deepEqual(setPatientSort('nombre'), { key: 'nombre', dir: 1 }, 'texto: ascendente');
  assert.equal(sortPatients(list)[0].nombre, 'Ana Pérez');
  assert.deepEqual(setPatientSort('nombre'), { key: 'nombre', dir: -1 }, 'misma columna: invierte');
  assert.equal(sortPatients(list)[0].nombre, 'Beto Soto');
  assert.deepEqual(setPatientSort('visitas'), { key: 'visitas', dir: -1 }, 'numérica: descendente');
  assert.deepEqual(setPatientSort('nope'), { key: 'visitas', dir: -1 }, 'columna desconocida no cambia nada');
});
