/**
 * Solicitud de exámenes de laboratorio: selección, previsión y maqueta impresa.
 *
 * Port de `hooks/controllers/examRequestController.ts`,
 * `components/modals/controllers/examRequestModalController.ts` y
 * `hooks/controllers/examRequestPrintController.ts` del proyecto HHR.
 *
 * LA SOLICITUD SÓLO SE IMPRIME. El papel marcado viaja al laboratorio en mano:
 * no existe envío electrónico. Nada aquí debe insinuar que la solicitud quedó
 * registrada en algún sistema — el médico creería que el laboratorio ya la
 * tiene y dejaría de llevar el papel, y el examen no se tomaría nunca.
 *
 * El catálogo (`exam-request-catalog.js`) dice QUÉ se puede pedir; este módulo
 * dice DÓNDE queda impreso cada examen. Son cosas distintas: el impreso reparte
 * las diez categorías en tres columnas y fusiona algunas para que todo quepa en
 * una carilla, y esa repartición no pertenece al catálogo.
 */

import { cleanText } from './lab-parser.js';
import { getExamCategoryById, FONASA_LEVELS } from './exam-request-catalog.js';

/** Textos fijos del impreso. `printLabel` es la única acción del formulario. */
export const EXAM_REQUEST_TEXTS = Object.freeze({
  modalTitle: 'Solicitud de Laboratorio',
  formTitle: 'Solicitud de Exámenes de Laboratorio',
  institution: 'Hospital Hanga Roa',
  unit: 'Unidad de Laboratorio',
  network: 'Red Salud Oriente',
  printLabel: 'Imprimir',
});

const DEFAULT_PROCEDENCIA = 'Hospitalización';
const DEFAULT_PREVISION = 'FONASA';

/** Valor de previsión que marca la casilla PRAIS del impreso. */
export const PRAIS_PREVISION = 'PRAIS';

/**
 * Previsión con la que se abre el formulario, a partir de la que trae la ficha.
 *
 * Se normaliza a mayúsculas porque el impreso está en mayúsculas y porque así
 * «Fonasa b», «FONASA  B» y «fonasa B» son la misma previsión. Sin dato se cae
 * a FONASA, que es la previsión de la inmensa mayoría en Rapa Nui; el tramo
 * queda en blanco a propósito (ver `previsionMarks`).
 */
export function resolveExamRequestPrevision(insurance) {
  return (cleanText(insurance) || DEFAULT_PREVISION).toUpperCase();
}

/**
 * Previsión resultante de marcar un tramo FONASA en el formulario.
 *
 * Lanza con un tramo inexistente: los tramos salen de `FONASA_LEVELS`, nunca
 * del usuario, así que un valor raro es un error de programación y no algo que
 * deba terminar impreso en una solicitud.
 */
export function previsionForFonasaLevel(level) {
  const tramo = cleanText(level).toUpperCase();
  if (!FONASA_LEVELS.includes(tramo)) throw new Error(`Tramo FONASA desconocido: ${level}`);
  return `FONASA ${tramo}`;
}

/**
 * Qué casillas del bloque PREVISION quedan marcadas para una previsión dada.
 *
 * Una previsión que no identifica tramo (FONASA a secas, una isapre,
 * PARTICULAR) no marca nada: el impreso tiene una línea en blanco para ISAPRE y
 * el tramo lo escribe quien completa el formulario. Adivinarlo sería peor que
 * dejarlo vacío — el tramo decide cuánto paga el paciente.
 *
 * @returns {{ fonasa: string|null, prais: boolean }}
 */
export function previsionMarks(prevision) {
  const value = cleanText(prevision).toUpperCase();
  return {
    fonasa: FONASA_LEVELS.find(level => value === `FONASA ${level}`) ?? null,
    prais: value === PRAIS_PREVISION,
  };
}

/**
 * Estado con el que se abre la solicitud de un paciente.
 *
 * Siempre sin exámenes marcados: heredar las marcas del paciente anterior haría
 * que se le tomaran exámenes que nadie pidió.
 *
 * @returns {{ selectedExams: Set<string>, procedencia: string, prevision: string }}
 */
export function buildExamRequestOpenState(insurance) {
  return {
    selectedExams: new Set(),
    procedencia: DEFAULT_PROCEDENCIA,
    prevision: resolveExamRequestPrevision(insurance),
  };
}

/**
 * Clave de una casilla del formulario.
 *
 * Va compuesta con el id de la sección y no sólo con el nombre del examen
 * porque el mismo examen puede aparecer en dos secciones del impreso, y marcar
 * uno no debe marcar el otro.
 */
export function examRequestKey(sectionId, exam) {
  return `${sectionId}|${exam}`;
}

/**
 * Marca o desmarca una casilla y devuelve un Set nuevo.
 *
 * No muta el Set recibido: quien renderiza compara el anterior con el nuevo
 * para saber si tiene que repintar.
 */
