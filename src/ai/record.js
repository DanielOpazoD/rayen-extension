/**
 * Registro clínico canónico: la única forma de datos que ven los flujos con
 * IA. Reúne lo que hoy vive disperso (agenda, ficha de Eloisa, interconsultas,
 * laboratorio) y deja sitio para imagenología y biopsias, con procedencia por
 * fuente y sin HTML. La interfaz no lo construye a mano: pasa por aquí.
 *
 * Contratos de los ítems externos (los adaptadores de io los producen):
 *   laboratorio:  { fecha: 'dd-mm-yyyy', examen, analito, valor, unidad, referencia, flag: ''|'alto'|'bajo'|'anormal', fuente }
 *   imagenologia: { fecha, estudio, informe, conclusion, fuente }
 *   biopsias:     { fecha, muestra, informe, diagnostico, fuente }
 */
import { rankProblems, prescripcionEstado } from '../core/ficha-rank.js';
import { isMine as sicEsMia } from '../core/sic-rules.js';
import { formatRun } from '../core/parser.js';

const RECORD_VERSION = 1;

const texto = v => (v ?? '').toString().trim();
const items = (arr) => (arr ?? []).map(x => typeof x === 'string' ? { texto: x } : { texto: [x.label, ...(x.details ?? [])].filter(Boolean).join(' · '), suspendido: !!x.suspendido });

function atencion(v, officerId) {
  const prest = (v.prestadores ?? []).map(p => ({ nombre: texto(p.nombre), instrumento: texto(p.instrumento), esMio: p.id === officerId }));
  const s = v.sections ?? {};
  const rx = [...(s.prescripciones ?? []), ...(s.prescExtra ?? [])].map(p => ({
    texto: [p.label, ...(p.details ?? [])].filter(Boolean).join(' · '),
    estado: prescripcionEstado(`${p.label} ${(p.details ?? []).join(' ')}`, v.fecha8, { suspendido: !!p.suspendido }),
  }));
  return {
    id: v.id ?? null,
    fecha: texto(v.fechaAtencion), hora: texto(v.hora), fecha8: v.fecha8 ?? null, fechaRegistro: texto(v.fechaRegistro),
    tipo: texto(v.tipoAtencion), razon: texto(v.razon), estado: texto(v.estado),
    esUrgencia: !!v.esUrgencia, esMia: prest.some(p => p.esMio) || (!prest.length && v.origen === 'cita'),
    prestadores: prest,
    diagnosticos: (v.diagnosticos ?? []).map(d => ({ nombre: texto(d.nombre), codigo: texto(d.codigo), esAuge: !!d.esAuge })),
    motivo: texto(v.anamnesis?.motivo), historia: texto(v.anamnesis?.historia),
    textos: (v.extras ?? []).map(x => ({ titulo: x.label, texto: x.text })),
    prescripciones: rx,
    indicaciones: items(s.indicaciones), examenes: items([...(s.examenes ?? []), ...(s.pruebas ?? [])]),
    examenFisico: items(s.examenFisico), licencias: items(s.licencias), derivaciones: items(s.derivaciones),
    proximoControl: (s.proximoControl ?? []).filter(c => !c.descartada).map(c => ({ fecha: c.fecha ?? '', fecha8: c.fecha8 ?? null, motivo: c.label ?? '' })),
    actividades: (v.actividades ?? []).map(a => texto(a.descripcion || a.codigo)).filter(Boolean),
    adjuntos: (v.adjuntos ?? []).map(a => texto(a.nombre)).filter(Boolean),
    fuente: v.origen === 'ficha' ? 'eloisa-ficha' : 'eloisa-agenda',
  };
}

function interconsulta(s) {
  return {
    id: s.id ?? null, fecha: texto(s.fecha), especialidad: texto(s.especialidad), especialidadOrigen: texto(s.especialidadOrigen),
    estado: texto(s.estado), grupo: texto(s.grupo), abierta: ['pendiente', 'enviada'].includes(s.grupo), prioridad: texto(s.prioridad),
    antiguedadDias: s.antiguedadDias ?? null, motivo: texto(s.motivo), problemaSalud: texto(s.problemaSalud), esAuge: !!s.esAuge,
    diagnostico: texto(s.diagnostico), hipotesis: texto(s.hipotesis), fundamentos: texto(s.fundamentos), examenes: texto(s.examenes),
    observaciones: texto(s.observaciones), esMia: sicEsMia(s), origen: texto(s.origen), destino: texto(s.destino),
    fuente: 'eloisa-sic',
  };
}

