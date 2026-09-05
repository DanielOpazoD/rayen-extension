import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  formatRun, computeDv, decodeEdadExacta, fmtDate, fmtHora, dateToInt,
  parseCita, parseAtencion, parseDiagnostico, matchKey, dateRange, humanCase, CITA_KNOWN_FIELDS } from '../src/core/parser.js';

// ── RUN ───────────────────────────────────────────────────────

test('formatRun: Rayen glues the DV to the number, K may be lowercase', () => {
  assert.deepEqual(formatRun('25106217k'), { run: '25106217K', runStr: '25.106.217-K', dvOk: true });
  assert.deepEqual(formatRun('292421311'), { run: '292421311', runStr: '29.242.131-1', dvOk: true });
  assert.deepEqual(formatRun('89068444'),  { run: '89068444',  runStr: '8.906.844-4',  dvOk: true });
});

test('formatRun: the user-provided example 17.752.753-K round-trips', () => {
  const r = formatRun('17752753K');
  assert.equal(r.runStr, '17.752.753-K');
  assert.equal(computeDv('17752753'), 'K');
  assert.equal(r.dvOk, true);
  assert.equal(formatRun('17.752.753-K').run, '17752753K');
});

test('formatRun: rejects non-RUN identifiers without throwing', () => {
  assert.equal(formatRun('admin5576').run, null);
  assert.equal(formatRun('').run, null);
  assert.equal(formatRun(null).run, null);
  assert.equal(formatRun(undefined).run, null);
});

test('formatRun: flags a wrong check digit but still formats it', () => {
  const r = formatRun('177527530');
  assert.equal(r.runStr, '17.752.753-0');
  assert.equal(r.dvOk, false);
});

// ── EdadExacta ────────────────────────────────────────────────

test('decodeEdadExacta unpacks YY…MMDDHH', () => {
  assert.deepEqual(decodeEdadExacta(54010817), { years: 54, months: 1, days: 8, hours: 17, label: '54 a' });
  assert.deepEqual(decodeEdadExacta(51118),    { years: 0,  months: 5, days: 11, hours: 18, label: '5 m 11 d' });
  assert.deepEqual(decodeEdadExacta(5032617),  { years: 5,  months: 3, days: 26, hours: 17, label: '5 a' });
  assert.equal(decodeEdadExacta(1090022).label, '1 a 9 m');
  assert.equal(decodeEdadExacta('x'), null);
});

// ── Dates ─────────────────────────────────────────────────────

test('date helpers handle Rayen formats and sentinel 0001-01-01', () => {
  assert.equal(fmtDate('20260902 202818'), '02-09-2026');
  assert.equal(fmtDate('00010101 000000'), '');
  assert.equal(fmtHora('20260902 202818'), '20:28');
  assert.equal(dateToInt('02-09-2026'), 20260902);
  assert.deepEqual(dateRange(new Date(2026, 0, 30), new Date(2026, 1, 1)), ['20260130', '20260131', '20260201']);
});

// ── Diagnósticos ──────────────────────────────────────────────

test('parseDiagnostico splits classification and certainty', () => {
  const d = parseDiagnostico({
    DescripcionClasificacion: 'Bronquitis aguda- (Confirmada) (AUGE)',
    DescripcionDiagnostico: 'Bronquitis aguda', EsAuge: true, EsENO: false,
  });
  assert.equal(d.clasificacion, 'Bronquitis aguda');
  assert.equal(d.certeza, 'Confirmada');
  assert.equal(d.esAuge, true);

  const e = parseDiagnostico({ DescripcionClasificacion: 'Trastornos específicos mixtos del desarrollo- (Sospecha)', DescripcionDiagnostico: '' });
  assert.equal(e.nombre, 'Trastornos específicos mixtos del desarrollo');
  assert.equal(e.certeza, 'Sospecha');
});

// ── Atención (HistorialAtencion) ──────────────────────────────

