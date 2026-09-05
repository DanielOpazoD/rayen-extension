/**
 * Contexto para un modelo de lenguaje a partir del registro clínico canónico.
 *
 * Reglas fijas, no configurables por plantilla:
 *  - Sin identidad: ni nombre, ni RUN, ni prestadores con nombre. El modelo
 *    recibe «el paciente», «médico tratante» y «otro profesional». La identidad
 *    se vuelve a poner en la interfaz, en la máquina de quien usa la extensión.
 *  - Fechas relativas a hoy («hace 3 meses», «hace 12 días») salvo que la
 *    plantilla pida fechas reales; una fecha exacta es un cuasi-identificador.
 *  - Texto libre pasado por el anonimizador y comprobado: si queda un nombre,
 *    `verificado` es false y la interfaz no deja continuar.
 *  - Presupuesto: las atenciones más antiguas se recortan primero y se dice
 *    cuántas quedaron fuera.
 */
import { minusMonths8 } from '../core/dates.js';
import { anonimizar } from '../core/anonimizar.js';

const MESES = 30.44;
export function fechaRelativa(ddmmyyyy, hoy = new Date()) {
  const m = /^(\d{2})-(\d{2})-(\d{4})$/.exec(ddmmyyyy ?? '');
  if (!m) return ddmmyyyy || 'sin fecha';
  const d = new Date(Date.UTC(+m[3], +m[2] - 1, +m[1]));
  const dias = Math.round((Date.UTC(hoy.getFullYear(), hoy.getMonth(), hoy.getDate()) - d.getTime()) / 864e5);
  const n = (k, s, p) => `${k} ${k === 1 ? s : p}`;
  if (dias < 0) return dias > -31 ? `en ${n(-dias, 'día', 'días')}` : `en ${n(Math.round(-dias / MESES), 'mes', 'meses')}`;
  if (dias === 0) return 'hoy';
  if (dias < 31) return `hace ${dias} ${dias === 1 ? 'día' : 'días'}`;
  if (dias < 365) return `hace ${n(Math.round(dias / MESES), 'mes', 'meses')}`;
  const a = Math.floor(dias / 365.25);
  return `hace ${a} ${a === 1 ? 'año' : 'años'}`;
}

const dentro = (fecha8, desde8) => !desde8 || !fecha8 || fecha8 >= desde8;
const desde8DeMeses = (meses, hoy) => (meses ? minusMonths8(meses, hoy) : null);
const lista = (arr, f = x => x) => arr.length ? arr.map(x => `- ${f(x)}`).join('\n') : '- Sin datos';
const quien = p => p.esMio ? 'médico tratante' : `otro profesional${p.instrumento ? ` (${p.instrumento})` : ''}`;

function seccionAtencion(a, fecha) {
  const l = [`### ${fecha(a.fecha)} · ${a.tipo || 'Atención'}${a.esUrgencia ? ' · urgencia' : ''}${a.fechaRegistro ? ` · registrada ${fecha(a.fechaRegistro)}` : ''} · ${a.prestadores.length ? [...new Set(a.prestadores.map(quien))].join(', ') : 'sin prestador registrado'}`];
  if (a.diagnosticos.length) l.push(`Diagnósticos: ${a.diagnosticos.map(d => `${d.nombre}${d.codigo ? ` (${d.codigo})` : ''}${d.esAuge ? ' [GES]' : ''}`).join('; ')}`);
  if (a.motivo) l.push(`Motivo: ${a.motivo}`);
  if (a.historia) l.push(`Historia/evolución: ${a.historia}`);
  for (const t of a.textos) l.push(`${t.titulo}: ${t.texto}`);
  if (a.examenFisico.length) l.push(`Examen físico: ${a.examenFisico.map(x => x.texto).join('; ')}`);
  if (a.prescripciones.length) l.push(`Prescripciones: ${a.prescripciones.map(p => `${p.texto}${p.estado === 'activa' ? '' : ` [${p.estado}]`}`).join('; ')}`);
  if (a.indicaciones.length) l.push(`Indicaciones: ${a.indicaciones.map(x => x.texto).join('; ')}`);
  if (a.examenes.length) l.push(`Exámenes solicitados: ${a.examenes.map(x => x.texto).join('; ')}`);
  if (a.derivaciones.length) l.push(`Derivaciones: ${a.derivaciones.map(x => x.texto).join('; ')}`);
  if (a.proximoControl.length) l.push(`Próximo control: ${a.proximoControl.map(c => fecha(c.fecha)).join(', ')}`);
  return l.join('\n');
}

