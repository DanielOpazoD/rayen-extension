/**
 * Parser clínico de informes de laboratorio.
 *
 * Port literal de `extension/lab-result-parser.js` del proyecto HHR, validado
 * contra informes reales de SysLab. Convierte el texto plano de un informe en
 * hallazgos estructurados y decide cuáles están fuera de rango.
 *
 * Dos reglas sutiles que no deben simplificarse:
 *
 * 1. Números chilenos: «1.234» puede ser mil doscientos treinta y cuatro o uno
 *    coma dos tres cuatro. Se resuelve mirando la unidad y si el rango de
 *    referencia declara decimales — no por convención fija.
 * 2. Separación de muestras: un sodio en orina no es comparable con uno en
 *    sangre. `isSystemicTrendEligible` deja fuera orina y otros líquidos de las
 *    tendencias sistémicas, salvo las razones RAC y RPC, que sí son sistémicas.
 */

export const cleanText = value => String(value == null ? '' : value).replace(/\s+/g, ' ').trim();

export const comparisonToken = value => cleanText(value)
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase();

const isUrineSection = section =>
  /orina|urinari|sedimento|albuminuria|creatininuria|creatinuria|proteinuria/i.test(comparisonToken(section));

const isOtherFluidSection = section => /\bliquidos?\b|\blcr\b/i.test(comparisonToken(section));

const specimenSignature = finding =>
  `${(finding && finding.section) || ''} ${(finding && finding.analysis) || ''} ${(finding && finding.unit) || ''}`;

/** Un hallazgo entra en tendencias sistémicas sólo si no es de orina ni de otro líquido. */
export const isSystemicTrendEligible = finding => {
  if (finding && (finding.analysis === 'RAC' || finding.analysis === 'RPC')) return true;
  return !isUrineSection(specimenSignature(finding)) && !isOtherFluidSection(specimenSignature(finding));
};

