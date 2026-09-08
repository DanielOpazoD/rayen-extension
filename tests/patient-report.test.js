import { test } from 'node:test';
import assert from 'node:assert/strict';
import { filterVisitsByScope, buildPatientReport, SCOPE_LABEL, isMedicalVisit, isMedico } from '../src/core/patient-report.js';
import { ageBucket } from '../src/ui/charts.js';
import { CONFIG } from '../src/core/config.js';

const ME = CONFIG.officerId;
const v = (id, prestadores, extra = {}) => ({
  id, fechaAtencion: '01-09-2026', fecha8: '20260901', hora: '10:00', tipoAtencion: 'Control',
  prestadores, diagnosticos: [], actividades: [], sections: {}, anamnesis: { motivo: '', historia: '' }, ...extra,
});
const yo   = v(1, [{ id: ME, nombre: 'Opazo Damiani Daniel', instrumento: 'Médico' }]);
const otro = v(2, [{ id: 5, nombre: 'Otra Médica', instrumento: 'Médico' }]);
const kine = v(3, [{ id: 6, nombre: 'Kine Uno', instrumento: 'Kinesiólogo(a)' }]);
const agenda = v(4, []); // agenda-only row: no prestadores

test('filterVisitsByScope: todos / médicos / solo yo', () => {
  const all = [yo, otro, kine, agenda];
  assert.deepEqual(filterVisitsByScope(all, 'todos').map(x => x.id),   [1, 2, 3, 4]);
  assert.deepEqual(filterVisitsByScope(all, 'medicos').map(x => x.id), [1, 2, 4], 'kine excluded; agenda rows count as the officer');
  assert.deepEqual(filterVisitsByScope(all, 'yo').map(x => x.id),      [1, 4]);
});

test('buildPatientReport falls back to the agenda when the ficha is not loaded and says so', () => {
  const cur = { record: { nombre: 'Paciente Prueba', runStr: '1-K', dob: '01-01-1990', edad: 36, sexo: 'Mujer', prevision: 'Fonasa B' },
                visits: [agenda], sics: [], ficha: null };
  const { fragment, css } = buildPatientReport(cur, 'yo');
  assert.match(fragment, /Paciente Prueba/);
  assert.match(fragment, /ficha no cargada/);
  assert.match(fragment, new RegExp(SCOPE_LABEL.yo.replace('·', '·')));
  assert.ok(css.includes('@page'));
});

test('buildPatientReport: interconsultas scope renders the clinical SIC without administrative metadata', () => {
  const sic = { id: 9, fecha: '10-08-2026', especialidad: 'Reumatología', estado: 'Atendido', grupo: 'atendida', esAuge: true,
    registrador: { nombre: 'Opazo Damiani Daniel' }, ejecutor: { nombre: 'Mezzano Rojas Carla' }, motivo: 'Confirmación', diagnostico: 'AR', cie10: 'M06.9',
    fundamentos: 'Dolor poliarticular', examenes: '' };
  const cur = { record: { nombre: 'Paciente Prueba Uno', runStr: '', dob: '', sexo: '', prevision: '' }, visits: [], sics: [sic], ficha: { visits: [yo], master: null, antecedentes: { farmacos: [] } } };
  const { fragment } = buildPatientReport(cur, 'ic');
  assert.match(fragment, /Interconsultas · 1/);
  assert.match(fragment, /M06\.9/);
  assert.doesNotMatch(fragment, /contrarreferencia/i);
  assert.doesNotMatch(fragment, /Atenciones · /, 'ic scope has no atenciones section');
});

test('buildPatientReport: completo includes atenciones, IC and fármacos', () => {
  const cur = { record: { nombre: 'Paciente Prueba Uno', runStr: '', dob: '', sexo: '', prevision: '' }, visits: [], sics: [],
    ficha: { visits: [yo, otro], master: { ficha: '123', dob: '01-01-1990', sexo: 'Mujer', prevision: 'Fonasa A', telefonos: '9' },
             antecedentes: { farmacos: [{ label: 'Losartán 50 mg', posologia: '1 c/12 h', estado: 'Pendiente', fecha: '28-08-2026', hearts: true }] } } };
  const { fragment } = buildPatientReport(cur, 'completo');
  assert.match(fragment, /todos los profesionales · 2/);
  assert.match(fragment, /Losartán 50 mg/);
  assert.match(fragment, /N° ficha/);
});

test('ageBucket follows clinical brackets and tolerates bad input', () => {
  assert.deepEqual([0, 3, 7, 12, 17, 30, 50, 80].map(ageBucket), ['<1','1–4','5–9','10–14','15–19','20–44','45–64','65+']);
  assert.equal(ageBucket(null), null);
  assert.equal(ageBucket('x'), null);
});

