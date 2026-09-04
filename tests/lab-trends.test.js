import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  TREND_TIME_RANGES,
  buildTrendGroups,
  countTrendVariables,
  filterTrendGroups,
  groupReferenceBand,
  groupSeriesByScale,
  latestTrendTimestamp,
} from '../src/ui/lab-trends.js';
import { buildAnalysis } from '../src/core/lab-analytics.js';

const HORA = 60 * 60 * 1000;
const DIA = 24 * HORA;
// Instante fijo: el módulo nunca mira el reloj, así que las pruebas tampoco.
const ULTIMO_EXAMEN = Date.UTC(2026, 8, 3, 8, 0);

/** Un punto de tendencia con la forma que emite `buildAnalysis`. */
const punto = (diasAntes, value, extra = {}) => ({
  examId: `e-${diasAntes}`,
  label: `-${diasAntes} d`,
  timestamp: ULTIMO_EXAMEN - diasAntes * DIA,
  value,
  alert: false,
  refMin: null,
  refMax: null,
  ...extra,
});

/** Una serie: los puntos van de la más antigua a la más reciente. */
const serie = (analysis, unit, points, section = 'BIOQUIMICA') =>
  ({ analysis, unit, section, points });

const SERIES = [
  serie('Sodio', 'mmol/L', [punto(10, 138), punto(2, 133), punto(0, 129, { alert: true })]),
  serie('Creatinina', 'mg/dL', [punto(10, 0.9), punto(2, 1.0), punto(0, 1.1)]),
  serie('INR', '', [punto(2, 1.1), punto(0, 1.3)]),
];

test('cada serie cae en su grupo clínico, en el orden del catálogo', () => {
  const grupos = buildTrendGroups([
    ...SERIES,
    serie('Hemoglobina', 'g/dL', [punto(2, 12.1), punto(0, 11.4)], 'HEMOGRAMA'),
  ]);

  assert.deepEqual(
    grupos.map(g => g.label),
    ['Electrolitos', 'Función Renal', 'Hemograma', 'Otros']
  );
  assert.deepEqual(grupos[0].series.map(s => s.analysis), ['Sodio']);
  // El INR no está en ningún patrón del catálogo: sin cajón de sastre
  // desaparecería de la vista agrupada sin que nadie lo note.
  assert.deepEqual(grupos[3].series.map(s => s.analysis), ['INR']);
});

test('una serie con un solo punto no arma tendencia', () => {
  const grupos = buildTrendGroups([serie('Sodio', 'mmol/L', [punto(0, 138)])]);
  assert.deepEqual(grupos, []);
});

test('la ventana temporal se ancla en el último examen, no en el reloj', () => {
  const grupos = buildTrendGroups(SERIES);
  assert.equal(latestTrendTimestamp(grupos), ULTIMO_EXAMEN);

  // El lote entero es de hace meses; con la ventana anclada en el último examen
  // el paciente sigue teniendo tendencia a la vista.
  const tresDias = filterTrendGroups(grupos, { range: '3d' });
  assert.deepEqual(
    tresDias.map(g => g.series.map(s => s.points.map(p => p.timestamp - ULTIMO_EXAMEN))),
    [[[-2 * DIA, 0]], [[-2 * DIA, 0]], [[-2 * DIA, 0]]]
  );

  // Con la ventana más larga vuelven los puntos antiguos.
  assert.equal(filterTrendGroups(grupos, { range: '30d' })[0].series[0].points.length, 3);
  assert.equal(filterTrendGroups(grupos, { range: 'all' })[0].series[0].points.length, 3);
});

test('la ventana acepta un ancla explícita y un rango desconocido no vacía la vista', () => {
  const grupos = buildTrendGroups(SERIES);

  // Anclada tres días después del último examen, la ventana de 24 h no alcanza
  // a ningún punto y no queda tendencia que mostrar.
  assert.deepEqual(filterTrendGroups(grupos, { range: '24h', anchor: ULTIMO_EXAMEN + 3 * DIA }), []);

  // Una preferencia guardada de otra versión se degrada a «Todo».
  assert.equal(countTrendVariables(filterTrendGroups(grupos, { range: '90d' })), 3);
});

