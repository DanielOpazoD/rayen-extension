import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  BLOOD_MARKERS,
  COMPARISON_DISPLAY_GROUPS,
  COMPARISON_EXCLUDE,
  COMPARISON_GROUP_ORDER,
  COMPARISON_ORDER,
  COMPARISON_PINNABLE_VARIABLES,
  EXAM_FILTER_CATEGORIES,
  MICROBIOLOGY_CATEGORY_LABELS,
  MICROBIOLOGY_CATEGORY_RULES,
  MICROBIOLOGY_PATTERNS,
  OTHER_FLUID_MARKERS,
  SPECIMEN_METADATA_MARKERS,
  SUMMARY_ABBREVIATIONS,
  TREND_GROUPS,
  URINE_ANALYTE_MARKERS,
  URINE_MARKERS,
} from '../src/core/lab-catalog.js';
import { IMPORTANT_ANALYSES } from '../src/core/lab-analytics.js';
import { normalizeAnalysisName } from '../src/core/lab-parser.js';

const duplicados = lista => lista.filter((valor, i) => lista.indexOf(valor) !== i);

test('los catálogos conservan su tamaño: una entrada perdida es un examen que se deja de ver', () => {
  // Cifras tomadas del catálogo original de HHR. Si un port futuro «limpia»
  // una lista, esta prueba dice exactamente cuál.
  assert.deepEqual(
    {
      order: COMPARISON_ORDER.length,
      exclude: COMPARISON_EXCLUDE.length,
      grupos: COMPARISON_DISPLAY_GROUPS.length,
      patronesDeGrupo: COMPARISON_DISPLAY_GROUPS.flatMap(g => g.patterns).length,
      ordenDeGrupos: COMPARISON_GROUP_ORDER.length,
      fijables: COMPARISON_PINNABLE_VARIABLES.length,
      tendencias: TREND_GROUPS.length,
      patronesDeTendencia: TREND_GROUPS.flatMap(g => g.patterns).length,
      filtrosDeExamen: EXAM_FILTER_CATEGORIES.length,
      microbiologia: MICROBIOLOGY_PATTERNS.length,
      reglas: Object.keys(MICROBIOLOGY_CATEGORY_RULES).length,
      resumen: SUMMARY_ABBREVIATIONS.length,
      orina: URINE_MARKERS.length,
      liquidos: OTHER_FLUID_MARKERS.length,
      sangre: BLOOD_MARKERS.length,
      analitosDeOrina: URINE_ANALYTE_MARKERS.length,
      metadatos: SPECIMEN_METADATA_MARKERS.length,
    },
    {
      order: 65, exclude: 44, grupos: 6, patronesDeGrupo: 48, ordenDeGrupos: 7,
      fijables: 5, tendencias: 10, patronesDeTendencia: 33, filtrosDeExamen: 10,
      microbiologia: 20, reglas: 7, resumen: 39, orina: 9, liquidos: 7,
      sangre: 7, analitosDeOrina: 18, metadatos: 5,
    }
  );
});

test('ninguna lista repite una entrada', () => {
  assert.deepEqual(duplicados(COMPARISON_ORDER), []);
  assert.deepEqual(duplicados(COMPARISON_EXCLUDE), []);
  assert.deepEqual(duplicados(COMPARISON_GROUP_ORDER), []);
  assert.deepEqual(duplicados(COMPARISON_PINNABLE_VARIABLES), []);
  assert.deepEqual(duplicados(MICROBIOLOGY_PATTERNS), []);
  assert.deepEqual(duplicados(URINE_MARKERS), []);
  assert.deepEqual(duplicados(OTHER_FLUID_MARKERS), []);
  assert.deepEqual(duplicados(BLOOD_MARKERS), []);
  assert.deepEqual(duplicados(URINE_ANALYTE_MARKERS), []);
  assert.deepEqual(duplicados(SPECIMEN_METADATA_MARKERS), []);
  assert.deepEqual(duplicados(SUMMARY_ABBREVIATIONS.map(([patron]) => patron)), []);
  assert.deepEqual(duplicados(SUMMARY_ABBREVIATIONS.map(([, config]) => config.abbr)), []);
});

test('un analito pertenece a lo más a un bloque de la comparación', () => {
  // Si un patrón se repitiera entre bloques, la variable aparecería dos veces
  // en la tabla y el clínico la leería como dos exámenes distintos.
  assert.deepEqual(duplicados(COMPARISON_DISPLAY_GROUPS.flatMap(g => g.patterns)), []);
  assert.deepEqual(duplicados(COMPARISON_DISPLAY_GROUPS.map(g => g.label)), []);
  assert.deepEqual(duplicados(TREND_GROUPS.map(g => g.label)), []);
  assert.deepEqual(duplicados(EXAM_FILTER_CATEGORIES.map(g => g.label)), []);
});

