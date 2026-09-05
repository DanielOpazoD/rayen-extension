/**
 * Plan de una carga: qué fechas quiere, cuáles vuelve a pedir, cuáles reintenta
 * y qué historial queda acoplado. Es puro (fechas, caché y salud de
 * sincronización entran por parámetro) para que se pueda probar sin red y para
 * que `api.js` sólo ejecute. Un plan es la única «bolsa» que viaja entre los
 * pasos de la carga, y está documentado aquí.
 *
 * @typedef {object} SyncPlan
 * @property {string[]} allDates          fechas YYYYMMDD del período pedido, de antigua a hoy
 * @property {Set<string>} wanted         las mismas, como conjunto
 * @property {string} todayStr            hoy en YYYYMMDD
 * @property {string} minDate8            límite de retención: lo anterior se poda
 * @property {Set<string>} refreshDates   hoy + fechas con citas en estado mutable (se vuelven a pedir aunque estén en caché)
 * @property {string[]} coupledHistoryDates fechas históricas cuyo historial debe volver a pedirse junto con la agenda
 * @property {Set<string>|null} retryAgendaDates en reintento, las fechas pendientes de agenda; si no, null
 * @property {string[]} toFetch           fechas de agenda que salen a la red
 * @property {string[]} priorHistoryDates fechas de historial pendientes de una carga anterior, dentro de la ventana
 * @property {Set<string>} historyRefreshDates fechas de historial que se vuelven a pedir
 * @property {(date: string) => boolean} inWindow  fecha YYYYMMDD válida, dentro de la retención y no futura
 */
import { dateRange, localDateStr } from './parser.js';
import { pendingSyncItems } from './sync-rules.js';

/**
 * Una cita histórica no es inmutable mientras Eloisa la muestre en un estado
 * abierto: esas fechas se vuelven a pedir para ver cierres posteriores sin
 * descargar todo el período en cada actualización.
 */
export function isMutableAppointmentStatus(status = '') {
  return /(iniciad|agendad|confirmad|citad|espera|pendiente|en curso)/i.test(String(status));
}

/** Primer día que se conserva según la retención en meses. */
export function retentionMin8(retentionMonths, today = new Date()) {
  const min = new Date(today);
  min.setMonth(min.getMonth() - retentionMonths);
  return localDateStr(min);
}

/**
 * @param {object} p
 * @param {number} p.months            meses hacia atrás que se quieren en pantalla
 * @param {number} p.retentionMonths   meses que se conservan en caché
 * @param {boolean} [p.retryOnly]      sólo lo pendiente de una carga anterior
 * @param {Iterable<object>} p.records registros ya en caché (tras la poda)
 * @param {Set<string>} p.fetchedDates fechas ya completas en caché
 * @param {object} p.previousSync      salud de sincronización previa (loadSyncHealth)
 * @param {Date} [p.today]
 * @returns {SyncPlan}
 */
export function planSync({ months, retentionMonths, retryOnly = false, records, fetchedDates, previousSync, today = new Date() }) {
  const from = new Date(today);
  from.setMonth(from.getMonth() - months);
  const allDates = dateRange(from, today);
  const wanted = new Set(allDates);
  const todayStr = localDateStr(today);
  const minDate8 = retentionMin8(retentionMonths, today);
  const inWindow = d => /^\d{8}$/.test(d) && d >= minDate8 && d <= todayStr;

  const refreshDates = new Set([todayStr]);
  for (const r of records) if (wanted.has(r.fecha8) && isMutableAppointmentStatus(r.estado)) refreshDates.add(r.fecha8);
  const historicalRefreshDates = [...refreshDates].filter(d => d !== todayStr);

  const pendingAgenda = pendingSyncItems(previousSync, 'agenda');
  const coupledHistoryDates = retryOnly ? historicalRefreshDates.filter(d => pendingAgenda.has(d)) : historicalRefreshDates;
  const retryAgendaDates = retryOnly ? pendingAgenda : null;
  const toFetch = retryOnly
    ? [...retryAgendaDates].filter(inWindow)
    : allDates.filter(d => !fetchedDates.has(d) || refreshDates.has(d));

  const priorHistoryDates = [...pendingSyncItems(previousSync, 'historial')].filter(inWindow);
  const historyRefreshDates = retryOnly ? refreshDates : new Set([...refreshDates, ...priorHistoryDates]);

  return { allDates, wanted, todayStr, minDate8, refreshDates, coupledHistoryDates, retryAgendaDates, toFetch, priorHistoryDates, historyRefreshDates, inWindow };
}
