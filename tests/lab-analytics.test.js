import { test } from 'node:test';
import { parseReportText } from '../src/lab-parser.js';
import assert from 'node:assert/strict';
import {
  buildAnalysis, comparisonClipboard, sanitizeExamList,
  normalizePatientRutBody, normalizeRutBody, examRowsMatchRut, rutInputAmbiguous,
  IMPORTANT_ANALYSES, MAX_SELECTED_EXAMS,
} from '../src/lab-analytics.js';

const EXAMS = [
  { id: '101', date: '01/09/2026', time: '08:00', patientName: 'PEREZ, JUAN', origin: 'URGENCIA', exams: ['Hemograma'], rutBody: '16940645' },
  { id: '102', date: '03/09/2026', time: '09:30', patientName: 'PEREZ, JUAN', origin: 'MEDICINA', exams: ['Hemograma', 'Orina'], rutBody: '16940645' },
];

const DETAILS = [
  {
    examId: '101',
    rutBody: '16940645',
    findings: [
      { section: 'HEMOGRAMA', analysis: 'Hemoglobina', result: '13,5', unit: 'g/dL', refValue: '13,0 - 17,0' },
      { section: 'BIOQUIMICA', analysis: 'Creatinina', result: '1,10', unit: 'mg/dL', refValue: '0,7 - 1,3' },
    ],
  },
  {
    examId: '102',
    rutBody: '16940645',
    findings: [
      { section: 'HEMOGRAMA', analysis: 'Hemoglobina', result: '10,8', unit: 'g/dL', refValue: '13,0 - 17,0' },
      { section: 'BIOQUIMICA', analysis: 'Creatinina', result: '2,40', unit: 'mg/dL', refValue: '0,7 - 1,3' },
      { section: 'ORINA COMPLETA', analysis: 'Leucocitos', result: '30', unit: '/uL', refValue: '0 - 5' },
    ],
  },
];

test('buildAnalysis ordena los informes cronológicamente en las columnas', () => {
  const a = buildAnalysis(DETAILS, EXAMS);
  assert.deepEqual(a.columns.map(c => c.key), ['101', '102']);
  assert.equal(a.columns[0].label, '01/09/2026 08:00');
  // `reports` va al revés: lo más reciente primero, que es como se lee.
  assert.deepEqual(a.reports.map(r => r.examId), ['102', '101']);
});

test('buildAnalysis arma la matriz y respeta el orden clínico de lectura', () => {
  const a = buildAnalysis(DETAILS, EXAMS);
  const names = a.comparison.map(r => r.analysis);
  // Hemoglobina precede a Creatinina en IMPORTANT_ANALYSES.
  assert.ok(names.indexOf('Hemoglobina') < names.indexOf('Creatinina'));

  const hb = a.comparison.find(r => r.analysis === 'Hemoglobina');
  assert.equal(hb.values['101'].result, '13,5');
  assert.equal(hb.values['102'].result, '10,8');
  assert.equal(hb.values['101'].alert, false);
  assert.equal(hb.values['102'].alert, true);
});

test('buildAnalysis separa filas por sección: un leucocito urinario no es hematológico', () => {
  const a = buildAnalysis(DETAILS, EXAMS);
  const urinarios = a.comparison.filter(r => r.section === 'ORINA COMPLETA');
  assert.equal(urinarios.length, 1);
  assert.equal(urinarios[0].analysis, 'Leucocitos');
});

test('buildAnalysis excluye muestras no sistémicas de las tendencias', () => {
  const a = buildAnalysis(DETAILS, EXAMS);
  const trended = a.trends.map(t => t.analysis);
  assert.ok(trended.includes('Hemoglobina'));
  assert.ok(trended.includes('Creatinina'));
  assert.ok(!trended.includes('Leucocitos'), 'el leucocito urinario no entra en tendencias');
});

test('una tendencia necesita al menos dos puntos medibles', () => {
  const soloUno = buildAnalysis([DETAILS[0]], [EXAMS[0]]);
  assert.deepEqual(soloUno.trends, []);
});

