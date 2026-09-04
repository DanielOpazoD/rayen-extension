/**
 * Catálogos clínicos del laboratorio: vocabulario, no lógica.
 *
 * Port literal de los `constants/` de laboratorio del proyecto HHR. Aquí sólo
 * hay datos: listas de analitos, agrupaciones de lectura, patrones de
 * microbiología y marcadores de muestra. Ninguna función.
 *
 * Por qué importa la literalidad: cada entrada es un nombre que SysLab o
 * ProactiveLIS puede emitir. Una entrada que se pierde no es una línea de
 * código menos, es un examen que deja de ordenarse en la tabla o un cultivo
 * que deja de detectarse. Por eso no se resume ni se «limpia» esta lista.
 *
 * La normalización de nombres (Triglicéridos → TG, T4 libre → T4L, …) vive en
 * `lab-parser.js` y es la única fuente de verdad de ese mapeo. Este módulo
 * conserva ambas grafías donde el catálogo original las traía, porque los
 * informes antiguos ya guardados pueden venir sin normalizar.
 */

/**
 * Orden clínico de lectura de la tabla de comparación. Lo que no aparece aquí
 * se muestra después, alfabético. El orden es el de una visita clínica: primero
 * hemograma, luego inflamación, renal, orina, gases, hepático, coagulación y
 * finalmente metabólico.
 */
export const COMPARISON_ORDER = [
  'Recuento Leucocitos',
  'Hemoglobina',
  'Hematocrito',
  'VCM',
  'HCM',
  'Recuento de Plaquetas',
  'Segmentados',
  'Linfocitos',
  'Monocitos',
  'Eosinofilos',
  'Proteina C Reactiva',
  'VHS',
  'LDH',
  'Creatinina',
  'RPC',
  'RAC',
  'Nitrogeno Ureico',
  'Uremia',
  'Sodio',
  'Potasio',
  'Cloro',
  'HCO3',
  'Calcio',
  'Fosforo',
  'Cuerpos Cetónicos',
  'Proteínas',
  'Nitritos',
  'Densidad',
  'Leucocitos',
  'Eritrocitos',
  'Bacterias',
  'Cilindros',
  'Placas de pus',
  'pH',
  'pCO2',
  'pO2',
  'Lactato',
  'ASAT/GOT',
  'ALAT/GPT',
  'GGT',
  'Fosfatasa Alcalina',
  'Bilirrubinas',
  'Lipasa',
  'Protrombina',
  'TTPK',
  'INR',
  'Albumina',
  'Proteinas Totales',
  'Troponina',
  'Dimero',
  'CK Total',
  'Magnesio',
  'TSH',
  'T4L',
  'T4 Libre',
  'Acido Urico',
  'Glicemia',
  'Hb glicosilada',
  'Colesterol Total',
  'LDL',
  'HDL',
  'TG',
  'Trigliceridos',
  'Cuerpos Ceton',
  'Cetonemia',
];

/**
 * Filas que nunca entran a la tabla de comparación. Mezcla tres cosas que el
 * informe imprime como si fueran analitos y no lo son:
 *  - índices derivados y fracciones sin valor de seguimiento (VLDL, RDW, CHCM);
 *  - metadatos administrativos del informe (N° de ingreso, MIDAS, Hora);
 *  - encabezados de las tablas de interpretación del perfil lipídico
 *    («Deseable», «Normal», «Muy alto»), que el PDF emite como si fueran filas.
 *
 * «N° de ingreso» aparece con signo de grado (°) y con ordinal masculino (º)
 * porque el LIS emite ambos y no son el mismo carácter: no colapsar.
 *
 * «Gentamicina» y «Recuento de Colonia(s)» se excluyen de la comparación
 * numérica pero SÍ clasifican microbiología (ver MICROBIOLOGY_CATEGORY_RULES):
 * son antibiogramas, no variables de tendencia.
 */
export const COMPARISON_EXCLUDE = [
  'Razon A/G',
  'Raz',
  'CHCM',
  'Conc.Hb.Corp',
  'Baciliformes',
  'Mielocitos',
  'Juveniles',
  'Blastos',
  'Promielocitos',
  'sO2c',
  'CO2 TOTAL',
  'Hora',
  'Veloc. Filtr. Glomer',
  'Veloc Filtr',
  'Deseable',
  'Indice de riesgo',
  'Glucosa promedio',
  'Normal',
  'Muy alto',
  'Recuento Hematies',
  'Basofilos',
  'Control',
  ', OT',
  'VLDL',
  'RDW',
  'Amilasa',
  'BEecf',
  'Globulinas',
  'N° de ingreso',
  'Nº de ingreso',
  'N° ingreso',
  'Nº ingreso',
  'No de ingreso',
  'Numero de ingreso',
  'MIDAS',
  'Tipo de muestra',
  'Resultado',
  'PCR SARS',
  'SARS-CoV',
  'SARS COV',
  'COVID',
  'Recuento de Colonia',
  'Recuento de Colonias',
  'Gentamicina',
];

