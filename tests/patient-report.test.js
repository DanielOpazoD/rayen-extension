import { test } from 'node:test';
import assert from 'node:assert/strict';
import { filterVisitsByScope, buildPatientReport, SCOPE_LABEL } from '../src/patient-report.js';
import { ageBucket } from '../src/charts.js';
import { CONFIG } from '../src/config.js';

const ME = CONFIG.officerId;
const v = (id, prestadores, extra = {}) => ({
  id, fechaAtencion: '01-09-2026', fecha8: '20260901', hora: '10:00', tipoAtencion: 'Control',
  prestadores, diagnosticos: [], actividades: [], sections: {}, anamnesis: { motivo: '', historia: '' }, ...extra,
});
const yo   = v(1, [{ id: ME, nombre: 'Opazo Damiani Daniel', instrumento: 'Médico' }]);
const otro = v(2, [{ id: 5, nombre: 'Otra Médica', instrumento: 'Médico' }]);
const kine = v(3, [{ id: 6, nombre: 'Kine Uno', instrumento: 'Kinesiólogo(a)' }]);
const agenda = v(4, []); // agenda-only row: no prestadores

test('filterVisitsByScope: todos / médicos / solo yo', () => {
  const all = [yo, otro, kine, agenda];
  assert.deepEqual(filterVisitsByScope(all, 'todos').map(x => x.id),   [1, 2, 3, 4]);
  assert.deepEqual(filterVisitsByScope(all, 'medicos').map(x => x.id), [1, 2, 4], 'kine excluded; agenda rows count as the officer');
  assert.deepEqual(filterVisitsByScope(all, 'yo').map(x => x.id),      [1, 4]);
});

test('buildPatientReport falls back to the agenda when the ficha is not loaded and says so', () => {
  const cur = { record: { nombre: 'Paciente Prueba', runStr: '1-K', dob: '01-01-1990', edad: 36, sexo: 'Mujer', prevision: 'Fonasa B' },
                visits: [agenda], sics: [], ficha: null };
  const { fragment, css } = buildPatientReport(cur, 'yo');
  assert.match(fragment, /Paciente Prueba/);
  assert.match(fragment, /ficha no cargada/);
  assert.match(fragment, new RegExp(SCOPE_LABEL.yo.replace('·', '·')));
  assert.ok(css.includes('@page'));
});

test('buildPatientReport: interconsultas scope renders the clinical SIC without administrative metadata', () => {
  const sic = { id: 9, fecha: '10-08-2026', especialidad: 'Reumatología', estado: 'Atendido', grupo: 'atendida', esAuge: true,
    registrador: { nombre: 'Opazo' }, ejecutor: { nombre: 'Mezzano' }, motivo: 'Confirmación', diagnostico: 'AR', cie10: 'M06.9',
    fundamentos: 'Dolor poliarticular', examenes: '' };
  const cur = { record: { nombre: 'P', runStr: '', dob: '', sexo: '', prevision: '' }, visits: [], sics: [sic], ficha: { visits: [yo], master: null, antecedentes: { farmacos: [] } } };
  const { fragment } = buildPatientReport(cur, 'ic');
  assert.match(fragment, /Interconsultas · 1/);
  assert.match(fragment, /M06\.9/);
  assert.doesNotMatch(fragment, /contrarreferencia/i);
  assert.doesNotMatch(fragment, /Atenciones · /, 'ic scope has no atenciones section');
});

test('buildPatientReport: completo includes atenciones, IC and fármacos', () => {
  const cur = { record: { nombre: 'P', runStr: '', dob: '', sexo: '', prevision: '' }, visits: [], sics: [],
    ficha: { visits: [yo, otro], master: { ficha: '123', dob: '01-01-1990', sexo: 'Mujer', prevision: 'Fonasa A', telefonos: '9' },
             antecedentes: { farmacos: [{ label: 'Losartán 50 mg', posologia: '1 c/12 h', estado: 'Pendiente', fecha: '28-08-2026', hearts: true }] } } };
  const { fragment } = buildPatientReport(cur, 'completo');
  assert.match(fragment, /todos los profesionales · 2/);
  assert.match(fragment, /Losartán 50 mg/);
  assert.match(fragment, /N° ficha/);
});

test('ageBucket follows clinical brackets and tolerates bad input', () => {
  assert.deepEqual([0, 3, 7, 12, 17, 30, 50, 80].map(ageBucket), ['<1','1–4','5–9','10–14','15–19','20–44','45–64','65+']);
  assert.equal(ageBucket(null), null);
  assert.equal(ageBucket('x'), null);
});
