/**
 * Analítica de las tendencias de laboratorio: en qué tarjeta cae cada serie,
 * qué se muestra según los filtros del clínico y qué series pueden compartir
 * un eje. Aquí no se dibuja nada; el SVG vive en `lab-charts.js`.
 *
 * Port de `labTrendFilterController.ts` y de la parte analítica de
 * `LabTrendChartHelpers.ts` del proyecto HHR.
 *
 * Entrada: las series que produce `buildAnalysis` en `lab-analytics.js`:
 * `{analysis, unit, section, points:[{examId,label,timestamp,value,alert,refMin,refMax}]}`.
 * Los puntos ya vienen en orden cronológico y ya están filtrados a muestras
 * sistémicas con comparador exacto, así que este módulo no vuelve a validarlos.
 *
 * Tres reglas que no deben simplificarse:
 *
 * 1. La ventana temporal se ancla en el ÚLTIMO examen del paciente, no en el
 *    reloj. Un paciente cuyo último control fue hace un mes igual tiene
 *    tendencia; anclar en hoy le dejaría la vista vacía justo a quien más
 *    necesita mirarla.
 * 2. Dos variables comparten eje sólo si sus magnitudes son comparables. Una
 *    fosfatasa alcalina de 500 y una GOT de 15 en el mismo eje aplastan la GOT
 *    contra el piso y esconden su alza.
 * 3. La banda de referencia común se pinta sólo si todas las series y todos sus
 *    puntos declaran el mismo rango. Un rango que cambió entre informes (otro
 *    laboratorio, otra edad) bajo una sola banda daría por normal un valor que
 *    no lo era en su momento.
 */

import { comparisonToken } from '../core/lab-parser.js';
import { TREND_GROUPS } from '../core/lab-catalog.js';

const HORA_MS = 60 * 60 * 1000;
const DIA_MS = 24 * HORA_MS;

/**
 * Ventanas que ofrece la barra de filtros. `ms` es la duración hacia atrás
 * desde el último examen; `null` significa «sin recorte».
 */
export const TREND_TIME_RANGES = [
  { id: '24h', label: '24 h', ms: DIA_MS },
  { id: '3d', label: '3 días', ms: 3 * DIA_MS },
  { id: '7d', label: '7 días', ms: 7 * DIA_MS },
  { id: '30d', label: '30 días', ms: 30 * DIA_MS },
  { id: 'all', label: 'Todo', ms: null },
];

/**
 * Una tendencia necesita dos puntos. Es el mismo mínimo que exige
 * `buildAnalysis`, y hay que volver a exigirlo después de recortar por ventana:
 * un solo punto no es una tendencia, es un valor suelto que ya se lee en la
 * tabla de comparación.
 */
const MIN_TREND_POINTS = 2;

/** Sobre esta razón de magnitudes dos variables dejan de compartir eje. */
const SCALE_SPLIT_RATIO = 4;

/** Cajón de sastre: rótulo del catálogo bajo el que caen las series sin grupo. */
const UNGROUPED_LABEL = 'Otros';

const listOf = value => (Array.isArray(value) ? value : []);

/** Un bound ausente puede llegar como null o undefined; aquí siempre es null. */
const boundOf = value => (value == null ? null : value);

/**
 * Grupo clínico de un analito: gana el PRIMER patrón del catálogo que calce.
 * El orden de `TREND_GROUPS` es significativo — «Fosfatasa Alcalina» calza en
 * perfil hepático antes de que «pH» de gases alcance a mirarla.
 */
function trendGroupLabel(analysis) {
  const token = comparisonToken(analysis);
  for (const group of TREND_GROUPS) {
    if (group.patterns.some(pattern => token.includes(comparisonToken(pattern)))) return group.label;
  }
  return UNGROUPED_LABEL;
}

/**
 * Reparte las series en las tarjetas clínicas del catálogo, en el orden del
 * catálogo. Las series que no calzan en ningún patrón caen en «Otros»: un INR o
 * una TSH con dos mediciones son tendencia aunque el catálogo no las nombre, y
 * dejarlas fuera las haría desaparecer sin aviso de la vista agrupada.
 *
 * @param {Array} trends series de `buildAnalysis`
 * @returns {Array<{label: string, series: Array}>}
 */
export function buildTrendGroups(trends) {
  const seriesByLabel = new Map();
  for (const trend of listOf(trends)) {
    if (!trend || listOf(trend.points).length < MIN_TREND_POINTS) continue;
    const label = trendGroupLabel(trend.analysis);
    if (!seriesByLabel.has(label)) seriesByLabel.set(label, []);
    seriesByLabel.get(label).push(trend);
  }

  const order = TREND_GROUPS.map(group => group.label);
  if (!order.includes(UNGROUPED_LABEL)) order.push(UNGROUPED_LABEL);
  return order
    .filter(label => seriesByLabel.has(label))
    .map(label => ({ label, series: seriesByLabel.get(label) }));
}

/**
 * Instante del examen más reciente presente en los grupos, o 0 si no hay
 * ninguno. Es el ancla por omisión de la ventana temporal.
 */
export function latestTrendTimestamp(groups) {
  let latest = 0;
  for (const group of listOf(groups)) {
    for (const trend of listOf(group && group.series)) {
      for (const point of listOf(trend && trend.points)) {
        if (Number.isFinite(point.timestamp) && point.timestamp > latest) latest = point.timestamp;
      }
    }
  }
  return latest;
}

