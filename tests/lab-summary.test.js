import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildReportSummary, buildAnalysisSummary } from '../src/core/lab-summary.js';
import { buildAnalysis } from '../src/core/lab-analytics.js';

/** Un informe con la forma que entrega `buildAnalysis().reports`. */
const informe = (findings, date = '08/04/2026', time = '14:00:00') => ({ date, time, findings });

const hallazgo = (section, analysis, result, unit = '', refValue = '') =>
  ({ section, analysis, result, unit, refValue });

test('arma la línea con la cabecera, las siglas y el orden clínico de dictado', () => {
  const texto = buildReportSummary(informe([
    hallazgo('BIOQUIMICA', 'ASAT/GOT', '34', 'U/L', '5 - 40'),
    hallazgo('BIOQUIMICA', 'Sodio', '140', 'mmol/L', '135 - 145'),
    hallazgo('HEMOGRAMA', 'Hemoglobina', '13,0', 'g/dL', '12,0 - 16,0'),
  ]));

  assert.match(texto, /^Laboratorio \(08\/04\/2026 14:00\): /);
  // El orden lo fija la tabla de siglas, no el orden del informe.
  assert.ok(texto.indexOf('Hb 13,0') < texto.indexOf('Na 140'));
  assert.ok(texto.indexOf('Na 140') < texto.indexOf('GOT 34'));
});

test('omite las unidades universales e imprime las ambiguas', () => {
  const texto = buildReportSummary(informe([
    hallazgo('BIOQUIMICA', 'Sodio', '140', 'mmol/L'),
    hallazgo('BIOQUIMICA', 'Proteina C Reactiva', '57', 'mg/L'),
    hallazgo('HORMONAS', 'TSH', '3,5', 'uUI/mL'),
  ]));

  // Un sodio siempre se dicta sin unidad; una PCR sin unidad es ambigua.
  assert.match(texto, /Na 140(?! mmol)/);
  assert.ok(texto.includes('PCR 57 mg/L'));
  assert.ok(texto.includes('TSH 3,5 uUI/mL'));
});

test('deshace la notación x10^3 y agrega el sufijo de porcentaje', () => {
  const texto = buildReportSummary(informe([
    hallazgo('HEMOGRAMA', 'Leucocitos', '7,5', 'x10^3/uL'),
    hallazgo('HEMOGRAMA', 'Plaquetas', '192', 'x10^3/uL'),
    hallazgo('HEMOGRAMA', 'Hematocrito', '40', 'o/o'),
    hallazgo('HEMOGRAMA', 'Segmentados', '70', 'o/o'),
  ]));

  assert.ok(texto.includes('RGB 7.500'));
  assert.ok(texto.includes('Plaq 192.000'));
  assert.ok(texto.includes('HTO 40%'));
  assert.ok(texto.includes('PMN 70%'));
});

test('un «menor que» no se multiplica: seguiría siendo un límite de detección', () => {
  const texto = buildReportSummary(informe([
    hallazgo('HEMOGRAMA', 'Recuento de Plaquetas', '<0,5', 'x10^3/uL'),
  ]));

  assert.ok(texto.includes('Plaq <0,5'));
  assert.ok(!texto.includes('500'));
});

test('un leucocito de sedimento urinario no se imprime como recuento hematológico', () => {
  const texto = buildReportSummary(informe([
    hallazgo('ORINA COMPLETA', 'Leucocitos', '30', '/uL', '0 - 5'),
    hallazgo('HEMOGRAMA', 'Hemoglobina', '13,0', 'g/dL', '12,0 - 16,0'),
  ]));

  // Sin hemograma de serie blanca, la línea no puede afirmar un RGB.
  assert.ok(texto.includes('Hb 13,0'));
  assert.ok(!texto.includes('RGB'));
});

test('con ambos leucocitos, RGB es el hematológico y nunca el urinario', () => {
  const texto = buildReportSummary(informe([
    hallazgo('ORINA COMPLETA', 'Leucocitos', '30', '/uL', '0 - 5'),
    hallazgo('HEMOGRAMA', 'Leucocitos', '7,5', 'x10^3/uL', '4,5 - 11,0'),
  ]));

  assert.ok(texto.includes('RGB 7.500'));
  assert.ok(!texto.includes('RGB 30'));
});

test('un sodio urinario no se dicta como natremia', () => {
  const texto = buildReportSummary(informe([
    hallazgo('ELECTROLITOS EN ORINA', 'Sodio', '30', 'mmol/L'),
  ]));

  // Cae al modo literal con el nombre completo: no hay «Na 30» que confundir.
  assert.ok(!texto.includes('Na 30'));
  assert.ok(texto.includes('Sodio 30 mmol/L'));
});

test('sin siglas que calcen, imprime nombre completo y valor', () => {
  const texto = buildReportSummary(informe([
    hallazgo('MICROBIOLOGIA', 'Variable Desconocida', '42', 'unidades'),
  ]));

  assert.equal(texto, 'Laboratorio (08/04/2026 14:00): Variable Desconocida 42 unidades');
});

test('un examen sólo cualitativo se puede pegar igual', () => {
  const texto = buildReportSummary(informe([
    { section: 'MICROBIOLOGIA', analysis: 'Cultivo corriente', result: 'SIN DESARROLLO', unit: '', refValue: '', qualitative: true },
  ]));

  assert.equal(texto, 'Laboratorio (08/04/2026 14:00): Cultivo corriente SIN DESARROLLO');
});

