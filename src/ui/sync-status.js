import { $, esc, closestOf } from './dom.js';
import { loadSyncHealth, recoverStaleSyncSources } from '../io/sync-health.js';
import { hasRetryableSync, SYNC_SOURCES } from '../core/sync-rules.js';

const LABELS = Object.freeze({ agenda: 'Agenda', historial: 'Ficha clínica', sics: 'Interconsultas' });
const STATUS = Object.freeze({
  ok:       ['Actualizada', 'ok'],
  cached:   ['Guardadas antes', 'neutral'],
  partial:  ['Parcial', 'warn'],
  error:    ['Sin actualizar', 'bad'],
  running:  ['Actualizando…', 'info'],
  disabled: ['Desactivada', 'neutral'],
});

function formatWhen(value) {
  if (!value) return 'Nunca';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Nunca';
  // Mismo formato que las fechas pendientes de la tarjeta («05-03-2026»).
  const p = n => String(n).padStart(2, '0');
  return `${p(date.getDate())}-${p(date.getMonth() + 1)}-${date.getFullYear()} ${p(date.getHours())}:${p(date.getMinutes())}`;
}

function formatItem(item) {
  return /^\d{8}$/.test(item) ? `${item.slice(6, 8)}-${item.slice(4, 6)}-${item.slice(0, 4)}` : item;
}

export function syncOverview(health) {
  const rows = SYNC_SOURCES.map(source => ({ source, value: health?.[source] })).filter(row => row.value);
  if (!rows.length) return { text: 'Sin comprobar', tone: 'neutral', pending: 0 };
  const pending = rows.reduce((sum, row) => sum + (row.value.failedItems?.length ?? 0), 0);
  if (rows.some(row => row.value.status === 'running')) return { text: 'Sincronizando', tone: 'info', pending };
  if (rows.some(row => row.value.status === 'error')) return { text: 'Error', tone: 'bad', pending };
  if (rows.some(row => row.value.status === 'partial')) return { text: 'Pendiente', tone: 'warn', pending };
  if (pending) return { text: 'Pendiente', tone: 'warn', pending };
  const checked = rows.filter(row => row.value.status !== 'disabled');
  const complete = rows.length === SYNC_SOURCES.length && checked.length > 0
    && checked.every(row => ['ok', 'cached'].includes(row.value.status));
  // Con la ficha desactivada, «Al día» a secas prometía más de lo comprobado.
  const sinFicha = rows.some(row => row.value.status === 'disabled');
  return { text: complete ? (sinFicha ? 'Al día · sin ficha' : 'Al día') : 'Sin comprobar', tone: complete ? 'ok' : 'neutral', pending };
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
  // El botón «Detalle» conserva su estilo; el tono lo lleva el texto de al lado.
  $('btnSyncDetails').className = 'btn-mini';
  $('btnSyncDetails').setAttribute('aria-label', `${overview.text}. ${overview.pending ? `${overview.pending} pendientes. ` : ''}${$('syncDetails').hidden ? 'Ver detalle' : 'Ocultar detalle'}`);
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

function setDetails(open) {
  const details = $('syncDetails');
  if (details.hidden === !open) return;
  details.hidden = !open;
  $('btnSyncDetails').setAttribute('aria-expanded', String(open));
  $('btnSyncDetails').textContent = open ? 'Ocultar' : 'Detalle';
  $('btnSyncDetails').setAttribute('aria-label', `${$('syncOverall').textContent}. ${open ? 'Ocultar detalle' : 'Ver detalle'}`);
}

export function initSyncStatus(onRetry) {
  $('btnSyncDetails').addEventListener('click', () => setDetails($('syncDetails').hidden));
  // Es un desplegable que tapa contenido: se va con un clic fuera, con Escape o al cambiar de pestaña.
  document.addEventListener('click', e => { if (!closestOf(e, '#syncHealth')) setDetails(false); });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && !$('syncDetails').hidden) { setDetails(false); $('btnSyncDetails').focus(); }
  });
  document.querySelector('.tabs')?.addEventListener('click', () => setDetails(false));
  $('btnRetrySync').addEventListener('click', onRetry);
  // Si no se pudo recuperar una fuente colgada, se pinta lo que haya: renderSyncStatus no lanza.
  recoverStaleSyncSources().catch(() => {}).then(() => renderSyncStatus());
}
