import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CONFIG } from '../src/core/config.js';
import { buildClinicalRecord } from '../src/ai/record.js';
import { buildContext, fechaRelativa } from '../src/ai/context.js';
import { PLANTILLAS, getPlantilla, validarPlantilla, crearPlantilla, buildPrompt } from '../src/ai/templates.js';
import { createManualProvider, createApiProvider, parsearRespuesta } from '../src/ai/provider.js';
import { armarInforme, markdownAHtml } from '../src/ai/report.js';
import { registerSource, listSources, fetchAll, resetSources } from '../src/ai/sources.js';
import { prepararInforme, cerrarInforme } from '../src/ai/index.js';

const HOY = new Date(2026, 8, 4); // 04-09-2026
const YO = CONFIG.officerId;
const visita = (fecha, fecha8, extra = {}) => ({
  id: Number(fecha8), origen: 'ficha', fechaAtencion: fecha, fecha8, hora: '09:00', tipoAtencion: 'Control Crónico', estado: 'Completado',
  prestadores: [{ id: YO, nombre: 'Daniel Opazo Damiani', instrumento: 'Médico' }],
  diagnosticos: [{ nombre: 'Diabetes mellitus tipo 2', codigo: 'E11', esAuge: true }],
  anamnesis: { motivo: 'Control', historia: 'Paciente Rosa Tuki refiere buena adherencia; su hija Carolina la acompaña.' },
  extras: [{ label: 'Evolución', text: 'Sin hipoglicemias. PA 130/80.' }],
  sections: { prescripciones: [{ label: 'Metformina 850 mg', details: ['1 comprimido cada 12 horas por 6 meses'] }], proximoControl: [{ label: 'Control', fecha: '04-12-2026', fecha8: '20261204' }] },
  actividades: [], adjuntos: [], ...extra,
});
const datos = () => ({
  officerId: YO, generado: '2026-09-04T12:00:00.000Z',
  record: { nombre: 'Rosa Ejemplo Tuki', run: '6.543.210-2', edad: 79, sexo: 'Mujer', prevision: 'Fonasa B', notas: [{ at: '2026-08-20T10:00:00.000Z', text: 'Vive sola; coordinar con hija.' }] },
  ficha: { visits: [visita('26-08-2026', '20260826'), visita('11-02-2026', '20260211'), visita('02-01-2025', '20250102', { esUrgencia: true, prestadores: [{ id: 1, nombre: 'Juana Luna Atamu', instrumento: 'Médico' }] })],
    antecedentes: { farmacos: [{ label: 'Metformina 850 mg', posologia: '1 cada 12 h', estado: 'Pendiente', fecha: '26-08-2026' }], morbidos: [{ label: 'HTA' }], alergias: [] },
    programas: [{ nombre: 'PSCV', estado: 'Ingresado' }], vigencia: [{ ok: false, mensaje: 'EMP no vigente' }], riesgo: [{ label: 'Estrato G2' }], ram: [], errors: [], master: { idUsp: 77 } },
  sics: [{ id: 5, fecha: '10-06-2026', fecha8: '20260610', especialidad: 'Reumatología', estado: 'Enviada', grupo: 'enviada', prioridad: 'P2', antiguedadDias: 86, motivo: 'Artralgias', diagnostico: 'Artritis', registrador: { id: YO }, origen: 'HHR', destino: 'HSR' }],
  laboratorio: [{ fecha: '20-08-2026', fecha8: '20260820', examen: 'Perfil bioquímico', analito: 'Glicemia', valor: '142', unidad: 'mg/dL', referencia: '70-100', flag: 'alto' }],
});

