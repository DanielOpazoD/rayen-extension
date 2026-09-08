import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  parseFichaHis, extraerPares, extraerSignosVitales, buscarMedico,
  contarPares, fichaTieneContenido, signosVitalesLista,
} from '../src/core/his-ficha.js';

/**
 * El contenido clínico de una atención del RCE (PURG0005 urgencia / PAMB0005
 * ambulatorio). Las reglas que custodia: las viñetas del plan de tratamiento
 * sobreviven como líneas; el valor de un campo no se pega con el siguiente;
 * ambulatorio no inventa signos vitales; y el médico se encuentra tanto cuando
 * viene como etiqueta (urgencia) como cuando viene en un <input> (ambulatorio).
 */
const purg = readFileSync(new URL('./fixtures/his-purg0005.html', import.meta.url), 'utf8');
const pamb = readFileSync(new URL('./fixtures/his-pamb0005.html', import.meta.url), 'utf8');

test('urgencia: paciente, atención, diagnóstico y cierre', () => {
  const f = parseFichaHis(purg);
  assert.equal(f.paciente.nombre, 'JUAN EJEMPLO PEREZ');
  assert.equal(f.paciente.rut, '11.111.111-1');
  assert.equal(f.paciente.edad, '58');
  assert.equal(f.meta.medico, 'DR. EJEMPLO TRATANTE');
  assert.equal(f.meta.fechaAtencion, '22-04-2026');
  assert.equal(f.meta.motivoConsulta, 'Dolor abdominal de 24 horas de evolución.');
  assert.equal(f.diagnosticos.principal, 'Pancreatitis aguda');
  assert.equal(f.cierre.condicion, 'Estable');
  assert.equal(f.cierre.destino, 'Hospitalización');
});

test('las viñetas del plan de tratamiento se conservan como líneas', () => {
  const f = parseFichaHis(purg);
  const lineas = f.atencion.indicaciones.split('\n');
  assert.equal(lineas.length, 3, 'los <br> del plan son viñetas, no espacios');
  assert.equal(lineas[0], 'Régimen cero por 12 horas.');
  assert.equal(lineas[2], 'Control con amilasa y lipasa en 6 horas.');
});

test('un campo no se pega con el siguiente: el </div> corta el valor', () => {
  const f = parseFichaHis(purg);
  assert.equal(f.atencion.examenFisico, 'Abdomen blando, depresible, doloroso en epigastrio.');
  assert.ok(!f.atencion.examenFisico.includes('HIPOTESIS'), 'no arrastra la etiqueta siguiente');
  assert.equal(f.atencion.anamnesis.split('\n').length, 2);
});

test('urgencia trae signos vitales; ambulatorio no los inventa', () => {
  const u = parseFichaHis(purg);
  assert.equal(u.signosVitales.FC, '72');
  assert.equal(u.signosVitales.PAS, '120');
  assert.equal(u.signosVitales.PAD, '80');
  assert.equal(u.signosVitales.SatO2, '98');
  assert.equal(u.signosVitales.TempAxilar, '36.5');

  const a = parseFichaHis(pamb);
  assert.equal(a.signosVitales.FC, '', 'PAMB0005 no trae la tabla');
  assert.equal(a.signosVitales.SatO2, '');
});

test('ambulatorio: el médico vive en un <input>, no en una etiqueta', () => {
  const f = parseFichaHis(pamb);
  assert.equal(f.meta.medico, 'DRA. EJEMPLO NEFROLOGA');
  assert.equal(f.paciente.nombre, 'MARIA EJEMPLO SOTO');
  assert.equal(f.meta.tipoAtencion, 'AMB Nefrología');
});

test('el buscador de médico rechaza al paramédico y a las etiquetas de diagnóstico', () => {
  assert.equal(buscarMedico({ 'DIAG. MÉDICO COMPLEMENTARIO': 'Hipertensión' }, ''), '',
    'una etiqueta de diagnóstico no es el médico tratante');
  assert.equal(buscarMedico({}, '<input name="paramedico" value="TECNICO EJEMPLO">'), '',
    'el paramédico no es el médico tratante');
  assert.equal(buscarMedico({}, '<input name="cboMedico" value="DR. EJEMPLO PREFIJO">'),
    'DR. EJEMPLO PREFIJO', 'acepta los prefijos del HIS (cbo, txt, nombre…)');
  assert.equal(buscarMedico({}, '<select name="medico"><option>Seleccione</option><option selected>DR. EJEMPLO SELECT</option></select>'),
    'DR. EJEMPLO SELECT');
  assert.equal(buscarMedico({}, '<td>Médico:</td><td>DR. EJEMPLO TABLA</td>'),
    'DR. EJEMPLO TABLA', 'tabla plana: la etiqueta y el valor en celdas distintas');
});

test('los comentarios HTML no crean campos fantasma', () => {
  const f = parseFichaHis('<!-- <b>NOMBRES:</b> NO SOY EL PACIENTE --><div><b>NOMBRES:</b> REAL EJEMPLO</div>');
  assert.equal(f.paciente.nombre, 'REAL EJEMPLO');
});

test('contarPares distingue una ficha real de una respuesta vacía', () => {
  assert.ok(contarPares(purg) >= 5, 'una ficha real trae decenas de pares');
  assert.equal(contarPares('<html><body>Sesión expirada</body></html>'), 0);
});

