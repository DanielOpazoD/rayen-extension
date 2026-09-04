import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  classifyLabSpecimen,
  comparisonSortIndex,
  findTrendGroup,
  isExcludedFromComparison,
  isLabComparisonEligible,
  isLabTrendSpecimenEligible,
  isTrendVariable,
} from '../src/core/lab-specimen.js';
import { COMPARISON_ORDER } from '../src/core/lab-catalog.js';

const hallazgo = (valores = {}) => ({
  section: 'GENERAL',
  analysis: '',
  result: '',
  unit: '',
  refValue: '',
  ...valores,
});

test('la sección del hemograma y la bioquímica identifican sangre', () => {
  const sangre = [
    hallazgo({ section: 'HEMOGRAMA', analysis: 'Hemoglobina', unit: 'g/dL' }),
    hallazgo({ section: 'PERFIL BIOQUIMICA', analysis: 'Sodio', unit: 'mEq/L' }),
    hallazgo({ section: 'PERFIL HEPATICO', analysis: 'ASAT/GOT', unit: 'U/L' }),
    hallazgo({ section: 'FORMULA LEUCOCITARIA', analysis: 'Segmentados', unit: '%' }),
  ];
  for (const finding of sangre) {
    assert.equal(classifyLabSpecimen(finding), 'blood', finding.section);
    assert.equal(isLabComparisonEligible(finding), true, finding.section);
    assert.equal(isLabTrendSpecimenEligible(finding), true, finding.section);
  }
});

test('un analito de orina queda fuera de la comparación y de las tendencias', () => {
  const orina = [
    hallazgo({ section: 'ORINA COMPLETA', analysis: 'Sodio', unit: 'mEq/L' }),
    hallazgo({ section: 'SEDIMENTO URINARIO', analysis: 'Bacterias' }),
    hallazgo({ section: 'GENERAL', analysis: 'Microalbuminuria', unit: 'mg/L' }),
    hallazgo({ section: 'GENERAL', analysis: 'Creatinina', unit: 'mg/24 h orina' }),
  ];
  for (const finding of orina) {
    assert.equal(classifyLabSpecimen(finding), 'urine', finding.analysis);
    assert.equal(isLabComparisonEligible(finding), false, finding.analysis);
    assert.equal(isLabTrendSpecimenEligible(finding), false, finding.analysis);
  }
});

test('el sodio en orina y el sodio en sangre no comparten destino', () => {
  const enSangre = hallazgo({ section: 'ELECTROLITOS PLASMA', analysis: 'Sodio', unit: 'mEq/L' });
  const enOrina = hallazgo({ section: 'ELECTROLITOS EN ORINA', analysis: 'Sodio', unit: 'mEq/L' });
  assert.equal(isLabTrendSpecimenEligible(enSangre), true);
  assert.equal(isLabTrendSpecimenEligible(enOrina), false);
});

test('los líquidos corporales no pertenecen a una tendencia sistémica', () => {
  const liquidos = [
    hallazgo({ section: 'LIQUIDO CEFALORRAQUIDEO', analysis: 'Glucosa', unit: 'mg/dL' }),
    hallazgo({ section: 'LÍQUIDO PLEURAL', analysis: 'Proteinas Totales', unit: 'g/dL' }),
    hallazgo({ section: 'LIQUIDO ASCITICO', analysis: 'Albumina', unit: 'g/dL' }),
    hallazgo({ section: 'MUESTRA: LCR', analysis: 'Cloro', unit: 'mEq/L' }),
  ];
  for (const finding of liquidos) {
    assert.equal(classifyLabSpecimen(finding), 'other-fluid', finding.section);
    assert.equal(isLabComparisonEligible(finding), false, finding.section);
    assert.equal(isLabTrendSpecimenEligible(finding), false, finding.section);
  }
});

test('la orina gana sobre el líquido cuando la seña nombra ambos', () => {
  // Un «líquido de orina» no existe: el orden de evaluación evita que un
  // rótulo genérico tape la muestra concreta.
  const finding = hallazgo({ section: 'ORINA', analysis: 'Liquido obtenido', unit: 'mL' });
  assert.equal(classifyLabSpecimen(finding), 'urine');
});

test('«Sangre» como analito de la tira reactiva no convierte la muestra en sanguínea', () => {
  // La hematuria se informa como el analito «Sangre». Si eso bastara para
  // rotular sangre, el sedimento urinario entero entraría a las tendencias.
  const finding = hallazgo({ section: 'GENERAL', analysis: 'Sangre', result: 'POSITIVO' });
  assert.equal(classifyLabSpecimen(finding), 'unknown');
  assert.equal(isLabComparisonEligible(finding), false);
});