/**
 * Bloques con que se agrupa la tabla de comparación. Un analito pertenece a lo
 * más a un bloque; lo que no calza cae en «Otros».
 *
 * «Inflamación» trae VHS con sus tres grafías porque el informe la imprime
 * indistintamente como VHS, V.H.S y V.H.S.
 */
export const COMPARISON_DISPLAY_GROUPS = [
  {
    label: 'Hemograma',
    patterns: [
      'Recuento Leucocitos',
      'Hemoglobina',
      'Hematocrito',
      'VCM',
      'HCM',
      'Recuento de Plaquetas',
      'Segmentados',
      'Linfocitos',
      'Monocitos',
      'Eosinofilos',
    ],
  },
  {
    label: 'Inflamación',
    patterns: ['Proteina C Reactiva', 'VHS', 'V.H.S', 'V.H.S.', 'LDH'],
  },
  {
    label: 'Función renal / electrolitos',
    patterns: [
      'Creatinina',
      'Nitrogeno Ureico',
      'Uremia',
      'Sodio',
      'Potasio',
      'Cloro',
      'HCO3',
      'Calcio',
      'Fosforo',
      'RPC',
      'RAC',
    ],
  },
  {
    label: 'Coagulación',
    patterns: ['Protrombina', 'TTPK', 'INR', 'Dimero'],
  },
  {
    label: 'Perfil hepático',
    patterns: [
      'ASAT/GOT',
      'ALAT/GPT',
      'GGT',
      'Fosfatasa Alcalina',
      'Bilirrubinas',
      'Albumina',
      'Proteinas Totales',
    ],
  },
  {
    label: 'Metabólico',
    patterns: [
      'Hb glicosilada',
      'Acido Urico',
      'Glicemia',
      'TSH',
      'T4L',
      'T4 Libre',
      'Colesterol Total',
      'LDL',
      'HDL',
      'TG',
      'Trigliceridos',
    ],
  },
];

/** Orden en que se pintan los bloques. «Otros» cierra: es el cajón de sastre. */
export const COMPARISON_GROUP_ORDER = [
  'Hemograma',
  'Inflamación',
  'Función renal / electrolitos',
  'Coagulación',
  'Perfil hepático',
  'Metabólico',
  'Otros',
];

/**
 * Variables que el clínico puede fijar arriba de la tabla. Son las que se
 * miran a diario en el paciente hospitalizado: función renal, marcador
 * inflamatorio, proteinuria y anemia.
 */
export const COMPARISON_PINNABLE_VARIABLES = [
  'Creatinina',
  'Proteina C Reactiva',
  'RPC',
  'RAC',
  'Hemoglobina',
];

/**
 * Series que se grafican juntas porque se leen juntas: un sodio sin su potasio
 * no dice nada. Los patrones son más cortos que los de la comparación a
 * propósito («ASAT» y no «ASAT/GOT») para tolerar las variantes del informe.
 */
export const TREND_GROUPS = [
  {
    label: 'Electrolitos',
    patterns: ['Sodio', 'Potasio', 'Cloro'],
  },
  {
    label: 'Función Renal',
    patterns: ['Creatinina', 'Nitrogeno Ureico', 'Uremia'],
  },
  {
    label: 'Perfil Hepático',
    patterns: [
      'ASAT',
      'ALAT',
      'GGT',
      'Fosfatasa Alcalina',
      'Bilirrubina Total',
      'Bilirrubina Directa',
    ],
  },
  {
    label: 'Actividad Inflamatoria',
    patterns: ['Recuento Leucocitos', 'Segmentados', 'Proteina C Reactiva', 'VHS', 'LDH'],
  },
  {
    label: 'Hemograma',
    patterns: ['Hemoglobina', 'Hematocrito', 'Recuento de Plaquetas'],
  },
  {
    label: 'Glicemia',
    patterns: ['Glicemia', 'Hb glicosilada'],
  },
  {
    label: 'Gases',
    patterns: ['pH', 'pCO2', 'pO2', 'HCO3', 'Lactato'],
  },
  {
    label: 'Marcadores musculares',
    patterns: ['CK Total'],
  },
  {
    label: 'Otros',
    patterns: ['Troponina', 'Magnesio', 'Albumina'],
  },
  {
    label: 'RPC / RAC',
    patterns: ['RPC', 'RAC'],
  },
];