test('buildClinicalRecord reúne agenda, ficha, SIC y laboratorio con procedencia y sin HTML', () => {
  const r = buildClinicalRecord(datos());
  assert.equal(r.version, 1); assert.equal(r.paciente.nombre, 'Rosa Ejemplo Tuki'); assert.equal(r.paciente.idUsp, 77);
  assert.equal(r.paciente.run, '6.543.210-2', 'RUN con formato aunque venga formateado');
  assert.equal(buildClinicalRecord({ ...datos(), record: { ...datos().record, run: '65432102' } }).paciente.run, '6.543.210-2', 'RUN con formato aunque venga en bruto');
  assert.equal(r.atenciones.length, 3); assert.equal(r.atenciones[0].fecha, '26-08-2026', 'más reciente primero');
  assert.equal(r.atenciones[0].esMia, true); assert.equal(r.atenciones[2].esMia, false); assert.equal(r.atenciones[2].esUrgencia, true);
  assert.equal(r.atenciones[0].textos[0].titulo, 'Evolución');
  assert.equal(r.atenciones[0].prescripciones[0].estado, 'activa'); assert.equal(r.atenciones[1].prescripciones[0].estado, 'vencida');
  assert.equal(r.problemas[0].nombre, 'Diabetes mellitus tipo 2'); assert.equal(r.problemas[0].n, 3);
  assert.equal(r.interconsultas[0].abierta, true); assert.equal(r.interconsultas[0].esMia, true);
  assert.equal(r.laboratorio[0].fuente, 'laboratorio');
  assert.deepEqual(r.fuentes.map(f => `${f.id}:${f.estado}`), ['eloisa-agenda:completa', 'eloisa-ficha:completa', 'eloisa-sic:completa', 'laboratorio:completa', 'imagenologia:ausente', 'biopsias:ausente']);
  assert.ok(!JSON.stringify(r).includes('<'), 'nada de HTML en el registro');
});

test('con la ficha caída la fuente se declara fallida y el registro sale de la agenda', () => {
  const d = datos(); d.ficha = { visits: [], antecedentes: {}, errors: ['Historial: 503'], programas: [], vigencia: [], riesgo: [], ram: [] };
  d.visits = [{ ...visita('01-09-2026', '20260901'), origen: 'cita', prestadores: [] }];
  const r = buildClinicalRecord(d);
  assert.equal(r.fuentes.find(f => f.id === 'eloisa-ficha').estado, 'fallida');
  assert.equal(r.atenciones.length, 1); assert.equal(r.atenciones[0].fuente, 'eloisa-agenda'); assert.equal(r.atenciones[0].esMia, true);
});

test('fechaRelativa habla en días, meses y años respecto de hoy', () => {
  assert.equal(fechaRelativa('04-09-2026', HOY), 'hoy'); assert.equal(fechaRelativa('03-09-2026', HOY), 'hace 1 día');
  assert.equal(fechaRelativa('20-08-2026', HOY), 'hace 15 días'); assert.equal(fechaRelativa('11-02-2026', HOY), 'hace 7 meses');
  assert.equal(fechaRelativa('02-01-2025', HOY), 'hace 1 año'); assert.equal(fechaRelativa('04-12-2026', HOY), 'en 3 meses'); assert.equal(fechaRelativa('', HOY), 'sin fecha');
});

test('buildContext no lleva nombre, RUN ni nombres de profesionales, ni dentro del texto libre, y usa fechas relativas', () => {
  const r = buildClinicalRecord(datos());
  const c = buildContext(r, { hoy: HOY });
  assert.equal(c.verificado, true, c.restos.join(','));
  for (const prohibido of ['Rosa', 'Tuki', 'Ejemplo', '6.543.210', 'Opazo', 'Damiani', 'Luna', 'Atamu', '26-08-2026']) assert.ok(!c.texto.includes(prohibido), `no debe contener ${prohibido}`);
  assert.match(c.texto, /médico tratante/);
  assert.match(buildContext(r, { hoy: HOY, ventanaMeses: null }).texto, /otro profesional \(Médico\)/, 'la urgencia de otro médico sólo entra sin ventana');
  assert.match(c.texto, /hace 9 días · Control Crónico/); assert.match(c.texto, /Glicemia: 142 mg\/dL \(ref 70-100\) \[alto\]/);
  assert.match(c.texto, /Diabetes mellitus tipo 2 \(E11\) \[GES\] · crónico · 3 registros/);
  assert.match(c.texto, /Evolución: Sin hipoglicemias/);
  assert.match(c.texto, /Carolina|<nombre>/, 'la hija sólo se borra si su nombre aparece como persona: aquí queda, y es un límite documentado');
  assert.equal(c.incluido.atenciones, 2, 'la de hace 20 meses cae fuera de la ventana de 12');
  assert.deepEqual(c.omitido, ['1 atenciones fuera de la ventana de 12 meses']);
});

test('buildContext respeta el presupuesto recortando las atenciones más antiguas y lo declara', () => {
  const d = datos(); d.ficha.visits = Array.from({ length: 30 }, (_, i) => visita(`0${(i % 9) + 1}-08-2026`, `202608${String((i % 9) + 1).padStart(2, '0')}`));
  const c = buildContext(buildClinicalRecord(d), { hoy: HOY, maxChars: 4000, ventanaMeses: null });
  assert.ok(c.chars <= 4300, `quedó en ${c.chars}`);
  assert.ok(c.omitido.some(o => /atenciones antiguas por el presupuesto/.test(o)));
  assert.match(c.texto, /atenciones más antiguas omitidas/);
});

