import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseFichaAtencion, describe, parseAntecedentes, parseProgramas, parseMaster, textosLibres } from '../src/core/ficha.js';

test('parseMaster maps the UsuarioApsRut record (contact, family, prevision, flags)', () => {
  const m = parseMaster({
    Id: 2113572, NumeroDeFicha: '176166002', Rut: '176166002', NombreFormateado: 'Paciente Prueba', NombreAlQueResponde: 'Pau',
    FechaDeNacimiento: '19910814 000000', Sexo: { Nombre: 'Mujer' }, Genero: { Nombre: 'Femenina' },
    ConvenioPrevisional: { Nombre: 'Fonasa C' }, EMail: 'p@x.cl', EstaActivo: true, EsCuidador: true,
    Familia: { CodigoDeFamiliaCompleto: 'HR005070' }, ParentescoConJefeDeFamilia: { Nombre: 'Hijo(a)' },
    Ocupacion: { Nombre: 'Desconocido' }, Nacionalidad: { Nombre: 'Chilena' }, GrupoEtnico: { Nombre: 'Ninguno' },
    Telefonos: [{ TelefonoDescripcion: '99999999', Eliminado: false }, { TelefonoDescripcion: '11111111', EsBorrado: true }],
    Georeferencias: [{ DireccionFormateada: 'Calle HOTU MATUA 1111' }], Direccion: 'HOTU MATUA Block Depto',
    FechaInscripcion: '19980604 000000', FechaDeFallecimiento: '00010101 000000', IdNodo: 1196,
  });
  assert.equal(m.idUsp, 2113572);
  assert.equal(m.run, '17.616.600-2');
  assert.equal(m.dob, '14-08-1991');
  assert.equal(m.prevision, 'Fonasa C');
  assert.equal(m.telefonos, '99999999', 'deleted phones are skipped');
  assert.equal(m.direccion, 'Calle HOTU MATUA 1111', 'geo-referenced address wins over the raw one');
  assert.equal(m.familia, 'HR005070');
  assert.equal(m.parentesco, 'Hijo(a)');
  assert.equal(m.fallecido, '', 'sentinel date means alive');
  assert.equal(m.cuidador, true);
  assert.equal(m.nodoInscripcion, 1196);
  assert.equal(parseMaster(null), null);
});

/** One per-patient HistorialAtencion item — real keys from the "FICHA 2 SEPT" HAR, synthetic values. */
const RAW = {
  Id: 736708184, Fecha: '20260828 121550', RutPaciente: '25106217k', NombreCompleto: 'Paciente Prueba',
  EdadExacta: 35010203, FechaNacimiento: '19910814 000000', IdSexo: 2, TipoDeAtencion: 'CRONICO PSCV',
  Anamnesis: [{ MotivoConsulta: 'Control HTA', HistoriaEnfermedadActual: 'Asintomática. PA 130/80.' }],
  Diagnosticos: [{ DescripcionClasificacion: 'Hipertensión esencial (primaria)- (Confirmada)', DescripcionDiagnostico: 'HTA' }],
  Actividades: [{ CodigoActividad: 'CMMI', Descripcion: '1 Consulta Médica Medicina Interna', Instrumento: 'Médico' }],
  Prescripciones: [{ Descripcion: 'Losartan Potasico 50 mg Comprimidos : 1 Comprimido cada 12 horas por 12 meses de la Receta Nº 593522430  ', IdReceta: 593522430, EsExterna: false, Observacion: '', Suspendido: false, Id: 1 }],
  Recetas: [{ TipoReceta: 'Otras Crónicas', EstadoReceta: 'Pendiente', IdEstado: 3, FechaGeneracion: '20260828 121550', FechaProximoDespacho: '20260928 235959', FechaDespacho: '00010101 000000', EsExterna: false, EsIniciativaHearts: false, Id: 593522430 }],
  OrdenAtencionInterna: [{ FechaEmision: '20260828 121628', CuantosDiasMas: 70, Motivo: 'Control en noviembre con examenes de sangre con Dr Opazo ', PrioridadAlta: false, Estado: 1, FechaSugerida: '20261106 121626', FechaDescarte: '00010101 000000', Id: 20612214 }],
  OrdenAtencionPruebaDiagnostica: [{ Descripcion: 'MAMOGRAFIA BILATERAL (4 EXP.)', IdTipoPrueba: 2, Estado: 'Nueva', Id: 10121235 }],
  EspecialidadesDerivadas: [{ Descripcion: 'Cirugía General', TieneContrarreferencias: false, Id: 21418832 }],
  FuncionariosPrestadores: [{ Id: 439550, NombreCompleto: 'Opazo Damiani Daniel', NombreInstrumento: 'Médico' }],
};

