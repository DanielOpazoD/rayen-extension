/**
 * Plantillas de informe: estructura declarativa que el modelo debe respetar
 * y que la interfaz puede editar. Una plantilla es datos, no código: se
 * guarda, se copia y se valida.
 *
 * { id, nombre, descripcion, secciones: [{ id, titulo, instruccion, opcional }],
 *   fechasReales, ventanaMeses, longitud: 'breve'|'media'|'extensa', personalizada }
 */
const S = (id, titulo, instruccion, opcional = false) => ({ id, titulo, instruccion, opcional });

export const PLANTILLAS = Object.freeze([
  {
    id: 'resumen-clinico', nombre: 'Resumen clínico', descripcion: 'Una página para retomar al paciente antes de la consulta.',
    ventanaMeses: 12, fechasReales: false, longitud: 'media',
    secciones: [
      S('problemas', 'Problemas activos', 'Lista ordenada por relevancia, con estado (controlado, descompensado, en estudio) cuando el registro lo permita.'),
      S('antecedentes', 'Antecedentes relevantes', 'Mórbidos, alergias y reacciones adversas que condicionen decisiones.'),
      S('evolucion', 'Evolución reciente', 'Qué ha pasado en las últimas atenciones, en orden cronológico, con lo que cambió.'),
      S('tratamiento', 'Tratamiento actual', 'Fármacos vigentes con dosis; señala recetas vencidas o suspendidas.'),
      S('examenes', 'Exámenes relevantes', 'Resultados fuera de rango o con tendencia, y exámenes solicitados sin resultado.', true),
      S('pendientes', 'Pendientes', 'Interconsultas abiertas, controles sugeridos, exámenes por reclamar, decisiones postergadas.'),
    ],
  },
  {
    id: 'epicrisis-ambulatoria', nombre: 'Epicrisis ambulatoria', descripcion: 'Cierre de un período de atención para otro equipo o nivel.',
    ventanaMeses: 24, fechasReales: true, longitud: 'extensa',
    secciones: [
      S('motivo', 'Motivo de atención', 'Por qué se atendió al paciente en este período.'),
      S('antecedentes', 'Antecedentes', 'Mórbidos, quirúrgicos, alergias, hábitos si constan.'),
      S('evolucion', 'Evolución y conducta', 'Cronología de decisiones clínicas con sus fechas.'),
      S('diagnosticos', 'Diagnósticos al cierre', 'Con código CIE-10 cuando conste.'),
      S('tratamiento', 'Tratamiento al alta', 'Fármacos, dosis, duración.'),
      S('plan', 'Plan y controles', 'Qué sigue, quién lo hace y cuándo.'),
    ],
  },
  {
    id: 'informe-interconsulta', nombre: 'Informe para interconsulta', descripcion: 'Lo que el especialista necesita, con la pregunta clara.',
    ventanaMeses: 12, fechasReales: true, longitud: 'media',
    secciones: [
      S('pregunta', 'Pregunta al especialista', 'Una o dos frases: qué se le pide resolver.'),
      S('resumen', 'Resumen del problema', 'Inicio, evolución y estado actual del problema que motiva la derivación.'),
      S('antecedentes', 'Antecedentes y tratamiento', 'Lo pertinente al problema.'),
      S('examenes', 'Exámenes realizados', 'Con fechas y valores; lo pendiente, aparte.'),
      S('estudios', 'Estudios pendientes o sugeridos', 'Si el registro lo permite inferir.', true),
    ],
  },
  {
    id: 'informe-examenes', nombre: 'Informe de exámenes', descripcion: 'Lectura ordenada de laboratorio, imágenes y biopsias.',
    ventanaMeses: 24, fechasReales: true, longitud: 'media',
    secciones: [
      S('hallazgos', 'Hallazgos fuera de rango', 'Por sistema, con valor, referencia y fecha.'),
      S('tendencias', 'Tendencias', 'Parámetros con más de un valor: dirección y magnitud del cambio.'),
      S('imagenes', 'Imágenes y biopsias', 'Conclusiones textuales de los informes.', true),
      S('pendientes', 'Exámenes pendientes', 'Solicitados sin resultado o vencidos según programa.'),
      S('sugerencias', 'Sugerencias de control', 'Qué repetir y cuándo, según el registro; sin inventar guías.', true),
    ],
  },
]);