/**
 * @param {object} rec — buildClinicalRecord()
 * @param {object} [o]
 * @param {number|null} [o.ventanaMeses=12] — atenciones y exámenes dentro de la ventana; null = todo
 * @param {boolean} [o.fechasReales=false]
 * @param {number} [o.maxChars=60000] — presupuesto aproximado (≈ 4 caracteres por token)
 * @param {string[]} [o.secciones] — subconjunto de: problemas, antecedentes, atenciones, interconsultas, laboratorio, imagenologia, biopsias, notas
 * @param {Date} [o.hoy]
 */
export function buildContext(rec, o = {}) {
  const hoy = o.hoy ?? new Date();
  const ventana = o.ventanaMeses === undefined ? 12 : o.ventanaMeses;
  const desde8 = desde8DeMeses(ventana, hoy);
  const fecha = o.fechasReales ? (f => f || 'sin fecha') : (f => fechaRelativa(f, hoy));
  const quiere = id => !o.secciones || o.secciones.includes(id);
  const maxChars = o.maxChars ?? 60000;
  const omitido = [];

  const partes = [];
  partes.push(`# Registro clínico del paciente\n\nPaciente: ${rec.paciente.sexo || 'sexo no registrado'}, ${rec.paciente.edad != null ? `${rec.paciente.edad} años` : 'edad no registrada'}${rec.paciente.prevision ? `, previsión ${rec.paciente.prevision}` : ''}.\nFuentes: ${rec.fuentes.filter(f => f.estado !== 'ausente').map(f => `${f.id} (${f.estado}${f.n ? `, ${f.n}` : ''})`).join('; ') || 'ninguna'}.`);

  if (quiere('problemas')) partes.push(`## Problemas activos (por peso)\n${lista(rec.problemas, p => `${p.nombre}${p.codigo ? ` (${p.codigo})` : ''}${p.esAuge ? ' [GES]' : ''}${p.cronico ? ' · crónico' : p.recurrente ? ' · recurrente' : ''} · ${p.n} ${p.n === 1 ? 'registro' : 'registros'} · última ${fecha(p.ultima)}`)}`);

  if (quiere('antecedentes')) {
    const a = rec.antecedentes;
    const fichaEstado = rec.fuentes.find(f => f.id === 'eloisa-ficha')?.estado;
    // Con la ficha caída, «Alergias: sin datos» invitaría a escribir «sin alergias conocidas».
    if (fichaEstado === 'fallida' || fichaEstado === 'ausente') partes.push('## Antecedentes\nFicha clínica no disponible: antecedentes, alergias, fármacos y programas no se pudieron consultar. No asumas que no existen.');
    else partes.push(`## Antecedentes\nMórbidos: ${a.morbidos.join('; ') || 'sin datos'}\nAlergias: ${a.alergias.join('; ') || 'sin datos'}\nReacciones adversas a medicamentos: ${a.ram.join('; ') || 'sin datos'}\nFármacos en uso (según recetas): ${a.farmacos.map(f => `${f.texto}${f.estado ? ` [${f.estado}]` : ''}`).join('; ') || 'sin datos'}\nProgramas: ${a.programas.map(p => `${p.nombre}${p.estado ? ` (${p.estado})` : ''}`).join('; ') || 'sin datos'}\nRiesgo: ${a.riesgo.join('; ') || 'sin datos'}\nVigencias: ${a.vigencia.map(v => `${v.mensaje}${v.ok ? '' : ' [no vigente]'}`).join('; ') || 'sin datos'}`);
  }

  if (quiere('atenciones')) {
    const todas = rec.atenciones.filter(a => dentro(a.fecha8, desde8));
    if (rec.atenciones.length > todas.length) omitido.push(`${rec.atenciones.length - todas.length} atenciones fuera de la ventana de ${ventana} meses`);
    partes.push(`## Atenciones (más reciente primero)\n${todas.length ? todas.map(a => seccionAtencion(a, fecha)).join('\n\n') : 'Sin atenciones en la ventana.'}`);
  }

  if (quiere('interconsultas')) partes.push(`## Interconsultas\n${lista(rec.interconsultas, s => `${fecha(s.fecha)} · ${s.especialidad} · ${s.estado}${s.abierta ? ' (abierta)' : ''}${s.esMia ? ' · emitida por el médico tratante' : ''}${s.diagnostico ? ` · ${s.diagnostico}` : ''}${s.motivo ? ` · motivo: ${s.motivo}` : ''}`)}`);

  if (quiere('laboratorio')) {
    const lab = rec.laboratorio.filter(x => dentro(x.fecha8, desde8));
    partes.push(`## Laboratorio\n${lista(lab, x => `${fecha(x.fecha)} · ${x.examen ? `${x.examen} · ` : ''}${x.analito}: ${x.valor}${x.unidad ? ` ${x.unidad}` : ''}${x.referencia ? ` (ref ${x.referencia})` : ''}${x.flag ? ` [${x.flag}]` : ''}`)}`);
  }
  if (quiere('imagenologia')) partes.push(`## Imagenología\n${lista(rec.imagenologia, x => `${fecha(x.fecha)} · ${x.estudio}: ${x.conclusion || x.informe || 'sin informe'}`)}`);
  if (quiere('biopsias')) partes.push(`## Biopsias\n${lista(rec.biopsias, x => `${fecha(x.fecha)} · ${x.muestra}: ${x.diagnostico || x.informe || 'sin informe'}`)}`);
  // La fecha de la nota es un instante ISO en UTC: se lleva a la fecha local antes de relativizarla.
  const fechaNotaLocal = iso => { const d = new Date(iso); return Number.isNaN(d.getTime()) ? '' : `${String(d.getDate()).padStart(2, '0')}-${String(d.getMonth() + 1).padStart(2, '0')}-${d.getFullYear()}`; };
  if (quiere('notas')) partes.push(`## Notas del médico tratante\n${lista(rec.notas, n => `${n.fecha ? fecha(fechaNotaLocal(n.fecha)) : 'sin fecha'}: ${n.texto}`)}`);

  // Presupuesto: recortar atenciones antiguas antes que nada más.
  let texto = partes.join('\n\n');
  if (texto.length > maxChars && quiere('atenciones')) {
    const i = partes.findIndex(p => p.startsWith('## Atenciones'));
    const bloques = partes[i].split('\n\n');
    let quitadas = 0;
    while (partes.join('\n\n').length > maxChars && bloques.length > 2) { bloques.pop(); quitadas++; partes[i] = bloques.join('\n\n'); }
    if (quitadas) { omitido.push(`${quitadas} atenciones antiguas por el presupuesto de ${maxChars} caracteres`); partes[i] += `\n\n(${quitadas} atenciones más antiguas omitidas)`; }
    texto = partes.join('\n\n');
  }

  // Desidentificación del texto libre: los nombres de paciente y profesionales
  // se buscan en el propio registro (paciente, prestadores) y se borran del contexto.
  const semilla = { NombreCompleto: rec.paciente.nombre, Rut: rec.paciente.run, Prestadores: rec.atenciones.flatMap(a => a.prestadores.map(p => ({ NombreCompleto: p.nombre }))), Texto: texto };
  const anon = anonimizar(semilla, { desplazamientoDias: 0 });
  const contexto = anon.data.Texto;
  return {
    texto: contexto,
    verificado: anon.verificado,
    restos: anon.restos,
    chars: contexto.length,
    tokensAprox: Math.ceil(contexto.length / 4),
    omitido,
    incluido: { atenciones: (texto.match(/^### /gm) ?? []).length, problemas: rec.problemas.length, interconsultas: rec.interconsultas.length, laboratorio: rec.laboratorio.length, imagenologia: rec.imagenologia.length, biopsias: rec.biopsias.length },
  };
}