const ATENCION = {
  Id: 737937908, IdCita: 0, IdUsp: 18707541, Fecha: '20260902 202818',
  RutPaciente: '25106217k', NombreCompleto: 'Nombre   Prueba Paciente', EdadExacta: 10113019,
  FechaNacimiento: '20150903 000000', IdSexo: 2, TipoDeAtencion: 'MORBILIDAD IRA-ERA',
  EsUrgencia: false, EsEspontanea: true, EsDiada: false,
  Diagnosticos: [{ DescripcionClasificacion: 'Bronquitis aguda- (Confirmada) (AUGE)', DescripcionDiagnostico: 'Bronquitis aguda', EsAuge: true }],
  Actividades: [{ CodigoActividad: 'SEKIRES', Descripcion: '1 Sesiones de Kinesioterapia Respiratoria', Instrumento: 'Kinesiólogo(a)', EsProcedimiento: true }],
  FuncionariosPrestadores: [{ Id: 439550, NombreCompleto: 'Opazo Damiani Daniel', NombreInstrumento: 'Médico' }],
  ArchivosAdjunto: [{ NombreArchivo: 'informe.pdf', PathAzure: '1788392829663.pdf' }],
};

test('parseAtencion compacts a HistorialAtencion item', () => {
  const a = parseAtencion(ATENCION);
  assert.equal(a.id, 737937908);
  assert.equal(a.fecha8, '20260902');
  assert.equal(a.fechaAtencion, '02-09-2026');
  assert.equal(a.hora, '20:28');
  assert.equal(a.runStr, '25.106.217-K');
  assert.equal(a.nombre, 'Nombre Prueba Paciente');
  assert.equal(a.edad, 10);
  assert.equal(a.sexo, 'Mujer');
  assert.equal(a.esEspontanea, true);
  assert.equal(a.diagnosticos[0].certeza, 'Confirmada');
  assert.equal(a.actividades[0].descripcion, 'Sesiones de Kinesioterapia Respiratoria');
  assert.equal(a.prestadores[0].id, 439550);
  assert.equal(a.adjuntos[0].nombre, 'informe.pdf');
  assert.equal(a.fechaRegistro, '', 'sin FechaCita, la fecha de guardado es la referencia y no se repite');
});

test('parseAtencion: la cita es la referencia cuando la ficha se guardó otro día; el registro queda aparte', () => {
  // Cita del 28-08 a las 09:00, ficha cerrada el 30-08 por la tarde (consulta por paciente, con FechaCita).
  const tarde = parseAtencion({ ...ATENCION, Fecha: '20260830 174512', FechaCita: '20260828 090000', IdCita: 795307447 });
  assert.equal(tarde.fecha8, '20260828');
  assert.equal(tarde.fechaAtencion, '28-08-2026');
  assert.equal(tarde.hora, '09:00');
  assert.equal(tarde.fechaRegistro, '30-08-2026');
  // Mismo día: no hay nada que aclarar.
  const mismoDia = parseAtencion({ ...ATENCION, Fecha: '20260828 104023', FechaCita: '20260828 113000' });
  assert.equal(mismoDia.fecha8, '20260828');
  assert.equal(mismoDia.fechaRegistro, '');
  // Urgencia o consulta por nodo: FechaCita nula o ausente → manda Fecha.
  assert.equal(parseAtencion({ ...ATENCION, FechaCita: '00010101 000000' }).fecha8, '20260902');
  assert.equal(parseAtencion({ ...ATENCION, FechaCita: null }).fecha8, '20260902');
});

// ── Cita (ListaPacientesCitados) ──────────────────────────────

const CITA = {
  Id: 805645254, FechaHoraInicio: '20260902 093000', EsCitaInterconsulta: 1,
  Razon: 'Control', Tag: { Nombre: 'Completado' }, TipoDeAtencion: { Nombre: 'Morbilidad Medica' },
  Cupos: [{ Descripcion: 'Citado por: Dr. Referidor\nN° Solicitud Interconsulta: 21437887' }],
  UsuarioAps: {
    Rut: '25106217k', NombreFormateado: 'Nombre Prueba Paciente', Nombres: 'Nombre', ApellidoPaterno: 'Prueba', ApellidoMaterno: 'Paciente',
    FechaDeNacimiento: '20150903 000000', Sexo: { Nombre: 'Mujer' }, ConvenioPrevisional: 'Fonasa D',
    Telefonos: [{ TelefonoDescripcion: '81869731', Eliminado: false }], Georeferencias: [{ DireccionFormateada: 'Calle 1' }],
  },
};