/**
 * @param {object} p
 * @param {object} p.record   — fila de la agenda (paciente + cita): nombre, run, edad, sexo, prevision, idUsp, notas
 * @param {object} [p.ficha]  — resultado de loadFicha: visits, antecedentes, programas, vigencia, riesgo, ram, errors, master
 * @param {Array}  [p.visits] — atenciones de la agenda cuando no hay ficha
 * @param {Array}  [p.sics]
 * @param {Array}  [p.laboratorio] [p.imagenologia] [p.biopsias] — ya normalizados (ver cabecera)
 * @param {number} p.officerId
 * @param {string} [p.generado] — ISO; sólo para pruebas
 */
/** Estado de cada fuente: el informe dice con qué se armó y qué faltó. */
function fuentesDe({ ficha, visits, sics, laboratorio, imagenologia, biopsias }) {
  const fichaEstado = !ficha ? 'ausente' : ficha.errors?.length ? (ficha.visits?.length ? 'parcial' : 'fallida') : 'completa';
  const opcional = (id, lista) => ({ id, estado: lista.length ? 'completa' : 'ausente', n: lista.length });
  return [
    { id: 'eloisa-agenda', estado: 'completa', n: visits.length },
    { id: 'eloisa-ficha', estado: fichaEstado, n: ficha?.visits?.length ?? 0, errores: (ficha?.errors ?? []).length },
    { id: 'eloisa-sic', estado: 'completa', n: sics.length },
    opcional('laboratorio', laboratorio), opcional('imagenologia', imagenologia), opcional('biopsias', biopsias),
  ];
}

/** Antecedentes de la ficha como texto plano: fármacos, mórbidos, alergias, RAM, programas, vigencias, riesgo. */
function antecedentesDe(ficha) {
  const ant = ficha?.antecedentes ?? {};
  const etiqueta = x => texto(x.label ?? x);
  return {
    farmacos: (ant.farmacos ?? []).map(f => ({ texto: [f.label, f.posologia].filter(Boolean).join(' · '), estado: texto(f.estado), fecha: texto(f.fecha) })),
    morbidos: (ant.morbidos ?? []).map(etiqueta).filter(Boolean),
    alergias: (ant.alergias ?? []).map(etiqueta).filter(Boolean),
    ram: (ficha?.ram ?? []).map(r => texto(r.label ?? r.descripcion ?? r)).filter(Boolean),
    programas: (ficha?.programas ?? []).map(p => ({ nombre: texto(p.nombre ?? p.label), estado: texto(p.estado), fecha: texto(p.fecha) })),
    vigencia: (ficha?.vigencia ?? []).map(v => ({ ok: !!v.ok, mensaje: texto(v.mensaje) })),
    riesgo: (ficha?.riesgo ?? []).map(r => texto(r.label ?? r.descripcion ?? r.nombre ?? r)).filter(Boolean),
  };
}

export function buildClinicalRecord({ record, ficha = null, visits = [], sics = [], laboratorio = [], imagenologia = [], biopsias = [], officerId, generado = new Date().toISOString() }) {
  const src = ficha?.visits?.length ? ficha.visits : visits;
  const atenciones = src.map(v => atencion(v, officerId)).sort((a, b) => (b.fecha8 ?? '').localeCompare(a.fecha8 ?? '') || b.fecha.localeCompare(a.fecha));
  const problemas = rankProblems(src, { officerId }).map(p => ({ nombre: p.nombre, codigo: p.codigo, esAuge: p.esAuge, cronico: p.cronico, recurrente: p.recurrente, n: p.n, primera: p.primera, ultima: p.ultima }));
  const fuentes = fuentesDe({ ficha, visits, sics, laboratorio, imagenologia, biopsias });
  const conFuente = (lista, fuente) => lista.map(x => ({ ...x, fuente: x.fuente ?? fuente }));
  return {
    version: RECORD_VERSION, generado, fuentes,
    paciente: {
      nombre: texto(record.nombre), run: formatRun(texto(record.run)).runStr || texto(record.run), edad: record.edad ?? null, sexo: texto(record.sexo),
      prevision: texto(record.prevision ?? ficha?.master?.prevision), idUsp: record.idUsp ?? ficha?.master?.idUsp ?? null,
    },
    problemas, atenciones,
    antecedentes: antecedentesDe(ficha),
    interconsultas: sics.map(interconsulta),
    laboratorio: conFuente(laboratorio, 'laboratorio'),
    imagenologia: conFuente(imagenologia, 'imagenologia'),
    biopsias: conFuente(biopsias, 'biopsias'),
    notas: (record.notas ?? []).map(n => ({ fecha: n.at ?? null, texto: texto(n.text) })),
  };
}
