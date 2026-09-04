/**
 * El mensaje de fin de carga. Antes sólo cambiaba el color cuando hubo días
 * sin actualizar; el ámbar no dice nada por sí solo. Ahora lo dice en palabras
 * y sigue empezando por el número que la persona usa.
 */
export function summarizeLoad(count, result) {
  const fails = (result.failedDays ?? 0) + (result.historialFailed ?? 0);
  const base = `${count} ${count === 1 ? 'atención' : 'atenciones'}`;
  if (!fails) return { text: base, cls: 'ok' };
  return { text: `${base} · ${fails} ${fails === 1 ? 'día no se pudo cargar' : 'días no se pudieron cargar'}`, cls: 'warn' };
}