test('parseFichaAtencion maps every captured section with exact labels', () => {
  const v = parseFichaAtencion(RAW);
  assert.equal(v.anamnesis.motivo, 'Control HTA');
  assert.deepEqual(Object.keys(v.sections).sort(), ['derivaciones', 'prescripciones', 'proximoControl', 'pruebas', 'recetas']);

  const rx = v.sections.prescripciones[0];
  assert.equal(rx.label, 'Losartan Potasico 50 mg Comprimidos : 1 Comprimido cada 12 horas por 12 meses');
  assert.deepEqual(rx.details, ['Receta Nº 593522430']);
  assert.equal(rx.suspendido, false);

  const rec = v.sections.recetas[0];
  assert.equal(rec.label, 'Receta Nº 593522430 · Otras Crónicas');
  assert.deepEqual(rec.details, ['Pendiente', 'emitida 28-08-2026', 'próx. despacho 28-09-2026']);

  const ctrl = v.sections.proximoControl[0];
  assert.equal(ctrl.label, 'Control en noviembre con examenes de sangre con Dr Opazo');
  assert.deepEqual(ctrl.details, ['sugerido 06-11-2026 (+70 d)']);

  assert.deepEqual(v.sections.pruebas[0], { label: 'MAMOGRAFIA BILATERAL (4 EXP.)', details: ['Nueva'], raw: RAW.OrdenAtencionPruebaDiagnostica[0] });
  assert.equal(v.sections.derivaciones[0].label, 'Cirugía General');
});

test('parseFichaAtencion flags suspended prescriptions', () => {
  const v = parseFichaAtencion({ ...RAW, Prescripciones: [{ ...RAW.Prescripciones[0], Suspendido: true }] });
  assert.ok(v.sections.prescripciones[0].details.includes('SUSPENDIDO'));
  assert.equal(v.sections.prescripciones[0].suspendido, true);
});

test('parseFichaAtencion tolerates an item with no clinical sections', () => {
  const v = parseFichaAtencion({ Id: 1, Fecha: '20260901 100000', RutPaciente: '292421311', Diagnosticos: [] });
  assert.deepEqual(v.sections, {});
  assert.equal(v.anamnesis.motivo, '');
});

