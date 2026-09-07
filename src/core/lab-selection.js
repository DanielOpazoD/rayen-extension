/**
 * Qué órdenes de laboratorio se pueden marcar, cuáles están marcadas y qué se
 * puede hacer con ellas.
 *
 * Vive en el núcleo, y recibe los resultados de los dos hospitales juntos,
 * porque la respuesta a «¿marcar todo incluye los dos?» no puede depender de
 * qué tabla se pintó. Ese fue justo el fallo: había una casilla de cabecera por
 * tabla, así que «seleccionar todo» alcanzaba a un hospital y el otro se
 * quedaba fuera sin decirlo.
 */

/** Identificador estable de una orden: dos hospitales pueden repetir el número. */
export const orderKey = (source, o) => `${source}:${source === 'hsr' ? o.numero : o.id}`;

/**
 * Sólo se ofrece marcar una orden de la que se pueda pedir el informe. Una
 * casilla sobre una orden sin informe prometería más de lo que se puede incluir.
 */
export const analysable = (source, o) => (source === 'hsr' ? Boolean(o.ordenEncryptada) : Boolean(o.link));

/** Todas las órdenes marcables de los dos hospitales, en el orden en que se pintan. */
export function selectableOrders(results) {
  return [
    ...(results?.hsr ?? []).filter(o => analysable('hsr', o)).map(o => ({ source: 'hsr', o })),
    ...(results?.hhr ?? []).filter(o => analysable('hhr', o)).map(o => ({ source: 'hhr', o })),
  ];
}

/** Las marcadas, en el mismo orden, ignorando claves que ya no están en pantalla. */
export function selectedOrders(results, selected) {
  return selectableOrders(results).filter(({ source, o }) => selected.has(orderKey(source, o)));
}

/**
 * Recuento para la interfaz. `imprimibles` no es lo mismo que `marcadas`: en el
 * Salvador una orden puede tener informe descargable y aún ninguna prestación
 * validada, y entonces no hay PDF que incluir.
 */
export function selectionCounts(results, selected) {
  const todas = selectableOrders(results);
  const marcadas = selectedOrders(results, selected);
  return {
    marcables: todas.length,
    marcadas: marcadas.length,
    imprimibles: marcadas.filter(({ o }) => o.puedeImprimir).length,
    todasMarcadas: todas.length > 0 && marcadas.length === todas.length,
    hsr: marcadas.filter(({ source }) => source === 'hsr').length,
    hhr: marcadas.filter(({ source }) => source === 'hhr').length,
  };
}

/** Cuántas órdenes con informe hay en total, marcadas o no. */
export const printableCount = results =>
  selectableOrders(results).filter(({ o }) => o.puedeImprimir).length;