export const getPlantilla = id => PLANTILLAS.find(p => p.id === id) ?? null;

/** Valida una plantilla (predeterminada o personalizada). Devuelve la lista de errores; vacía si es válida. */
export function validarPlantilla(p) {
  const e = [];
  if (!p || typeof p !== 'object') return ['La plantilla no es un objeto'];
  if (!/^[a-z0-9-]{3,40}$/.test(p.id ?? '')) e.push('id: sólo minúsculas, números y guiones (3 a 40)');
  if (!(p.nombre ?? '').trim()) e.push('nombre vacío');
  if (!Array.isArray(p.secciones) || !p.secciones.length) e.push('sin secciones');
  else {
    const ids = new Set();
    p.secciones.forEach((s, i) => {
      if (!/^[a-z0-9-]{2,40}$/.test(s.id ?? '')) e.push(`sección ${i + 1}: id inválido`);
      if (ids.has(s.id)) e.push(`sección ${i + 1}: id repetido (${s.id})`); ids.add(s.id);
      if (!(s.titulo ?? '').trim()) e.push(`sección ${i + 1}: título vacío`);
      if (!(s.instruccion ?? '').trim()) e.push(`sección ${i + 1}: instrucción vacía`);
    });
  }
  if (p.ventanaMeses != null && !(Number.isInteger(p.ventanaMeses) && p.ventanaMeses > 0 && p.ventanaMeses <= 240)) e.push('ventanaMeses: entero entre 1 y 240, o null');
  if (p.longitud && !['breve', 'media', 'extensa'].includes(p.longitud)) e.push('longitud: breve, media o extensa');
  return e;
}

/** Crea una plantilla personalizada a partir de otra, con un id propio. */
export function crearPlantilla(base, { id, nombre, descripcion = '', secciones, ventanaMeses, fechasReales, longitud } = {}) {
  const p = { ...(base ?? {}), id, nombre, descripcion, secciones: secciones ?? base?.secciones ?? [], personalizada: true };
  if (ventanaMeses !== undefined) p.ventanaMeses = ventanaMeses;
  if (fechasReales !== undefined) p.fechasReales = fechasReales;
  if (longitud !== undefined) p.longitud = longitud;
  const errores = validarPlantilla(p);
  if (errores.length) throw new Error(`Plantilla inválida: ${errores.join('; ')}`);
  return p;
}

const LONGITUD = { breve: 'Máximo 150 palabras en total.', media: 'Entre 250 y 500 palabras en total.', extensa: 'Hasta 900 palabras; lo necesario, no más.' };

/**
 * Prompt para el modelo: instrucciones fijas (sistema) y contexto + estructura (usuario).
 * Los títulos de sección van exactos para poder reconocer la respuesta después.
 */
export function buildPrompt(plantilla, contexto, { idioma = 'es' } = {}) {
  const system = [
    'Eres un asistente clínico para un médico de atención primaria en Chile. Escribes informes a partir de un registro clínico que se te entrega como texto.',
    'Reglas: usa sólo lo que está en el registro; no inventes fechas, valores ni diagnósticos. Si una sección no tiene datos, escribe exactamente «Sin datos en el registro». Señala incertidumbre cuando el registro sea ambiguo. No hagas recomendaciones fuera de lo que el registro permite inferir.',
    'El paciente no tiene nombre en el registro: llámalo «el paciente». Los profesionales aparecen como «médico tratante» u «otro profesional».',
    `Responde en ${idioma === 'es' ? 'español de Chile, registro clínico formal' : idioma}, en Markdown, con un encabezado de nivel 2 por sección y exactamente los títulos que se te indican, en ese orden, sin secciones adicionales ni preámbulo.`,
  ].join('\n');
  const estructura = plantilla.secciones.map((s, i) => `${i + 1}. ## ${s.titulo}${s.opcional ? ' (opcional: omite la sección si no hay nada)' : ''}\n   ${s.instruccion}`).join('\n');
  const user = `${contexto}\n\n---\n\n# Tarea: ${plantilla.nombre}\n${plantilla.descripcion}\n${LONGITUD[plantilla.longitud] ?? LONGITUD.media}\n\nEstructura obligatoria:\n${estructura}`;
  return { system, user };
}