test('todo analito de IMPORTANT_ANALYSES está en COMPARISON_ORDER', () => {
  // Éste es el cruce que detecta un renombre silencioso: si alguien cambia un
  // nombre en lab-analytics.js y no aquí, la variable cae al final alfabético
  // y el orden clínico de lectura se rompe sin que nada falle.
  assert.deepEqual(IMPORTANT_ANALYSES.filter(a => !COMPARISON_ORDER.includes(a)), []);
});

test('lo que produce normalizeAnalysisName tiene lugar en COMPARISON_ORDER', () => {
  // Se usa el normalizador real sobre grafías tal como las emite el LIS: si el
  // parser y el catálogo se desincronizan, esto lo dice antes que el usuario.
  const crudos = [
    'Leucocitos totales', 'Rcto. Leucocitos', 'Plaquetas', 'Neutrófilos segmentados',
    'Hb. Corp. Media - HCM', 'Vol. Corp. Medio VCM', 'PCR', 'Creatinina sérica',
    'Nitrógeno ureico', 'CPK', 'HCO3 actual', 'T4 libre', 'Triglicéridos',
    'Hemoglobina Glicosilada #2', 'Relación Proteinuria/Creatininuria',
    'Relacion Albumina/Creatininuria',
  ];
  const normalizados = crudos.map(nombre => normalizeAnalysisName(nombre, 'BIOQUIMICA'));
  assert.deepEqual(normalizados.filter(n => !COMPARISON_ORDER.includes(n)), []);
  assert.ok(normalizados.includes('TG'), 'Triglicéridos debe llegar como TG');
  assert.ok(normalizados.includes('T4L'), 'T4 libre debe llegar como T4L');
});

test('COMPARISON_ORDER conserva las dos grafías de TG y de T4 libre', () => {
  // El parser normaliza a 'TG' y 'T4L', pero los informes ya guardados y el
  // catálogo de HHR traen la forma larga: quitarla dejaría sin orden a los
  // datos históricos.
  for (const nombre of ['TG', 'Trigliceridos', 'T4L', 'T4 Libre']) {
    assert.ok(COMPARISON_ORDER.includes(nombre), `falta ${nombre}`);
  }
});

test('COMPARISON_ORDER agrupa las bilirrubinas en una sola fila (brecha conocida)', () => {
  // El parser produce 'Bilirrubina Total/Directa/Indirecta' pero el catálogo
  // sólo conoce 'Bilirrubinas': esas tres caen al final alfabético de la tabla.
  // Se deja tal cual porque cambiar el orden clínico exige decisión médica, no
  // de programación. Si alguien lo corrige, esta prueba debe caer con él.
  assert.ok(COMPARISON_ORDER.includes('Bilirrubinas'));
  for (const nombre of ['Bilirrubina Total', 'Bilirrubina Directa', 'Bilirrubina Indirecta']) {
    assert.ok(!COMPARISON_ORDER.includes(nombre), `${nombre} ya está: actualizar esta prueba`);
  }
  // El resumen clínico y las tendencias sí distinguen total de directa.
  assert.ok(SUMMARY_ABBREVIATIONS.some(([p]) => p === 'Bilirrubina Total'));
  assert.ok(TREND_GROUPS.some(g => g.patterns.includes('Bilirrubina Directa')));
});

test('COMPARISON_EXCLUDE distingue el signo de grado del ordinal masculino', () => {
  // «N° de ingreso» y «Nº de ingreso» no son la misma cadena: el LIS emite las
  // dos. Colapsarlas deja pasar el número de ingreso como si fuera un analito.
  assert.ok(COMPARISON_EXCLUDE.includes('N° de ingreso'), 'falta la forma con °');
  assert.ok(COMPARISON_EXCLUDE.includes('Nº de ingreso'), 'falta la forma con º');
  assert.notEqual('N° de ingreso', 'Nº de ingreso');
});

test('ningún analito ordenado queda anulado por la lista de exclusión', () => {
  // La exclusión se aplica por subcadena; un patrón demasiado corto borraría
  // una variable que sí queremos ver.
  const anulados = COMPARISON_ORDER.filter(a => COMPARISON_EXCLUDE.some(e => a.includes(e)));
  assert.deepEqual(anulados, []);
  assert.deepEqual(COMPARISON_PINNABLE_VARIABLES.filter(v => !COMPARISON_ORDER.includes(v)), []);
});