test('buildAnalysis resume informes, hallazgos y alertas', () => {
  const a = buildAnalysis(DETAILS, EXAMS);
  assert.equal(a.summary.reportCount, 2);
  assert.equal(a.summary.findingCount, 5);
  // Hb baja, creatinina alta y leucocituria: tres alteraciones.
  assert.equal(a.summary.alertCount, 3);
});

test('comparisonClipboard produce TSV pegable con hueco explícito', () => {
  const a = buildAnalysis(DETAILS, EXAMS);
  const tsv = comparisonClipboard(a);
  const [header, ...rows] = tsv.split('\n');
  assert.equal(header, 'Variable\t01/09/2026 08:00\t03/09/2026 09:30');
  const urina = rows.find(r => r.startsWith('Leucocitos'));
  // El primer informe no tenía orina: se marca el hueco, no se inventa un valor.
  assert.ok(urina.includes('\t--\t'));
});

test('sanitizeExamList ordena de más reciente a más antiguo y descarta ids no numéricos', () => {
  const list = sanitizeExamList([...EXAMS, { id: 'abc', date: '05/09/2026' }]);
  assert.deepEqual(list.map(e => e.id), ['102', '101']);
});

test('normalizePatientRutBody quita el dígito verificador sólo si es correcto', () => {
  assert.equal(normalizePatientRutBody('17752753K'), '17752753');
  assert.equal(normalizePatientRutBody('16.940.645-6'), '16940645');
  // Con un DV que no cuadra, el valor completo era el cuerpo.
  assert.equal(normalizePatientRutBody('169406459'), '169406459');
});

// La fila fusionada de bilirrubinas fijaba `alert:false` y borraba la
// referencia, con lo que una ictericia franca se pintaba como valor normal
// mientras la cabecera seguía contándola entre las alteradas.
test('la fila de bilirrubinas conserva la alerta de sus componentes', () => {
  const exams = [{ id: '1', date: '01/09/2026', time: '08:00', patientName: 'X', origin: 'H', exams: [] }];
  const a = buildAnalysis([{ examId: '1', rutBody: '1', findings: [
    { section: 'HEPATICO', analysis: 'Bilirrubina T.', result: '15,4', unit: 'mg/dL', refValue: '0,2 - 1,2' },
    { section: 'HEPATICO', analysis: 'Bilirrubina D.', result: '11,0', unit: 'mg/dL', refValue: '0,0 - 0,3' },
  ] }], exams);

  const fila = a.comparison.find(r => r.analysis === 'Bilirrubinas (T/D/I)');
  assert.equal(fila.values['1'].alert, true, 'una bilirrubina de 15,4 no puede verse como normal');
  assert.equal(fila.values['1'].result, '15,4 / 11,0 / –');
  assert.equal(fila.values['1'].unit, 'mg/dL', 'la unidad sale del informe, no de una constante');
  assert.match(fila.values['1'].refValue, /0,2 - 1,2/, 'la referencia no puede borrarse');
});

test('unas bilirrubinas normales no se marcan', () => {
  const exams = [{ id: '1', date: '01/09/2026', time: '08:00', patientName: 'X', origin: 'H', exams: [] }];
  const a = buildAnalysis([{ examId: '1', rutBody: '1', findings: [
    { section: 'HEPATICO', analysis: 'Bilirrubina T.', result: '0,8', unit: 'mg/dL', refValue: '0,2 - 1,2' },
  ] }], exams);
  assert.equal(a.comparison.find(r => r.analysis === 'Bilirrubinas (T/D/I)').values['1'].alert, false);
});

test('una bilirrubina urinaria no fabrica una fila de perfil hepático', () => {
  const exams = [{ id: '1', date: '01/09/2026', time: '08:00', patientName: 'X', origin: 'H', exams: [] }];
  const a = buildAnalysis([{ examId: '1', rutBody: '1', findings: [
    { section: 'ORINA COMPLETA', analysis: 'Bilirrubina', result: 'NEGATIVO', unit: '', refValue: 'NEGATIVO' },
  ] }], exams);

  assert.ok(!a.comparison.some(r => r.analysis === 'Bilirrubinas (T/D/I)'),
    'no puede inventarse una fila hepática que el informe no midió');
  const urinaria = a.comparison.find(r => r.section === 'ORINA COMPLETA');
  assert.ok(urinaria, 'el dato urinario debe conservar su propia fila');
  assert.equal(urinaria.values['1'].result, 'NEGATIVO');
});

