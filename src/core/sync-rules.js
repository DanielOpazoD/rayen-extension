/**
 * Reglas puras sobre la salud de sincronización: qué fuentes existen y qué
 * quedó pendiente. El almacenamiento del estado vive en io/sync-health.js.
 */
export const SYNC_SOURCES = Object.freeze(['agenda', 'historial', 'sics']);

/** Ítems (fechas o ids) que una fuente dejó fallidos en la última corrida. */
export function pendingSyncItems(health, source) {
  return new Set(health?.[source]?.failedItems ?? []);
}

/** Hay algo que reintentar en alguna fuente. */
export function hasRetryableSync(health) {
  return SYNC_SOURCES.some(source => (health?.[source]?.failedItems?.length ?? 0) > 0);
}