test('RAC y RPC son la excepción sistémica pese a ser urinarias', () => {
  for (const analysis of ['RAC', 'RPC']) {
    const finding = hallazgo({ section: 'ORINA AISLADA', analysis, unit: 'mg/g' });
    assert.equal(classifyLabSpecimen(finding), 'urine', analysis);
    assert.equal(isLabComparisonEligible(finding), true, analysis);
    assert.equal(isLabTrendSpecimenEligible(finding), true, analysis);
    assert.equal(findTrendGroup(analysis), 'RPC / RAC', analysis);
  }
});

test('la excepción exige el nombre ya normalizado, no cualquier razón urinaria', () => {
  // `normalizeAnalysisName` es quien produce «RAC» y «RPC»; sin pasar por ahí,
  // la razón sigue siendo un analito urinario más.
  const crudo = hallazgo({
    section: 'ORINA',
    analysis: 'Relacion albumina/creatininuria',
    unit: 'mg/g',
  });
  assert.equal(isLabTrendSpecimenEligible(crudo), false);
});

test('sin sección que rotule la muestra, el analito delata la orina', () => {
  const delatores = [
    hallazgo({ section: 'GENERAL', analysis: 'Nitritos', result: 'NEGATIVO' }),
    hallazgo({ section: 'GENERAL', analysis: 'Placas de pus', result: '2 - 4' }),
    hallazgo({ section: 'GENERAL', analysis: 'Cilindros', result: 'NO SE OBSERVAN' }),
    hallazgo({ section: 'GENERAL', analysis: 'Densidad', result: '1.020' }),
    hallazgo({ section: 'GENERAL', analysis: 'Proteínas', result: 'NEGATIVO' }),
  ];
  for (const finding of delatores) {
    assert.equal(classifyLabSpecimen(finding), 'unknown', finding.analysis);
    assert.equal(isLabComparisonEligible(finding), false, finding.analysis);
  }
});

test('«Proteínas Totales» no es la tira reactiva y sí entra a la comparación', () => {
  const plasmatica = hallazgo({ section: 'GENERAL', analysis: 'Proteinas Totales', unit: 'g/dL' });
  assert.equal(isLabComparisonEligible(plasmatica), true);
});

test('los leucocitos cualitativos son sedimento; el recuento del hemograma no', () => {
  const sedimento = hallazgo({ section: 'GENERAL', analysis: 'Leucocitos', result: '10 - 15 x campo' });
  const recuento = hallazgo({
    section: 'HEMOGRAMA',
    analysis: 'Recuento Leucocitos',
    result: '8.500',
    unit: '/uL',
  });
  assert.equal(isLabComparisonEligible(sedimento), false);
  assert.equal(isLabComparisonEligible(recuento), true);
});

test('las filas administrativas del informe no son analitos', () => {
  const administrativas = [
    hallazgo({ section: 'GENERAL', analysis: 'MIDAS', result: '12345' }),
    hallazgo({ section: 'GENERAL', analysis: 'Equipo', result: 'MIDAS 4.2' }),
    hallazgo({ section: 'GENERAL', analysis: 'Fecha y hora validacion', result: '01/09/2026' }),
    hallazgo({ section: 'GENERAL', analysis: 'Director tecnico', result: 'TM Perez' }),
  ];
  for (const finding of administrativas) {
    assert.equal(isLabComparisonEligible(finding), false, finding.analysis);
  }
});

test('la clasificación ignora tildes y puntuación de la sección', () => {
  assert.equal(
    classifyLabSpecimen(hallazgo({ section: 'ORINA - COMPLETA', analysis: 'Color' })),
    'urine'
  );
  assert.equal(
    classifyLabSpecimen(hallazgo({ section: 'Líquido Cefalorraquídeo', analysis: 'Cloro' })),
    'other-fluid'
  );
});

test('«P-LCR» del hemograma se clasifica como líquido: divergencia declarada de HHR', () => {
  // Comportamiento heredado, NO deseado: P-LCR es un índice plaquetario de
  // sangre. El marcador «LCR» del catálogo lo atrapa porque la normalización
  // convierte el guion en espacio. El efecto práctico es que el índice queda
  // fuera de la comparación, igual que RDW y CHCM, que el catálogo excluye a
  // propósito; corregirlo toca el catálogo compartido y necesita visto clínico.
  const finding = hallazgo({ section: 'HEMOGRAMA', analysis: 'P-LCR', result: '18,5', unit: '%' });
  assert.equal(classifyLabSpecimen(finding), 'other-fluid');
});