test('una ventana que deja un solo punto descarta la serie: un valor suelto no es tendencia', () => {
  const grupos = buildTrendGroups(SERIES);
  assert.deepEqual(filterTrendGroups(grupos, { range: '24h' }), []);
});

test('«sólo alterados» mira los puntos que quedaron dentro de la ventana', () => {
  // La única alteración del potasio es la de hace diez días: ya corregida, no
  // debe seguir marcando la serie como alterada en la vista de tres días.
  const grupos = buildTrendGroups([
    ...SERIES,
    serie('Potasio', 'mmol/L', [punto(10, 6.5, { alert: true }), punto(2, 4.2), punto(0, 4.0)]),
  ]);

  const todo = filterTrendGroups(grupos, { range: 'all', onlyAltered: true });
  assert.deepEqual(todo.map(g => g.series.map(s => s.analysis)), [['Sodio', 'Potasio']]);

  const tresDias = filterTrendGroups(grupos, { range: '3d', onlyAltered: true });
  assert.deepEqual(tresDias.map(g => g.series.map(s => s.analysis)), [['Sodio']]);
  assert.equal(countTrendVariables(tresDias), 1);
});

test('la búsqueda ignora tildes y el rótulo del grupo arrastra a sus variables', () => {
  const grupos = buildTrendGroups([
    ...SERIES,
    serie('Nitrogeno Ureico', 'mg/dL', [punto(2, 18), punto(0, 24)]),
  ]);

  const porGrupo = filterTrendGroups(grupos, { range: 'all', search: 'funcion renal' });
  assert.deepEqual(porGrupo.map(g => g.label), ['Función Renal']);
  assert.deepEqual(porGrupo[0].series.map(s => s.analysis), ['Creatinina', 'Nitrogeno Ureico']);

  const porVariable = filterTrendGroups(grupos, { range: 'all', search: 'crea' });
  assert.deepEqual(porVariable.map(g => g.label), ['Función Renal']);
  assert.deepEqual(porVariable[0].series.map(s => s.analysis), ['Creatinina']);

  assert.deepEqual(filterTrendGroups(grupos, { range: 'all', search: 'troponina' }), []);
});

test('filtrar no muta los grupos de entrada', () => {
  const grupos = buildTrendGroups(SERIES);
  const antes = JSON.parse(JSON.stringify(grupos));
  filterTrendGroups(grupos, { range: '3d', search: 'sodio', onlyAltered: true });
  assert.deepEqual(grupos, antes);
});

test('la partición por escala separa unidades y magnitudes incomparables', () => {
  const hepatico = [
    serie('Fosfatasa Alcalina', 'U/L', [punto(2, 480), punto(0, 520)]),
    serie('ASAT/GOT', 'U/L', [punto(2, 14), punto(0, 18)]),
    serie('ALAT/GPT', 'u / l', [punto(2, 16), punto(0, 20)]),
    serie('Bilirrubina Total', 'mg/dL', [punto(2, 0.8), punto(0, 1.4)]),
  ];

  const subgraficos = groupSeriesByScale(hepatico);
  assert.deepEqual(
    subgraficos.map(g => g.series.map(s => s.analysis)),
    [['ASAT/GOT', 'ALAT/GPT'], ['Fosfatasa Alcalina'], ['Bilirrubina Total']]
  );
  // La unidad se escribe distinto en el informe pero es la misma escala.
  assert.equal(subgraficos[0].unit, 'U/L');
  assert.equal(subgraficos[2].unit, 'mg/dL');
});

test('magnitudes parecidas siguen compartiendo eje', () => {
  const electrolitos = [
    serie('Sodio', 'mmol/L', [punto(2, 138), punto(0, 129)]),
    serie('Cloro', 'mmol/L', [punto(2, 104), punto(0, 98)]),
    serie('Potasio', 'mmol/L', [punto(2, 4.1), punto(0, 3.2)]),
  ];

  const subgraficos = groupSeriesByScale(electrolitos);
  assert.deepEqual(
    subgraficos.map(g => g.series.map(s => s.analysis)),
    [['Potasio'], ['Cloro', 'Sodio']]
  );
});