test('parseCita maps agenda fields and IC description', () => {
  const c = parseCita(CITA);
  assert.equal(c.runStr, '25.106.217-K');
  assert.equal(c.esIC, true);
  assert.equal(c.icCitadoPor, 'Dr. Referidor');
  assert.equal(c.icSIC, '21437887');
  assert.equal(c.prevision, 'Fonasa D');
  assert.equal(c.telefono, '81869731');
  assert.equal(c.fecha8, '20260902');
  assert.equal(c.hora, '09:30');
  assert.equal(parseCita({ UsuarioAps: null }), null);
});

test('matchKey links a cita and an atención by RUN + day, name as fallback', () => {
  assert.equal(matchKey(parseCita(CITA)), matchKey(parseAtencion(ATENCION)));
  const noRun = { run: null, nombre: 'Ana   Pérez ', fecha8: '20260902' };
  assert.equal(matchKey(noRun), 'ana pérez|20260902');
});

// Los laboratorios gritan: «PACIENTE EJEMPLO, ROSA», «QUÍMICA». En pantalla se
// lee en caja de oración, sin tocar lo que ya viene mixto ni las siglas de exámenes.
test('humanCase pasa a caja de oración sólo lo que llega íntegramente en mayúsculas', () => {
  assert.equal(humanCase('PEREZ SOTO, JUAN'), 'Perez Soto, Juan');
  assert.equal(humanCase('ANA DE LA CRUZ'), 'Ana de la Cruz');
  assert.equal(humanCase('QUÍMICA SANGUÍNEA'), 'Química Sanguínea');
  assert.equal(humanCase('Rosa Ejemplo'), 'Rosa Ejemplo', 'lo mixto se respeta');
  assert.equal(humanCase('PERFIL LIPIDICO, VHS, TSH', { siglas: true }), 'Perfil Lipidico, VHS, TSH');
  assert.equal(humanCase('ANA', { siglas: false }), 'Ana', 'sin siglas, un nombre corto es un nombre');
  assert.equal(humanCase(''), '');
  assert.equal(humanCase('123-4'), '123-4', 'sin letras no hay nada que cambiar');
});

// ── Bordes que la mutación mostró sin defender (Stryker, 05-09-2026: parser.js 57 %) ──

test('fmtDate y fmtHora: largos mínimos y centinela', () => {
  assert.equal(fmtDate('2026090'), '');
  assert.equal(fmtDate('00010101 000000'), '');
  assert.equal(fmtDate('20260904'), '04-09-2026');
  assert.equal(fmtHora('20260904 101'), '', 'sin hora completa no hay hora');
  assert.equal(fmtHora('20260904 1015'), '10:15');
  assert.equal(dateToInt('x'), 0);
  assert.equal(dateToInt('02-09-2026'), 20260902);
});

test('formatRun: largos, verificador, puntos y casos inválidos', () => {
  assert.deepEqual(formatRun('12K'), { run: '12K', runStr: '12-K', dvOk: false });
  assert.deepEqual(formatRun('1K'), { run: null, runStr: '', dvOk: false }, 'menos de dos dígitos no es RUN');
  assert.deepEqual(formatRun('ABC'), { run: null, runStr: '', dvOk: false });
  assert.deepEqual(formatRun(null), { run: null, runStr: '', dvOk: false });
  assert.deepEqual(formatRun('17752753K'), { run: '17752753K', runStr: '17.752.753-K', dvOk: true });
  assert.deepEqual(formatRun('177527530'), { run: '177527530', runStr: '17.752.753-0', dvOk: false }, 'verificador incorrecto se conserva pero se marca');
  assert.equal(formatRun('1234567K').runStr, '1.234.567-K');
  assert.equal(formatRun('17752753K9').run, null, 'diez caracteres no son un RUN');
  for (const [body, dv] of [['17752753', 'K'], ['25106217', 'K'], ['1', '9'], ['6543210', '2'], ['12345678', '5']]) assert.equal(computeDv(body), dv, body);
});