test('las plantillas predeterminadas validan; una personalizada mal hecha se rechaza con motivos', () => {
  for (const p of PLANTILLAS) assert.deepEqual(validarPlantilla(p), [], p.id);
  assert.equal(getPlantilla('resumen-clinico').secciones.length, 6);
  assert.throws(() => crearPlantilla(getPlantilla('resumen-clinico'), { id: 'Mi Plantilla', nombre: '' }), /id: sólo minúsculas.*nombre vacío/s);
  const mia = crearPlantilla(getPlantilla('resumen-clinico'), { id: 'mi-resumen', nombre: 'Mi resumen', secciones: [{ id: 'esencial', titulo: 'Lo esencial', instruccion: 'Tres frases.' }], longitud: 'breve' });
  assert.equal(mia.personalizada, true); assert.equal(mia.ventanaMeses, 12);
  assert.deepEqual(validarPlantilla({ ...mia, secciones: [mia.secciones[0], mia.secciones[0]] }), ['sección 2: id repetido (esencial)']);
});

test('buildPrompt fija las reglas y exige los títulos exactos en orden', () => {
  const { system, user } = buildPrompt(getPlantilla('informe-interconsulta'), 'CONTEXTO');
  assert.match(system, /no inventes fechas/); assert.match(system, /«el paciente»/);
  assert.ok(user.startsWith('CONTEXTO'));
  assert.match(user, /1\. ## Pregunta al especialista\n/); assert.match(user, /5\. ## Estudios pendientes o sugeridos \(opcional/);
});

test('el proveedor manual no llama a la red y entrega el prompt completo', async () => {
  const r = await createManualProvider().generar({ system: 'S', user: 'U' });
  assert.equal(r.prompt, 'S\n\n=====\n\nU');
});

test('el proveedor por API está apagado sin clave y, con clave, arma la Messages API y lee el texto', async () => {
  await assert.rejects(createApiProvider().generar({ system: 's', user: 'u' }), /no está configurado/);
  const llamadas = [];
  const fetchImpl = async (url, init) => { llamadas.push({ url, init }); return { ok: true, status: 200, json: async () => ({ model: 'claude-opus-5', stop_reason: 'end_turn', content: [{ type: 'thinking', thinking: '' }, { type: 'text', text: '## Hola' }] }) }; };
  const p = createApiProvider({ apiKey: 'sk-test', fetchImpl });
  const r = await p.generar({ system: 'S', user: 'U' });
  assert.equal(r.texto, '## Hola'); assert.equal(r.truncado, false);
  const body = JSON.parse(llamadas[0].init.body);
  assert.equal(llamadas[0].url, 'https://api.anthropic.com/v1/messages');
  assert.equal(llamadas[0].init.headers['x-api-key'], 'sk-test'); assert.equal(llamadas[0].init.headers['anthropic-version'], '2023-06-01');
  assert.deepEqual(body, { model: 'claude-opus-5', max_tokens: 16000, system: 'S', messages: [{ role: 'user', content: 'U' }], thinking: { type: 'adaptive' }, output_config: { effort: 'high' } });
  const rechaza = createApiProvider({ apiKey: 'k', fetchImpl: async () => ({ ok: true, status: 200, json: async () => ({ stop_reason: 'refusal', stop_details: { category: 'x' }, content: [] }) }) });
  await assert.rejects(rechaza.generar({ system: 's', user: 'u' }), /declinó la solicitud \(x\)/);
  const e401 = createApiProvider({ apiKey: 'k', fetchImpl: async () => ({ ok: false, status: 401 }) });
  await assert.rejects(e401.generar({ system: 's', user: 'u' }), /API 401: clave rechazada/);
});

test('parsearRespuesta reconoce los títulos con tolerancia y detecta faltantes y «Sin datos»', () => {
  const p = getPlantilla('resumen-clinico');
  const txt = 'Aquí va el informe:\n## 1. Problemas Activos\n- DM2\n- HTA\n### Antecedentes relevantes\nHTA desde 2010.\n## Evolucion reciente\nSin datos en el registro.\n## Tratamiento actual\nMetformina.\n## Pendientes\nIC reumatología abierta.\n## Comentario del modelo\nbla';
  const r = parsearRespuesta(txt, p);
  assert.equal(r.secciones.problemas, '- DM2\n- HTA'); assert.equal(r.secciones.antecedentes, 'HTA desde 2010.');
  assert.deepEqual(r.faltantes, []); assert.deepEqual(r.sinDatos, ['evolucion']);
  assert.match(r.extra, /Aquí va el informe:/); assert.match(r.extra, /Comentario del modelo/);
  assert.deepEqual(parsearRespuesta('nada', p).faltantes, ['problemas', 'antecedentes', 'evolucion', 'tratamiento', 'pendientes']);
});

test('armarInforme vuelve a poner la identidad, marca lo faltante y deja el pie de revisión; markdownAHtml escapa', () => {
  const p = getPlantilla('resumen-clinico');
  const md = armarInforme({ plantilla: p, respuesta: parsearRespuesta('## Problemas activos\nDM2 <b>x</b>\n## Antecedentes relevantes\nHTA', p), paciente: { nombre: 'Rosa Ejemplo Tuki', run: '6.543.210-2', edad: 79, sexo: 'Mujer' }, generado: HOY, contexto: { incluido: { atenciones: 2, problemas: 1, interconsultas: 1 }, omitido: ['1 atenciones fuera de la ventana'] } });
  assert.match(md, /\*\*Paciente:\*\* Rosa Ejemplo Tuki · RUN 6\.543\.210-2 · 79 años · Mujer/);
  assert.match(md, /## Tratamiento actual\n\n_Sección no generada\._/); assert.match(md, /Secciones que el modelo no entregó: Evolución reciente, Tratamiento actual, Pendientes/);
  assert.match(md, /2 atenciones, 1 problemas, 1 interconsultas; omitido: 1 atenciones fuera de la ventana/);
  const html = markdownAHtml(md);
  assert.match(html, /<h1>Resumen clínico<\/h1>/); assert.match(html, /&lt;b&gt;x&lt;\/b&gt;/); assert.match(html, /<strong>Paciente:<\/strong>/); assert.match(html, /<hr>/);
});

test('el registro de fuentes declara imagenología y biopsias como pendientes y tolera fallos por fuente', async () => {
  const ids = listSources().map(s => `${s.id}:${s.disponible}`);
  assert.deepEqual(ids, ['imagenologia-mmard:false', 'biopsias:false']);
  registerSource({ id: 'lab-x', etiqueta: 'Lab X', tipo: 'laboratorio', obtener: async () => [{ fecha: '01-01-2026', analito: 'Hb', valor: '12' }] });
  registerSource({ id: 'lab-roto', etiqueta: 'Lab roto', tipo: 'laboratorio', obtener: async () => { throw new Error('sin red'); } });
  const r = await fetchAll('laboratorio', { run: 'x' });
  assert.equal(r.items.length, 1); assert.equal(r.items[0].fuente, 'lab-x'); assert.deepEqual(r.fallos, [{ fuente: 'lab-roto', error: 'sin red' }]);
  assert.throws(() => registerSource({ id: 'z', etiqueta: 'z', tipo: 'otro' }), /Tipo de fuente desconocido/);
  resetSources();
});

test('prepararInforme y cerrarInforme cierran el ciclo sin que la identidad salga del contexto', () => {
  const prep = prepararInforme({ plantilla: 'resumen-clinico', datos: datos(), opciones: { hoy: HOY } });
  assert.ok(!prep.prompt.user.includes('Tuki') && !prep.prompt.user.includes('6.543.210'));
  assert.match(prep.prompt.user, /Estructura obligatoria/);
  const fin = cerrarInforme({ plantilla: prep.plantilla, registro: prep.registro, contexto: prep.contexto, respuestaTexto: '## Problemas activos\nDM2 con glicemia 142.\n## Antecedentes relevantes\nHTA.\n## Evolución reciente\nControl hace 9 días.\n## Tratamiento actual\nMetformina 850 mg c/12 h.\n## Pendientes\nIC reumatología.' });
  assert.deepEqual(fin.respuesta.faltantes, []);
  assert.match(fin.markdown, /\*\*Paciente:\*\* Rosa Ejemplo Tuki/); assert.match(fin.markdown, /Borrador generado con un modelo de lenguaje \(manual\)/);
  assert.throws(() => prepararInforme({ plantilla: 'no-existe', datos: datos() }), /Plantilla desconocida/);
});
