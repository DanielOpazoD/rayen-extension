/**
 * Clasificación de la muestra biológica y política de elegibilidad.
 *
 * Port de `features/laboratory/controllers/labSpecimenController.ts` y de la
 * parte de `labAnalyticsVariableController.ts` que decide qué variable entra a
 * la comparación, en qué orden se lee y a qué grupo de tendencia pertenece.
 *
 * ESTA ES LA GARANTÍA CLÍNICA CENTRAL DEL LABORATORIO. Un sodio en orina no es
 * comparable con un sodio en sangre: son magnitudes distintas, con rangos
 * distintos y significado opuesto (uno mide manejo renal, el otro estado
 * hidroelectrolítico). Ponerlos en la misma fila o en la misma curva no muestra
 * un dato de más: inventa una tendencia que no existe, y una tendencia falsa
 * mueve una conducta. Lo mismo con un analito de líquido cefalorraquídeo,
 * pleural o ascítico: mide el compartimento, no al paciente, y no pertenece a
 * ninguna serie sistémica.
 *
 * Por eso la clasificación mira la SEÑA del informe —sección + analito +
 * unidad— y nunca el resultado: el valor no dice de qué muestra viene.
 *
 * La sangre es la única muestra que se afirma sólo desde la SECCIÓN. En un
 * examen de orina existe el analito «Sangre» (hematuria); leerlo como muestra
 * sanguínea metería el sedimento urinario entero en las tendencias sistémicas.
 * La asimetría es deliberada: ante la duda, `unknown`, que es más restrictivo.
 *
 * Módulo de lógica pura: no lee el reloj ni genera HTML.
 */

import { cleanText, comparisonToken, isSystemicTrendEligible } from './lab-parser.js';
import {
  BLOOD_MARKERS,
  COMPARISON_EXCLUDE,
  COMPARISON_ORDER,
  OTHER_FLUID_MARKERS,
  SPECIMEN_METADATA_MARKERS,
  TREND_GROUPS,
  URINE_ANALYTE_MARKERS,
  URINE_MARKERS,
} from './lab-catalog.js';

/**
 * Seña normalizada contra la que se comparan los marcadores del catálogo:
 * MAYÚSCULAS, sin tildes y con toda la puntuación convertida en un espacio, de
 * modo que «ORINA-COMPLETA», «Orina completa» y «ORINA / COMPLETA» sean lo
 * mismo. Se apoya en `comparisonToken`, que ya resuelve tildes y espacios.
 */
const clinicalToken = value =>
  comparisonToken(value).replace(/[^a-z0-9]+/g, ' ').trim().toUpperCase();

/**
 * Los acrónimos calzan como palabra completa y el resto como subcadena: «LCR»
 * buscado como subcadena aparecería dentro de cualquier código que lo contenga,
 * mientras que «LIQUIDO» sí debe atrapar a «LIQUIDOS» y «LIQUIDO PLEURAL».
 */
const containsMarker = (token, marker) =>
  marker.length <= 3 && !marker.includes(' ')
    ? token.split(' ').includes(marker)
    : token.includes(marker);

const containsAny = (token, markers) => markers.some(marker => containsMarker(token, marker));

/**
 * RAC y RPC son razones urinarias que sí describen al paciente y no a la orina:
 * son el marcador de daño renal que se sigue en el tiempo. Son la única
 * excepción a la separación de muestras, aquí y en `lab-parser.js`.
 */
const isRatio = finding => {
  const analysis = finding && finding.analysis;
  return analysis === 'RAC' || analysis === 'RPC';
};

/** Muestra de la que proviene el hallazgo: 'blood' | 'urine' | 'other-fluid' | 'unknown'. */
export function classifyLabSpecimen(finding) {
  const section = clinicalToken(finding && finding.section);
  const signature = clinicalToken(
    `${(finding && finding.section) || ''} ${(finding && finding.analysis) || ''} ${(finding && finding.unit) || ''}`
  );
  if (containsAny(signature, URINE_MARKERS)) return 'urine';
  if (containsAny(signature, OTHER_FLUID_MARKERS)) return 'other-fluid';
  if (containsAny(section, BLOOD_MARKERS)) return 'blood';
  return 'unknown';
}

/**
 * Última red cuando el informe no rotula la muestra. Cubre dos cosas distintas
 * que comparten destino: analitos que sólo existen en un sedimento urinario y
 * filas administrativas que el PDF imprime con forma de analito.
 */
