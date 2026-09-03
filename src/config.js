export const CONFIG = Object.freeze({
  nodeId:    5576,
  officerId: 439550,
  base:      'https://clinicohangaroa.eloisa.cl',

  // Concurrency
  batchSize:      15, // ListaPacientesCitados (small responses)
  historialBatch: 3,  // HistorialAtencion (~1 MB per day for the whole node)
  sicBatch:       4,  // SIC detail calls in flight
  sicIdsPerCall:  10, // ids per SolicitudInterconsultaDerivacionPorIds call (as Eloisa does)

  // Storage keys
  cacheKey:     'rayen_citas_v2',
  historialKey: 'rayen_historial_v1',
  sicKey:       'rayen_sic_v1',
  watchKey:     'rayen_watch_v1',
  notesKey:     'rayen_notes_v1',
  prefsKey:     'rayen_prefs_v1',
  syncKeys: Object.freeze({
    agenda:    'rayen_sync_agenda_v1',
    historial: 'rayen_sync_historial_v1',
    sics:      'rayen_sync_sics_v1',
  }),

  // SIC list is re-fetched when older than this (states change over time)
  sicTtlMs: 30 * 60 * 1000,
  // Cached days older than this are pruned on load
  retentionMonths: 13,
  // Per-patient ficha window (years back). The API accepts any range.
  fichaYears: 10,

  /**
   * Interconsulta streams whose changes are worth remembering between loads.
   * These are the telemedicine specialties the doctor resolves himself, so a
   * change here is a change in his own queue. Editable from the IC tab.
   */
  watchEspecialidades: ['Gastroenterología Adulto', 'Reumatología'],

  /** Day thresholds at which each rule stops being noise. Clinical judgement. */
  pendientes: {
    nuevaDias:   21,  // SIC que nunca salió del estado "Nueva"
    citaDias:     7,  // cita ya pasada y la SIC sigue abierta
    controlDias:  1,  // control sugerido vencido
  },
});

export const DOW_LABEL = ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'];

/** HistorialAtencion.IdSexo → label (verified against UsuarioAps.Sexo.Id in the HAR). */
export const SEXO_BY_ID = Object.freeze({ 1: 'Desconocido', 2: 'Mujer', 3: 'Hombre', 4: 'Indeterminado' });

/** SIC state ids → label, from EstadosDerivacion/{SOLICITUD_INTERCONSULTA,RECEPCION_CONTRALOR}. */
export const SIC_ESTADOS = Object.freeze({
  2:  'Enviada',
  3:  'Cita Agendada',
  4:  'Con Cita Confirmada',
  5:  'Atendido',
  6:  'No Atendido',
  7:  'Rechazada por est. destino',
  9:  'Cita Cancelada',
  12: 'No se presentó a la cita',
  13: 'Nueva',
  15: 'Aceptada por est. destino',
  18: 'Diagnóstico confirmado',
  19: 'Alta',
  20: 'Egresada',
  25: 'En Revisión',
  26: 'Re Emitida',
  27: 'Rechazada por paciente',
  28: 'Observada por est. destino',
  29: 'Cancelada',
  30: 'Rechazada por sistema',
  32: 'Postergada',
});

/** Coarse lifecycle group for badges/filters. */
export const SIC_GRUPO = Object.freeze({
  pendiente: { label: 'Pendiente',  ids: [13, 25, 26, 28, 32] },
  enviada:   { label: 'En curso',   ids: [2, 15, 3, 4] },
  atendida:  { label: 'Atendida',   ids: [5, 18] },
  cerrada:   { label: 'Cerrada',    ids: [19, 20] },
  fallida:   { label: 'Fallida',    ids: [6, 7, 9, 12, 27, 29, 30] },
});

export function sicGrupo(estadoId) {
  for (const [k, g] of Object.entries(SIC_GRUPO)) if (g.ids.includes(estadoId)) return k;
  return 'otro';
}

/** States used when listing SICs. Origin-side (pre-envío) and destination-side (post-envío). */
export const SIC_ESTADOS_ORIGEN  = [13, 25, 26, 28, 30, 32];
export const SIC_ESTADOS_DESTINO = [2, 3, 4, 5, 6, 7, 9, 12, 15, 18, 19, 20, 27, 28, 29, 30, 31, 32];

/**
 * SIC priority. Rayen sends only the number — never a label — so the UI shows
 * the raw code and explains the inference on hover. Showing "Alta/Media/Baja"
 * would present a statistical guess as if it were a clinical fact.
 * Distribution observed in the HAR of 983 SIC: P1 = 33, P2 = 720, P3 = 230.
 */
const SIC_PRIORIDAD = Object.freeze({
  1: { code: 'P1', hint: 'Prioridad 1 · la menos frecuente (33 de 983 SIC del período). Rayen no envía una etiqueta; por su rareza es probablemente la más urgente, pero no está confirmado.' },
  2: { code: 'P2', hint: 'Prioridad 2 · la más frecuente (720 de 983 SIC del período). Rayen no envía una etiqueta.' },
  3: { code: 'P3', hint: 'Prioridad 3 · frecuencia intermedia (230 de 983 SIC del período). Rayen no envía una etiqueta.' },
});

/** @returns {{code: string, hint: string}} */
export function prioridadInfo(n) {
  return SIC_PRIORIDAD[n] ?? { code: `P${n}`, hint: 'Código de prioridad no visto en los datos analizados.' };
}
