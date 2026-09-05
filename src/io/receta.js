/**
 * Detalle de una receta desde Eloisa, bajo demanda (al desplegarla en la
 * pestaña Recetas). Una llamada por receta y sesión: el despacho cambia poco y
 * el botón de recarga de la ficha vacía esta memoria.
 */
import { apiGet } from './http.js';
import { parseRecetaDetalle } from '../core/receta.js';

const memo = new Map(); // idReceta → detalle

export const recetaDetallePath = id => `/API/api/rayen/Farmacia/Receta/id=${id};TraerPrescripciones=true;TraerAnexoReceta=true`;

/**
 * @param {string} token
 * @param {number} idReceta
 * @returns {Promise<ReturnType<typeof parseRecetaDetalle>>}  null si Eloisa no conoce la receta
 */
export async function fetchRecetaDetalle(token, idReceta, { force = false } = {}) {
  const id = Number(idReceta);
  if (!force && memo.has(id)) return memo.get(id);
  const data = await apiGet(token, recetaDetallePath(id));
  const detalle = parseRecetaDetalle(data);
  memo.set(id, detalle);
  return detalle;
}

export function olvidarRecetas() { memo.clear(); }