/**
 * Chips para filtrar la lista de órdenes por tipo de examen. Se comparan contra
 * el nombre del examen en mayúsculas, no contra el analito; por eso los
 * patrones son raíces truncadas («HEPAT», «LIPID»): el LIS varía el sufijo.
 */
export const EXAM_FILTER_CATEGORIES = [
  { label: 'Hemograma', patterns: ['HEMOGRAMA'] },
  {
    label: 'Bioquímica',
    patterns: ['BIOQUIMIC', 'PERFIL BIOQUIM', 'ALBUMINA', 'PROTEINA', 'GLICEMIA'],
  },
  { label: 'Electrolitos', patterns: ['ELECTROLITOS'] },
  { label: 'P. hepático', patterns: ['PERFIL HEPAT', 'HEPAT'] },
  { label: 'P. lipídico', patterns: ['LIPID', 'COLESTEROL'] },
  { label: 'Coagulación', patterns: ['PROTROMBINA', 'TTPK', 'INR', 'COAGUL'] },
  { label: 'Función Renal', patterns: ['CREA', 'UREMIA', 'VFG', 'BUN'] },
  {
    label: 'Cultivos',
    patterns: [
      'CULTIVO',
      'COPROCULTIVO',
      'UROCULTIVO',
      'HEMOCULTIVO',
      'ANTIBIOGRAMA',
      'MICROBIOLOG',
    ],
  },
  {
    label: 'PCR Virales',
    patterns: ['PCR PANEL', 'PANEL RESPIRATORIO', 'PANEL VIRAL', 'ARBOVIROSIS'],
  },
  { label: 'Orina', patterns: ['ORINA', 'SEDIMENTO'] },
];

/**
 * ¿Este examen es microbiológico? Decide si la orden se muestra en la pestaña
 * de cultivos en vez de en la tabla numérica. Se compara en MAYÚSCULAS.
 */
export const MICROBIOLOGY_PATTERNS = [
  'CULTIVO',
  'COPROCULTIVO',
  'UROCULTIVO',
  'HEMOCULTIVO',
  'MICROBIOLOG',
  'ANTIBIOGRAMA',
  'PCR PANEL',
  'PANEL RESPIRATORIO',
  'ARBOVIROSIS',
  'DENGUE',
  'CHIKUNGUNYA',
  'ZIKA',
  'VIRUS',
  'INFLUENZA',
  'COVID',
  'SARS',
  'BACTER',
  'HONGO',
  'LEVADUR',
  'PARASITO',
];

/**
 * Reglas para asignar cada examen y cada hallazgo a una categoría de
 * microbiología.
 *
 * EL ORDEN DE LAS CLAVES ES SIGNIFICATIVO: la categoría de un examen se
 * resuelve con la PRIMERA clave cuyo patrón `exam` esté contenido en el nombre.
 * `otros_cultivos` va última a propósito, porque sus patrones («ANTIBIOGRAMA»,
 * «CULTIVO CORRIENTE») son genéricos y taparían a urocultivo y hemocultivo si
 * se evaluaran antes. No reordenar.
 *
 * `findingStrong` identifica el hallazgo sin ambigüedad; `findingWeak` sólo
 * desempata cuando ninguna categoría dio una señal fuerte: «SUSCEPTIBLE» o
 * «RESISTENTE» aparecen en cualquier antibiograma y por sí solos no dicen si
 * la muestra era orina o sangre.
 *
 * «SUCEPTIBLE» sin la primera S no es un typo nuestro: es como lo imprime el
 * equipo, y quitarlo perdería esas filas.
 */
