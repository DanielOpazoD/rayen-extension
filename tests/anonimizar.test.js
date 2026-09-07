import { test } from 'node:test';
import assert from 'node:assert/strict';
import { anonimizar, resumenInforme, detectarRestos } from '../src/core/anonimizar.js';

const muestra = () => ({
  Id: 500439, IdUsuarioAps: 77123, Rut: '14407675-3', NombreFormateado: 'Napoleón Alexis Icka Pakarati',
  Nombres: 'Napoleón Alexis', ApellidoPaterno: 'Icka', ApellidoMaterno: 'Pakarati',
  FechaDeNacimiento: '19700215 000000', Sexo: { Id: 2, Nombre: 'Hombre' },
  EMail: 'napo@example.cl', Telefonos: [{ TelefonoDescripcion: '+56 9 8765 4321', Eliminado: false }],
  Georeferencias: [{ DireccionFormateada: 'Atamu Tekena 123, Hanga Roa', Latitud: -27.15, Longitud: -109.43 }],
  Atenciones: [{
    Id: 9001, IdUsuarioAps: 77123, FechaAtencion: '20260731 105900', FechaDescarte: '00010101 000000',
    Funcionario: 'Juana Luna Atamu', Prestadores: [{ Id: 439554, NombreCompleto: 'Juana Luna Atamu', NombreInstrumento: 'Médico' }],
    Diagnosticos: [{ Id: 1, Codigo: 'I10', Descripcion: 'Hipertensión arterial crónica' }],
    Anamnesis: [{ MotivoConsulta: 'Cefalea', Evolucion: 'Sr. Icka Pakarati, RUT 14.407.675-3, evoluciona bien. Contacto hija 987654321 y napo@example.cl. Dra. Luna indica control.' }],
    Especialidad: { Id: 12, Nombre: 'Medicina Interna' },
  }],
});

test('anonimizar borra nombres, RUT, contactos y direcciones, y conserva catálogos y estructura', () => {
  const { data, informe, verificado, restos } = anonimizar(muestra(), { desplazamientoDias: 10 });
  assert.equal(verificado, true, `restos: ${restos.join(', ')}`);
  assert.equal(data.NombreFormateado, '<nombre>'); assert.equal(data.ApellidoPaterno, '<apellido>'); assert.equal(data.Rut, '<rut>');
  assert.equal(data.EMail, '<contacto>'); assert.equal(data.Telefonos[0].TelefonoDescripcion, '<contacto>'); assert.equal(data.Telefonos[0].Eliminado, false);
  assert.equal(data.Georeferencias[0].DireccionFormateada, '<direccion>'); assert.equal(data.Georeferencias[0].Latitud, 0);
  assert.equal(data.Sexo.Nombre, 'Hombre', 'el catálogo Sexo no es una persona');
  assert.equal(data.Atenciones[0].Especialidad.Nombre, 'Medicina Interna');
  assert.equal(data.Atenciones[0].Diagnosticos[0].Descripcion, 'Hipertensión arterial crónica');
  assert.equal(data.Atenciones[0].Funcionario, '<nombre>'); assert.equal(data.Atenciones[0].Prestadores[0].NombreCompleto, '<nombre>');
  assert.equal(data.Atenciones[0].Prestadores[0].NombreInstrumento, 'Médico');
  const txt = data.Atenciones[0].Anamnesis[0].Evolucion;
  assert.equal(txt, 'Sr. <nombre>, RUT <rut>, evoluciona bien. Contacto hija <fono> y <email>. Dra. <nombre> indica control.');
  assert.ok(informe.nombres >= 6 && informe.ruts >= 2 && informe.contactos >= 4 && informe.direcciones >= 3);
  assert.match(resumenInforme(informe), /nombres · .*RUT/);
});

