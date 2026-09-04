/**
 * Catálogo de la solicitud de laboratorio del Hospital Hanga Roa.
 *
 * Port de `src/constants/examCategories.ts` del proyecto HHR.
 *
 * Esto es la transcripción del formulario de papel que el laboratorio recibe:
 * el orden de las categorías, el tubo de cada una y el texto exacto de cada
 * examen son los del impreso oficial. Un examen que no esté aquí es un examen
 * que el médico no puede marcar, y una etiqueta que no coincida con la del
 * formulario obliga al laboratorio a adivinar qué se pidió. Por eso las
 * etiquetas se copian literales — incluidas sus rarezas tipográficas — y no se
 * corrigen aquí (ver CATÁLOGO LITERAL más abajo).
 *
 * El catálogo va congelado: lo importa medio módulo de la solicitud y un
 * `push` accidental sobre `exams` contaminaría el formulario de todos los
 * pacientes durante el resto de la sesión. Quien necesite ordenar o filtrar,
 * que copie primero.
 *
 * CATÁLOGO LITERAL — rarezas del impreso que se conservan a propósito:
 *  - 'COPROPARASITARO' (sin la segunda «I»).
 *  - 'SUB. UND Β- HCG' usa beta griega (U+0392), no una «B» latina.
 *  - Los tubos usan raya (–, U+2013), no guion.
 */

const congelarCategoria = categoria =>
  Object.freeze({ ...categoria, exams: Object.freeze([...categoria.exams]) });

/**
 * Categorías del formulario, en el orden en que aparecen impresas.
 * @type {ReadonlyArray<{ id: string, name: string, tube?: string, exams: ReadonlyArray<string> }>}
 */
export const EXAM_CATEGORIES = Object.freeze([
  {
    id: 'bioquimica',
    name: 'BIOQUIMICA',
    tube: 'TUBO AMARILLO – ROJO',
    exams: [
      'GLICEMIA',
      'P.T.G.O',
      'UREMIA',
      'CREATININA',
      'FOSFATASA ALCALINA',
      'GOT – GPT',
      'GGT',
      'AMILASA',
      'PROTEINA TOTAL',
      'ALBUMINA',
      'BILIRRUBINA DIRECTA Y TOTAL',
      'LDH',
      'LIPASA',
      'URICEMIA',
      'COLESTEROL',
      'COLESTEROL HDL',
      'TRIGLICERIDOS',
      'CK',
      'CK-MB',
      'GASES ARTERIALES (JERINGA HEPARINIZADA)',
      'GASES VENOSOS (JERINGA HEPARINIZADA)',
    ],
  },
  {
    id: 'hematologia',
    name: 'HEMATOLOGIA',
    tube: 'TUBO LILA',
    exams: [
      'HEMOGRAMA',
      'VHS',
      'RCTO.LEUCOCITOS',
      'RCTO. PLAQUETAS',
      'HEMATOCRITO',
      'HEMOGLOBINA',
      'HEMOGLOBINA GLICOSILADA',
      'GRUPO SANGUINEO ABO-RH',
    ],
  },
  {
    id: 'coagulacion',
    name: 'COAGULACION',
    tube: 'TUBO CELESTE',
    exams: ['PROTROMBINA/ INR', 'TTPK', 'TIEMPO DE SANGRÍA', 'FIBRINOGENO', 'DIMERO - D'],
  },
  {
    id: 'hormonas',
    name: 'HORMONAS',
    tube: 'TUBO AMARILLO – ROJO',
    exams: [
      'H. TIROESTIMULANTE (TSH)',
      'TIROXINA LIBRE (T4L)',
      'TROPONINA',
      'ANT. PROST-ESPECIF. (PSA)',
      'SUB. UND Β- HCG',
    ],
  },
  {
    id: 'microbiologicos',
    name: 'MICROBIOLOGICOS',
    exams: [
      'UROCULTIVO',
      'HEMOCULTIVO',
      'COPROCULTIVO',
      'MYCOPLASMA-UREAPLASMA',
      'FLUJO VAGINAL',
      'TINCION BAAR',
      'SECRECIONES',
    ],
  },
  {
    id: 'orina',
    name: 'ORINA',
    exams: ['SEDIMENTO URINARIO', 'ORINA COMPLETA', 'TEST DE EMBARAZO'],
  },
  {
    id: 'parasitologia',
    name: 'PARASITOLOGIA',
    exams: ['COPROPARASITARO', 'TEST DE GRAHAM', 'ACAROTEST'],
  },
  {
    id: 'virologia',
    name: 'VIROLOGIA',
    exams: ['ROTAVIRUS', 'ADENOVIRUS', 'SARS-COV-2', 'DENGUE/ZIKA/CHIKUNGUNYA'],
  },
  {
    id: 'inmunologia',
    name: 'INMUNOLOGIA/SEROLOGÍA',
    tube: 'TUBO AMARILLO – ROJO',
    exams: ['PROTEINA C REACTIVA', 'FACTOR REUMATOIDEO', 'R.P.R.', 'IGM DENGUE'],
  },
  {
    id: 'otros',
    name: 'OTROS',
    exams: [
      'TEST DE WEBER (HEMORRAGIAS OCULTAS)',
      'CITOLOGICO (MICROTUBO LILA 0.5CC)',
      'FISICO QUIMICO (JERINGA)',
      'LEUCOCITOS FECALES',
      'MICOLOGICO DIRECTO',
    ],
  },
].map(congelarCategoria));

// Un Map y no un objeto: con `{}` los ids heredados de Object.prototype
// ('constructor', 'toString') resolverían a algo truthy y el formulario armaría
// una sección con basura en vez de fallar. El original tenía justamente ese hueco.
const POR_ID = new Map(EXAM_CATEGORIES.map(categoria => [categoria.id, categoria]));

/**
 * Resuelve una categoría por id, sin depender de su posición en el arreglo.
 *
 * Lanza si el id no existe: los ids los escribe nuestro código, nunca el
 * usuario, así que un id desconocido es un error de programación. Devolver
 * `undefined` imprimiría una solicitud a la que le falta una sección entera
 * sin que nadie lo note — el médico marcaría sobre un papel incompleto.
 *
 * @param {string} id
 * @returns {{ id: string, name: string, tube?: string, exams: ReadonlyArray<string> }}
 */
export function getExamCategoryById(id) {
  const categoria = POR_ID.get(id);
  if (!categoria) throw new Error(`Categoría de exámenes desconocida: ${id}`);
  return categoria;
}

/** Procedencia impresa en la solicitud: de dónde sale la muestra. */
export const PROCEDENCIA_OPTIONS = Object.freeze([
  'Infantil',
  'Adulto',
  'Maternal',
  'Policlínico',
  'Hospitalización',
  'Urgencia',
]);

/** Tramos FONASA del bloque PREVISION. ISAPRE y PRAIS van aparte en el impreso. */
export const FONASA_LEVELS = Object.freeze(['A', 'B', 'C', 'D']);