export const MICROBIOLOGY_CATEGORY_RULES = {
  clostridium_difficile: {
    exam: ['CLOSTRIDIUM DIFFICILE'],
    findingStrong: ['CLOSTRIDIUM', 'TOXINA', 'PRESENCIA DEL AG'],
    findingWeak: [],
  },
  coprocultivo: {
    exam: ['COPROCULTIVO'],
    findingStrong: ['COPROCULTIVO', 'SALMONELLA', 'SHIGELLA'],
    findingWeak: ['LEUCOCITOS FECALES'],
  },
  pcr_8_virus: {
    exam: ['PCR PANEL', 'PANEL RESPIRATORIO', 'PANEL VIRAL', 'SARS', 'COVID', 'COV-2'],
    findingStrong: [
      'INFLUENZA',
      'PARAINFLUENZA',
      'METAPNEUMOVIRUS',
      'RHINOVIRUS',
      'RINOVIRUS',
      'SINCICIAL',
      'ADENOVIRUS',
      'SARS',
      'CORONAVIRUS',
      'COVID',
      'PANEL RESPIRATORIO',
    ],
    findingWeak: [],
  },
  pcr_arbovirus: {
    exam: ['PCR ARBOVIROSIS'],
    findingStrong: ['ARBOVIROSIS', 'DENGUE', 'CHIKUNGUNYA', 'ZIKA'],
    findingWeak: [],
  },
  urocultivo: {
    exam: ['UROCULTIVO'],
    findingStrong: ['UROCULTIVO', 'ANTIBIOGRAMA', 'RECUENTO DE COLONIA', 'GENTAMICINA'],
    findingWeak: [
      'DESARROLLO',
      'SUSCEPTIBLE',
      'SUCEPTIBLE',
      'SENSIBLE',
      'INTERMEDIO',
      'RESISTENTE',
      'AISLADO',
    ],
  },
  hemocultivo: {
    exam: ['HEMOCULTIVO'],
    findingStrong: ['HEMOCULTIVO'],
    findingWeak: [
      'DESARROLLO',
      'SUSCEPTIBLE',
      'SUCEPTIBLE',
      'SENSIBLE',
      'INTERMEDIO',
      'RESISTENTE',
      'AISLADO',
    ],
  },
  otros_cultivos: {
    exam: ['CULTIVO CORRIENTE', 'ANTIBIOGRAMA', 'ATB ', 'BACILOS'],
    findingStrong: [
      'CULTIVO',
      'ANTIBIOGRAMA',
      'ATB',
      'BACILO',
      'RECUENTO DE COLONIA',
      'GENTAMICINA',
    ],
    findingWeak: [
      'DESARROLLO',
      'SUSCEPTIBLE',
      'SUCEPTIBLE',
      'SENSIBLE',
      'INTERMEDIO',
      'RESISTENTE',
      'AISLADO',
    ],
  },
};

/** Rótulo humano de cada categoría de microbiología, para la tarjeta del cultivo. */
export const MICROBIOLOGY_CATEGORY_LABELS = {
  clostridium_difficile: 'Clostridium difficile',
  coprocultivo: 'Coprocultivo',
  pcr_8_virus: 'PCR 8 virus',
  pcr_arbovirus: 'PCR arbovirus',
  urocultivo: 'Urocultivo',
  hemocultivo: 'Hemocultivo',
  otros_cultivos: 'Otros cultivos',
};

/**
 * Abreviaturas del resumen de una línea que se pega en la evolución clínica.
 *
 * EL ORDEN ES SIGNIFICATIVO: define el orden de lectura del resumen, y es el
 * orden en que un clínico dicta el laboratorio (hemograma, fórmula,
 * inflamación, renal, electrolitos, gases, hepático, otros). No alfabetizar.
 *
 * `showUnit` se reserva para las variables cuya unidad cambia entre
 * laboratorios y sin la cual el número es ambiguo (PCR en mg/L o mg/dL,
 * troponina, dímero D). Las universales van sin unidad para que el resumen
 * quepa en una línea.
 *
 * `multiplyExponent` deshace la notación x10^3 del contador hematológico:
 * «5,81 x10^3» se dicta como 5.810, no como 5,81.
 */
