import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildMicrobiologyEntriesForExam,
  collectMicrobiologyFinding,
  hasMicrobiologyPattern,
  microbiologyResultAlert,
  resolveMicrobiologyCategoriesForExam,
  resolveMicrobiologyCategoryForFinding,
} from '../src/core/lab-microbiology.js';

// Orden real de SysLab: en un mismo folio vienen el cultivo, su antibiograma y
// un panel viral. Es el caso que obliga a separar categorías.
const ORDEN_COMBINADA = {
  id: '43091284',
  date: '06/04/2026',
  time: '11:40:00',
  patientName: 'TEST',
  origin: 'HOSP',
  exams: [
    'CULTIVO CORRIENTE 1',
    'ATB BACILOS GRAM (-) 1',
    'ANTIBIOGRAMA EXTENDIDO 1',
    'PCR PANEL RESPIRATORIO #2',
  ],
};

const hallazgo = (analysis, result, section = 'MICROBIOLOGIA') => ({
  section,
  analysis,
  result,
  unit: '',
  refValue: '',
  qualitative: true,
});

const recolectar = (hallazgos, categorias) => {
  const porCategoria = new Map();
  for (const item of hallazgos) collectMicrobiologyFinding(item, categorias, porCategoria);
  return porCategoria;
};

test('un examen microbiológico se reconoce por su nombre y no por su sección', () => {
  assert.equal(hasMicrobiologyPattern('Rhinovirus'), true);
  assert.equal(hasMicrobiologyPattern('urocultivo corriente'), true);
  assert.equal(hasMicrobiologyPattern('PERFIL BIOQUIMICO'), false);
  assert.equal(hasMicrobiologyPattern(null), false);
});

test('la orden combinada se reparte en las categorías de sus exámenes, sin repetir', () => {
  // Tres nombres distintos caen en otros_cultivos; la categoría aparece una vez.
  assert.deepEqual(resolveMicrobiologyCategoriesForExam(ORDEN_COMBINADA), [
    'otros_cultivos',
    'pcr_8_virus',
  ]);
  assert.deepEqual(resolveMicrobiologyCategoriesForExam(undefined), []);
});

test('los patrones genéricos de otros_cultivos no tapan al urocultivo ni al hemocultivo', () => {
  const categoriaDe = nombre => resolveMicrobiologyCategoriesForExam({ exams: [nombre] });
  assert.deepEqual(categoriaDe('UROCULTIVO'), ['urocultivo']);
  assert.deepEqual(categoriaDe('HEMOCULTIVO AEROBIO'), ['hemocultivo']);
  assert.deepEqual(categoriaDe('COPROCULTIVO'), ['coprocultivo']);
  assert.deepEqual(categoriaDe('PCR ARBOVIROSIS'), ['pcr_arbovirus']);
  assert.deepEqual(categoriaDe('CLOSTRIDIUM DIFFICILE TOXINA'), ['clostridium_difficile']);
  assert.deepEqual(categoriaDe('ANTIBIOGRAMA EXTENDIDO'), ['otros_cultivos']);
  assert.deepEqual(categoriaDe('HEMOGRAMA'), []);
});

test('el panel viral no se lleva las filas del cultivo ni el cultivo las del panel', () => {
  const categorias = resolveMicrobiologyCategoriesForExam(ORDEN_COMBINADA);
  const porCategoria = recolectar(
    [
      hallazgo('Cultivo', 'Bacilos Gram (-) No Fermentador'),
      hallazgo('Ceftazidima', 'Susceptible'),
      hallazgo('Rhinovirus', 'NEGATIVO'),
    ],
    categorias
  );

  assert.deepEqual(porCategoria.get('otros_cultivos'), [
    { analysis: 'Cultivo', result: 'Bacilos Gram (-) No Fermentador' },
    { analysis: 'Ceftazidima', result: 'Susceptible' },
  ]);
  assert.deepEqual(porCategoria.get('pcr_8_virus'), [
    { analysis: 'Rhinovirus', result: 'NEGATIVO' },
  ]);
});

test('el puntaje: una señal fuerte gana aunque la categoría venga después en la orden', () => {
  // «HEMOCULTIVO» es señal fuerte de hemocultivo (3); «DESARROLLO» sólo es
  // señal débil de urocultivo (2), que además va primero en la lista.
  assert.equal(
    resolveMicrobiologyCategoryForFinding(hallazgo('Hemocultivo', 'No hubo desarrollo'), [
      'urocultivo',
      'hemocultivo',
    ]),
    'hemocultivo'
  );
});

test('el desempate entre señales débiles lo gana la primera categoría de la orden', () => {
  // «Resistente» es señal débil de ambas: no dice si la muestra era orina o
  // sangre. El orden de la orden es lo único estable para decidir.
  const ampicilina = hallazgo('Ampicilina', 'Resistente');
  assert.equal(
    resolveMicrobiologyCategoryForFinding(ampicilina, ['urocultivo', 'hemocultivo']),
    'urocultivo'
  );
  assert.equal(
    resolveMicrobiologyCategoryForFinding(ampicilina, ['hemocultivo', 'urocultivo']),
    'hemocultivo'
  );
  // Un analito que no calza en ninguna categoría queda fuera de la tarjeta.
  assert.equal(
    resolveMicrobiologyCategoryForFinding(hallazgo('Creatinina', '1,2'), ['urocultivo']),
    null
  );
});