test('los identificadores se sustituyen de forma consistente y las fechas conservan sus intervalos', () => {
  const { data } = anonimizar(muestra(), { desplazamientoDias: 10 });
  assert.notEqual(data.IdUsuarioAps, 77123);
  assert.equal(data.IdUsuarioAps, data.Atenciones[0].IdUsuarioAps, 'mismo valor → mismo seudónimo');
  assert.notEqual(data.Id, data.IdUsuarioAps);
  assert.equal(data.Atenciones[0].Diagnosticos[0].Codigo, 'I10', 'los códigos clínicos no son identificadores');
  assert.equal(data.Atenciones[0].FechaAtencion, '20260721 105900');
  assert.equal(data.FechaDeNacimiento, '19700205 000000');
  assert.equal(data.Atenciones[0].FechaDescarte, '00010101 000000', 'el centinela de Rayen no se toca');
});

test('el desplazamiento por defecto es aleatorio y no aparece en el resultado', () => {
  const a = anonimizar({ Fecha: '20260904 120000' }), b = anonimizar({ Fecha: '20260904 120000' });
  assert.ok(a.data.Fecha !== '20260904 120000' && b.data.Fecha !== '20260904 120000');
  assert.ok(!('desplazamientoDias' in a) && !JSON.stringify(a).includes('desplazamiento'));
});

test('un nombre en texto libre se detecta si lleva tratamiento delante', () => {
  // Un nombre metido en una clave que no es de persona ni texto libre con espacios: «Observacion» es texto libre y se limpia;
  // forzamos el fallo con un token que el tokenizador no pudo recoger porque la persona sólo aparece en texto libre.
  const r = anonimizar({ Nota: 'Paciente Tuki refiere dolor', Apellidos: 'Tuki' }, { desplazamientoDias: 1 });
  assert.equal(r.verificado, true);
  const r2 = anonimizar({ Nota: 'Paciente Tuki refiere dolor' }, { desplazamientoDias: 1 });
  assert.equal(r2.data.Nota, 'Paciente <nombre> refiere dolor', 'la segunda pasada lo reconoce por el tratamiento «Paciente»');
  assert.equal(r2.verificado, true);
});

test('tokens con acento se borran sin importar mayúsculas ni acentos, y las palabras cortas no se tocan', () => {
  const r = anonimizar({ NombreCompleto: 'María José Pakarati Tepano', Nota: 'MARIA jose y pakarati tepano vinieron; la maría luna no.' }, { desplazamientoDias: 1 });
  assert.equal(r.data.Nota, '<nombre> y <nombre> vinieron; la <nombre> luna no.');
  assert.equal(r.verificado, true);
});

test('si un nombre sobrevive donde el recorrido no llega (una clave), verificado es false y se nombra', () => {
  const r = anonimizar({ NombreCompleto: 'Rosa Tuki', 'Rosa Tuki': { visitas: 3 } }, { desplazamientoDias: 1 });
  assert.equal(r.verificado, false);
  assert.deepEqual(r.restos, ['Rosa', 'Tuki']);
});

test('el anonimizador responde en tiempo lineal ante textos largos sin arroba ni dígitos separados', () => {
  const largo = { NombreCompleto: 'Rosa Tuki', Texto: 'a'.repeat(200_000), Digitos: '9'.repeat(200_000) };
  const t0 = Date.now(); anonimizar(largo, { desplazamientoDias: 1 });
  assert.ok(Date.now() - t0 < 4000, `tardó ${Date.now() - t0} ms`); // cuadrático eran 80 s; el margen absorbe una máquina cargada
});

test('segunda pasada: RUN pegado con verificador válido, teléfonos en todos los formatos y fechas dentro del texto', () => {
  const r = anonimizar({ Texto: 'RUN 56785678K y 56785678-K y 6543210-2; llama al 56987654321, (+56) 9-8765-4321, 9 8765 4321 o al fijo 32 2100000; nació el 18/11/1963, control 4-9-2026 y alta 20260901; id 12345678 no es RUN.' }, { desplazamientoDias: 10 });
  const t = r.data.Texto;
  assert.ok(!/56785678|6543210/.test(t), 'RUN pegado y con guion fuera');
  assert.ok(!/8765|2100000/.test(t), 'teléfonos fuera');
  assert.match(t, /nació el 08\/11\/1963/); assert.match(t, /control 25-8-2026|control 25-08-2026/); assert.match(t, /alta 20260822/);
  assert.match(t, /id 12345678 no es RUN/, 'ocho dígitos sin verificador válido se quedan');
  assert.equal(r.verificado, true, r.restos.join(', '));
});

