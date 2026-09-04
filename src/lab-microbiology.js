/**
 * Analítica de microbiología: a qué cultivo pertenece cada examen y cada
 * hallazgo, y cómo se arma la tarjeta de cada cultivo.
 *
 * Port de `labMicrobiologyAnalyticsController.ts` del proyecto HHR. El
 * vocabulario (patrones, reglas y rótulos) vive en `lab-catalog.js`; aquí sólo
 * está la lógica que lo aplica.
 *
 * Por qué hay que categorizar: una sola orden de SysLab puede traer el cultivo
 * corriente, su antibiograma y un panel viral respiratorio. Sin separarlos, la
 * tarjeta mezclaría el «NEGATIVO» del rinovirus con el «Susceptible» de la
 * ceftazidima, y ninguno de los dos se podría leer.
 */

import { cleanText, comparisonToken } from './lab-parser.js';
import {
  MICROBIOLOGY_CATEGORY_LABELS,
  MICROBIOLOGY_CATEGORY_RULES,
  MICROBIOLOGY_PATTERNS,
} from './lab-catalog.js';

/** Los patrones del catálogo están en MAYÚSCULAS y sin espacios sobrantes. */
const upper = value => cleanText(value).toUpperCase();

/**
 * ¿Este examen es microbiológico? Sólo decide si la orden se lee como cultivo
 * en vez de como tabla numérica; la categoría se resuelve aparte.
 */
export function hasMicrobiologyPattern(value) {
  const name = upper(value);
  return MICROBIOLOGY_PATTERNS.some(pattern => name.includes(pattern));
}

/**
 * Categoría de un examen por su nombre. Gana la PRIMERA regla que calza, y por
 * eso el orden de `MICROBIOLOGY_CATEGORY_RULES` es parte del contrato:
 * «otros_cultivos» va última porque «ANTIBIOGRAMA» taparía a urocultivo y
 * hemocultivo si se evaluara antes.
 *
 * El patrón «ATB » lleva espacio final a propósito: «ATB BACILOS» es un
 * antibiograma, pero un examen que empiece por esas tres letras sin separarlas
 * no tiene por qué serlo.
 */
function categoryForExamName(examName) {
  const name = upper(examName);
  const matched = Object.entries(MICROBIOLOGY_CATEGORY_RULES).find(([, rule]) =>
    rule.exam.some(pattern => name.includes(pattern))
  );
  return matched ? matched[0] : null;
}

/**
 * Categorías presentes en una orden, sin repetir y en el orden en que aparecen
 * sus exámenes. Ese orden es además el de las tarjetas y el que desempata la
 * categoría de un hallazgo ambiguo.
 */
export function resolveMicrobiologyCategoriesForExam(exam) {
  const names = exam && Array.isArray(exam.exams) ? exam.exams : [];
  return [...new Set(names.map(categoryForExamName).filter(Boolean))];
}

const findingSignature = finding =>
  [finding?.section, finding?.analysis, finding?.result].map(cleanText).join(' ').toUpperCase();

/**
 * Cuánto pertenece un hallazgo a una categoría.
 *
 * `findingStrong` (3) lo identifica sin ambigüedad: «RHINOVIRUS» sólo puede
 * venir del panel viral. `findingWeak` (2) no identifica nada por sí solo y
 * únicamente sirve para desempatar: «RESISTENTE» o «AISLADO» aparecen en
 * cualquier antibiograma y no dicen si la muestra era orina o sangre.
 */
function categoryMatchScore(category, signature) {
  const rule = MICROBIOLOGY_CATEGORY_RULES[category];
  if (!rule) return 0;
  if (rule.findingStrong.some(pattern => signature.includes(pattern))) return 3;
  if (rule.findingWeak.some(pattern => signature.includes(pattern))) return 2;
  return 0;
}

/**
 * Categoría de un hallazgo entre las que trae la orden, o null si no calza en
 * ninguna. En empate gana la primera categoría de la orden: cualquier otro
 * criterio haría que un mismo antibiograma saltara de tarjeta según cómo venga
 * ordenado el informe.
 */
export function resolveMicrobiologyCategoryForFinding(finding, availableCategories) {
  const signature = findingSignature(finding);
  let best = null;
  let bestScore = 0;
  for (const category of Array.isArray(availableCategories) ? availableCategories : []) {
    const score = categoryMatchScore(category, signature);
    if (score > bestScore) {
      best = category;
      bestScore = score;
    }
  }
  return best;
}