// Panel: pestañas internas Medicina / Otros. Decide por el instrumento del
// prestador; «Técnico Paramédico» y «Tecnólogo Médico» no son médicos.
test('isMedicalVisit separa profesional médico de otros profesionales', () => {
  const v = (instrumento, tipoAtencion = '') => ({ prestadores: instrumento ? [{ id: 1, nombre: 'Médico Prueba Uno', instrumento }] : [], tipoAtencion });
  assert.equal(isMedicalVisit(v('Médico')), true);
  assert.equal(isMedicalVisit(v('Médico Cirujano')), true);
  assert.equal(isMedicalVisit(v('Matrona')), false);
  assert.equal(isMedicalVisit(v('Kinesiólogo')), false);
  assert.equal(isMedicalVisit(v('Técnico Paramédico')), false);
  assert.equal(isMedicalVisit(v('Tecnólogo Médico')), false);
  assert.equal(isMedico({ instrumento: 'Nutricionista' }), false);
  assert.equal(isMedicalVisit(v('', 'Consulta Médica')), true);
  assert.equal(isMedicalVisit(v('', 'Morbilidad Medica')), true);
  assert.equal(isMedicalVisit(v('', 'Kinesiología')), false);
  assert.equal(isMedicalVisit(v('', 'Taller de autocuidado')), false);
});

/**
 * El RCE (HIS de Hanga Roa) en el informe imprimible. Lo que custodian:
 * el papel lleva las dos historias, cada atención dice de qué sistema viene, y
 * una ficha que no se pudo leer se declara en vez de desaparecer.
 */
const atencionRce = (idCuenta, fecha, tipoFicha = 'ambulatorio') => ({
  idCuenta, fecha, tipoFicha, tipoAtencion: 'AMB Cardiología', servicio: 'CARDIOLOGIA', rut: '1-9',
});
const fichaRce = {
  paciente: { nombre: 'PACIENTE PRUEBA' },
  meta: { medico: 'DR. EJEMPLO RCE', motivoConsulta: 'Control de presión' },
  atencion: { anamnesis: 'Asintomático.', examenFisico: '', hipotesis: '', indicaciones: 'Continuar losartán.', indicacionesAlta: '' },
  diagnosticos: { principal: 'Hipertensión arterial', secundario: '', complementario: '' },
  signosVitales: { PAS: '145', PAD: '90', FC: '72' },
  cierre: { condicion: 'Estable', destino: 'Domicilio', pronostico: '', fechaSalida: '', horaSalida: '' },
};
const curConRce = (his) => ({
  record: { nombre: 'Paciente Prueba', runStr: '1-K', edad: 40, sexo: 'Hombre' },
  visits: [yo], ficha: null, sics: [], his,
});

test('el informe lleva las atenciones del RCE junto a las de Eloisa', () => {
  const { fragment } = buildPatientReport(curConRce({
    estado: 'ok',
    atenciones: [atencionRce('501', '2026-05-18')],
    fichas: new Map([['ambulatorio:501', { estado: 'ok', ficha: fichaRce }]]),
  }), 'todos');
  assert.ok(fragment.includes('Atenciones del RCE'), 'el RCE tiene su propia sección');
  assert.ok(fragment.includes('2026-05-18') && fragment.includes('CARDIOLOGIA'));
  assert.ok(fragment.includes('DR. EJEMPLO RCE'), 'el médico que atendió en el RCE');
  assert.ok(fragment.includes('Hipertensión arterial') && fragment.includes('Continuar losartán.'));
  assert.ok(fragment.includes('145/90'), 'la presión se imprime como sistólica/diastólica');
  assert.ok(fragment.includes('>RCE<'), 'cada tarjeta declara su origen');
  assert.ok(fragment.includes(SCOPE_LABEL.todos), 'y las de Eloisa siguen ahí');
});

test('una ficha del RCE que no se pudo leer se declara, no se omite', () => {
  const { fragment } = buildPatientReport(curConRce({
    estado: 'ok',
    atenciones: [atencionRce('502', '2026-02-02', 'urgencia')],
    fichas: new Map([['urgencia:502', { estado: 'error', error: 'sesión del HIS caída' }]]),
  }), 'todos');
  assert.ok(fragment.includes('Atenciones del RCE · Hospital Hanga Roa · 1'));
  assert.ok(fragment.includes('Ficha no leída desde el RCE: sesión del HIS caída'));
  assert.ok(fragment.includes('urgencia'), 'la cabecera sale igual, con lo que sí sabe el listado');
});

test('sin RCE el informe no cambia; el alcance «ic» no lo incluye', () => {
  const sinHis = buildPatientReport(curConRce(null), 'todos');
  assert.ok(!sinHis.fragment.includes('Atenciones del RCE'));

  const soloIc = buildPatientReport(curConRce({
    estado: 'ok', atenciones: [atencionRce('501', '2026-05-18')], fichas: new Map(),
  }), 'ic');
  assert.ok(!soloIc.fragment.includes('Atenciones del RCE'), 'el alcance de interconsultas no lleva atenciones');
});

