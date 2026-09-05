/**
 * Recetas: autoridad de Rayen y detalle de despacho, sin red ni DOM.
 *
 * Dos fuentes verificadas en el HAR «ficha amb» del 04-09-2026:
 *   - `FichaClinica/FarmacoEnUso/IdUsuario={id}` (la misma lista que trae
 *     `RecuperarAntecedentes.farmacoEnUsos.medications`): los fármacos que Rayen
 *     considera en uso, con número de receta y «Estado Receta: Por Despachar».
 *     Es la autoridad para «activa»; la duración escrita (ficha-rank.js) queda
 *     de respaldo cuando la receta no aparece ahí.
 *   - `Farmacia/Receta/id={id};TraerPrescripciones=true;TraerAnexoReceta=true`:
 *     por prescripción, `SuspenderTratamiento`, `FechaSuspendeTratamiento`,
 *     `CantidadDespachada`, `SaldoPendiente` y, por receta, `TerminoVigencia`.
 *     Se pide sólo al desplegar una receta.
 */
import { cleanText } from './text.js';
import { fmtDate, localDateStr } from './parser.js';
import { prescripcionEstado } from './ficha-rank.js';

const NULL_DATE = '00010101';
const hasDate = v => /^\d{8}/.test(String(v || '')) && !String(v).startsWith(NULL_DATE);

/**
 * Índice por número de receta de los fármacos en uso según Rayen.
 * @param {Array<{receta:number, estado?:string, fecha?:string}>} farmacos  salida de parseAntecedentes().farmacos
 * @returns {Map<number, {estado:string, fecha:string, n:number}>}
 */
export function mapaFarmacosEnUso(farmacos) {
  const m = new Map();
  for (const f of farmacos ?? []) {
    const id = Number(f.receta);
    if (!id) continue;
    const cur = m.get(id);
    if (cur) { cur.n += 1; continue; }
    m.set(id, { estado: (f.estado ?? '').trim(), fecha: f.fecha ?? '', n: 1 });
  }
  return m;
}

/**
 * Estado de una prescripción o receta cruzando la autoridad de Rayen con la
 * duración escrita.
 *  - suspendida en la ficha → 'suspendida' (Rayen).
 *  - la receta está entre los fármacos en uso → 'activa' (Rayen), con el estado
 *    textual de la receta («Por Despachar») como detalle.
 *  - si no, la duración escrita decide (respaldo).
 * @param {{texto:string, fecha8:string, receta?:number, suspendido?:boolean}} item
 * @param {Map<number, {estado:string}>} enUso   mapaFarmacosEnUso()
 * @returns {{estado:'activa'|'vencida'|'suspendida', fuente:'rayen'|'duracion', detalle:string}}
 */
export function estadoPrescripcion(item, enUso, { hoy = new Date() } = {}) {
  if (item.suspendido) return { estado: 'suspendida', fuente: 'rayen', detalle: '' };
  const u = item.receta ? enUso?.get(Number(item.receta)) : null;
  if (u) return { estado: 'activa', fuente: 'rayen', detalle: u.estado };
  return { estado: prescripcionEstado(item.texto, item.fecha8, { hoy }), fuente: 'duracion', detalle: '' };
}

/** Texto corto del estado para la pestaña: quién lo dice y qué dice. */
export function etiquetaEstado({ estado, fuente, detalle }) {
  if (estado === 'suspendida') return 'suspendida';
  if (fuente === 'rayen') return `en uso según Rayen${detalle ? ` · ${detalle}` : ''}`;
  return `${estado} por duración escrita`;
}

/** «Losartan 50 mg Comprimidos : 1 Comprimido cada 12 horas por 12 meses» → nombre y posología. */
function splitDescripcion(desc, articulo) {
  const txt = cleanText(desc);
  const i = txt.indexOf(' : ');
  const label = cleanText(articulo) || (i >= 0 ? txt.slice(0, i) : txt);
  const posologia = i >= 0 ? txt.slice(i + 3).trim() : (label && txt !== label ? txt.replace(label, '').replace(/^\s*:\s*/, '').trim() : '');
  return { label, posologia };
}

function mapPrescripcionDetalle(p) {
  const { label, posologia } = splitDescripcion(p.Descripcion, p.DescripcionArticulo);
  const total = Number(p.TotalRecetado) || 0;
  const despachado = Number(p.CantidadDespachada) || 0;
  const saldo = p.SaldoPendiente != null ? Number(p.SaldoPendiente) : Math.max(total - despachado, 0);
  return {
    id: p.Id ?? 0,
    label, posologia,
    observacion: cleanText(p.Observacion ?? ''),
    suspendida: Number(p.SuspenderTratamiento) !== 0 && p.SuspenderTratamiento !== false && p.SuspenderTratamiento != null,
    fechaSuspension: hasDate(p.FechaSuspendeTratamiento) ? fmtDate(p.FechaSuspendeTratamiento) : '',
    total, despachado, saldo,
    proximoDespacho: hasDate(p.FechaProximoDespacho) ? fmtDate(p.FechaProximoDespacho) : '',
    controlado: !!p.Controlado, psicotropico: !!p.Psicotropico,
  };
}

/**
 * Detalle de una receta a partir de la respuesta de `Farmacia/Receta/id=…`
 * (envuelta en `{Resultado:[…]}` o el objeto suelto).
 * @returns {null|{id, emitida, vigenteHasta, vencida:boolean, proximoDespacho, periodicidad, cerrada, externa, prescripciones:object[]}}
 */
export function parseRecetaDetalle(data, { hoy = new Date() } = {}) {
  const r = Array.isArray(data?.Resultado) ? data.Resultado[0] : Array.isArray(data) ? data[0] : data;
  if (!r || typeof r !== 'object' || !r.Id) return null;
  const hoy8 = localDateStr(hoy);
  const fin8 = hasDate(r.TerminoVigencia) ? String(r.TerminoVigencia).slice(0, 8) : '';
  return {
    id: r.Id,
    emitida: hasDate(r.FechaGeneracion) ? fmtDate(r.FechaGeneracion) : '',
    vigenteHasta: fin8 ? fmtDate(fin8) : '',
    vencida: !!fin8 && fin8 < hoy8,
    proximoDespacho: hasDate(r.FechaProximoDespacho) ? fmtDate(r.FechaProximoDespacho) : '',
    periodicidad: Number(r.Periodicidad) || 0,
    cerrada: hasDate(r.FechaHoraCierreReceta),
    externa: !!r.EsExterna,
    prescripciones: (Array.isArray(r.Prescripciones) ? r.Prescripciones : []).filter(p => !p.EsBorrado).map(mapPrescripcionDetalle),
  };
}