test('humanCase: oración desde mayúsculas, partículas en minúscula salvo al inicio, y lo que no se toca', () => {
  assert.equal(humanCase('JUAN DE LA CRUZ'), 'Juan de la Cruz');
  assert.equal(humanCase('DE ALGO'), 'De Algo', 'la partícula inicial va en mayúscula');
  assert.equal(humanCase('Juan Pérez'), 'Juan Pérez', 'ya mezclado: no se toca');
  assert.equal(humanCase('123'), '123');
  assert.equal(humanCase(''), '');
  assert.equal(humanCase('  '), '', 'sólo espacios: vacío');
});

test('decodeEdadExacta: etiqueta por rango y entradas no válidas', () => {
  assert.deepEqual(decodeEdadExacta(20000000), { years: 20, months: 0, days: 0, hours: 0, label: '20 a' });
  assert.equal(decodeEdadExacta(2000000).label, '2 a');
  assert.equal(decodeEdadExacta(1020304).label, '1 a 2 m');
  assert.equal(decodeEdadExacta(10500).label, '1 m 5 d');
  assert.equal(decodeEdadExacta(106).label, '1 d');
  assert.equal(decodeEdadExacta(5).label, '0 d');
  assert.equal(decodeEdadExacta('10113019').label, '10 a');
  assert.equal(decodeEdadExacta(null), null);
  assert.equal(decodeEdadExacta('x1'), null);
});

test('parseCita: entradas inválidas, interconsulta, tipo de atención por prioridad y valores por defecto', () => {
  assert.equal(parseCita(null), null);
  assert.equal(parseCita('texto'), null);
  assert.equal(parseCita({ UsuarioAps: {} }), null, 'sin nombre formateado no es una cita');
  const min = parseCita({ Id: 1, FechaHoraInicio: '20260904 093000', UsuarioAps: { NombreFormateado: 'Rosa Ejemplo Tuki' } });
  assert.deepEqual([min.origen, min.idUsp, min.nombres, min.ap, min.am, min.dob, min.edad, min.telefono, min.direccion, min.razon, min.estado, min.tipoAtencion, min.esUrgencia, min.esEspontanea],
    ['cita', 0, '', '', '', '', null, '', '', '', '', '', false, false]);
  assert.deepEqual([min.fecha8, min.fechaAtencion, min.hora, min.diaSemana], ['20260904', '04-09-2026', '09:30', 'Vie']);
  const cupo = parseCita({ UsuarioAps: { NombreFormateado: 'X Y', FechaNacimiento: '20000104 000000' }, Cupos: [{ TipoAtencion: 'Consulta Médica', Descripcion: 'Citado por:Secretaria SOME\nN°Solicitud de Interconsulta: 21450480' }], EsCitaInterconsulta: 1, Tag: { Nombre: 'Confirmado' }, Razon: 'Control', TipoDeAtencion: { Nombre: '' } });
  assert.deepEqual([cupo.tipoAtencion, cupo.estado, cupo.razon, cupo.dob], ['Consulta Médica', 'Confirmado', 'Control', '04-01-2000'], 'sin TipoDeAtencion, el tipo sale del cupo; la fecha de nacimiento tiene dos nombres');
  assert.deepEqual([cupo.icCitadoPor, cupo.icSIC], ['Secretaria SOME', '21450480']);
  const noIC = parseCita({ UsuarioAps: { NombreFormateado: 'X Y' }, Cupos: [{ Descripcion: 'Citado por: Alguien' }], EsCitaInterconsulta: 0 });
  assert.deepEqual([noIC.icCitadoPor, noIC.icSIC], ['', ''], 'sin bandera de interconsulta, el cupo no se lee');
  const tel = parseCita({ UsuarioAps: { NombreFormateado: 'X Y', Telefonos: [{ TelefonoDescripcion: '9 1111 1111' }, { TelefonoDescripcion: '9 2222 2222', Eliminado: true }, { TelefonoDescripcion: '' }, { TelefonoDescripcion: '9 3333 3333' }], Georeferencias: [{ DireccionFormateada: 'Calle 1' }] } });
  assert.equal(tel.telefono, '9 1111 1111 / 9 3333 3333');
  assert.equal(tel.direccion, 'Calle 1');
});