test('segunda pasada: personas tras tratamiento o parentesco y en claves por subcadena o de rol', () => {
  const r = anonimizar({
    Nota: 'Hija Vaitiare Pakarati acompaña; Dra. Paula Tepano indica control; Dr. Riroroko en turno. Paciente refiere dolor.',
    MedicoTratante: 'Dr. Juan Pérez', NombreCompletoPaciente: 'ROSA TUKI', numDocumentoCompleto: '0119570018', Titular: 'María José Hotus', Glosa: 'Paciente Rosa Tuki refiere cefalea',
    NombreExamen: 'Hemograma completo', Diagnostico: 'Hipertensión Arterial Esencial', Sexo: { Nombre: 'Mujer' },
  }, { desplazamientoDias: 1 });
  const d = r.data;
  assert.equal(d.Nota, 'Hija <nombre> acompaña; Dra. <nombre> indica control; Dr. <nombre> en turno. Paciente refiere dolor.');
  assert.equal(d.MedicoTratante, '<nombre>'); assert.equal(d.NombreCompletoPaciente, '<nombre>'); assert.equal(d.numDocumentoCompleto, '<rut>'); assert.equal(d.Titular, '<nombre>');
  assert.equal(d.Glosa, 'Paciente <nombre> refiere cefalea');
  assert.equal(d.NombreExamen, 'Hemograma completo', 'los catálogos se conservan'); assert.equal(d.Diagnostico, 'Hipertensión Arterial Esencial'); assert.equal(d.Sexo.Nombre, 'Mujer');
  assert.equal(r.verificado, true, r.restos.join(', '));
});

test('la comprobación final es independiente: detecta lo que el recorrido no tocó', () => {
  assert.deepEqual(detectarRestos({ 'Sra. Rosa Tuki': 1 }), ['persona tras tratamiento o parentesco']);
  assert.deepEqual(detectarRestos({ x: 'ver 56785678K' }), ['RUT pegado']);
  assert.deepEqual(detectarRestos({ x: 'fono 56987654321' }), ['teléfono']);
  assert.deepEqual(detectarRestos({ x: 'nada que ver 12345678' }), []);
  assert.deepEqual(detectarRestos({ x: 'Sra. <nombre> vino' }), [], 'un marcador ya puesto no es un resto');
});

test('límite documentado: un tercero sin tratamiento ni parentesco en texto libre no se detecta', () => {
  const r = anonimizar({ Nota: 'coordinar con Carolina la próxima semana' }, { desplazamientoDias: 1 });
  assert.equal(r.data.Nota, 'coordinar con Carolina la próxima semana'); assert.equal(r.verificado, true);
});

test('regresión: una fecha-hora de Rayen cuyo octavo dígito valida como verificador no es un RUN pegado', () => {
  // 2026081-5 y 2027010-1 tienen verificador válido; como fecha con hora deben quedar como fecha (desplazada), no como <rut>.
  for (const fecha of ['20260815 080000', '20270101 235959']) {
    const r = anonimizar({ FechaAtencion: fecha, Anamnesis: [{ Evolucion: `Control el ${fecha}, sin novedades.` }] }, { desplazamientoDias: 0 });
    assert.equal(r.verificado, true, `${fecha}: la comprobación final no debe hablar de RUT pegado`);
    assert.deepEqual(r.restos, []);
    assert.equal(r.data.FechaAtencion, fecha, 'con desplazamiento 0 la fecha se conserva, no se convierte en <rut>');
    assert.ok(!JSON.stringify(r.data).includes('<rut>'));
  }
  // El RUN pegado real sigue detectándose, incluso si lo sigue un espacio y otra cosa.
  const real = anonimizar({ Texto: 'RUN 56785678K acude solo' }, { desplazamientoDias: 0 });
  assert.match(real.data.Texto, /<rut>/);
  assert.deepEqual(detectarRestos({ x: '20260815 080000' }), [], 'la comprobación final tampoco lo confunde');
});

