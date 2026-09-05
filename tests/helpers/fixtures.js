/**
 * Datos sintéticos con la forma real (convención 7 de ARCHITECTURE.md): nombres
 * de varias palabras, RUN con verificador, estados como los escribe Rayen y el
 * centinela «00010101». Una agregación por identidad o un anonimizador fallan
 * con «Opazo Damiani Daniel» y pasan con «Rosa»: por eso nada aquí es de una palabra.
 */
export const OFICIAL = Object.freeze({ id: 439550, nombre: 'Opazo Damiani Daniel', instrumento: 'Médico' });
export const OTRO_PROFESIONAL = Object.freeze({ id: 439701, nombre: 'Pérez Tuki Ana María', instrumento: 'Kinesiología' });

/** Registro de paciente como lo deja parseCita/parseAtencion. */
export function paciente(over = {}) {
  return {
    run: '25106217K', runStr: '25.106.217-K', nombre: 'Rosa Ejemplo Tuki', nombres: 'Rosa', ap: 'Ejemplo', am: 'Tuki',
    dob: '03-09-2015', edad: 10, sexo: 'Mujer', prevision: 'FONASA B', ...over,
  };
}

/** Fila de agenda (parseCita) con la atención vacía, lista para mergeHistorial. */
export function cita(over = {}) {
  return {
    id: 100, origen: 'cita', ...paciente(), fecha8: '20260902', fechaAtencion: '02-09-2026', hora: '09:30', diaSemana: 'Mié',
    estado: 'Completado', tipoAtencion: 'Morbilidad Medica', razon: 'Control', atencionId: null,
    diagnosticos: [], actividades: [], prestadores: [], adjuntos: [], prestador: '', esIC: false, ...over,
  };
}

/** Atención del historial diario (parseAtencion) del oficial, con un diagnóstico confirmado. */
export function atencion(over = {}) {
  return {
    id: 1, idCita: 0, idUsp: 4242, origen: 'ficha', ...paciente(), fecha8: '20260902', fechaAtencion: '02-09-2026', hora: '10:00', diaSemana: 'Mié',
    tipoAtencion: 'Morbilidad Medica', esUrgencia: false, esEspontanea: false,
    diagnosticos: [{ nombre: 'Bronquitis aguda', clasificacion: 'Bronquitis aguda- (Confirmada)', certeza: 'Confirmada', codigo: 'J20.9', esAuge: false }],
    actividades: [], prestadores: [{ ...OFICIAL }], adjuntos: [], proximoControl: [], ...over,
  };
}

/** Interconsulta (parseSIC) emitida por el oficial, en estado «Nueva». */
export function sic(over = {}) {
  return {
    id: 21450480, fecha: '01-08-2026', fecha8: '20260801', fechaCita: '', antiguedadDias: null, prioridad: 0,
    estadoId: 13, estado: 'Nueva', grupo: 'pendiente', especialidad: 'Gastroenterología Adulto', motivo: 'Confirmación diagnóstica',
    esAuge: false, diagnostico: 'Reflujo gastroesofágico', cie10: 'K21.9',
    paciente: { idUsp: 4242, ...paciente(), telefono: '9 1111 1111', direccion: 'Calle Ejemplo 123, Hanga Roa', tipoUsuario: 'Inscrito' },
    registrador: { id: OFICIAL.id, nombre: OFICIAL.nombre }, ejecutor: { id: OTRO_PROFESIONAL.id, nombre: OTRO_PROFESIONAL.nombre },
    ...over,
  };
}