test('parseAntecedentes extracts drugs in use, morbid history, and only patient-owned allergy rows', () => {
  const a = parseAntecedentes({
    antecedenteMedicoPersonal: [
      { EsMorbido: false, Diagnostico: 'Hipertensión arterial', Fecha: '20260714 145446', Seleccionado: true, EsBorrado: false },
      { EsMorbido: true,  Diagnostico: 'Descartado', Fecha: '20260714 145446', Seleccionado: false },
    ],
    farmacoEnUsos: { medications: [{ Descripcion: 'Losartan Potasico 50 mg Comprimidos : 1 Comprimido cada 12 horas por 12 meses \n Nº Receta: 593522430. Estado Receta: Pendiente', DescripcionArticulo: 'Losartan Potasico 50 mg Comprimidos ', IdReceta: 593522430, FechaReceta: '20260828 121550', EsHearts: true }] },
    alergia: { reaccionAdversa: [{ Nombre: 'Exantema', Id: 1 }], alergiasUsuario: [{ IdUsuarioAps: 129994, Descripcion: 'Penicilina', EsBorrado: false }] },
    eventoAdverso: { categories: [{ Descripcion: 'Caída' }] },
  });
  assert.equal(a.farmacos.length, 1);
  assert.equal(a.farmacos[0].label, 'Losartan Potasico 50 mg Comprimidos');
  assert.equal(a.farmacos[0].posologia, '1 Comprimido cada 12 horas por 12 meses');
  assert.equal(a.farmacos[0].estado, 'Pendiente');
  assert.equal(a.farmacos[0].hearts, true);
  assert.deepEqual(a.morbidos, [{ label: 'Hipertensión arterial', fecha: '14-07-2026', morbido: false }]);
  assert.deepEqual(a.alergias.map(x => x.label), ['Penicilina'], 'catalog rows without IdUsuarioAps are ignored');
  assert.deepEqual(a.eventosAdversos, []);
  assert.deepEqual(parseAntecedentes(null).farmacos, []);
});

test('parseProgramas keeps the latest event per programme', () => {
  const p = parseProgramas([
    { IdPrograma: 1,  NombrePrograma: 'Regulación Fecundidad', Estado: 1, FechaHora: '20080605 111316' },
    { IdPrograma: 1,  NombrePrograma: 'Regulación Fecundidad', Estado: 4, FechaHora: '20080707 042816' },
    { IdPrograma: 32, NombrePrograma: 'Cáncer Cervicouterino', Estado: 1, FechaHora: '20260101 000000' },
  ]);
  assert.equal(p.length, 2);
  assert.equal(p[0].nombre, 'Cáncer Cervicouterino');
  assert.equal(p[0].vigente, true);
  assert.equal(p[1].estado, 4);
  assert.equal(p[1].vigente, false);
});

test('describe falls back to the first meaningful string field', () => {
  assert.equal(describe({ Id: 9, EsBorrado: false, TimeStamp: 'x', Glosa: 'Reposo 3 días' }).label, 'Reposo 3 días');
  assert.equal(describe({ Id: 9, AlgoRaro: 'Valor libre' }).label, 'Valor libre');
  assert.equal(describe({ Id: 9 }).label, '(sin descripción)');
  assert.equal(describe({ Tipo: { Nombre: 'Receta magistral' } }).label, 'Receta magistral');
  assert.deepEqual(describe({ Nombre: 'X', FechaInicio: '20260901 000000' }).details, ['FechaInicio: 01-09-2026']);
});

test('textosLibres rescata la evolución y el examen físico de una atención de urgencia sin sección conocida', () => {
  const a = {
    Id: 9, Motivo: 'Consulta', FechaAtencion: '20260731 105900', NombreFuncionario: 'Juana Luna Atamu',
    Anamnesis: [{ MotivoConsulta: 'Cefalea', HistoriaEnfermedadActual: '', Evolucion: 'Paciente evoluciona sin cefalea tras analgesia, sin focalidad.', ExamenFisico: 'Vigil, orientado, sin signos meníngeos.' }],
    EpisodioAtencion: [{ Categorizacion: 'C3 · sin riesgo vital, atención diferible', IdEpisodio: 12 }],
    Indicaciones: [{ Descripcion: 'Hidratación, dieta liviana y control en policlínico' }],
    Observaciones: 'Sin observaciones de enfermería relevantes',
  };
  const x = textosLibres(a);
  assert.deepEqual(x.map(e => e.label), ['Evolución', 'Examen físico', 'Categorización', 'Observaciones']);
  assert.equal(x[0].text, 'Paciente evoluciona sin cefalea tras analgesia, sin focalidad.');
  const v = parseFichaAtencion(a);
  assert.equal(v.extras.length, 4);
  assert.ok(!v.extras.some(e => /Indicaciones|Motivo|Nombre/.test(e.key)), 'lo que ya tiene sección o es identidad no se repite');
});