// ── Bordes que la mutación mostró sin defender (Stryker, 05-09-2026: anonimizar.js 60 %) ──
const D = 1; // desplazamiento fijo: las fechas retroceden un día
const uno = (k, v, opts = { desplazamientoDias: D }) => anonimizar({ [k]: v }, opts).data[k];

test('regresión: una fecha de ocho dígitos suelta en el texto es una fecha, no un RUN pegado', () => {
  const r = anonimizar({ Evolucion: 'Control el 04/09/2026 y el 4-9-2026 y 20260904.' }, { desplazamientoDias: D });
  assert.equal(r.data.Evolucion, 'Control el 03/09/2026 y el 03-09-2026 y 20260903.');
  assert.equal(r.informe.ruts, 0);
  assert.equal(uno('Evolucion', 'RUN 56785678K y fecha 20260904'), 'RUN <rut> y fecha 20260903', 'el RUN pegado real sí se borra');
  assert.equal(uno('Evolucion', '04/09-2026'), '04/09-2026', 'separadores mezclados no son una fecha');
});

test('claves de RUT, contacto, dirección y secreto: cada alternativa borra, y las parecidas no', () => {
  for (const k of ['Rut', 'RUN', 'run', 'Dv', 'NumeroDocumento', 'numDocumentoCompleto', 'Pasaporte', 'RutPaciente']) assert.equal(uno(k, '1-9'), '<rut>', k);
  for (const k of ['Telefono', 'Fono', 'Celular', 'Movil', 'Email', 'EMail', 'Correo', 'Gmail']) assert.equal(uno(k, 'x'), '<contacto>', k);
  for (const k of ['Direccion', 'Domicilio', 'Calle', 'Villa', 'Poblacion', 'NumeroCasa', 'Depto', 'Georeferencia', 'Latitud', 'Longitud']) assert.equal(uno(k, 'x'), '<direccion>', k);
  assert.equal(uno('Latitud', -27.15), 0, 'una coordenada numérica pasa a 0');
  for (const k of ['Token', 'Authorization', 'Password', 'Clave', 'accessToken']) assert.equal(uno(k, 'x'), '<secreto>', k);
  // Casi iguales pero no: la clave se conserva tal cual (anclas ^ y $ de cada expresión).
  for (const k of ['Runt', 'Overrun', 'Dvd', 'Ldv', 'Recalled', 'Adepto', 'Clavel', 'Mailing', 'Fichas', 'Midfield', 'MiCodigoFamilia']) assert.equal(uno(k, 'abc7'), 'abc7', k);
  // Vacíos: no se cuentan ni se marcan.
  const v = anonimizar({ Rut: '', Telefono: 0, Direccion: '', Id: 0, Folio: '0' });
  assert.deepEqual(v.data, { Rut: '', Telefono: 0, Direccion: '', Id: 0, Folio: '0' });
  assert.deepEqual([v.informe.ruts, v.informe.contactos, v.informe.direcciones, v.informe.identificadores], [0, 0, 0, 0]);
});

test('identificadores: cada clave se renumera de forma estable, respetando el tipo; lo no numérico no se toca', () => {
  const ids = ['Id', 'IdUsuario', 'GuidX', 'XGuid', 'UsuarioId', 'Valid', 'CodigoFamilia', 'CodigoDeFamilia', 'NumeroFicha', 'NumeroDeFicha', 'Ficha', 'NumeroReceta', 'NumeroOrden', 'Folio', 'FolioX'];
  for (const k of ids) assert.equal(uno(k, 12345), 100001, k);
  const r = anonimizar({ A: { Id: 7, Ref: '7' }, B: { Id: 8, IdPadre: 7 } });
  assert.equal(r.data.A.Id, r.data.B.IdPadre, 'el mismo valor recibe el mismo sustituto en todo el documento');
  assert.notEqual(r.data.A.Id, r.data.B.Id);
  assert.equal(typeof r.data.A.Id, 'number');
  assert.equal(r.data.A.Ref, '7', 'una clave que no es identificador no se renumera');
  assert.equal(uno('Id', '00123'), '100001', 'un id textual sigue siendo texto');
  assert.equal(uno('Id', 'ABC-1'), 'ABC-1', 'un id no numérico se deja');
  assert.equal(anonimizar({ Id: 9 }).informe.identificadores, 1);
});

