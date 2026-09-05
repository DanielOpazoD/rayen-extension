/**
 * Análisis de una solicitud de interconsulta (SolicitudInterconsultaDerivacionPorIds)
 * a los campos que muestra la aplicación. Sin red ni DOM; el cargador vive en io/sic.js.
 */
import { nameOf } from './text.js';
import { SIC_ESTADOS, sicGrupo } from './config.js';
import { formatRun, fmtDate } from './parser.js';

/** El paciente de la solicitud (UsuarioApsDerivacion), con RUN normalizado y contacto. */
function pacienteSIC(u, si) {
  const { run, runStr } = formatRun(u.Rut);
  return {
    idUsp:       u.Id ?? si.IdUsuarioAps ?? 0,
    run, runStr,
    nombre:      u.NombreFormateado ?? '',
    dob:         fmtDate(u.FechaNacimiento ?? ''),
    edad:        u.Edad ?? '',
    sexo:        nameOf(u.Sexo),
    prevision:   nameOf(u.ConvenioPrevisional),
    telefono:    (u.Telefonos ?? []).filter(t => !t.Eliminado).map(t => t.TelefonoDescripcion).filter(Boolean).join(' / '),
    direccion:   u.Georeferencias?.[0]?.DireccionFormateada ?? '',
    tipoUsuario: u.TipoUsuario ?? '',
  };
}

/** Quién registró y quién ejecuta la solicitud. */
function personasSIC(raw, si) {
  const ejecutor = si.FuncionarioPrestadorEjecutor ?? raw.FuncionarioPrestadorEjecutor ?? {};
  return {
    registrador: { id: si.IdFuncionarioRegistrador ?? 0, nombre: raw.FuncionarioPrestadorRegistrador?.NombreFormateado ?? '' },
    ejecutor:    { id: si.IdFuncionarioPrestadorEjecutor ?? 0, nombre: ejecutor.NombreFormateado ?? '' },
  };
}

/** Diagnóstico principal (o el primero), CIE-10 e hipótesis. */
function diagnosticoSIC(raw) {
  const dx0 = raw.ArrDiagnosticos?.find(d => d.EsPrincipal) ?? raw.ArrDiagnosticos?.[0];
  return {
    diagnostico: raw.Diagnostico || dx0?.ClasificacionDiagnostica || '',
    cie10:       dx0?.CodigoCIE10 ?? '',
    hipotesis:   (dx0?.HipotesisDiagnostica ?? '').trim(),
  };
}

/**
 * Compacts one item of SolicitudInterconsultaDerivacionPorIds (~5 KB) into the
 * fields the app shows.
 */
export function parseSIC(raw) {
  const si  = raw.SolicitudInterconsulta ?? {};
  const u   = raw.UsuarioApsDerivacion ?? {};
  const estadoId = si.Estado ?? 0;

  return {
    id:             Number(raw.NumeroSolicitud ?? raw.Id),
    fecha:          raw.FechaHora ?? fmtDate(si.FechaHora ?? ''),
    fecha8:         (si.FechaHora ?? '').slice(0, 8),
    fechaCreacion:  raw.FechaHoraCreacion ?? '',
    fechaEnvio:     raw.FechaHoraEnvioFormateado ?? '',
    fechaCita:      raw.FechaHoraCita ?? '',
    // null cuando la API no lo trae: con `?? 0` las reglas de pendientes nunca
    // llegaban a calcular los días por su cuenta y una SIC de ocho meses sin
    // contrarreferencia no aparecía.
    antiguedadDias: Number.isFinite(raw.AntiguedadDias) ? raw.AntiguedadDias : null,
    prioridad:      raw.Prioridad ?? si.Prioridad ?? 0,

    estadoId,
    estado:  raw.Estado || raw.DescripcionEstado || SIC_ESTADOS[estadoId] || `Estado ${estadoId}`,
    grupo:   sicGrupo(estadoId),

    especialidad:       raw.Especialidad ?? '',
    especialidadOrigen: si.EspecialidadNodoOrigen?.NombreEspecialidad ?? '',
    motivo:             raw.MotivoInterconsulta ?? '',
    problemaSalud:      raw.ProblemaSalud ?? '',
    esAuge:             /^s/i.test(String(raw.EsAuge ?? '')) || !!si.EsGES,

    ...diagnosticoSIC(raw),
    fundamentos: (raw.FundamentosClinicos ?? '').trim(),
    examenes:    (raw.ExamenesRealizados ?? '').trim(),
    observaciones: (raw.ObservacionesInterconsulta || raw.Observaciones || si.ObservacionContralor || '').trim(),
    motivoCancelacion: raw.MotivoCancelacionSolicitud ?? '',

    origen:      raw.EstablecimientoOrigen ?? '',
    destino:     raw.EstablecimientoDestinoSIC ?? '',
    nodoOrigen:  si.IdNodoOrigen ?? 0,
    nodoDestino: si.IdNodoDestino ?? 0,

    paciente: pacienteSIC(u, si),
    ...personasSIC(raw, si),
  };
}

/** True when the officer registered or is the executor of the SIC. */
