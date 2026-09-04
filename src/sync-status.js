import { $, esc } from './dom.js';
import { hasRetryableSync, loadSyncHealth, recoverStaleSyncSources, SYNC_SOURCES } from './sync-health.js';

const LABELS = Object.freeze({ agenda: 'Agenda', historial: 'Ficha clínica', sics: 'Interconsultas' });
const STATUS = Object.freeze({
  ok:       ['Actualizada', 'ok'],
  cached:   ['Desde caché', 'neutral'],
  partial:  ['Parcial', 'warn'],
  error:    ['Sin actualizar', 'bad'],
  running:  ['Actualizando…', 'info'],
  disabled: ['Desactivada', 'neutral'],
});

function formatWhen(value) {
  if (!value) return 'Nunca';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Nunca';
  return date.toLocaleString('es-CL', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function formatItem(item) {
  return /^\d{8}$/.test(item) ? `${item.slice(6, 8)}-${item.slice(4, 6)}-${item.slice(0, 4)}` : item;
}

export function syncOverview(health) {
  const rows = SYNC_SOURCES.map(source => ({ source, value: health?.[source] })).filter(row => row.value);
  if (!rows.length) return { text: 'Sin sincronizaciones registradas', tone: 'neutral', pending: 0 };
  const pending = rows.reduce((sum, row) => sum + (row.value.failedItems?.length ?? 0), 0);
  if (rows.some(row => row.value.status === 'running')) return { text: 'Actualización en curso', tone: 'info', pending };
  if (rows.some(row => row.value.status === 'error')) return { text: 'Hay fuentes sin actualizar', tone: 'bad', pending };
  if (rows.some(row => row.value.status === 'partial')) return { text: 'Actualización parcial', tone: 'warn', pending };
  if (pending) return { text: 'Actualización parcial', tone: 'warn', pending };
  const checked = rows.filter(row => row.value.status !== 'disabled');
  const complete = rows.length === SYNC_SOURCES.length && checked.length > 0
    && checked.every(row => ['ok', 'cached'].includes(row.value.status));
  return { text: complete ? 'Fuentes disponibles' : 'Comprobación incompleta', tone: complete ? 'ok' : 'neutral', pending };
}

/**
 * Pinta el estado de sincronización. Nunca lanza: un fallo al leerlo se muestra
 * en su propio sitio en vez de tumbar la carga que lo llamó. Antes cada llamada
 * se protegía con su propio `.catch(() => {})` (ocho en total).
 */
export async function renderSyncStatus(health = null) {
  try {
    await renderSyncStatusBody(health);
  } catch {
    const panel = $('syncHealth');
    panel.hidden = false;
    $('syncOverall').textContent = 'No se pudo leer el estado de sincronización.';
    $('syncOverall').className = 'sync-overall warn';
  }
}

async function renderSyncStatusBody(health) {
  const data = health ?? await loadSyncHealth();
  const panel = $('syncHealth');
  const any = SYNC_SOURCES.some(source => data[source]);
  panel.hidden = !any;
  if (!any) return;

  const overview = syncOverview(data);
  $('syncOverall').textContent = overview.text;
  $('syncOverall').className = `sync-overall ${overview.tone}`;
  $('btnRetrySync').hidden = !hasRetryableSync(data);

  $('syncSources').innerHTML = SYNC_SOURCES.map(source => {
    const item = data[source];
    const [label, tone] = STATUS[item?.status] ?? ['Sin comprobar', 'neutral'];
    const pending = item?.failedItems ?? [];
    const pendingText = pending.length
      ? `<div class="sync-pending">Pendiente: ${pending.slice(0, 5).map(formatItem).map(esc).join(', ')}${pending.length > 5 ? ` y ${pending.length - 5} más` : ''}</div>`
      : '';
    const success = item?.lastSuccessAt ? `Último éxito: ${formatWhen(item.lastSuccessAt)}` : 'Sin actualización completa registrada';
    const attempt = item?.attemptedAt ? `Intento: ${formatWhen(item.attemptedAt)}` : 'Sin intentos';
    return `<article class="sync-source">
      <div class="sync-source-h"><strong>${LABELS[source]}</strong><span class="sync-badge ${tone}">${label}</span></div>
      <div class="sync-meta">${esc(success)} · ${esc(attempt)}</div>${pendingText}
    </article>`;
  }).join('');
}

export function initSyncStatus(onRetry) {
  $('btnSyncDetails').addEventListener('click', () => {
    const details = $('syncDetails');
    const open = details.hidden;
    details.hidden = !open;
    $('btnSyncDetails').setAttribute('aria-expanded', String(open));
    $('btnSyncDetails').textContent = open ? 'Ocultar' : 'Detalle';
  });
  $('btnRetrySync').addEventListener('click', onRetry);
  // Si no se pudo recuperar una fuente colgada, se pinta lo que haya: renderSyncStatus no lanza.
  recoverStaleSyncSources().catch(() => {}).then(() => renderSyncStatus());
}
