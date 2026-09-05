/**
 * Flujo completo, en un solo lugar y sin interfaz:
 *   registro → contexto desidentificado → prompt → proveedor → respuesta reconocida → informe.
 * La interfaz llama a `prepararInforme` (todo lo local) y, según el proveedor,
 * copia el prompt o llama a `generarInforme`.
 */
import { buildClinicalRecord } from './record.js';
import { buildContext } from './context.js';
import { buildPrompt, getPlantilla, validarPlantilla } from './templates.js';
import { parsearRespuesta } from './provider.js';
import { armarInforme } from './report.js';

// La fachada expone sólo lo que la interfaz consume; cada pieza se prueba e
// importa desde su propio módulo (knip señala las reexportaciones sin uso).
export { PLANTILLAS } from './templates.js';
export { markdownAHtml } from './report.js';

/**
 * Todo lo que ocurre en la máquina: registro, contexto y prompt. Falla si el
 * contexto no quedó verificado (un nombre sobrevivió) o la plantilla es inválida.
 */
export function prepararInforme({ plantilla, datos, opciones = {} }) {
  const p = typeof plantilla === 'string' ? getPlantilla(plantilla) : plantilla;
  if (!p) throw new Error('Plantilla desconocida');
  const errores = validarPlantilla(p);
  if (errores.length) throw new Error(`Plantilla inválida: ${errores.join('; ')}`);
  const registro = buildClinicalRecord(datos);
  const contexto = buildContext(registro, { ventanaMeses: p.ventanaMeses ?? 12, fechasReales: !!p.fechasReales, ...opciones });
  if (!contexto.verificado) throw new Error(`El contexto no quedó desidentificado (${contexto.restos.join(', ')}). No se continúa.`);
  const prompt = buildPrompt(p, contexto.texto);
  return { plantilla: p, registro, contexto, prompt };
}

/** Con la respuesta del modelo (pegada o recibida), el informe listo para revisar. */
export function cerrarInforme({ plantilla, respuestaTexto, registro, contexto, proveedor = 'manual', revisadoPor = '' }) {
  const respuesta = parsearRespuesta(respuestaTexto, plantilla);
  const markdown = armarInforme({ plantilla, respuesta, paciente: registro.paciente, contexto, proveedor, revisadoPor });
  return { respuesta, markdown };
}