test('fichaTieneContenido: sin nada clínico no se pinta una tarjeta en blanco', () => {
  assert.equal(fichaTieneContenido(parseFichaHis(purg)), true);
  assert.equal(fichaTieneContenido(parseFichaHis('<div><b>RUT:</b> 1-9</div>')), false);
  assert.equal(fichaTieneContenido(null), false);
});

test('extraerPares y extraerSignosVitales se pueden probar sueltos', () => {
  const pares = extraerPares('<div><b>SEXO:</b> Femenino</div>');
  assert.equal(pares.SEXO, 'Femenino');
  assert.deepEqual(extraerSignosVitales('<table><tr><th>OTRA</th></tr><tr><td>x</td></tr></table>'), {},
    'sin SAT/O2 en el encabezado no es la tabla de signos vitales');
});

/**
 * Regresiones de la revisión adversarial. Cada una es un dato clínico que el
 * programa mostraba mal, no una preferencia de estilo.
 */
test('entidades HTML en la ETIQUETA: si no se decodifican, el campo desaparece', () => {
  // El HIS es PHP; con htmlentities() las tildes llegan como &oacute;.
  const f = parseFichaHis('<div><b>DIAGN&Oacute;STICO PRI:</b> Hipertensi&oacute;n arterial</div>' +
    '<div><b>EXAMEN F&Iacute;SICO:</b> Sin hallazgos</div>');
  assert.equal(f.diagnosticos.principal, 'Hipertensión arterial',
    'con la etiqueta sin decodificar, ningún sinónimo coincidía y el diagnóstico se perdía');
  assert.equal(f.atencion.examenFisico, 'Sin hallazgos');
});

test('entidades numéricas en el valor: grados y micras son dosis y temperaturas', () => {
  const f = parseFichaHis('<div><b>INDICACIONES:</b> Fiebre sobre 38&#176;C. Noradrenalina 5 &#181;g/kg/min. Sat &#x3C; 90%</div>');
  assert.equal(f.atencion.indicaciones, 'Fiebre sobre 38°C. Noradrenalina 5 µg/kg/min. Sat < 90%');
});

test('el paramédico con tilde tampoco es el médico tratante', () => {
  // «\b» en JS es ASCII: «PARÁMEDICO» burlaba la guarda y la atención quedaba
  // atribuida al técnico en vez de al médico.
  assert.equal(buscarMedico({ 'PARÁMEDICO': 'TECNICO EJEMPLO' }, ''), '');
  assert.equal(buscarMedico({ 'PARAMEDICO': 'TECNICO EJEMPLO' }, ''), '');
});

test('una etiqueta administrativa con «MÉDICA» no aporta el médico tratante', () => {
  assert.equal(buscarMedico({ 'ALTA MÉDICA': 'SI' }, ''), '',
    '«SI» se pintaba donde va el profesional que atendió');
  assert.equal(buscarMedico({ 'ATENCIÓN MÉDICA': 'Consulta de morbilidad' }, ''), '');
  assert.equal(buscarMedico({ 'HORA MÉDICO': '10:30' }, ''), '');
  assert.equal(buscarMedico({ 'MÉDICO TRATANTE': 'DR. EJEMPLO REAL' }, ''), 'DR. EJEMPLO REAL',
    'y el de verdad sigue encontrándose');
});

test('un médico apellidado SINCLAIR no se confunde con «sin médico»', () => {
  assert.equal(buscarMedico({}, '<td>Médico:</td><td>SINCLAIR ROJAS</td>'), 'SINCLAIR ROJAS');
  assert.equal(buscarMedico({}, '<td>Médico:</td><td>Sin médico asignado</td>'), '');
});

test('una atención con sólo signos vitales y cierre NO está vacía', () => {
  // Urgencia sin texto pero con el paciente en shock: decir «sin contenido
  // clínico» sería falso, y el informe imprimible sí los imprimía.
  const f = parseFichaHis(`<div><b>CONDICIÓN CIERRE ATENCIÓN:</b> Grave</div>
    <div><b>DESTINO:</b> Hospitalización</div>
    <table><tr><th>F.C.</th><th>P. SISTOLICA</th><th>P. DIASTOLICA</th><th>SAT. O2</th></tr>
    <tr><td>132</td><td>82</td><td>44</td><td>85</td></tr></table>`);
  assert.equal(fichaTieneContenido(f), true);
  assert.equal(f.signosVitales.FC, '132');
  assert.equal(f.cierre.condicion, 'Grave');
});

test('signosVitalesLista: una lista sola para la pantalla y el papel', () => {
  const l = signosVitalesLista({ FC: '88', PAS: '145', PAD: '90', PAM: '110', SatO2: '96',
    TempRectal: '38.9', dolor: '8', altura: '170', hora: '14:20' });
  const m = new Map(l);
  assert.equal(m.get('PA'), '145/90');
  assert.equal(m.get('PAM'), '110', 'el papel la perdía');
  assert.equal(m.get('Dolor'), '8', 'el papel lo perdía');
  assert.equal(m.get('Talla'), '170', 'el papel la perdía');
  assert.equal(m.get('T° rectal'), '38.9', 'el papel la rotulaba «T°» a secas, sin decir que era rectal');
  assert.equal(m.has('T° axilar'), false, 'no se inventa la que no vino');
  // Una sistólica sin diastólica no puede desaparecer.
  assert.equal(new Map(signosVitalesLista({ PAS: '145' })).get('PA'), '145');
  assert.deepEqual(signosVitalesLista({}), []);
});