test('un antibiograma con S/I/R queda entero en su tarjeta y no repite filas', () => {
  const categorias = ['urocultivo'];
  const porCategoria = new Map();
  const filas = [
    hallazgo('Urocultivo', 'Desarrollo de Escherichia coli'),
    hallazgo('Recuento de Colonias', '100.000 UFC/mL'),
    hallazgo('Ampicilina', 'Resistente'),
    hallazgo('Ciprofloxacino', 'Intermedio'),
    hallazgo('Ceftriaxona', 'Susceptible'),
    // El informe repite la fila cuando la orden trae dos muestras del germen.
    hallazgo('Ampicilina', 'Resistente'),
  ];
  const usadas = filas.map(fila => collectMicrobiologyFinding(fila, categorias, porCategoria));
  assert.deepEqual(usadas, Array(6).fill('urocultivo'));

  const [tarjeta] = buildMicrobiologyEntriesForExam({
    exam: { id: '43091999', exams: ['UROCULTIVO'] },
    date: '19/04/2026 20:30',
    categories: categorias,
    findingsByCategory: porCategoria,
  });

  assert.equal(tarjeta.examLabel, 'Urocultivo');
  assert.equal(tarjeta.date, '19/04/2026 20:30');
  assert.deepEqual(
    tarjeta.findings.map(f => f.analysis),
    ['Urocultivo', 'Recuento de Colonias', 'Ampicilina', 'Ciprofloxacino', 'Ceftriaxona']
  );
  // Hay desarrollo y hay resistencia: esta tarjeta sí se destaca.
  assert.equal(tarjeta.hasAlertFinding, true);
});

test('un cultivo negativo no se destaca: la buena noticia no es una alerta', () => {
  const categorias = ['hemocultivo'];
  const porCategoria = recolectar(
    [hallazgo('Hemocultivo', 'No hubo desarrollo bacteriano en 5 días de incubación')],
    categorias
  );
  const [tarjeta] = buildMicrobiologyEntriesForExam({
    exam: { id: '43090001', exams: ['HEMOCULTIVO'] },
    date: '02/09/2026 08:00',
    categories: categorias,
    findingsByCategory: porCategoria,
  });

  assert.equal(tarjeta.examLabel, 'Hemocultivo');
  assert.equal(tarjeta.findings.length, 1);
  assert.equal(tarjeta.hasAlertFinding, false);
});

test('la alerta respeta la negación: «no hubo desarrollo» y «NO REACTIVO» son negativos', () => {
  // Los cuatro primeros los marcaba como alerta la regla original de HHR.
  for (const negativo of [
    'No hubo desarrollo bacteriano',
    'NO REACTIVO',
    'NO DETECTADO',
    'Sin desarrollo a las 48 horas',
    'No se observa desarrollo',
    'Ausencia de desarrollo bacteriano',
    'NEGATIVO',
    'Susceptible',
    'Sensible a ampicilina',
    '',
  ]) {
    assert.equal(microbiologyResultAlert(negativo), false, negativo);
  }

  for (const alerta of [
    'POSITIVO',
    'REACTIVO',
    'Detectado',
    'Resistente a ampicilina',
    'Se aisla Escherichia coli',
    // El «no» niega al fermentador, no al desarrollo: sigue siendo un cultivo
    // con crecimiento y no puede pasar como negativo.
    'Desarrollo de bacilo Gram negativo no fermentador',
    // Una cláusula positiva basta aunque la siguiente esté negada.
    'Desarrollo de Escherichia coli, no se realizó antibiograma',
  ]) {
    assert.equal(microbiologyResultAlert(alerta), true, alerta);
  }
});

test('la tarjeta existe aunque el hallazgo sólo esté en el PDF', () => {
  const entradas = buildMicrobiologyEntriesForExam({
    exam: ORDEN_COMBINADA,
    date: '06/04/2026 11:40',
    categories: resolveMicrobiologyCategoriesForExam(ORDEN_COMBINADA),
    findingsByCategory: new Map(),
  });

  assert.deepEqual(
    entradas.map(entrada => entrada.examLabel),
    ['Otros cultivos', 'PCR 8 virus']
  );
  assert.deepEqual(
    entradas.map(entrada => entrada.category),
    ['otros_cultivos', 'pcr_8_virus']
  );
  // Sin hallazgos no hay nada que destacar, pero el cultivo pedido se ve.
  assert.equal(
    entradas.every(entrada => entrada.findings.length === 0 && !entrada.hasAlertFinding),
    true
  );
  assert.equal(
    entradas.every(entrada => entrada.sourceExam.id === '43091284'),
    true
  );
  assert.deepEqual(buildMicrobiologyEntriesForExam({ exam: undefined }), []);
});

test('la tarjeta no cambia si después se siguen recolectando hallazgos', () => {
  const categorias = ['urocultivo'];
  const porCategoria = recolectar([hallazgo('Urocultivo', 'Desarrollo de E. coli')], categorias);
  const [tarjeta] = buildMicrobiologyEntriesForExam({
    exam: { id: '1', exams: ['UROCULTIVO'] },
    date: '19/04/2026',
    categories: categorias,
    findingsByCategory: porCategoria,
  });

  collectMicrobiologyFinding(hallazgo('Ampicilina', 'Resistente'), categorias, porCategoria);
  assert.equal(tarjeta.findings.length, 1);
});