/**
 * Aplica los filtros de la barra: ventana temporal, búsqueda y «sólo
 * alterados». No muta la entrada; devuelve grupos y series nuevos.
 *
 * `anchor` es el instante en que se ancla la ventana, en milisegundos. Si no se
 * entrega se usa el último examen del paciente — nunca el reloj: el resultado
 * debe depender sólo de los datos para poder probarse y para que un paciente
 * sin controles recientes no vea la vista en blanco. La ventana sólo recorta
 * hacia atrás; con el ancla por omisión no hay nada después de ella.
 *
 * Un rango desconocido (una preferencia guardada de una versión anterior) se
 * trata como «Todo»: mejor mostrar de más que dejar la pantalla vacía.
 *
 * @param {Array} groups salida de `buildTrendGroups`
 * @param {{range?: string, search?: string, onlyAltered?: boolean, anchor?: number}} filters
 */
export function filterTrendGroups(groups, filters = {}) {
  const { range = 'all', search = '', onlyAltered = false, anchor } = filters || {};
  const safeGroups = listOf(groups);
  const window = TREND_TIME_RANGES.find(option => option.id === range);
  const anchorAt = Number.isFinite(anchor) ? anchor : latestTrendTimestamp(safeGroups);
  const cutoff = window && window.ms != null ? anchorAt - window.ms : -Infinity;
  const needle = comparisonToken(search);

  const result = [];
  for (const group of safeGroups) {
    if (!group) continue;
    // Si el rótulo del grupo calza, la búsqueda arrastra a todas sus variables:
    // buscar «hepático» debe traer la GOT aunque no se llame así.
    const labelMatches = comparisonToken(group.label).includes(needle);
    const series = [];
    for (const trend of listOf(group.series)) {
      if (!trend) continue;
      if (needle && !labelMatches && !comparisonToken(trend.analysis).includes(needle)) continue;
      const points = listOf(trend.points).filter(point => point.timestamp >= cutoff);
      if (points.length < MIN_TREND_POINTS) continue;
      if (onlyAltered && !points.some(point => point.alert)) continue;
      series.push({ ...trend, points });
    }
    if (series.length) result.push({ ...group, series });
  }
  return result;
}

/** Cuántas variables hay a la vista, para el contador «N de M» de la barra. */
export function countTrendVariables(groups) {
  return listOf(groups).reduce((total, group) => total + listOf(group && group.series).length, 0);
}

/**
 * Valor central de una serie (|valor| de la mitad superior una vez ordenados).
 * Se usa la mediana y no el máximo porque un solo peak no debe decidir en qué
 * eje vive la variable el resto del ingreso.
 */
function seriesMagnitude(points) {
  const values = listOf(points).map(point => Math.abs(point.value)).sort((a, b) => a - b);
  return values[Math.floor(values.length / 2)] || 0;
}

/** Dos unidades son la misma aunque el informe las escriba «U/L» y «u / l». */
const unitKey = unit => comparisonToken(unit).replace(/\s/g, '');

/**
 * Parte las series de una tarjeta en subgráficos: primero por unidad, y dentro
 * de cada unidad por escala. Sin esto, en el perfil hepático la fosfatasa
 * alcalina (~500 U/L) deja a la GOT y la GPT (~15 U/L) pegadas al eje y su alza
 * pasa desapercibida.
 *
 * @param {Array} series series de un grupo
 * @returns {Array<{unit: string, series: Array}>}
 */
export function groupSeriesByScale(series) {
  const byUnit = new Map();
  for (const trend of listOf(series)) {
    if (!trend) continue;
    const key = unitKey(trend.unit);
    if (!byUnit.has(key)) byUnit.set(key, []);
    byUnit.get(key).push(trend);
  }

  const result = [];
  for (const sameUnit of byUnit.values()) {
    const unit = sameUnit[0].unit || '';
    if (sameUnit.length === 1) {
      result.push({ unit, series: sameUnit });
      continue;
    }

    const ranked = sameUnit
      .map(trend => ({ trend, magnitude: seriesMagnitude(trend.points) }))
      .sort((a, b) => a.magnitude - b.magnitude);

    let cluster = [];
    // El `|| 1` evita dividir por cero cuando una serie es constante en 0.
    let clusterBase = ranked[0].magnitude || 1;
    for (const item of ranked) {
      if (cluster.length && (item.magnitude || 1) / clusterBase > SCALE_SPLIT_RATIO) {
        result.push({ unit, series: cluster });
        cluster = [];
        clusterBase = item.magnitude || 1;
      }
      cluster.push(item.trend);
    }
    if (cluster.length) result.push({ unit, series: cluster });
  }
  return result;
}

/**
 * Rango normal común a un subgráfico completo. Sólo existe si todos los puntos
 * de todas sus series declaran exactamente el mismo rango; si uno difiere no
 * hay banda, porque una banda única sobre rangos distintos miente.
 *
 * Se aceptan cotas abiertas («< 0,5» ⇒ min null): la banda llega al borde del
 * gráfico, igual que en `lab-charts.js`.
 *
 * @returns {{min: number|null, max: number|null}|null}
 */
export function groupReferenceBand(series) {
  const points = listOf(series).flatMap(trend => listOf(trend && trend.points));
  if (!points.length) return null;
  const min = boundOf(points[0].refMin);
  const max = boundOf(points[0].refMax);
  if (min === null && max === null) return null;
  const same = points.every(point => boundOf(point.refMin) === min && boundOf(point.refMax) === max);
  return same ? { min, max } : null;
}
