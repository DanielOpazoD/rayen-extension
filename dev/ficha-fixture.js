/**
 * Ficha clínica sintética por paciente: las siete respuestas que loadFicha pide
 * a Eloisa, con las claves reales observadas en las capturas (ver tests/ficha.test.js)
 * y valores inventados. Determinista por paciente. Así el arnés ejercita el panel
 * con ficha, las recetas, la portada y el informe con IA sin tocar la red.
 */
import { PATIENTS, DX, OFFICER, KINE, MATRONA, rng, pick, edadExacta } from './fixture.js';
import { CONFIG } from '../src/core/config.js';
import { localDateStr } from '../src/core/parser.js';

const ESPECIALISTA = { Id: 439701, NombreCompleto: 'Juana Ejemplo Atamu', NombreInstrumento: 'Médico' };
const TIPOS_MIOS = ['Control Crónico', 'Consulta Médica', 'Consulta Morbilidad'];

function master(p) {
  return {
    Id: p.idUsp, NumeroDeFicha: p.rut, Rut: p.rut, NombreFormateado: p.nombre, Nombres: p.nom, ApellidoPaterno: p.ap, ApellidoMaterno: p.am,
    FechaDeNacimiento: `${p.dob} 000000`, Sexo: { Nombre: p.sexo }, Genero: { Nombre: p.sexo === 'Mujer' ? 'Femenina' : 'Masculino' },
    ConvenioPrevisional: { Nombre: p.prev }, EMail: '', EstaActivo: true, EsCuidador: false,
    Telefonos: [{ TelefonoDescripcion: '9 0000 0000', Eliminado: false }],
    Georeferencias: [{ DireccionFormateada: 'Calle Ejemplo 123, Hanga Roa' }],
    Familia: { CodigoDeFamiliaCompleto: `HR${String(p.idUsp % 10000).padStart(6, '0')}` }, ParentescoConJefeDeFamilia: { Nombre: 'Jefe(a) de familia' },
    Ocupacion: { Nombre: 'Desconocido' }, Nacionalidad: { Nombre: 'Chilena' }, GrupoEtnico: { Nombre: 'Rapa Nui' },
    FechaInscripcion: '20100101 000000', FechaDeFallecimiento: '00010101 000000', IdNodo: CONFIG.nodeId,
  };
}