test('la banda de referencia se comparte sólo cuando el rango es idéntico', () => {
  const conRango = (analysis, refMin, refMax) => serie(analysis, 'mmol/L', [
    punto(2, 138, { refMin, refMax }),
    punto(0, 133, { refMin, refMax }),
  ]);

  assert.deepEqual(groupReferenceBand([conRango('Sodio', 135, 145)]), { min: 135, max: 145 });
  assert.deepEqual(
    groupReferenceBand([conRango('Sodio', 135, 145), conRango('Sodio HSR', 136, 145)]),
    null
  );
  assert.equal(groupReferenceBand([serie('INR', '', [punto(2, 1.1), punto(0, 1.3)])]), null);
  assert.equal(groupReferenceBand([]), null);

  // Cota abierta («< 0,5»): la banda llega al borde, igual que en lab-charts.
  assert.deepEqual(groupReferenceBand([conRango('Troponina', null, 0.5)]), { min: null, max: 0.5 });

  // Un rango que cambió entre informes no puede pintarse como uno solo.
  const cambiante = serie('Sodio', 'mmol/L', [
    punto(2, 138, { refMin: 135, refMax: 145 }),
    punto(0, 133, { refMin: 136, refMax: 146 }),
  ]);
  assert.equal(groupReferenceBand([cambiante]), null);
});

test('las ventanas ofrecidas son coherentes: identificadores únicos y duración creciente', () => {
  const ids = TREND_TIME_RANGES.map(r => r.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.equal(ids[ids.length - 1], 'all');
  assert.equal(TREND_TIME_RANGES[TREND_TIME_RANGES.length - 1].ms, null);

  const duraciones = TREND_TIME_RANGES.filter(r => r.ms != null).map(r => r.ms);
  assert.deepEqual(duraciones, [...duraciones].sort((a, b) => a - b));
  assert.ok(TREND_TIME_RANGES.every(r => r.label));
});

test('opera sobre las tendencias reales que emite buildAnalysis', () => {
  const exams = [
    { id: '201', date: '01/09/2026', time: '08:00', rutBody: '16940645', exams: ['Perfil bioquímico'] },
    { id: '202', date: '03/09/2026', time: '08:00', rutBody: '16940645', exams: ['Perfil bioquímico'] },
  ];
  const details = [
    {
      examId: '201',
      rutBody: '16940645',
      findings: [
        { section: 'BIOQUIMICA', analysis: 'Sodio', result: '138', unit: 'mmol/L', refValue: '135 - 145' },
        { section: 'BIOQUIMICA', analysis: 'Creatinina', result: '0,9', unit: 'mg/dL', refValue: '0,7 - 1,3' },
      ],
    },
    {
      examId: '202',
      rutBody: '16940645',
      findings: [
        { section: 'BIOQUIMICA', analysis: 'Sodio', result: '129', unit: 'mmol/L', refValue: '135 - 145' },
        { section: 'BIOQUIMICA', analysis: 'Creatinina', result: '2,4', unit: 'mg/dL', refValue: '0,7 - 1,3' },
      ],
    },
  ];

  const analysis = buildAnalysis(details, exams);
  const grupos = buildTrendGroups(analysis.trends);
  assert.deepEqual(grupos.map(g => g.label), ['Electrolitos', 'Función Renal']);
  assert.equal(countTrendVariables(grupos), 2);

  const sodio = grupos[0].series[0];
  assert.deepEqual(Object.keys(sodio.points[0]).sort(), [
    'alert', 'examId', 'label', 'refMax', 'refMin', 'timestamp', 'value',
  ]);
  assert.deepEqual(groupReferenceBand(grupos[0].series), { min: 135, max: 145 });

  // Ventana anclada en el último examen: dos días separan los informes, así que
  // en 24 h no hay tendencia y en 7 d están las dos completas.
  const anchor = latestTrendTimestamp(grupos);
  assert.equal(anchor, analysis.trends[0].points[1].timestamp);
  assert.deepEqual(filterTrendGroups(grupos, { range: '24h', anchor }), []);
  assert.equal(countTrendVariables(filterTrendGroups(grupos, { range: '7d', anchor })), 2);

  // El sodio bajo está alterado; la creatinina alta también.
  assert.equal(countTrendVariables(filterTrendGroups(grupos, { range: 'all', onlyAltered: true })), 2);
});