test('nombres por clave fuerte, por hermano de persona y por rol con valor que parece persona', () => {
  for (const k of ['Nombres', 'NombreCompleto', 'NombreFormateado', 'NombreSocial', 'NombreMadre', 'Funcionario', 'Medico', 'Paciente', 'Solicitante']) assert.equal(uno(k, 'Rosa Ejemplo'), '<nombre>', k);
  for (const k of ['Apellidos', 'ApellidoPaterno', 'ApellidoMaterno']) assert.equal(uno(k, 'Tuki'), '<apellido>', k);
  // «Nombre» a secas sólo es persona con un hermano que lo delate.
  for (const sib of ['Apellido', 'Rut', 'Run', 'FechaDeNacimiento', 'FechaNacimiento', 'Sexo', 'Instrumento', 'Profesion', 'EsPrestador', 'IdFuncionario', 'IdUsuario', 'NombreCompleto']) {
    assert.equal(anonimizar({ Nombre: 'Rosa Ejemplo', [sib]: 'x' }).data.Nombre, '<nombre>', `hermano ${sib}`);
  }
  for (const sib of ['Rutina', 'Corrun', 'Sexos', 'Codigo']) assert.equal(anonimizar({ Nombre: 'Mujer', [sib]: 'x' }).data.Nombre, 'Mujer', `hermano ${sib} no delata`);
  // Rol: el valor debe parecer una persona (2 a 5 palabras con mayúscula inicial, tratamiento aparte).
  const rol = v => uno('MedicoTratante', v);
  assert.equal(rol('Juan Pérez Soto'), '<nombre>');
  assert.equal(rol('Dr. Juan Pérez'), '<nombre>');
  assert.equal(rol('Juan de la Cruz'), '<nombre>', 'las partículas no rompen el patrón');
  for (const v of ['Sí', 'juan perez', 'Pérez', 'Uno Dos Tres Cuatro Cinco Seis']) assert.equal(rol(v), v, `«${v}» no parece persona`);
});

test('RUN con formato y pegado, teléfonos y correos en todas las formas que aparecen en Rayen', () => {
  const t = v => uno('Texto', v);
  for (const v of ['12.345.678-9', '12.345.6789', '1.234.567-K', '12345678-9', '56785678K', '56785678 K', '56785678k']) assert.equal(t(`RUN ${v} acude`), 'RUN <rut> acude', v);
  assert.equal(t('folio 123456-7'), 'folio 123456-7', 'seis dígitos con guion no son un RUN');
  for (const v of ['+56 9 1234 5678', '+56912345678', '9 1234 5678', '912345678', '56912345678', '32 212 3456', '2 212 3456', '9-1234-5678']) assert.equal(t(`llamar al ${v} hoy`), 'llamar al <fono> hoy', v);
  const parentesis = t('llamar al (+56) 9 1234 5678 hoy');
  assert.match(parentesis, /<fono>/); assert.doesNotMatch(parentesis, /\d{4}/, 'el prefijo entre paréntesis puede quedar, el número no');
  for (const v of ['a.b+c@dominio.cl', 'x@sub.dom.org', 'rosa_1@hospital-hr.cl']) assert.equal(t(`correo ${v} ok`), 'correo <email> ok', v);
});

test('fechas: cada formato se desplaza, el cambio de mes se respeta y antes de 1900 no se toca', () => {
  assert.equal(uno('F', '20260904 101010'), '20260903 101010');
  assert.equal(uno('F', '20260904'), '20260903');
  assert.equal(uno('F', '2026-09-04'), '2026-09-03');
  assert.equal(uno('F', '2026-09-04T10:00:00Z'), '2026-09-03T10:00:00Z');
  assert.equal(uno('F', '2026-09-04T10:00:00.000+03:00'), '2026-09-03T10:00:00.000+03:00');
  assert.equal(uno('F', '04-09-2026'), '03-09-2026');
  assert.equal(uno('F', '04-09-2026 10:30'), '03-09-2026 10:30');
  assert.equal(uno('F', '20260201 000000'), '20260131 000000', 'cruza el mes hacia atrás');
  assert.equal(uno('F', '20260301 000000', { desplazamientoDias: 60 }), '20251231 000000', 'sesenta días cruzan el año');
  assert.equal(uno('F', '18991231 000000'), '18991231 000000', 'anterior a 1900: centinela, no se toca');
  assert.equal(uno('F', '19000101 000000'), '18991231 000000', '1900 sí se desplaza');
  assert.equal(uno('F', '2026-9-4'), '2026-9-4', 'sin ceros no es una fecha ISO');
  assert.equal(anonimizar({ F: '20260904' }, { desplazamientoDias: 0 }).informe.fechas, 0, 'sin desplazamiento no se cuenta');
  assert.equal(anonimizar({ F: '20260904' }, { desplazamientoDias: 1 }).informe.fechas, 1);
});