test('el orden clínico de lectura empieza por hemograma y no tiene repetidos', () => {
  // Un reordenamiento accidental cambia silenciosamente cómo lee el médico.
  assert.equal(IMPORTANT_ANALYSES[0], 'Recuento Leucocitos');
  assert.equal(new Set(IMPORTANT_ANALYSES).size, IMPORTANT_ANALYSES.length);
  const orden = name => IMPORTANT_ANALYSES.indexOf(name);
  assert.ok(orden('Hemoglobina') < orden('Creatinina'));
  assert.ok(orden('Creatinina') < orden('Sodio'));
  assert.ok(orden('ASAT/GOT') < orden('Bilirrubinas'));
});

test('el lote de análisis está acotado a 24 informes', () => {
  assert.equal(MAX_SELECTED_EXAMS, 24);
});

test('examRowsMatchRut protege la identidad del lote', () => {
  assert.equal(examRowsMatchRut(EXAMS, '16940645'), true);
  assert.equal(examRowsMatchRut([...EXAMS, { rutBody: '17752753' }], '16940645'), false);
  assert.equal(normalizeRutBody('16.940.645-6'), '16940645');
});

// Regresión del balance 2: con el nombre truncado a «Total», bilirrubina y
// colesterol compartían fila y la fila fusionada T/D/I nunca se formaba.
test('buildAnalysis mantiene separados «Bilirrubina Total» y «Colesterol Total» y fusiona las bilirrubinas', () => {
  const exams = [{ id: '201', date: '01/09/2026', time: '08:00', patientName: 'PEREZ, JUAN', origin: 'MEDICINA', exams: ['Perfil hepático'], rutBody: '16940645' }];
  const details = [{ examId: '201', rutBody: '16940645', findings: [
    { section: 'QUIMICA SANGUINEA', analysis: 'Bilirrubina Total', result: '15,4', unit: 'mg/dL', refValue: '0,3 - 1,2' },
    { section: 'QUIMICA SANGUINEA', analysis: 'Bilirrubina Directa', result: '0,4', unit: 'mg/dL', refValue: '0,0 - 0,3' },
    { section: 'QUIMICA SANGUINEA', analysis: 'Bilirrubina Indirecta', result: '15,0', unit: 'mg/dL', refValue: '0,2 - 0,9' },
    { section: 'QUIMICA SANGUINEA', analysis: 'Colesterol Total', result: '210', unit: 'mg/dL', refValue: '< 200' },
  ] }];
  const a = buildAnalysis(details, exams);
  const rows = Array.isArray(a.comparison) ? a.comparison : a.comparison.rows;
  const texto = JSON.stringify(rows);
  assert.doesNotMatch(texto, /"Total"/, 'ninguna fila se llama «Total»');
  assert.match(texto, /Colesterol/);
  assert.match(texto, /Bilirrubina/);
  assert.equal(rows.length, 2, `una fila de bilirrubinas (T/D/I) y una de colesterol; hay: ${rows.map(r => r.analysis ?? r.name ?? r.key).join(' | ')}`);
});

// Regresión del balance 2: «1195700» sin verificador pasaba el módulo 11 como
// 119570-0 y buscaba a otra persona. Sin guion, 7 u 8 dígitos son ambiguos.
test('rutInputAmbiguous exige verificador explícito cuando la entrada puede ser dos RUT', () => {
  assert.equal(rutInputAmbiguous('1195700'), true, '7 dígitos: ¿cuerpo de 7 o 6 + verificador?');
  assert.equal(rutInputAmbiguous('11957001'), true, '8 dígitos: ¿cuerpo de 8 o 7 + verificador?');
  assert.equal(rutInputAmbiguous('11.957.001'), true, 'los puntos no aportan el verificador');
  assert.equal(rutInputAmbiguous('119570018'), false, '9 dígitos: cuerpo de 8 + verificador, sin duda');
  assert.equal(rutInputAmbiguous('11.957.001-8'), false);
  assert.equal(rutInputAmbiguous('11957001-8'), false);
  assert.equal(rutInputAmbiguous('17752753K'), false, 'la K sólo puede ser verificador');
  assert.equal(rutInputAmbiguous('123456'), false, 'menos de 7 dígitos no es un RUT buscable; lo rechaza otra validación');
});