test('cada bloque de la comparación tiene su lugar en COMPARISON_GROUP_ORDER', () => {
  const rotulos = COMPARISON_DISPLAY_GROUPS.map(g => g.label);
  assert.deepEqual(rotulos.filter(l => !COMPARISON_GROUP_ORDER.includes(l)), []);
  // El único rótulo sin bloque propio es el cajón de sastre, y va al final.
  assert.deepEqual(COMPARISON_GROUP_ORDER.filter(l => !rotulos.includes(l)), ['Otros']);
  assert.equal(COMPARISON_GROUP_ORDER.at(-1), 'Otros');
});

test('los patrones de bloque nombran analitos del catálogo, salvo las grafías de VHS', () => {
  const sueltos = COMPARISON_DISPLAY_GROUPS
    .flatMap(g => g.patterns)
    .filter(p => !COMPARISON_ORDER.includes(p));
  assert.deepEqual(sueltos, ['V.H.S', 'V.H.S.']);
});

test('el orden de las claves de microbiología es la regla de precedencia', () => {
  // La categoría se resuelve con la PRIMERA clave cuyo patrón esté contenido en
  // el nombre del examen. `otros_cultivos` va última porque «ANTIBIOGRAMA» es
  // genérico: si se adelantara, un urocultivo con antibiograma dejaría de
  // rotularse como urocultivo.
  const claves = Object.keys(MICROBIOLOGY_CATEGORY_RULES);
  assert.equal(claves.at(-1), 'otros_cultivos');

  const categoriaDe = nombre => claves.find(clave =>
    MICROBIOLOGY_CATEGORY_RULES[clave].exam.some(p => nombre.toUpperCase().includes(p))) ?? null;
  assert.equal(categoriaDe('UROCULTIVO CORRIENTE Y ANTIBIOGRAMA'), 'urocultivo');
  assert.equal(categoriaDe('HEMOCULTIVO AEROBIO + ANTIBIOGRAMA'), 'hemocultivo');
  assert.equal(categoriaDe('COPROCULTIVO'), 'coprocultivo');
  assert.equal(categoriaDe('ANTIBIOGRAMA'), 'otros_cultivos');
  assert.equal(categoriaDe('PCR PANEL RESPIRATORIO'), 'pcr_8_virus');
  assert.equal(categoriaDe('PCR ARBOVIROSIS'), 'pcr_arbovirus');
  assert.equal(categoriaDe('CLOSTRIDIUM DIFFICILE TOXINA'), 'clostridium_difficile');
  assert.equal(categoriaDe('HEMOGRAMA'), null);
});

test('cada categoría de microbiología tiene regla y rótulo, sin sobrantes', () => {
  assert.deepEqual(
    Object.keys(MICROBIOLOGY_CATEGORY_LABELS).slice().sort(),
    Object.keys(MICROBIOLOGY_CATEGORY_RULES).slice().sort()
  );
  for (const [clave, rotulo] of Object.entries(MICROBIOLOGY_CATEGORY_LABELS)) {
    assert.ok(rotulo.trim(), `rótulo vacío en ${clave}`);
  }
  for (const [clave, regla] of Object.entries(MICROBIOLOGY_CATEGORY_RULES)) {
    assert.ok(regla.exam.length, `${clave} sin patrón de examen`);
    assert.ok(regla.findingStrong.length, `${clave} sin señal fuerte`);
    assert.ok(Array.isArray(regla.findingWeak), `${clave} sin lista de señal débil`);
    // Una señal no puede ser fuerte y débil a la vez: el desempate se anularía.
    assert.deepEqual(regla.findingStrong.filter(p => regla.findingWeak.includes(p)), []);
  }
});

test('conserva «SUCEPTIBLE», la falta de ortografía que imprime el equipo', () => {
  // No es un typo nuestro: si se «corrige», se pierden las filas del
  // antibiograma que el analizador emite así.
  const debiles = MICROBIOLOGY_CATEGORY_RULES.urocultivo.findingWeak;
  assert.ok(debiles.includes('SUSCEPTIBLE'));
  assert.ok(debiles.includes('SUCEPTIBLE'));
});

test('todo patrón que se compara en mayúsculas está escrito en mayúsculas', () => {
  // Un patrón en minúsculas nunca calzaría: sería vocabulario muerto.
  const enMayusculas = [
    ...MICROBIOLOGY_PATTERNS,
    ...EXAM_FILTER_CATEGORIES.flatMap(g => g.patterns),
    ...Object.values(MICROBIOLOGY_CATEGORY_RULES)
      .flatMap(r => [...r.exam, ...r.findingStrong, ...r.findingWeak]),
    ...URINE_MARKERS, ...OTHER_FLUID_MARKERS, ...BLOOD_MARKERS,
    ...URINE_ANALYTE_MARKERS, ...SPECIMEN_METADATA_MARKERS,
  ];
  assert.deepEqual(enMayusculas.filter(p => p !== p.toUpperCase()), []);
  // Y sin tildes: la firma de la muestra se compara ya normalizada a NFD.
  assert.deepEqual(enMayusculas.filter(p => /[À-ɏ]/.test(p)), []);
});