test('en los alcances filtrados se advierte que el RCE va completo', () => {
  const { fragment } = buildPatientReport(curConRce({
    estado: 'ok', atenciones: [atencionRce('501', '2026-05-18')], fichas: new Map(),
  }), 'yo');
  assert.ok(fragment.includes('no se filtra por alcance'),
    'el listado del HIS no dice quién atendió: filtrarlo sería inventar');
  assert.ok(fragment.includes('no se trajo el contenido'), 'y dice que esa ficha no se llegó a leer');
});

test('las atenciones del RCE salen de la más reciente a la más antigua', () => {
  const { fragment } = buildPatientReport(curConRce({
    estado: 'ok',
    atenciones: [atencionRce('1', '2025-01-01'), atencionRce('2', '2026-06-30'), atencionRce('3', '2025-12-31')],
    fichas: new Map(),
  }), 'todos');
  const orden = [...fragment.matchAll(/20\d\d-\d\d-\d\d/g)].map(m => m[0]);
  const rce = orden.filter(f => ['2025-01-01', '2026-06-30', '2025-12-31'].includes(f));
  assert.deepEqual(rce, ['2026-06-30', '2025-12-31', '2025-01-01']);
});

test('dos atenciones con el mismo id pero distinto tipo no se pisan', () => {
  // PURG0005.php?id=N y PAMB0005.php?id=N son documentos distintos, de tablas
  // distintas del HIS: con la clave puesta sólo en el id, la ambulatoria salía
  // con la anamnesis y los signos vitales de la urgencia.
  const urg = { ...fichaRce, meta: { medico: 'DR. URGENCIA', motivoConsulta: 'Dolor torácico' },
    atencion: { anamnesis: 'Contenido de la URGENCIA.', examenFisico: '', hipotesis: '', indicaciones: '', indicacionesAlta: '' } };
  const amb = { ...fichaRce, meta: { medico: 'DRA. AMBULATORIA', motivoConsulta: 'Control' },
    atencion: { anamnesis: 'Contenido de la AMBULATORIA.', examenFisico: '', hipotesis: '', indicaciones: '', indicacionesAlta: '' } };
  const { fragment } = buildPatientReport(curConRce({
    estado: 'ok',
    atenciones: [{ ...atencionRce('700', '2026-02-02', 'urgencia') }, { ...atencionRce('700', '2026-05-18', 'ambulatorio') }],
    fichas: new Map([['urgencia:700', { estado: 'ok', ficha: urg }], ['ambulatorio:700', { estado: 'ok', ficha: amb }]]),
  }), 'todos');
  assert.ok(fragment.includes('Contenido de la URGENCIA.'));
  assert.ok(fragment.includes('Contenido de la AMBULATORIA.'));
  assert.ok(fragment.includes('DR. URGENCIA') && fragment.includes('DRA. AMBULATORIA'),
    'cada atención con el médico que de verdad la firmó');
});

test('si el RCE falló o no había llegado, el informe lo dice en vez de callarlo', () => {
  const caido = buildPatientReport(curConRce({ estado: 'error', error: 'HIS fuera de la red' }), 'todos');
  assert.ok(caido.fragment.includes('RCE no disponible: HIS fuera de la red'));
  assert.ok(caido.fragment.includes('incompleta'), 'quien lee el papel tiene que saber que falta media historia');

  const enVuelo = buildPatientReport(curConRce({ estado: 'cargando' }), 'todos');
  assert.ok(enVuelo.fragment.includes('aún no había llegado'),
    'imprimir apenas se abre el panel no puede producir un informe que parezca completo');

  const vacio = buildPatientReport(curConRce({ estado: 'ok', atenciones: [], fichas: new Map() }), 'todos');
  assert.ok(vacio.fragment.includes('Sin atenciones registradas en el RCE'));
});

test('el papel imprime los mismos signos vitales que la pantalla', () => {
  const f = { ...fichaRce, signosVitales: { FC: '88', PAS: '145', PAD: '90', PAM: '110',
    SatO2: '96', TempRectal: '38.9', dolor: '8', altura: '170', hora: '14:20' } };
  const { fragment } = buildPatientReport(curConRce({
    estado: 'ok', atenciones: [atencionRce('501', '2026-05-18')],
    fichas: new Map([['ambulatorio:501', { estado: 'ok', ficha: f }]]),
  }), 'todos');
  for (const esperado of ['FC 88', 'PA 145/90', 'PAM 110', 'Sat O₂ 96', 'T° rectal 38.9', 'Dolor 8', 'Talla 170']) {
    assert.ok(fragment.includes(esperado), `el papel perdía «${esperado}»`);
  }
  assert.ok(fragment.includes('Signos vitales · 14:20'), 'y la hora a la que se tomaron');
});