/**
 * Deja el hallazgo en el balde de su categoría y devuelve esa categoría (o
 * null). Devolverla evita que quien recorre el informe tenga que resolverla dos
 * veces, como hacía el original.
 */
export function collectMicrobiologyFinding(finding, availableCategories, findingsByCategory) {
  const category = resolveMicrobiologyCategoryForFinding(finding, availableCategories);
  if (!category) return null;

  const entry = { analysis: cleanText(finding?.analysis), result: cleanText(finding?.result) };
  const collected = findingsByCategory.get(category) || [];
  // El informe repite la misma línea de antibiograma cuando la orden trae dos
  // muestras del mismo germen; verla dos veces en la tarjeta no agrega nada.
  const repeated = collected.some(
    previous => previous.analysis === entry.analysis && previous.result === entry.result
  );
  if (!repeated) collected.push(entry);
  findingsByCategory.set(category, collected);
  return category;
}

/**
 * Palabras que delatan un resultado que el clínico debe mirar: crecimiento,
 * detección o resistencia.
 *
 * «SENSIBLE» y «SUSCEPTIBLE» quedan fuera a propósito (ver `decisiones`): son
 * la mitad favorable del antibiograma y no cambian la conducta.
 */
const ALERT_MARKER =
  /^(?:positiv[oa]s?|reactiv[oa]s?|detect(?:a|o|an|ad[oa]s?)|aisl(?:a|o|ad[oa]s?)|presentes?|desarrollo|resistentes?)$/;

const NEGATION_CUE = /^(?:no|sin|ausencia|ausente)$/;

/**
 * Palabras que la negación puede atravesar sin dejar de negar: «no HUBO
 * desarrollo», «no SE OBSERVA desarrollo», «ausencia DE desarrollo».
 *
 * Cualquier otra palabra corta el alcance de la negación, y eso es lo que
 * distingue «no hubo desarrollo» (cultivo negativo) de «desarrollo de bacilo
 * Gram negativo NO FERMENTADOR» (cultivo positivo, donde el «no» niega al
 * fermentador y no al desarrollo).
 */
const NEGATION_BRIDGE =
  /^(?:se|hubo|hay|habia|existe|existen|observa|observan|observo|evidencia|evidencian|detecta|detectan|informa|reporta|de|del|el|la|los|las|un|una)$/;

const isNegatedMarker = (words, markerIndex) => {
  for (let index = markerIndex - 1; index >= 0; index -= 1) {
    if (NEGATION_CUE.test(words[index])) return true;
    if (!NEGATION_BRIDGE.test(words[index])) return false;
  }
  return false;
};

/**
 * ¿Este resultado microbiológico merece que la tarjeta se destaque?
 *
 * Se evalúa por cláusulas («desarrollo de E. coli, no se realizó antibiograma»
 * es alerta por la primera mitad) y respetando la negación, porque un cultivo
 * negativo es la buena noticia: marcarlo como alerta enseña al clínico a
 * ignorar el destacado.
 */
export function microbiologyResultAlert(result) {
  for (const clause of comparisonToken(result).split(/[.;:,]+/)) {
    const words = clause.split(/[^a-z0-9]+/).filter(Boolean);
    for (let index = 0; index < words.length; index += 1) {
      if (ALERT_MARKER.test(words[index]) && !isNegatedMarker(words, index)) return true;
    }
  }
  return false;
}

/**
 * Una entrada por categoría presente en la orden:
 * `{category, date, examLabel, findings, hasAlertFinding, sourceExam}`.
 *
 * La tarjeta se arma aunque no haya ni un hallazgo: el texto del cultivo suele
 * llegar sólo en el PDF, y esconder la tarjeta haría desaparecer un hemocultivo
 * pedido. El `date` llega por parámetro, nunca del reloj, para que la tarjeta
 * sea reproducible.
 */
export function buildMicrobiologyEntriesForExam(input) {
  const exam = input && input.exam;
  if (!exam) return [];

  const categories = Array.isArray(input.categories) ? input.categories : [];
  const findingsByCategory =
    input.findingsByCategory instanceof Map ? input.findingsByCategory : new Map();

  return categories.map(category => {
    const findings = (findingsByCategory.get(category) || []).slice();
    return {
      category,
      date: cleanText(input.date),
      examLabel: MICROBIOLOGY_CATEGORY_LABELS[category] || category,
      findings,
      hasAlertFinding: findings.some(finding => microbiologyResultAlert(finding.result)),
      sourceExam: exam,
    };
  });
}
