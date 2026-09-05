/**
 * Proveedores de generación. Uno solo está activo por defecto: el manual, que
 * no envía nada a ningún sitio. El de API queda preparado y apagado.
 *
 * Contrato: { id, etiqueta, requiereRed, async generar({ system, user, signal }) → { texto } | { prompt } }
 *
 * Por qué HTTP directo y no el SDK oficial: esta extensión es JavaScript sin
 * empaquetador (módulos ES servidos tal cual, CSP de MV3); el SDK de npm no se
 * puede importar sin un bundler. La forma de la petición es la de la Messages
 * API (POST /v1/messages) y se mantiene en un solo lugar, aquí.
 */

export function createManualProvider() {
  return {
    id: 'manual', etiqueta: 'Manual: copiar el prompt y pegar la respuesta', requiereRed: false,
    async generar({ system, user }) {
      return { prompt: `${system}\n\n=====\n\n${user}` };
    },
  };
}

const API_DEFAULTS = Object.freeze({ endpoint: 'https://api.anthropic.com/v1/messages', model: 'claude-opus-5', maxTokens: 16000, effort: 'high', version: '2023-06-01' });

/**
 * Proveedor por API de Anthropic. Sólo se activa con clave; la clave nunca se
 * registra ni se incluye en errores. Requiere además permiso de host en el
 * manifiesto y una decisión institucional sobre el envío de texto clínico
 * desidentificado fuera del hospital: por eso no viene activado.
 */
export function createApiProvider({ apiKey = '', endpoint = API_DEFAULTS.endpoint, model = API_DEFAULTS.model, maxTokens = API_DEFAULTS.maxTokens, effort = API_DEFAULTS.effort, fetchImpl = globalThis.fetch } = {}) {
  const activo = Boolean(apiKey);
  return {
    id: 'api', etiqueta: `API de Anthropic (${model})`, requiereRed: true, activo,
    async generar({ system, user, signal }) {
      if (!activo) throw new Error('El proveedor por API no está configurado (sin clave).');
      const res = await fetchImpl(endpoint, {
        method: 'POST', signal,
        headers: { 'content-type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': API_DEFAULTS.version, 'anthropic-dangerous-direct-browser-access': 'true' },
        body: JSON.stringify({ model, max_tokens: maxTokens, system, messages: [{ role: 'user', content: user }], thinking: { type: 'adaptive' }, output_config: { effort } }),
      });
      if (!res.ok) throw new Error(`API ${res.status}${res.status === 401 ? ': clave rechazada' : res.status === 429 ? ': límite de uso, reintenta en un momento' : ''}`);
      const data = await res.json();
      if (data.stop_reason === 'refusal') throw new Error(`El modelo declinó la solicitud${data.stop_details?.category ? ` (${data.stop_details.category})` : ''}.`);
      const texto = (data.content ?? []).filter(b => b.type === 'text').map(b => b.text).join('\n').trim();
      if (!texto) throw new Error('La respuesta no trae texto.');
      return { texto, truncado: data.stop_reason === 'max_tokens', modelo: data.model ?? model };
    },
  };
}

/**
 * Reconoce la respuesta del modelo por los títulos de la plantilla: qué
 * secciones vinieron, cuáles faltan y qué texto sobró. Tolera «##»/«###»,
 * numeración y diferencias de mayúsculas y acentos.
 */
const norm = s => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
// Un título puede venir como «## 1) Problemas Activos (por relevancia)», «**Pendientes:**» o «Pendientes:».
// Devuelve { titulo, cuerpo, laxa }: `laxa` marca las formas sin «#» (negrita, «Título:»),
// que sólo se aceptan si el título coincide exacto con uno de la plantilla.
const limpiar = t => t.replace(/\*\*/g, '').replace(/\s*\([^)]*\)\s*$/, '').replace(/:\s*$/, '').trim();
const cabecera = linea => {
  const md = /^\s{0,3}#{1,4}\s*(?:\d+[.)]\s*)?(.+?)\s*#*\s*$/.exec(linea);
  if (md) return { titulo: limpiar(md[1]), cuerpo: '', laxa: false };
  const negrita = /^\s*(?:\d+[.)]\s*)?\*\*(.+?)\*\*\s*:?\s*(.*)$/.exec(linea);
  if (negrita) return { titulo: limpiar(negrita[1]), cuerpo: negrita[2].trim(), laxa: true };
  const dosPuntos = /^\s*(?:\d+[.)]\s*)?([A-ZÁÉÍÓÚÑ][^:]{2,60}):\s*(.*)$/.exec(linea);
  if (dosPuntos) return { titulo: limpiar(dosPuntos[1]), cuerpo: dosPuntos[2].trim(), laxa: true };
  return null;
};
export function parsearRespuesta(texto, plantilla) {
  const lineas = (texto ?? '').split(/\r?\n/);
  const titulos = plantilla.secciones.map(s => ({ s, n: norm(s.titulo) }));
  const secciones = {}; const extra = []; const repetidas = [];
  let actual = null;
  for (const linea of lineas) {
    const h = cabecera(linea);
    const hn = h ? norm(h.titulo) : '';
    const t = h ? (titulos.find(x => x.n === hn) ?? (h.laxa ? null : titulos.find(x => hn.startsWith(x.n) || x.n.startsWith(hn)))) : null;
    if (t) {
      if (secciones[t.s.id]) { repetidas.push(t.s.id); secciones[t.s.id] += '\n'; }
      actual = t.s.id; secciones[actual] = (secciones[actual] ?? '') + (h.cuerpo ? h.cuerpo : ''); continue;
    }
    if (h && !h.laxa) { actual = null; extra.push(linea); continue; } // un «#» que no es de la plantilla cierra la sección
    if (actual) secciones[actual] += (secciones[actual] ? '\n' : '') + linea;
    else if (linea.trim()) extra.push(linea);
  }
  for (const k of Object.keys(secciones)) secciones[k] = secciones[k].trim();
  const faltantes = plantilla.secciones.filter(s => !s.opcional && !secciones[s.id]).map(s => s.id);
  const sinDatos = Object.entries(secciones).filter(([, v]) => /^sin datos en el registro\.?$/i.test(v)).map(([k]) => k);
  return { secciones, faltantes, sinDatos, repetidas: [...new Set(repetidas)], extra: extra.join('\n').trim() };
}