test('un resultado cualitativo no ocupa el lugar de la sigla', () => {
  const texto = buildReportSummary(informe([
    { section: 'HEMOGRAMA', analysis: 'Hemoglobina', result: 'HEMOLIZADO', unit: '', refValue: '', qualitative: true },
    hallazgo('HEMOGRAMA', 'Hemoglobina', '13,0', 'g/dL'),
  ]));

  assert.ok(texto.includes('Hb 13,0'));
  assert.ok(!texto.includes('HEMOLIZADO'));
});

test('la hora se recorta a HH:MM y desaparece si el informe no la trae', () => {
  const findings = [hallazgo('HEMOGRAMA', 'Hemoglobina', '13', 'g/dL')];
  assert.ok(buildReportSummary(informe(findings, '08/04/2026', '14:30:45')).startsWith('Laboratorio (08/04/2026 14:30):'));
  assert.ok(buildReportSummary(informe(findings, '08/04/2026', '')).startsWith('Laboratorio (08/04/2026):'));
});

test('normaliza el nombre antes de buscar la sigla', () => {
  const texto = buildReportSummary(informe([
    hallazgo('GASES', 'HCO3 ACTUAL', '22', 'mEq/L'),
    hallazgo('BIOQUIMICA', 'Nitrógeno Ureico', '35', 'mg/dL'),
    hallazgo('BIOQUIMICA', 'Fósforo', '3,1', 'mg/dL'),
  ]));

  assert.ok(texto.includes('HCO3 22'));
  assert.ok(texto.includes('BUN 35'));
  // Con tilde y todo: la tabla de siglas escribe «Fosforo».
  assert.ok(texto.includes('P 3,1'));
});

test('marcarAlterados es opcional y sólo marca lo que está fuera de rango', () => {
  const findings = [
    hallazgo('HEMOGRAMA', 'Hemoglobina', '10,8', 'g/dL', '13,0 - 17,0'),
    hallazgo('BIOQUIMICA', 'Creatinina', '1,10', 'mg/dL', '0,7 - 1,3'),
  ];

  assert.ok(!buildReportSummary(informe(findings)).includes('*'));
  const marcado = buildReportSummary(informe(findings), { markAlerts: true });
  assert.ok(marcado.includes('Hb 10,8*'));
  assert.ok(marcado.includes('Creat 1,10'));
  assert.ok(!marcado.includes('Creat 1,10*'));
});

test('un informe sin hallazgos no produce línea', () => {
  assert.equal(buildReportSummary(informe([])), '');
  assert.equal(buildReportSummary(null), '');
  assert.equal(buildReportSummary(informe([hallazgo('GENERAL', 'Hemoglobina', '   ')])), '');
});

test('buildAnalysisSummary recorre el modelo real, de lo más reciente a lo más antiguo', () => {
  const exams = [
    { id: '101', date: '01/09/2026', time: '08:00', patientName: 'PEREZ, JUAN', origin: 'URGENCIA', exams: ['Hemograma'] },
    { id: '102', date: '03/09/2026', time: '09:30', patientName: 'PEREZ, JUAN', origin: 'MEDICINA', exams: ['Hemograma', 'Orina'] },
  ];
  const details = [
    {
      examId: '101',
      rutBody: '16940645',
      findings: [hallazgo('HEMOGRAMA', 'Hemoglobina', '13,5', 'g/dL', '13,0 - 17,0')],
    },
    {
      examId: '102',
      rutBody: '16940645',
      findings: [
        hallazgo('HEMOGRAMA', 'Hemoglobina', '10,8', 'g/dL', '13,0 - 17,0'),
        hallazgo('ORINA COMPLETA', 'Leucocitos', '30', '/uL', '0 - 5'),
      ],
    },
  ];

  const lineas = buildAnalysisSummary(buildAnalysis(details, exams), { markAlerts: true }).split('\n');

  assert.equal(lineas.length, 2);
  assert.equal(lineas[0], 'Laboratorio (03/09/2026 09:30): Hb 10,8*');
  assert.equal(lineas[1], 'Laboratorio (01/09/2026 08:00): Hb 13,5');
});

test('un análisis vacío no produce texto', () => {
  assert.equal(buildAnalysisSummary(buildAnalysis([], [])), '');
  assert.equal(buildAnalysisSummary(null), '');
});

// Un sedimento urinario informado «25 x campo» en un informe que no rotula la
// muestra se abreviaba como «RGB 25»: RGB es el recuento de glóbulos blancos,
// así que el texto que el médico pega en la evolución declaraba una
// leucocitosis que el paciente no tenía.
test('un sedimento urinario sin sección rotulada no se abrevia como recuento sanguíneo', () => {
  const informe = {
    label: '01/09/2026 08:00',
    findings: [{
      section: 'GENERAL', analysis: 'Leucocitos', result: '25',
      unit: 'x campo', refValue: '0 - 5', alert: true,
    }],
  };
  const texto = buildReportSummary(informe, { markAlerts: true });
  assert.ok(!/\bRGB\b/.test(texto), `no puede usar la sigla del hemograma: ${texto}`);
  assert.match(texto, /x campo/, 'debe mostrar la unidad para que se vea la muestra');
});

test('una leucocitosis verdadera sí se abrevia como RGB', () => {
  const informe = {
    label: '01/09/2026 08:00',
    findings: [{
      section: 'HEMOGRAMA', analysis: 'Recuento Leucocitos', result: '15.200',
      unit: '/uL', refValue: '4.000 - 10.000', alert: true,
    }],
  };
  assert.match(buildReportSummary(informe, { markAlerts: true }), /RGB 15\.200/);
});
