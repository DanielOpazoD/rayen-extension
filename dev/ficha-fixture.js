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
  const base = {
    Id: 736000000 + p.idUsp % 100000 * 20 + i, IdCita: 0, IdUsp: p.idUsp, Fecha: `${d8} ${hh}1500`, RutPaciente: p.rut, NombreCompleto: p.nombre,
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

function antecedentes(p, r) {
  const cronico = r() < 0.7;
  return {
    antecedenteMedicoPersonal: cronico ? [{ EsMorbido: false, Diagnostico: 'Hipertensión arterial', Fecha: '20200714 145446', Seleccionado: true, EsBorrado: false }] : [],
    farmacoEnUsos: { medications: cronico ? [{ Descripcion: 'Losartan Potasico 50 mg Comprimidos : 1 Comprimido cada 12 horas por 6 meses \n Nº Receta: 1. Estado Receta: Pendiente', DescripcionArticulo: 'Losartan Potasico 50 mg Comprimidos', IdReceta: 1, FechaReceta: '20260828 000000', EsHearts: true }] : [] },
    alergia: { reaccionAdversa: [], alergiasUsuario: r() < 0.25 ? [{ IdUsuarioAps: p.idUsp, Descripcion: 'Penicilina', EsBorrado: false }] : [] },
    eventoAdverso: { categories: [] },
  };
}

/** @returns {{ byRunBody: Map<string, object>, byId: Map<number, object> }} */
export function buildFichaResponses(today = new Date()) {
  const byRunBody = new Map(), byId = new Map();
  for (const p of PATIENTS) {
    const r = rng(p.idUsp);
    byRunBody.set(p.run, master(p));
    byId.set(p.idUsp, {
      historial: historial(p, r, today),
      antecedentes: antecedentes(p, r),
      programas: r() < 0.6 ? [{ IdPrograma: 5, NombrePrograma: 'Programa Salud Cardiovascular', Estado: 1, FechaHora: '20240101 000000' }] : [],
      vigencias: r() < 0.5 ? [{ Ok: false, Mensaje: 'EMP no vigente', Alert: 1 }] : [{ Ok: true, Mensaje: 'EMP vigente', Alert: 0 }],
      riesgo: r() < 0.5 ? [{ Activo: true, Estratificacion: 'G2', FechaHoraIngreso: '20250301 000000' }] : [],
      ram: [],
    });
  }
  return { byRunBody, byId };
}
