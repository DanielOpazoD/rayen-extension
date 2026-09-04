/**
 * Informe final: la respuesta del modelo (ya reconocida por secciones) más la
 * identidad del paciente, que nunca salió de la máquina, y un pie que dice
 * cómo se generó. Produce Markdown y un HTML mínimo para imprimir.
 */
import { esc } from '../core/text.js';

export function armarInforme({ plantilla, respuesta, paciente, generado = new Date(), proveedor = 'manual', contexto = null, revisadoPor = '' }) {
  const fecha = generado instanceof Date ? generado.toLocaleDateString('es-CL') : String(generado);
  const cab = [`# ${plantilla.nombre}`, '', `**Paciente:** ${paciente.nombre || '—'}${paciente.run ? ` · RUN ${paciente.run}` : ''}${paciente.edad != null ? ` · ${paciente.edad} años` : ''}${paciente.sexo ? ` · ${paciente.sexo}` : ''}`, `**Fecha:** ${fecha}`, ''];
  const cuerpo = plantilla.secciones.map(s => {
    const t = respuesta.secciones[s.id];
    if (!t && s.opcional) return null;
    return `## ${s.titulo}\n\n${t || '_Sección no generada._'}`;
  }).filter(Boolean);
  const pie = [
    '---',
    `_Borrador generado con un modelo de lenguaje (${proveedor}) a partir del registro desidentificado${contexto ? `: ${contexto.incluido.atenciones} atenciones, ${contexto.incluido.problemas} problemas, ${contexto.incluido.interconsultas} interconsultas${contexto.omitido.length ? `; omitido: ${contexto.omitido.join(', ')}` : ''}` : ''}. No sustituye el juicio clínico; debe revisarse antes de usarse._`,
    `_Revisado por: ${revisadoPor || '____________________'}_`,
  ];
  if (respuesta.faltantes.length) pie.unshift(`_Secciones que el modelo no entregó: ${respuesta.faltantes.map(id => plantilla.secciones.find(s => s.id === id)?.titulo ?? id).join(', ')}._`);
  return [...cab, ...cuerpo, '', ...pie].join('\n');
}

/** Markdown mínimo → HTML: encabezados, listas, negrita, cursiva, párrafos y regla. Suficiente para imprimir. */
export function markdownAHtml(md) {
  const inline = s => esc(s).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/(^|[^*])_(.+?)_(?!\w)/g, '$1<em>$2</em>').replace(/\*(.+?)\*/g, '<em>$1</em>');
  const out = []; let lista = null;
  const cerrar = () => { if (lista) { out.push(`</${lista}>`); lista = null; } };
  for (const raw of md.split(/\r?\n/)) {
    const l = raw.trimEnd();
    let m;
    if ((m = /^(#{1,4})\s+(.*)$/.exec(l))) { cerrar(); out.push(`<h${m[1].length}>${inline(m[2])}</h${m[1].length}>`); }
    else if (/^---+$/.test(l)) { cerrar(); out.push('<hr>'); }
    else if ((m = /^\s*[-*]\s+(.*)$/.exec(l))) { if (lista !== 'ul') { cerrar(); lista = 'ul'; out.push('<ul>'); } out.push(`<li>${inline(m[1])}</li>`); }
    else if ((m = /^\s*\d+[.)]\s+(.*)$/.exec(l))) { if (lista !== 'ol') { cerrar(); lista = 'ol'; out.push('<ol>'); } out.push(`<li>${inline(m[1])}</li>`); }
    else if (!l.trim()) cerrar();
    else { cerrar(); out.push(`<p>${inline(l)}</p>`); }
  }
  cerrar();
  return out.join('\n');
}