function isUrineMetadataOrAnalyte(finding) {
  const analysis = clinicalToken(finding && finding.analysis);
  const result = clinicalToken(finding && finding.result);
  const unit = clinicalToken(finding && finding.unit);
  // «Leucocitos» informado como escaso/moderado/abundante o «x campo» es
  // recuento de sedimento urinario, no el del hemograma.
  //
  // «x campo» se mira también en la UNIDAD: el informe suele traer el resultado
  // como número y la unidad como «x campo», y buscándolo sólo en el resultado
  // el sedimento se colaba al resumen como recuento de glóbulos blancos.
  const porCampo = /X CAMPO|XCAMPO|POR CAMPO/;
  const isQualitativeLeukocyte =
    analysis.includes('LEUCOCITOS') &&
    (/NEGATIVO|NO SE OBSERVA|ESCASA|MODERADA|ABUNDANTE/.test(result) ||
      porCampo.test(result) || porCampo.test(unit));
  // MIDAS es el único metadato que además hay que buscar en el RESULTADO: el
  // informe a veces emite el nombre del sistema como si fuera el valor.
  const isMetadata =
    SPECIMEN_METADATA_MARKERS.some(marker => analysis.includes(marker)) || result.includes('MIDAS');
  return (
    URINE_ANALYTE_MARKERS.some(marker => analysis.includes(marker)) ||
    // «Proteínas» a secas es la tira reactiva de orina; «Proteínas Totales» es
    // el analito plasmático del perfil hepático. Por eso la igualdad es exacta.
    analysis === 'PROTEINAS' ||
    isQualitativeLeukocyte ||
    isMetadata
  );
}

/**
 * A la comparación entran los resultados sistémicos y las dos razones urinarias
 * clínicamente útiles. Cuando la muestra no se puede afirmar se exige que el
 * hallazgo no delate orina por sí mismo.
 */
export function isLabComparisonEligible(finding) {
  if (isRatio(finding)) return true;
  const specimen = classifyLabSpecimen(finding);
  if (specimen === 'urine' || specimen === 'other-fluid') return false;
  if (specimen === 'blood') return true;
  return !isUrineMetadataOrAnalyte(finding);
}

/**
 * Una tendencia sistémica nunca mezcla sangre con orina ni con otro líquido
 * corporal. Se exige el acuerdo de las dos reglas —la del catálogo de muestras
 * y la de `lab-parser.js`, que es la autoridad vigente del corte sistémico—
 * porque en esta decisión el error caro es incluir de más, no excluir de más.
 */
export function isLabTrendSpecimenEligible(finding) {
  if (isRatio(finding)) return true;
  const specimen = classifyLabSpecimen(finding);
  if (specimen === 'urine' || specimen === 'other-fluid') return false;
  return isSystemicTrendEligible(finding);
}

/**
 * Filas que nunca entran a la comparación numérica. El calce es por subcadena y
 * sin plegar tildes: el catálogo trae las entradas truncadas («Raz») justamente
 * para cubrir las variantes acentuadas, y «N° de ingreso» y «Nº de ingreso» son
 * caracteres distintos que el LIS emite indistintamente.
 */
export function isExcludedFromComparison(analysis) {
  const name = cleanText(analysis).toLowerCase();
  return COMPARISON_EXCLUDE.some(entry => name.includes(entry.toLowerCase()));
}

/**
 * Prioridad de lectura en la tabla de comparación: menor índice, más arriba. Lo
 * que el catálogo no nombra se va al final, donde el llamador lo ordena alfabético.
 */
export function comparisonSortIndex(name) {
  const value = cleanText(name).toLowerCase();
  for (let index = 0; index < COMPARISON_ORDER.length; index += 1) {
    if (value.includes(COMPARISON_ORDER[index].toLowerCase())) return index;
  }
  return COMPARISON_ORDER.length + 1;
}

/**
 * Grupo de tendencia al que pertenece la variable, o null si no se grafica.
 * El primer grupo que calza gana: el orden de `TREND_GROUPS` es el orden de
 * lectura clínica, no un detalle de implementación.
 */
export function findTrendGroup(analysis) {
  const value = cleanText(analysis).toLowerCase();
  for (const group of TREND_GROUPS) {
    if (group.patterns.some(pattern => value.includes(pattern.toLowerCase()))) return group.label;
  }
  return null;
}

/** ¿Esta variable se grafica? Equivale a pertenecer a algún grupo de tendencia. */
export const isTrendVariable = analysis => findTrendGroup(analysis) !== null;
