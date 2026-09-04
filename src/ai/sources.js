/**
 * Registro de fuentes de exámenes complementarios para el registro clínico.
 * Cada fuente es un adaptador de io con la misma firma; la interfaz las
 * enumera y el registro las consume sin saber de dónde vienen. Las que aún no
 * existen (imagenología, biopsias) se declaran con su motivo para que la
 * pantalla lo diga en vez de mostrar un hueco.
 *
 * Contrato: { id, etiqueta, tipo: 'laboratorio'|'imagenologia'|'biopsias',
 *             disponible: boolean, motivo?: string,
 *             async obtener({ run, idUsp, desde, hasta, signal }) → ítems normalizados (ver record.js) }
 */
const registry = new Map();

export function registerSource(source) {
  for (const k of ['id', 'etiqueta', 'tipo']) if (!source?.[k]) throw new Error(`Fuente sin ${k}`);
  if (!['laboratorio', 'imagenologia', 'biopsias'].includes(source.tipo)) throw new Error(`Tipo de fuente desconocido: ${source.tipo}`);
  registry.set(source.id, { disponible: typeof source.obtener === 'function', ...source });
  return source;
}
export const listSources = () => [...registry.values()];
export function resetSources() { registry.clear(); }

// Declaradas desde el principio para que el hub de «Exámenes complementarios» las muestre honestas.
registerSource({ id: 'imagenologia-mmard', etiqueta: 'Imagenología (MMARD)', tipo: 'imagenologia', motivo: 'Pendiente: falta el acceso al visor MMARD.' });
registerSource({ id: 'biopsias', etiqueta: 'Biopsias (anatomía patológica)', tipo: 'biopsias', motivo: 'Pendiente: sin fuente de informes de biopsia todavía.' });

/**
 * Obtiene los ítems de todas las fuentes disponibles de un tipo, tolerando
 * fallos por fuente (se informan, no se ocultan).
 */
export async function fetchAll(tipo, params) {
  const out = { items: [], fallos: [] };
  for (const s of listSources().filter(s => s.tipo === tipo && s.disponible)) {
    try { out.items.push(...(await s.obtener(params)).map(x => ({ ...x, fuente: x.fuente ?? s.id }))); }
    catch (e) { out.fallos.push({ fuente: s.id, error: e.message }); }
  }
  return out;
}