function visita(p, r, d8, i, mine, urgencia) {
  const hh = String(8 + (i % 8)).padStart(2, '0');
  const dx = pick(r, DX), dx2 = r() < 0.4 ? pick(r, DX) : null;
  const receta = 590000000 + p.idUsp % 1000 * 10 + i;
  const sug = new Date(+d8.slice(0, 4), +d8.slice(4, 6) - 1, +d8.slice(6, 8) + 60);
  // Como en la consulta por paciente: FechaCita es la cita; Fecha, cuándo se guardó (a veces días después).
  const tarde = mine && !urgencia && i % 4 === 1;
  const guardado = tarde ? localDateStr(new Date(+d8.slice(0, 4), +d8.slice(4, 6) - 1, +d8.slice(6, 8) + 2)) : d8;
  const base = {
    Id: 736000000 + p.idUsp % 100000 * 20 + i, IdCita: urgencia ? 0 : 790000000 + i, IdUsp: p.idUsp, Fecha: `${guardado} ${hh}1500`,
    FechaCita: urgencia ? '00010101 000000' : `${d8} ${hh}0000`, RutPaciente: p.rut, NombreCompleto: p.nombre,
    EdadExacta: edadExacta(p.dob, d8), FechaNacimiento: `${p.dob} 000000`, IdSexo: p.sexo === 'Mujer' ? 2 : 3,
    TipoDeAtencion: urgencia ? 'Atención de Urgencia' : mine ? pick(r, TIPOS_MIOS) : 'Kinesiología', EsUrgencia: urgencia, EsEspontanea: urgencia,
    Diagnosticos: [{ DescripcionClasificacion: dx[0], DescripcionDiagnostico: dx[1], CodigoCIE10: dx[2], EsAuge: dx[3] },
      ...(dx2 ? [{ DescripcionClasificacion: dx2[0], DescripcionDiagnostico: dx2[1], CodigoCIE10: dx2[2], EsAuge: dx2[3] }] : [])],
    Actividades: [{ CodigoActividad: mine ? 'CMMI' : 'KIN', Descripcion: mine ? '1 Consulta Médica Medicina Interna' : 'Sesión de kinesiología', Instrumento: mine ? 'Médico' : 'Kinesiología' }],
    FuncionariosPrestadores: [urgencia ? ESPECIALISTA : mine ? OFFICER : pick(r, [KINE, MATRONA])],
  };
  if (!mine && !urgencia) return base;
  if (urgencia) {
    return { ...base,
      Anamnesis: [{ MotivoConsulta: 'Cefalea de 2 días', HistoriaEnfermedadActual: '', Evolucion: 'Evoluciona sin cefalea tras analgesia; sin focalidad neurológica al alta.', ExamenFisico: 'Vigil, orientada, sin signos meníngeos.' }],
      EpisodioAtencion: [{ Categorizacion: 'C3 · sin riesgo vital, atención diferible', IdEpisodio: 1 }],
      Indicaciones: [{ Descripcion: 'Paracetamol 1 g cada 8 h por 3 días; control en policlínico.' }],
    };
  }
  return { ...base,
    Anamnesis: [{ MotivoConsulta: `Control ${dx[1].toLowerCase()}`, HistoriaEnfermedadActual: 'Asintomática. Buena adherencia. PA 130/80.' }],
    Prescripciones: [{ Descripcion: `Losartan Potasico 50 mg Comprimidos : 1 Comprimido cada 12 horas por 6 meses de la Receta Nº ${receta}  `, IdReceta: receta, EsExterna: false, Observacion: '', Suspendido: false }],
    Recetas: [{ Id: receta, TipoReceta: 'Otras Crónicas', EstadoReceta: 'Pendiente', IdEstado: 3, FechaGeneracion: `${d8} ${hh}1550`, FechaProximoDespacho: `${d8} 235959`, FechaDespacho: '00010101 000000', EsExterna: false }],
    OrdenAtencionInterna: i === 0 ? [{ Id: receta, FechaEmision: `${d8} ${hh}1628`, CuantosDiasMas: 60, Motivo: 'Control con exámenes', PrioridadAlta: false, Estado: 1, FechaSugerida: `${localDateStr(sug)} 000000`, FechaDescarte: '00010101 000000' }] : [],
  };
}

function historial(p, r, today) {
  const n = 4 + Math.floor(r() * 8);
  const out = [];
  for (let i = 0; i < n; i++) {
    const d = new Date(today); d.setDate(d.getDate() - Math.floor(r() * 700) - (i === 0 ? 3 : 0));
    const mine = r() < 0.6, urgencia = i === n - 1 && r() < 0.5;
    out.push(visita(p, r, localDateStr(d), i, mine, urgencia));
  }
  return out;
}

/**
 * Detalle de la receta (Farmacia/Receta/id=…): claves reales del HAR «ficha amb»
 * del 04-09-2026. Cada tercera receta lleva una prescripción suspendida y un
 * despacho parcial, para que el panel muestre esos estados.
 */