test('tokens del nombre: partículas y palabras de dos letras no se persiguen, los tratamientos se quitan, las listas también aportan', () => {
  const r = anonimizar({ NombreFormateado: 'María de la Cruz Li', Familiares: [{ NombreCompleto: 'Pedro Atamu' }], Texto: 'la casa de la esquina; María y Li y Pedro; Sra. Atamu también' }, { desplazamientoDias: 0 });
  assert.equal(r.data.Texto, 'la casa de la esquina; <nombre> y Li y <nombre>; Sra. <nombre> también');
  const m = anonimizar({ NombreMadre: 'Sra. Rosa Tuki', Texto: 'Sra habla; Rosa Tuki también' }, { desplazamientoDias: 0 });
  assert.equal(m.data.Texto, 'Sra habla; <nombre> también', '«Sra.» no se vuelve token; «Rosa Tuki» colapsa en un marcador');
  const tres = anonimizar({ NombreFormateado: 'Rosa Ejemplo Tuki', Texto: 'vino Rosa Ejemplo Tuki hoy' }, { desplazamientoDias: 0 });
  assert.equal(tres.data.Texto, 'vino <nombre> hoy', 'tres palabras seguidas son un solo marcador');
  assert.equal(anonimizar({ Texto: 'sin personas' }).informe.textos, 0);
  assert.equal(tres.informe.textos, 1);
});

test('el recorrido conserva lo que no es dato de persona: booleanos, nulos, números y estructura', () => {
  const r = anonimizar({ Activo: true, Nada: null, Falta: undefined, Peso: 72.5, Lista: [1, 'texto', { Id: 3 }], Nombre: 'Consulta' }, { desplazamientoDias: 0 });
  assert.deepEqual(r.data, { Activo: true, Nada: null, Falta: undefined, Peso: 72.5, Lista: [1, 'texto', { Id: 100001 }], Nombre: 'Consulta' });
});

test('informe y resumen: cada contador cuenta lo suyo, exactamente', () => {
  const r = anonimizar({ Rut: '1-9', Telefono: '9', Direccion: 'Calle 1', Id: 5, Token: 't', Fecha: '20260904 000000', Anamnesis: [{ Evolucion: 'Sra. Rosa Tuki vino' }], NombreFormateado: 'Rosa Tuki' }, { desplazamientoDias: D });
  assert.deepEqual(r.informe, { nombres: 1, ruts: 1, contactos: 1, direcciones: 1, identificadores: 1, fechas: 1, textos: 1, secretos: 1 });
  assert.equal(resumenInforme({ nombres: 1, ruts: 2, contactos: 0, direcciones: 3, identificadores: 4, fechas: 5, textos: 6, secretos: 7 }), '1 nombres · 2 RUT · 3 direcciones · 4 identificadores · 5 fechas desplazadas · 6 textos con nombres · 7 secretos');
  assert.equal(resumenInforme({ nombres: 0, ruts: 0, contactos: 0, direcciones: 0, identificadores: 0, fechas: 0, textos: 0, secretos: 0 }), 'nada que anonimizar');
  assert.deepEqual(detectarRestos({ a: '12.345.678-9', b: 'x@y.cl', c: 'Sra. Rosa Tuki', d: '9 1234 5678' }), ['persona tras tratamiento o parentesco', 'RUT con formato', 'correo', 'teléfono']);
});