// Balance 3: «mEq/L Adultos:» como unidad partía el potasio en dos filas y
// dejaba cero tendencias. La unidad limpia vuelve a unir la variable.
test('la misma variable con y sin rótulo de edad cae en una sola fila y forma tendencia', () => {
  const exams = [
    { id: '301', date: '01/08/2026', time: '08:00', patientName: 'PEREZ, JUAN', origin: 'MEDICINA', exams: ['ELP'], rutBody: '16940645' },
    { id: '302', date: '01/09/2026', time: '08:00', patientName: 'PEREZ, JUAN', origin: 'MEDICINA', exams: ['ELP'], rutBody: '16940645' },
  ];
  const finding = text => parseReportText(`QUIMICA\n${text}`)[0];
  const details = [
    { examId: '301', rutBody: '16940645', findings: [finding('Potasio: 4,2 mEq/L Adultos: 3,5 - 5,0')] },
    { examId: '302', rutBody: '16940645', findings: [finding('Potasio: 5,9 mEq/L 3,5 - 5,0')] },
  ];
  const a = buildAnalysis(details, exams);
  const rows = Array.isArray(a.comparison) ? a.comparison : a.comparison.rows;
  assert.equal(rows.length, 1, `una sola fila de potasio; hay ${rows.length}`);
  assert.ok(a.trends.length >= 1, 'dos mediciones de la misma variable forman tendencia');
});

// Balance 4: un «4.500» sin unidad se mezclaba con 4500 de otro informe en la
// tendencia de leucocitos.
test('un recuento ambiguo no entra a la tendencia', () => {
  // Tres informes de la misma fila (misma sección, analito y unidad vacía): el
  // primero es «4.500», que sin unidad puede ser 4,5 o 4500.
  const exam = (id, date) => ({ id, date, time: '08:00', patientName: 'PEREZ, JUAN', origin: 'MEDICINA', exams: ['Hemograma'], rutBody: '16940645' });
  const det = (id, result) => ({ examId: id, rutBody: '16940645', findings: [{ section: 'HEMOGRAMA', analysis: 'Recuento Leucocitos', result, unit: '', refValue: '' }] });
  const a = buildAnalysis([det('401', '4.500'), det('402', '6100'), det('403', '5800')], [exam('401', '01/07/2026'), exam('402', '01/08/2026'), exam('403', '01/09/2026')]);
  const t = a.trends.find(x => /leucocit/i.test(x.analysis));
  const puntos = (t?.points ?? []).filter(Boolean).map(p => p.value);
  assert.deepEqual(puntos, [6100, 5800], 'el ambiguo queda fuera; los dos claros forman la tendencia');
});

// La marca del laboratorio debe llegar a la matriz: sanitizeFinding la perdía.
test('la matriz conserva la marca del laboratorio y alerta por ella', () => {
  const exams = [{ id: '501', date: '01/09/2026', time: '08:00', patientName: 'PEREZ, JUAN', origin: 'MEDICINA', exams: ['Perfil'], rutBody: '16940645' }];
  const [finding] = parseReportText('QUIMICA\nGlucosa: 105 mg/dL 70 - 100 *');
  const a = buildAnalysis([{ examId: '501', rutBody: '16940645', findings: [finding] }], exams);
  const rows = Array.isArray(a.comparison) ? a.comparison : a.comparison.rows;
  const cell = rows[0].values['501'];
  assert.equal(cell.flag, '*'); assert.equal(cell.alert, true);
});