test('los marcadores de muestra separan orina, otros líquidos y sangre', () => {
  assert.ok(URINE_MARKERS.includes('ORINA') && URINE_MARKERS.includes('SEDIMENTO'));
  assert.ok(OTHER_FLUID_MARKERS.includes('LCR'));
  assert.ok(BLOOD_MARKERS.includes('HEMOGRAMA') && BLOOD_MARKERS.includes('SUERO'));
  // «SANGRE» vive en los dos lados a propósito: como sección identifica la
  // muestra sanguínea, y como analito es la hematuria del sedimento urinario.
  assert.ok(BLOOD_MARKERS.includes('SANGRE'));
  assert.ok(URINE_ANALYTE_MARKERS.includes('SANGRE'));
  // Ningún marcador de sangre puede aparecer como marcador de orina o líquido,
  // o la clasificación de la muestra se volvería ambigua.
  const cruce = BLOOD_MARKERS.filter(
    m => URINE_MARKERS.includes(m) || OTHER_FLUID_MARKERS.includes(m)
  );
  assert.deepEqual(cruce, []);
  assert.ok(SPECIMEN_METADATA_MARKERS.includes('MIDAS'));
});

test('SUMMARY_ABBREVIATIONS mantiene el orden con que se dicta el laboratorio', () => {
  const patrones = SUMMARY_ABBREVIATIONS.map(([p]) => p);
  assert.deepEqual(patrones.slice(0, 6), [
    'Hemoglobina', 'Hematocrito', 'Recuento Leucocitos', 'Recuento de Plaquetas',
    'Segmentados', 'Linfocitos',
  ]);
  // Ningún patrón puede contener a otro: el primero se llevaría el hallazgo del
  // segundo, porque la búsqueda es por subcadena.
  const minusculas = patrones.map(p => p.toLowerCase());
  const solapados = minusculas.filter((p, i) => minusculas.some((q, j) => j !== i && q.includes(p)));
  assert.deepEqual(solapados, []);
});

test('SUMMARY_ABBREVIATIONS muestra la unidad sólo donde el número es ambiguo', () => {
  const conUnidad = SUMMARY_ABBREVIATIONS.filter(([, c]) => c.showUnit).map(([p]) => p);
  assert.deepEqual(conUnidad, [
    'Proteina C Reactiva', 'Lactato', 'TSH', 'Troponina', 'Dimero', 'CK Total',
  ]);
  // Sodio o potasio no la llevan: la unidad es universal y el resumen debe
  // caber en una línea de la evolución.
  const sodio = SUMMARY_ABBREVIATIONS.find(([p]) => p === 'Sodio');
  assert.deepEqual(sodio, ['Sodio', { abbr: 'Na' }]);
  // Los recuentos hematológicos deshacen la notación x10^3.
  const conExponente = SUMMARY_ABBREVIATIONS.filter(([, c]) => c.multiplyExponent === 3);
  assert.deepEqual(conExponente.map(([p]) => p), ['Recuento Leucocitos', 'Recuento de Plaquetas']);
  // Los porcentajes se rotulan como tales para no leerse como valor absoluto.
  const conSufijo = SUMMARY_ABBREVIATIONS.filter(([, c]) => c.suffix === '%').map(([p]) => p);
  assert.deepEqual(conSufijo, ['Hematocrito', 'Segmentados', 'Linfocitos', 'Protrombina']);
});

test('los grupos de tendencia y los filtros de examen traen patrones utilizables', () => {
  for (const grupo of [...TREND_GROUPS, ...COMPARISON_DISPLAY_GROUPS, ...EXAM_FILTER_CATEGORIES]) {
    assert.ok(grupo.label.trim(), 'grupo sin rótulo');
    assert.ok(grupo.patterns.length, `${grupo.label} sin patrones`);
    assert.deepEqual(grupo.patterns.filter(p => !p.trim().length), []);
  }
  // Las razones urinarias se grafican aparte porque son sistémicas pese a
  // medirse en orina (ver isSystemicTrendEligible en lab-parser.js).
  assert.deepEqual(TREND_GROUPS.find(g => g.label === 'RPC / RAC').patterns, ['RPC', 'RAC']);
  assert.ok(EXAM_FILTER_CATEGORIES.find(g => g.label === 'Orina').patterns.includes('SEDIMENTO'));
});
