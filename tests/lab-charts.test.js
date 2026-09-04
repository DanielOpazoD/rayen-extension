import { test } from 'node:test';
import assert from 'node:assert/strict';
import { trendSVG, renderTrends } from '../src/ui/lab-charts.js';

const serie = (values) => ({
  analysis: 'Creatinina',
  unit: 'mg/dL',
  points: values.map(([label, value, alert], i) => ({
    examId: String(i + 1), label, value, alert: Boolean(alert), timestamp: i,
  })),
});

test('trendSVG dibuja un punto por medición y rotula la serie', () => {
  const svg = trendSVG(serie([['01/09 08:00', 1.1], ['03/09 09:30', 2.4, true]]));
  assert.match(svg, /<svg[^>]+viewBox=/);
  assert.match(svg, /Creatinina/);
  assert.match(svg, /mg\/dL/);
  assert.equal((svg.match(/<circle/g) || []).length, 2);
});

test('trendSVG distingue visualmente la medición fuera de rango', () => {
  const svg = trendSVG(serie([['a', 1.1], ['b', 2.4, true]]));
  // El punto alterado usa el color de alerta; el normal, el de la serie.
  assert.match(svg, /fill="var\(--bad\)"/);
  assert.match(svg, /fill="var\(--brand\)"/);
});

test('trendSVG describe la serie para lectura no visual', () => {
  const svg = trendSVG(serie([['a', 1.1], ['b', 2.4, true]]));
  assert.match(svg, /aria-label="[^"]*2 mediciones[^"]*1 fuera de rango/);
});

test('trendSVG no dibuja una serie de un solo punto', () => {
  assert.equal(trendSVG(serie([['a', 1.1]])), '');
  assert.equal(trendSVG({ analysis: 'X', unit: '', points: [] }), '');
});

test('trendSVG sobrevive a una serie plana sin dividir por cero', () => {
  const svg = trendSVG(serie([['a', 5], ['b', 5], ['c', 5]]));
  assert.equal((svg.match(/<circle/g) || []).length, 3);
  assert.ok(!svg.includes('NaN'), 'ninguna coordenada puede ser NaN');
});

test('trendSVG escapa el texto que viene de la API', () => {
  const svg = trendSVG({
    analysis: '<script>alert(1)</script>',
    unit: '"',
    points: [{ label: 'a', value: 1 }, { label: 'b', value: 2 }],
  });
  assert.ok(!svg.includes('<script>'), 'no debe inyectarse marcado');
  assert.match(svg, /&lt;script&gt;/);
});

test('la banda normal se dibuja cuando todos los puntos comparten rango', () => {
  const conRango = {
    analysis: 'Potasio', unit: 'mEq/L',
    points: [
      { label: 'a', value: 4.0, refMin: 3.5, refMax: 5.1 },
      { label: 'b', value: 6.2, alert: true, refMin: 3.5, refMax: 5.1 },
    ],
  };
  assert.match(trendSVG(conRango), /<rect[^>]+fill="var\(--good-soft/);
});

test('sin rango común no se dibuja banda: sería dar por normal lo que no lo era', () => {
  // Dos informes con rangos distintos (otro laboratorio, u otra edad).
  const rangoCambiante = {
    analysis: 'Hemoglobina', unit: 'g/dL',
    points: [
      { label: 'a', value: 13, refMin: 13, refMax: 17 },
      { label: 'b', value: 12, refMin: 11.5, refMax: 15 },
    ],
  };
  assert.ok(!trendSVG(rangoCambiante).includes('good-soft'));
  // Y sin rango declarado, tampoco.
  const sinRango = { analysis: 'X', unit: '', points: [{ label: 'a', value: 1 }, { label: 'b', value: 2 }] };
  assert.ok(!trendSVG(sinRango).includes('good-soft'));
});

test('la banda entra en la escala aunque todos los valores estén fuera', () => {
  // Un paciente con todo alterado igual debe ver dónde empieza lo normal.
  const svg = trendSVG({
    analysis: 'Creatinina', unit: 'mg/dL',
    points: [
      { label: 'a', value: 8, alert: true, refMin: 0.7, refMax: 1.3 },
      { label: 'b', value: 9, alert: true, refMin: 0.7, refMax: 1.3 },
    ],
  });
  assert.match(svg, /<rect/);
  assert.ok(!svg.includes('NaN'));
});

test('renderTrends muestra primero las series con alteraciones', () => {
  const normal = { ...serie([['a', 1], ['b', 1.1]]), analysis: 'Sodio' };
  const alterada = { ...serie([['a', 1], ['b', 9, true]]), analysis: 'Potasio' };
  const html = renderTrends([normal, alterada]);
  assert.ok(html.indexOf('Potasio') < html.indexOf('Sodio'));
});

test('renderTrends explica la ausencia en vez de mostrar un hueco', () => {
  assert.match(renderTrends([]), /Sin series/);
  assert.match(renderTrends(null), /Sin series/);
});