test('las exclusiones del catálogo se aplican por subcadena', () => {
  const excluidos = [
    'RDW',
    'VLDL',
    'CHCM',
    'Basofilos',
    'Veloc. Filtr. Glomer.',
    'Recuento de Colonias',
    'Gentamicina',
    'Amilasa',
    'Glucosa promedio estimada',
    'PCR SARS-CoV-2',
  ];
  for (const nombre of excluidos) {
    assert.equal(isExcludedFromComparison(nombre), true, nombre);
  }
  for (const nombre of ['Hemoglobina', 'Creatinina', 'Sodio', 'Proteina C Reactiva']) {
    assert.equal(isExcludedFromComparison(nombre), false, nombre);
  }
});

test('«N° de ingreso» se excluye con signo de grado y con ordinal masculino', () => {
  // No son el mismo carácter y el LIS emite ambos: colapsarlos perdería una
  // de las dos grafías.
  assert.equal(isExcludedFromComparison('N° de ingreso'), true);
  assert.equal(isExcludedFromComparison('Nº de ingreso'), true);
});

test('«Razón A/G» acentuada se excluye por la entrada truncada del catálogo', () => {
  assert.equal(isExcludedFromComparison('Razón A/G'), true);
});

test('la exclusión tolera entradas vacías o nulas', () => {
  assert.equal(isExcludedFromComparison(''), false);
  assert.equal(isExcludedFromComparison(null), false);
  assert.equal(isExcludedFromComparison(undefined), false);
});

test('el orden de comparación respeta la lectura clínica', () => {
  const orden = [
    'Recuento Leucocitos',
    'Hemoglobina',
    'Proteina C Reactiva',
    'Creatinina',
    'Sodio',
    'ASAT/GOT',
    'INR',
    'Glicemia',
  ].map(comparisonSortIndex);
  assert.deepEqual(orden, [...orden].sort((a, b) => a - b), 'el orden clínico no se respeta');
  assert.equal(comparisonSortIndex('Recuento Leucocitos'), 0);
});

test('el recuento de leucocitos gana su lugar del hemograma, no el del sedimento', () => {
  // «Leucocitos» aparece dos veces en el catálogo: en el hemograma y en la
  // orina. El primer calce manda, y por eso el recuento va arriba.
  assert.ok(comparisonSortIndex('Recuento Leucocitos') < comparisonSortIndex('Leucocitos'));
});

test('una variable fuera del catálogo se ordena al final', () => {
  assert.equal(comparisonSortIndex('Zonisamida'), COMPARISON_ORDER.length + 1);
  assert.equal(comparisonSortIndex(''), COMPARISON_ORDER.length + 1);
});

test('el orden calza aunque el informe agregue palabras al nombre', () => {
  assert.equal(comparisonSortIndex('Sodio plasmatico'), comparisonSortIndex('Sodio'));
});

test('cada variable graficable cae en su grupo de tendencia', () => {
  const esperado = [
    ['Sodio', 'Electrolitos'],
    ['Potasio', 'Electrolitos'],
    ['Creatinina', 'Función Renal'],
    ['Nitrogeno Ureico', 'Función Renal'],
    ['ASAT/GOT', 'Perfil Hepático'],
    ['Bilirrubina Total', 'Perfil Hepático'],
    ['Proteina C Reactiva', 'Actividad Inflamatoria'],
    ['Hemoglobina', 'Hemograma'],
    ['Glicemia', 'Glicemia'],
    ['pH', 'Gases'],
    ['HCO3', 'Gases'],
    ['CK Total', 'Marcadores musculares'],
    ['Troponina', 'Otros'],
  ];
  for (const [analisis, grupo] of esperado) {
    assert.equal(findTrendGroup(analisis), grupo, analisis);
    assert.equal(isTrendVariable(analisis), true, analisis);
  }
});

test('lo que no está en ningún grupo no se grafica', () => {
  for (const analisis of ['Zonisamida', 'Aspecto', '']) {
    assert.equal(findTrendGroup(analisis), null, analisis);
    assert.equal(isTrendVariable(analisis), false, analisis);
  }
});

test('ser variable de tendencia no basta: la muestra manda', () => {
  // La creatininuria calza el patrón «Creatinina» del grupo renal, pero no es
  // una creatinina plasmática y no puede compartir su curva.
  const urinaria = hallazgo({ section: 'ORINA 24 HORAS', analysis: 'Creatinina', unit: 'mg/24h' });
  assert.equal(isTrendVariable(urinaria.analysis), true);
  assert.equal(isLabTrendSpecimenEligible(urinaria), false);
});

test('las funciones toleran un hallazgo vacío sin reventar', () => {
  assert.equal(classifyLabSpecimen(null), 'unknown');
  assert.equal(classifyLabSpecimen(undefined), 'unknown');
  assert.equal(classifyLabSpecimen({}), 'unknown');
  assert.doesNotThrow(() => isLabComparisonEligible(null));
  assert.doesNotThrow(() => isLabTrendSpecimenEligible(null));
});