export const SUMMARY_ABBREVIATIONS = [
  // Hemograma
  ['Hemoglobina', { abbr: 'Hb' }],
  ['Hematocrito', { abbr: 'HTO', suffix: '%' }],
  ['Recuento Leucocitos', { abbr: 'RGB', multiplyExponent: 3 }],
  ['Recuento de Plaquetas', { abbr: 'Plaq', multiplyExponent: 3 }],
  // Fórmula
  ['Segmentados', { abbr: 'PMN', suffix: '%' }],
  ['Linfocitos', { abbr: 'Linf', suffix: '%' }],
  // Inflamación
  ['Proteina C Reactiva', { abbr: 'PCR', showUnit: true }],
  ['VHS', { abbr: 'VHS' }],
  // Función renal
  ['Creatinina', { abbr: 'Creat' }],
  ['Nitrogeno Ureico', { abbr: 'BUN' }],
  ['Uremia', { abbr: 'Uremia' }],
  // Electrolitos
  ['Sodio', { abbr: 'Na' }],
  ['Potasio', { abbr: 'K' }],
  ['Cloro', { abbr: 'Cl' }],
  ['Magnesio', { abbr: 'Mg' }],
  ['Calcio', { abbr: 'Ca' }],
  ['Fosforo', { abbr: 'P' }],
  // Gases
  ['pH', { abbr: 'pH' }],
  ['pCO2', { abbr: 'pCO2' }],
  ['pO2', { abbr: 'pO2' }],
  ['HCO3', { abbr: 'HCO3' }],
  ['Lactato', { abbr: 'Lac', showUnit: true }],
  // Hepático
  ['ASAT/GOT', { abbr: 'GOT' }],
  ['ALAT/GPT', { abbr: 'GPT' }],
  ['GGT', { abbr: 'GGT' }],
  ['Fosfatasa Alcalina', { abbr: 'FA' }],
  ['Bilirrubina Total', { abbr: 'BT' }],
  ['Bilirrubina Directa', { abbr: 'BD' }],
  // Otros
  ['Lipasa', { abbr: 'Lipasa' }],
  ['Albumina', { abbr: 'Alb' }],
  ['Glicemia', { abbr: 'Gli' }],
  ['TSH', { abbr: 'TSH', showUnit: true }],
  ['Troponina', { abbr: 'TnUS', showUnit: true }],
  ['Dimero', { abbr: 'DD', showUnit: true }],
  ['CK Total', { abbr: 'CK', showUnit: true }],
  ['LDH', { abbr: 'LDH' }],
  ['Protrombina', { abbr: 'TP', suffix: '%' }],
  ['INR', { abbr: 'INR' }],
  ['TTPK', { abbr: 'TTPK' }],
];

/**
 * Marcadores de muestra. Un sodio en orina no es comparable con uno en sangre:
 * mezclarlos en una misma serie inventa una tendencia que no existe.
 *
 * Se comparan contra la firma «sección + analito + unidad» normalizada a
 * MAYÚSCULAS sin tildes ni puntuación.
 */
export const URINE_MARKERS = [
  'ORINA',
  'URINARIO',
  'URINARIA',
  'SEDIMENTO',
  'ALBUMINURIA',
  'MICROALBUMINURIA',
  'CREATININURIA',
  'CREATINURIA',
  'PROTEINURIA',
];

export const OTHER_FLUID_MARKERS = [
  'LIQUIDO',
  'LIQUIDO CEFALORRAQUIDEO',
  'LCR',
  'LIQUIDO PLEURAL',
  'LIQUIDO ASCITICO',
  'LIQUIDO ARTICULAR',
  'LIQUIDO PERITONEAL',
];

/**
 * La sangre sólo se afirma desde la SECCIÓN del informe, nunca desde la firma
 * completa: en un examen de orina existe el analito «Sangre» (hematuria), y
 * tomarlo como muestra sanguínea metería el sedimento urinario en las
 * tendencias sistémicas.
 */
export const BLOOD_MARKERS = [
  'SANGRE',
  'SUERO',
  'PLASMA',
  'HEMOGRAMA',
  'PERFIL HEPATICO',
  'BIOQUIMICA',
  'FORMULA LEUCOCITARIA',
];

/**
 * Analitos que delatan orina aunque la sección no lo diga. Sirven de última
 * red cuando el informe no rotula la muestra: «Nitritos» o «Placas de pus»
 * sólo existen en un sedimento urinario.
 */
export const URINE_ANALYTE_MARKERS = [
  'ORINA FISICO QUIMICO',
  'SEDIMENTO URINARIO',
  'CUERPOS CETON',
  'NITRIT',
  'SANGRE',
  'UROBILIN',
  'GLUCOSA',
  'BILIRRUBINA',
  'DENSIDAD',
  'ASPECTO',
  'COLOR',
  'PROTEINURIA',
  'CREATININURIA',
  'MICROALBUMINURIA',
  'BACTERIAS',
  'CILINDROS',
  'PLACAS DE PUS',
  'ERITROCITOS',
];

/**
 * Filas administrativas que el PDF imprime con forma de analito. «MIDAS» es el
 * único que hay que buscar además en el RESULTADO y no sólo en el nombre: el
 * informe a veces lo emite como valor.
 */
export const SPECIMEN_METADATA_MARKERS = [
  'MIDAS',
  'FECHA Y HORA INGRESO SOLICITUD',
  'FECHA Y HORA VALIDACION',
  'DIRECTOR TECNICO',
  'RESULTADO VIA WEB',
];