export function normalizeAnalysisName(value, section) {
  const name = cleanText(value);
  const token = comparisonToken(name);
  const hasRatioLabel = token === 'rac' || token === 'rpc' || token.includes('relac') || token.includes('ratio');
  if (hasRatioLabel && token.includes('albumina') && token.includes('creatininuri')) return 'RAC';
  if (hasRatioLabel && token.includes('proteinuria') && token.includes('creatininuri')) return 'RPC';
  // En orina, «Leucocitos» es sedimento urinario y no el recuento hematológico.
  if (isUrineSection(section) && /^leucocitos$/i.test(name)) return 'Leucocitos';

  const replacements = [
    [/^leucocitos(?:\s+totales)?$/i, 'Recuento Leucocitos'],
    [/^(?:recuento\s+de?\s*|rcto\.?\s*)leucocitos$/i, 'Recuento Leucocitos'],
    [/^plaquetas$|^recuento\s+(?:de\s+)?plaquetas$/i, 'Recuento de Plaquetas'],
    [/^neutr[oó]filos(?:\s+segmentados)?$/i, 'Segmentados'],
    [/^hb\.?\s*corp\.?\s*media\s*-?\s*hcm$/i, 'HCM'],
    [/^vol\.?\s*corp\.?\s*medio\s*-?\s*vcm$/i, 'VCM'],
    [/^prote[ií]na\s+c\s+reactiva$|^pcr\s+cuantitativ[ao]$/i, 'Proteina C Reactiva'],
    [/^prot\.?\s*c\.?\s*reactiva$/i, 'Proteina C Reactiva'],
    [/^creatinina(?:\s+s[eé]rica)?$/i, 'Creatinina'],
    [/^nitr[oó]geno\s+ureico$/i, 'Nitrogeno Ureico'],
    [/^(?:ck|cpk|creatin(?:a\s+)?(?:fosfo)?(?:quinasa|kinasa))(?:\s+total)?$/i, 'CK Total'],
    [/^hco3(?:\s+actual)?$/i, 'HCO3'],
    [/^t4\s+libre$/i, 'T4L'],
    [/^triglic[eé]ridos$/i, 'TG'],
    [/^hemoglobina\s+glicosilada(?:\s*#?\d*)?$/i, 'Hb glicosilada'],
    [/^bilirrubina\s+t\.?$/i, 'Bilirrubina Total'],
    [/^bilirrubina\s+d\.?$/i, 'Bilirrubina Directa'],
    [/^bilirrubina\s+i\.?$/i, 'Bilirrubina Indirecta'],
  ];
  for (const [pattern, replacement] of replacements) {
    if (pattern.test(name)) return replacement;
  }

  // «PCR» a secas es proteína C reactiva en bioquímica, pero en microbiología
  // es reacción en cadena de la polimerasa: un examen distinto. La app de HHR
  // lo traduce siempre a proteína C reactiva; aquí se exige que la sección no
  // sea microbiológica antes de hacerlo, para no rotular un panel viral como
  // un marcador inflamatorio.
  if (/^pcr$/i.test(name) && !/microbiolog|cultivo|biolog[ií]a\s+molecular/i.test(comparisonToken(section))) {
    return 'Proteina C Reactiva';
  }
  return name;
}

const referenceDeclaresDecimals = reference => {
  const value = cleanText(reference);
  return /\d+,\d+/.test(value) || /\d+\.\d{1,2}(?!\d)/.test(value) || /\b0\.\d{3,}\b/.test(value);
};
const usesScaledCellUnit = unit => /(?:X|×)?10\s*\^?\s*[369]/i.test(cleanText(unit));
const usesWholeNumberUnit = unit =>
  /^(?:(?:U|UI|IU)\/?L|(?:(?:C[ÉE]L(?:ULA)?S?|CELLS?)\/?)?\/?(?:[UµΜ]L|MM(?:\^?3|³)))$/i
    .test(cleanText(unit).replace(/[\s|]/g, ''));

const LOCALIZED_NUMBER_SOURCE = '[+-]?\\d[\\d.,]*';
const REFERENCE_RANGE_REGEX = new RegExp(`(${LOCALIZED_NUMBER_SOURCE})\\s*[-–]\\s*(${LOCALIZED_NUMBER_SOURCE})`);
const REFERENCE_BOUND_REGEX = new RegExp(`^\\s*([<>]=?|[≤≥])\\s*(${LOCALIZED_NUMBER_SOURCE})`);
const REFERENCE_SUFFIX_REGEX = new RegExp(
  `(?:^|\\s)((?:(?:[<>]=?|[≤≥])\\s*)?${LOCALIZED_NUMBER_SOURCE}\\s*[-–]\\s*${LOCALIZED_NUMBER_SOURCE}|(?:[<>]=?|[≤≥])\\s*${LOCALIZED_NUMBER_SOURCE})\\s*$`
);

/**
 * Interpreta un valor medido, resolviendo la ambigüedad del punto chileno.
 * Devuelve `{comparator, value}` o null si no es numérico.
 */
export function parseMeasurement(value, context) {
  const compact = cleanText(value).replace(/\s/g, '');
  const match = compact.match(/^([<>]=?|[≤≥])?([+-]?\d[\d.,]*)$/);
  if (!match) return null;
  const numeric = match[2];
  const unsignedNumeric = numeric.replace(/^[+-]/, '');
  const unit = cleanText(context && context.unit);
  const refValue = cleanText(context && context.refValue);
  let normalized = numeric;

  if (numeric.includes(',') && numeric.includes('.')) {
    normalized = numeric.lastIndexOf(',') > numeric.lastIndexOf('.')
      ? numeric.replace(/\./g, '').replace(',', '.')
      : numeric.replace(/,/g, '');
  } else if (numeric.includes(',')) {
    normalized = numeric.replace(',', '.');
  } else if (/^\d{1,3}(?:\.\d{3}){2,}$/.test(unsignedNumeric)) {
    normalized = numeric.replace(/\./g, '');
  } else if (
    // «4.500» con unidad de recuento entero y referencia sin decimales es 4500,
    // no 4,5. Cualquiera de las señales contrarias deja el punto como decimal.
    /^\d{1,3}\.\d{3}$/.test(unsignedNumeric) &&
    !unsignedNumeric.startsWith('0.') &&
    !usesScaledCellUnit(unit) &&
    !referenceDeclaresDecimals(refValue) &&
    usesWholeNumberUnit(unit)
  ) {
    normalized = numeric.replace('.', '');
  }

  const number = Number(normalized);
  if (!Number.isFinite(number)) return null;
  const rawComparator = match[1] || '=';
  const comparator = rawComparator === '≤' ? '<=' : rawComparator === '≥' ? '>=' : rawComparator;
  return { comparator, value: number };
}

const parseReferenceNumber = (value, context) => parseMeasurement(value, context)?.value;

/** Convierte un valor de referencia («3,5 - 5,1», «< 0,5») en límites comparables. */
export function referenceBounds(value, context) {
  const ref = cleanText(value);
  let match = ref.match(REFERENCE_RANGE_REGEX);
  if (match) {
    const min = parseReferenceNumber(match[1], context);
    const max = parseReferenceNumber(match[2], context);
    return min != null && max != null ? { min, max, minInclusive: true, maxInclusive: true } : null;
  }
  match = ref.match(REFERENCE_BOUND_REGEX);
  if (!match) return null;
  const boundary = parseReferenceNumber(match[2], context);
  if (boundary == null) return null;
  if (match[1].startsWith('<') || match[1] === '≤') {
    return {
      min: null,
      max: boundary,
      minInclusive: true,
      maxInclusive: match[1] === '<=' || match[1] === '≤',
    };
  }
  return {
    min: boundary,
    max: null,
    maxInclusive: true,
    minInclusive: match[1] === '>=' || match[1] === '≥',
  };
}

/** ¿Este hallazgo está fuera de rango? Cubre comparadores y resultados cualitativos. */
export function findingAlert(finding) {
  const result = cleanText(finding && finding.result);
  const measurement = parseMeasurement(result, finding);
  const bounds = referenceBounds(finding && finding.refValue, finding);
  if (measurement && measurement.comparator === '=' && bounds) {
    if (bounds.min != null && (measurement.value < bounds.min || (!bounds.minInclusive && measurement.value === bounds.min))) return true;
    if (bounds.max != null && (measurement.value > bounds.max || (!bounds.maxInclusive && measurement.value === bounds.max))) return true;
    return false;
  }
  if (measurement && bounds) {
    const isLess = measurement.comparator === '<';
    const isLessOrEqual = measurement.comparator === '<=';
    const isGreater = measurement.comparator === '>';
    const isGreaterOrEqual = measurement.comparator === '>=';
    if (bounds.min != null && (
      (isLess && measurement.value <= bounds.min) ||
      (isLessOrEqual && (measurement.value < bounds.min || (measurement.value === bounds.min && !bounds.minInclusive)))
    )) return true;
    if (bounds.max != null && (
      (isGreater && measurement.value >= bounds.max) ||
      (isGreaterOrEqual && (measurement.value > bounds.max || (measurement.value === bounds.max && !bounds.maxInclusive)))
    )) return true;
  }
  const resultToken = comparisonToken(result);
  const referenceToken = comparisonToken(finding && finding.refValue);
  const qualitativeResult = /^(negativo|positivo|normal|ausente|presente|reactivo|no reactivo|detectado|no detectado|escasa|moderada|abundante|no se observa(?:n)?)$/;
  const qualitativeReference = /^(negativo|normal|ausente|no reactivo|no detectado|escasa|no se observa(?:n)?)$/;
  return qualitativeResult.test(resultToken) && qualitativeReference.test(referenceToken)
    ? resultToken !== referenceToken
    : false;
}

const REPORT_SKIP_PATTERNS = [
  /^HOSPITAL\s+DE\s+/i, /^Laboratorio\s+Cl[íi]nico/i, /^Nombre\s*:/i,
  /^Rut\/?Fic\s*:/i, /^Fecha\s+de\s+Nac/i, /^Procedencia\s*:/i,
  /^Fecha\s+y\s+Hora/i, /^Fecha\s+de\s+impresi[óo]n/i,
  /^E\s+X\s+A\s+M\s+E\s+N\s+E\s+S\s*$/, /^Director\s+T[ée]cnico/i,
  /^Resultado\s+Via\s+WEB/i, /^Resultado\s+Unidad\s+Valor\s+de\s+Referencia/i,
  /^Nota\s*:/i, /^Valores?\s+(de\s+)?[Rr]eferencia/i, /^Ni[ñn]os?.*\s\d/i,
  /^Adultos\s+[<>]/i, /^Para\s+valores/i, /^se\s+recomienda/i, /^_+$/, /^TM\s+[A-ZÁÉÍÓÚÑ]/,
];
const REPORT_SECTION_REGEX = /^[A-ZÁÉÍÓÚÑ][A-ZÁÉÍÓÚÑ0-9\s+\-/#.]{2,60}$/;
const REPORT_NUMERIC_REGEX = /^(.+?)\s*:\s*\|?\s*((?:[<>]=?|[≤≥])?\s*[+-]?\s*[\d.,]+)(.*)$/;
const REPORT_QUALITATIVE_REGEX = /^(.+?)\s*:\s*(NEGATIVO|POSITIVO|NORMAL|AUSENTE|PRESENTE|REACTIVO|NO\s+REACTIVO|DETECTADO|NO\s+DETECTADO|ESCASA|MODERADA|ABUNDANTE|NO\s+SE\s+OBSERVA(?:N)?)\s*$/i;
const REPORT_NON_ANALYTIC_PATTERNS = [
  /^Edad$/i, /^Valor\s+de\s+referencia$/i, /^Profilaxis\s+trombosis\s+venosa$/i,
  /^Prevenci[oó]n\s+tromb\./i, /^Profilaxis\s+arteriales/i, /^Equipo\s+analizador$/i,
  /^Hombres?$/i, /^Mujeres/i, /^Ni[ñn]os?/i, /^Ni[ñn]as?/i, /^Adultos?/i,
  /^Embarazadas?/i, /^Reci[ée]n\s+nacidos?/i, /^Lactantes?/i,
];

/** Extrae el cuerpo del RUT desde la línea «Rut/Fic:» del informe. */
export function extractRutBodyFromReportText(text) {
  const line = String(text || '').split(/\r?\n/).find(value => /^\s*Rut\/?Fic\s*:/i.test(value));
  if (!line) return '';
  const match = line.replace(/^\s*Rut\/?Fic\s*:/i, '').match(/\d[\d.]*/);
  return match ? match[0].replace(/\D/g, '') : '';
}

// Referencias escritas con palabras: «Hasta 5», «Menor a 200», «Mayor de 40».
const WORDED_BOUNDS = [
  [new RegExp(`\\bHasta\\s+(${LOCALIZED_NUMBER_SOURCE})`, 'gi'), '≤ $1'],
  [new RegExp(`\\bMenor(?:es)?\\s+(?:a|de|que)\\s+(${LOCALIZED_NUMBER_SOURCE})`, 'gi'), '< $1'],
  [new RegExp(`\\bMayor(?:es)?\\s+(?:a|de|que)\\s+(${LOCALIZED_NUMBER_SOURCE})`, 'gi'), '> $1'],
];
// Un rótulo de grupo que encabeza el rango («mEq/L Adultos: 3,5 - 5,0») no es
// parte de la unidad. Dejarlo dentro partía una misma variable en dos filas.
const UNIT_TRAILING_LABEL = /\s*\b(?:Adultos?|Ni[ñn][oa]s?|Hombres?|Mujeres|Embarazadas?|Lactantes?|Reci[ée]n\s+nacidos?|Valores?\s+(?:de\s+)?referencia)\s*:?\s*$/i;

function splitReportUnitAndReference(rest) {
  let cleaned = String(rest || '').replace(/^\s*\|+\s*|\s*\|+\s*$/g, '').trim();
  if (!cleaned) return { unit: '', refValue: '' };
  for (const [regex, replacement] of WORDED_BOUNDS) cleaned = cleaned.replace(regex, replacement);
  const rangeSuffix = cleaned.match(REFERENCE_SUFFIX_REGEX);
  let unit = cleaned, refValue = '';
  if (rangeSuffix && Number.isInteger(rangeSuffix.index)) {
    unit = cleaned.slice(0, rangeSuffix.index).trim();
    refValue = rangeSuffix[1].trim();
  }
  unit = unit.replace(UNIT_TRAILING_LABEL, '').replace(/\s*\S+:$/, '').trim();
  return { unit, refValue };
}

const isValidAnalysis = analysis => analysis.length >= 2 && analysis.length <= 60 &&
  !analysis.includes(':') && !REPORT_NON_ANALYTIC_PATTERNS.some(pattern => pattern.test(analysis));

// Un informe a dos columnas puede dejar dos analitos en una misma línea
// reconstruida: «Sodio: 140 mEq/L 135 - 145 Potasio: 6,8 mEq/L 3,5 - 5,1».
// Sin cortar, el primer analito se quedaba con el rango del segundo —un sodio
// normal marcado como alterado— y el segundo desaparecía sin dejar rastro.
//
// Cada «: valor» es el ancla de un analito. Entre dos anclas hay, en este
// orden, la cola del anterior (unidad y rango) y la cabeza del siguiente (su
// nombre). La frontera se busca de derecha a izquierda: son nombre las palabras
// sólo de letras con mayúscula inicial («Hb», «Corpuscular», «Media», «B12») y
// los conectores en minúscula entre ellas («Recuento de Plaquetas»); todo lo
// demás —«fL», «80 - 100», «%», «seg», «mg/dL»— es cola. Un ancla cuya cabeza no
// es un analito («Adultos: 3,5 - 5,0») encabeza el rango del anterior y se le
// pliega. Las versiones anteriores cortaban ante cualquier «palabra: número» y
// decidían por trozos; con nombres de tres palabras tras otro analito completo
// el VCM perdía su rango y, con él, su alerta.
const VALUE_ANCHOR = /:\s*\|?\s*(?:[<>]=?|[≤≥])?\s*[+-]?\s*\d[\d.,]*/g;
const HEAD_WORD = /^[A-ZÁÉÍÓÚÑ][A-Za-z0-9ÁÉÍÓÚÑáéíóúñ]*\.?$/;
const HEAD_CONNECTOR = new Set(['de', 'del', 'la', 'las', 'el', 'los', 'en', 'y', 'e', 'a', 'por', 'con']);
const UNIT_LIKE_HEAD = /^(?:m?UI|IU|U|mU|UFC|UF)$/;

/** Divide el texto entre dos anclas en cola del analito anterior y cabeza del siguiente. */
function splitTailAndHead(middle) {
  const words = middle.trim().split(/\s+/).filter(Boolean);
  let i = words.length;
  while (i > 0) {
    const w = words[i - 1];
    if (HEAD_WORD.test(w) && !UNIT_LIKE_HEAD.test(w)) i -= 1;
    else if (HEAD_CONNECTOR.has(w) && i < words.length) i -= 1;
    else break;
  }
  while (i < words.length && HEAD_CONNECTOR.has(words[i])) i += 1; // un nombre no empieza por «de»
  return { tail: words.slice(0, i).join(' '), head: words.slice(i).join(' ') };
}

function splitEmbeddedAnalytes(line) {
  const anchors = [...line.matchAll(VALUE_ANCHOR)];
  if (anchors.length <= 1) return [line];

  const segments = []; // { label, value, rest }
  let label = line.slice(0, anchors[0].index).trim();
  for (let k = 0; k < anchors.length; k += 1) {
    const value = anchors[k][0];
    const restEnd = k + 1 < anchors.length ? anchors[k + 1].index : line.length;
    const middle = line.slice(anchors[k].index + value.length, restEnd);
    const { tail, head } = k + 1 < anchors.length ? splitTailAndHead(middle) : { tail: middle.trim(), head: '' };
    const last = segments[segments.length - 1];
    if (segments.length && (!label || !isValidAnalysis(cleanText(label)))) {
      // «Adultos: 3,5 - 5,0» o una cabeza vacía: rango del analito anterior.
      last.rest = `${last.rest} ${label}${value} ${tail}`.trim();
    } else {
      segments.push({ label, value, rest: tail });
    }
    label = head;
  }
  return segments.map(seg => `${seg.label}${seg.value}${seg.rest ? ` ${seg.rest}` : ''}`);
}

/** Texto plano de un informe → lista de hallazgos `{section, analysis, result, unit, refValue}`. */
export function parseReportText(text) {
  const parsedData = [];
  let currentSection = 'GENERAL';
  for (let line of String(text || '').split(/\r?\n/)) {
    line = line.trim();
    if (line.length < 3 || REPORT_SKIP_PATTERNS.some(pattern => pattern.test(line))) continue;
    if (!line.includes(':') && REPORT_SECTION_REGEX.test(line)) {
      currentSection = cleanText(line);
      continue;
    }
    for (const segment of splitEmbeddedAnalytes(line)) {
      const finding = parseAnalyteSegment(segment, currentSection);
      if (finding) parsedData.push(finding);
    }
  }
  return parsedData;
}

function parseAnalyteSegment(segment, currentSection) {
  let match = segment.match(REPORT_QUALITATIVE_REGEX);
  if (match) {
    const analysis = normalizeAnalysisName(match[1], currentSection);
    if (!isValidAnalysis(analysis)) return null;
    return {
      section: currentSection, analysis, result: match[2].trim().toUpperCase(),
      unit: '', refValue: '', qualitative: true,
    };
  }
  match = segment.match(REPORT_NUMERIC_REGEX);
  if (!match) return null;
  const analysis = normalizeAnalysisName(match[1], currentSection);
  if (!isValidAnalysis(analysis)) return null;
  const split = splitReportUnitAndReference(match[3]);
  return {
    section: currentSection, analysis, result: match[2].replace(/\s+/g, ''),
    unit: split.unit, refValue: split.refValue,
  };
}
