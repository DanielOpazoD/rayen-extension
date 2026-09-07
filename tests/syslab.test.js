import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeRutBody, examRowsMatchRut, normalizeSyslabExam,
} from '../src/io/syslab-api.js';

test('normalizeRutBody deja sólo el cuerpo del RUT, sin puntos ni dígito verificador', () => {
  assert.equal(normalizeRutBody('16.940.645-6'), '16940645');
  assert.equal(normalizeRutBody('16940645-6'), '16940645');
  assert.equal(normalizeRutBody('16940645'), '16940645');
  assert.equal(normalizeRutBody('56.785.678-K'), '56785678');
  assert.equal(normalizeRutBody(' 56785678 '), '56785678');
  assert.equal(normalizeRutBody(null), '');
  assert.equal(normalizeRutBody(undefined), '');
});

test('examRowsMatchRut acepta un lote cuyas filas son todas del RUN consultado', () => {
  const exams = [
    { id: '1', rutBody: '16940645' },
    { id: '2', rutBody: '16.940.645' },
  ];
  assert.equal(examRowsMatchRut(exams, '16940645'), true);
  assert.equal(examRowsMatchRut(exams, '16.940.645-6'), true);
});

test('examRowsMatchRut rechaza el lote completo si una sola fila es de otro paciente', () => {
  const exams = [
    { id: '1', rutBody: '16940645' },
    { id: '2', rutBody: '56785678' },
  ];
  assert.equal(examRowsMatchRut(exams, '16940645'), false);
});

test('examRowsMatchRut rechaza filas sin RUT legible en vez de asumir que coinciden', () => {
  assert.equal(examRowsMatchRut([{ id: '1', rutBody: '' }], '16940645'), false);
  assert.equal(examRowsMatchRut([{ id: '1' }], '16940645'), false);
  assert.equal(examRowsMatchRut([null], '16940645'), false);
});

test('examRowsMatchRut exige un RUN esperado plausible', () => {
  assert.equal(examRowsMatchRut([], ''), false);
  assert.equal(examRowsMatchRut([], '123'), false);
  assert.equal(examRowsMatchRut([], 'abc'), false);
  // Cero resultados para un RUN válido es una respuesta legítima, no un fallo.
  assert.equal(examRowsMatchRut([], '16940645'), true);
});

test('normalizeSyslabExam sólo ofrece PDF cuando SysLab entregó una ruta de informe', () => {
  const conLink = normalizeSyslabExam({
    id: 42, date: '03/09/2026', time: '10:15', patientName: 'Perez',
    origin: 'Urgencia', exams: ['Hemograma'], link: 'http://10.4.69.90/syslab/detalleexamenes.php?id=42',
  });
  assert.equal(conLink.puedeImprimir, true);
  assert.equal(conLink.id, '42');
  assert.deepEqual(conLink.examenes, ['Hemograma']);

  const sinLink = normalizeSyslabExam({ id: 43, link: null });
  assert.equal(sinLink.puedeImprimir, false);
  assert.deepEqual(sinLink.examenes, []);
});