test('parseDiagnostico: clasificación y certeza, nombre con espacios, código y ENO', () => {
  const d = parseDiagnostico({ DescripcionClasificacion: 'Bronquitis aguda- (Confirmada)', DescripcionDiagnostico: 'Bronquitis   aguda ', CodigoCIE10: 'J20.9', EsENO: true });
  assert.deepEqual([d.clasificacion, d.certeza, d.nombre, d.codigo, d.esENO], ['Bronquitis aguda', 'Confirmada', 'Bronquitis aguda', 'J20.9', true]);
  assert.deepEqual(parseDiagnostico({ DescripcionClasificacion: 'Lumbago -(Sospecha)' }).certeza, 'Sospecha');
  const sin = parseDiagnostico({ DescripcionClasificacion: 'Sin paréntesis' });
  assert.deepEqual([sin.clasificacion, sin.certeza, sin.codigo, sin.esENO, sin.nombre], ['Sin paréntesis', '', '', false, 'Sin paréntesis'], 'sin descripción propia, el nombre es la clasificación');
});

test('parseAtencion: banderas, actividades, adjuntos y órdenes internas con sus valores por defecto', () => {
  const a = parseAtencion({ Id: 1, Fecha: '20260904 101500', FuncionariosPrestadores: [], Diagnosticos: [],
    Actividades: [{ Descripcion: '12Consulta' }, { CodigoActividad: '0101', Descripcion: '0101 Consulta médica', Instrumento: 'Médico', EsProcedimiento: true, EsVacuna: 1 }, {}],
    ArchivosAdjunto: [{ NombreArchivo: 'informe.pdf' }],
    EsDiada: 1, EsOdontologica: true, EsVacuna: 'x',
    OrdenesAtencionInterna: [
      { Id: 1, Motivo: '  Control   con exámenes ', FechaSugerida: '20261001 000000', CuantosDiasMas: 30, PrioridadAlta: 1, FechaDescarte: '20260905 000000' },
      { Id: 2, FechaSugerida: '00010101 000000', FechaDescarte: '00010101 000000' },
      { Id: 3, EsBorrado: true, FechaSugerida: '20261001 000000' },
      { Id: 4 },
    ] });
  assert.deepEqual([a.idCita, a.dob, a.edad, a.edadLabel, a.esDiada, a.esOdontologica, a.esVacuna, a.esUrgencia], [0, '', null, '', true, true, true, false]);
  assert.deepEqual(a.actividades.map(x => [x.codigo, x.descripcion, x.instrumento, x.esProcedimiento, x.esVacuna]),
    [['', '12Consulta', '', false, false], ['0101', 'Consulta médica', 'Médico', true, true], ['', '', '', false, false]], 'el número inicial sólo se quita si lo sigue un espacio');
  assert.deepEqual(a.adjuntos, [{ nombre: 'informe.pdf', path: '' }]);
  assert.equal(a.proximoControl.length, 3, 'la borrada no cuenta; OrdenesAtencionInterna es el nombre alterno');
  assert.deepEqual(a.proximoControl[0], { id: 1, motivo: 'Control con exámenes', fecha8: '20261001', fecha: '01-10-2026', dias: 30, prioritario: true, descartada: true });
  assert.deepEqual(a.proximoControl[1], { id: 2, motivo: '', fecha8: '', fecha: '', dias: 0, prioritario: false, descartada: false }, 'el centinela no es fecha ni descarte');
  assert.deepEqual(a.proximoControl[2], { id: 4, motivo: '', fecha8: '', fecha: '', dias: 0, prioritario: false, descartada: false });
  assert.equal(parseAtencion({ ...ATENCION, FechaCita: '20260828 090000x' }).fecha8, '20260902', 'una FechaCita malformada no reemplaza a la fecha de guardado');
  assert.equal(parseAtencion({ ...ATENCION, IdCita: 5 }).idCita, 5);
});

test('CITA_KNOWN_FIELDS contiene exactamente los campos que parseCita lee', () => {
  assert.deepEqual([...CITA_KNOWN_FIELDS].sort(), ['Cupos', 'EsCitaInterconsulta', 'FechaHoraInicio', 'FechaHoraTermino', 'Id', 'Razon', 'Tag', 'TipoDeAtencion', 'UsuarioAps']);
});