function recetaDetalle(v) {
  const rec = v.Recetas?.[0];
  if (!rec) return null;
  const d8 = v.Fecha.slice(0, 8);
  const fin = new Date(+d8.slice(0, 4), +d8.slice(4, 6) - 1, +d8.slice(6, 8) + 90);
  const susp = rec.Id % 3 === 0;
  const presc = (Id, DescripcionArticulo, Descripcion, extra) => ({
    Id, IdReceta: rec.Id, DescripcionArticulo, Descripcion, DosisUnitaria: 1, Intervalo: 12, Duracion: 6, TipoUnidadIntervalo: 3, TipoUnidadDuracion: 6,
    TotalRecetado: 360, TotalADespachar: 360, CantidadDespachada: 0, SaldoPendiente: 360, CantidadPorPrescripcion: 30, Observacion: '',
    SuspenderTratamiento: 0, FechaSuspendeTratamiento: '00010101 000000', FechaProximoDespacho: rec.FechaProximoDespacho,
    Controlado: false, Psicotropico: false, EsBorrado: false, ...extra,
  });
  return {
    Id: rec.Id, Estado: 1, IdTipoReceta: 47, FechaGeneracion: rec.FechaGeneracion, TerminoVigencia: `${localDateStr(fin)} 000000`,
    Periodicidad: 30, FechaProximoDespacho: rec.FechaProximoDespacho, FechaHoraCierreReceta: '00010101 000000', EsExterna: false, EsAdministrativa: false,
    Prescripciones: [
      presc(rec.Id * 10 + 1, 'Losartan Potasico 50 mg Comprimidos', 'Losartan Potasico 50 mg Comprimidos : 1 Comprimido cada 12 horas por 6 meses', susp ? { CantidadDespachada: 60, SaldoPendiente: 300 } : {}),
      ...(susp ? [presc(rec.Id * 10 + 2, 'Metformina Clorhidrato 850 mg Comprimidos', 'Metformina Clorhidrato 850 mg Comprimidos : 1 Comprimido cada 12 horas por 6 meses',
        { SuspenderTratamiento: 1, FechaSuspendeTratamiento: `${d8} 120000`, Observacion: 'Intolerancia digestiva' })] : []),
    ],
  };
}

function antecedentes(p, r, recetaEnUso) {
  const cronico = r() < 0.7;
  return {
    antecedenteMedicoPersonal: cronico ? [{ EsMorbido: false, Diagnostico: 'Hipertensión arterial', Fecha: '20200714 145446', Seleccionado: true, EsBorrado: false }] : [],
    // Misma lista que FichaClinica/FarmacoEnUso: la receta citada existe en el historial, así el panel ejercita la autoridad de Rayen.
    farmacoEnUsos: { medications: cronico && recetaEnUso ? [{ Descripcion: `Losartan Potasico 50 mg Comprimidos : 1 Comprimido cada 12 horas por 6 meses \n Nº Receta: ${recetaEnUso.Id}. Estado Receta: Por Despachar`, DescripcionArticulo: 'Losartan Potasico 50 mg Comprimidos', IdReceta: recetaEnUso.Id, IdTipoReceta: 47, FechaReceta: recetaEnUso.FechaGeneracion, FarmPopular: -1, EsHearts: true, EsBorrado: false, Id: recetaEnUso.Id }] : [] },
    alergia: { reaccionAdversa: [], alergiasUsuario: r() < 0.25 ? [{ IdUsuarioAps: p.idUsp, Descripcion: 'Penicilina', EsBorrado: false }] : [] },
    eventoAdverso: { categories: [] },
  };
}

/** @returns {{ byRunBody: Map<string, object>, byId: Map<number, object>, byReceta: Map<number, object> }} */
export function buildFichaResponses(today = new Date()) {
  const byRunBody = new Map(), byId = new Map(), byReceta = new Map();
  for (const p of PATIENTS) {
    const r = rng(p.idUsp);
    byRunBody.set(p.run, master(p));
    const hist = historial(p, r, today);
    const conReceta = hist.filter(v => v.Recetas?.length).sort((a, b) => b.Fecha.localeCompare(a.Fecha));
    for (const v of conReceta) byReceta.set(v.Recetas[0].Id, recetaDetalle(v));
    byId.set(p.idUsp, {
      historial: hist,
      antecedentes: antecedentes(p, r, conReceta[0]?.Recetas[0]),
      programas: r() < 0.6 ? [{ IdPrograma: 5, NombrePrograma: 'Programa Salud Cardiovascular', Estado: 1, FechaHora: '20240101 000000' }] : [],
      vigencias: r() < 0.5 ? [{ Ok: false, Mensaje: 'EMP no vigente', Alert: 1 }] : [{ Ok: true, Mensaje: 'EMP vigente', Alert: 0 }],
      riesgo: r() < 0.5 ? [{ Activo: true, Estratificacion: 'G2', FechaHoraIngreso: '20250301 000000' }] : [],
      ram: [],
    });
  }
  return { byRunBody, byId, byReceta };
}