export function toggleExamSelection(selectedExams, examKey) {
  const next = new Set(selectedExams);
  if (!next.delete(examKey)) next.add(examKey);
  return next;
}

// Los dos exámenes de tubo verde no son una categoría del catálogo: en el
// impreso van como una nota al pie de la primera columna, bajo BIOQUIMICA y sin
// encabezado propio. Viven aquí, en la maqueta, y no en el catálogo.
const TUBO_VERDE = Object.freeze({
  id: 'tubo-verde',
  label: 'TUBO VERDE',
  exams: Object.freeze(['ELECTROLITOS PLASMATICOS', 'LACTATO']),
});

// Pie del impreso: líneas en blanco que se completan a mano después de imprimir.
const FOOTER_FIELDS = Object.freeze([
  Object.freeze({ label: 'OTROS', lines: 2 }),
  Object.freeze({ label: 'MEDICO TRATANTE', lines: 1 }),
  Object.freeze({ label: 'FIRMA', lines: 1 }),
]);

const buildRow = (sectionId, exam) => ({ exam, key: examRequestKey(sectionId, exam) });

const sectionFromCategory = (id, { columns = 1, fill = false } = {}) => {
  const category = getExamCategoryById(id);
  return {
    id,
    title: category.name,
    ...(category.tube ? { tube: category.tube } : {}),
    columns,
    fill,
    rows: category.exams.map(exam => buildRow(id, exam)),
  };
};

// Categorías que comparten un encabezado en el impreso para ganar espacio. La
// sección fusionada no declara tubo: sus categorías no lo llevan impreso.
const mergedSection = (id, title, categoryIds) => ({
  id,
  title,
  columns: 1,
  fill: false,
  rows: categoryIds
    .flatMap(categoryId => getExamCategoryById(categoryId).exams)
    .map(exam => buildRow(id, exam)),
});

/**
 * Maqueta del formulario impreso: tres columnas de exámenes más el pie.
 *
 * `columns: 2` reparte los exámenes de la sección en dos columnitas dentro de
 * su celda; `fill: true` marca la sección que absorbe el alto sobrante de su
 * columna, para que las tres terminen a ras y la hoja no quede coja.
 *
 * Devuelve estructuras nuevas en cada llamada — el catálogo va congelado, pero
 * la maqueta se entrega mutable para quien necesite reordenarla o anotarla.
 *
 * @returns {{
 *   columns: Array<{ sections: Array<object>, footer?: { id: string, label: string, rows: Array<object> } }>,
 *   footer: { section: object, fields: Array<{ label: string, lines: number }> },
 * }}
 */
export function buildExamRequestLayout() {
  return {
    columns: [
      {
        sections: [sectionFromCategory('bioquimica')],
        footer: {
          id: TUBO_VERDE.id,
          label: TUBO_VERDE.label,
          rows: TUBO_VERDE.exams.map(exam => buildRow(TUBO_VERDE.id, exam)),
        },
      },
      {
        sections: [
          sectionFromCategory('hematologia', { columns: 2 }),
          sectionFromCategory('coagulacion'),
          sectionFromCategory('microbiologicos', { fill: true }),
        ],
      },
      {
        sections: [
          sectionFromCategory('hormonas'),
          mergedSection('orina-parasitos', 'Orina / Parásitos', ['orina', 'parasitologia']),
          mergedSection('virologia-otros', 'Virología / Otros', ['virologia', 'otros']),
        ],
      },
    ],
    footer: {
      section: sectionFromCategory('inmunologia'),
      fields: FOOTER_FIELDS.map(field => ({ ...field })),
    },
  };
}

const DEFAULT_PRINT_DELAY_MS = 150;
const DEFAULT_RESTORE_DELAY_MS = 1000;

/**
 * Manda el formulario a la impresora.
 *
 * El título del documento se vacía antes de imprimir porque el navegador lo
 * estampa en la cabecera de cada hoja, y esta hoja es un impreso oficial del
 * laboratorio: no puede salir con el nombre de una extensión encima. Se repone
 * después, con un margen para que el diálogo de impresión alcance a leer el
 * documento ya en blanco.
 *
 * `documentRef` y `windowRef` entran por parámetro para poder probar el
 * vaciado y la reposición sin navegador.
 */
export function runExamRequestPrint({
  documentRef = document,
  windowRef = window,
  printDelayMs = DEFAULT_PRINT_DELAY_MS,
  restoreDelayMs = DEFAULT_RESTORE_DELAY_MS,
} = {}) {
  const originalTitle = documentRef.title;
  documentRef.title = '';

  windowRef.setTimeout(() => {
    try {
      windowRef.print();
    } finally {
      // El `finally` no es adorno: si print() lanza (impresión bloqueada) y la
      // reposición quedara colgando del camino feliz, la pestaña se quedaría
      // sin título hasta que alguien la recargue.
      windowRef.setTimeout(() => { documentRef.title = originalTitle; }, restoreDelayMs);
    }
  }, printDelayMs);
}
