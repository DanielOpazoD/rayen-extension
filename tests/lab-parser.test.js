import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseMeasurement, referenceBounds, findingAlert, parseReportText,
  normalizeAnalysisName, isSystemicTrendEligible, extractRutBodyFromReportText, normalizeSexo,
} from '../src/core/lab-parser.js';

// Informe con la forma real de SysLab: cabecera que se descarta, secciones en
// mayúsculas y filas «Analito : valor unidad rango».
const INFORME = `HOSPITAL DE HANGA ROA
Laboratorio Clínico
Nombre: PEREZ SOTO, JUAN
Rut/Fic: 16.940.645-6
Fecha de Nacimiento: 01/01/1980
Procedencia: URGENCIA
Fecha y Hora: 03/09/2026 10:15
Resultado Unidad Valor de Referencia

HEMOGRAMA
Recuento Leucocitos : 12.500 /uL 4.000 - 10.000
Hemoglobina : 11,2 g/dL 13,0 - 17,0
Recuento de Plaquetas : 250 x10^3/uL 150 - 400

PERFIL BIOQUIMICO
Creatinina : 1,45 mg/dL 0,7 - 1,3
Sodio : 138 mEq/L 135 - 145
Troponina : <0,01 ng/mL < 0,04

ORINA COMPLETA
Leucocitos : 25 /uL 0 - 5
Nitritos : POSITIVO

Director Técnico
TM JUAN SOTO`;

test('parseMeasurement resuelve el punto chileno según unidad y referencia', () => {
  // Recuento entero con referencia sin decimales: el punto es separador de miles.
  assert.deepEqual(
    parseMeasurement('12.500', { unit: '/uL', refValue: '4.000 - 10.000' }),
    { comparator: '=', value: 12500 }
  );
  // Sin señales de recuento entero, el punto es decimal.
  assert.deepEqual(
    parseMeasurement('1.234', { unit: '', refValue: '' }),
    { comparator: '=', value: 1.234 }
  );
  // La coma siempre es decimal.
  assert.deepEqual(
    parseMeasurement('3,45', { unit: 'mg/dL', refValue: '' }),
    { comparator: '=', value: 3.45 }
  );
  // Una unidad escalada (x10^3) descarta la lectura de miles.
  assert.deepEqual(
    parseMeasurement('4.500', { unit: 'x10^3/uL', refValue: '' }),
    { comparator: '=', value: 4.5 }
  );
  // Referencia con decimales declarados descarta la lectura de miles.
  assert.deepEqual(
    parseMeasurement('4.500', { unit: 'U/L', refValue: '0,5 - 1,2' }),
    { comparator: '=', value: 4.5 }
  );
});

test('parseMeasurement conserva el comparador y normaliza ≤ ≥', () => {
  assert.deepEqual(parseMeasurement('<0,01', {}), { comparator: '<', value: 0.01 });
  assert.deepEqual(parseMeasurement('>120', {}), { comparator: '>', value: 120 });
  assert.deepEqual(parseMeasurement('≤5', {}), { comparator: '<=', value: 5 });
  assert.deepEqual(parseMeasurement('≥10', {}), { comparator: '>=', value: 10 });
  assert.equal(parseMeasurement('NEGATIVO', {}), null);
  assert.equal(parseMeasurement('', {}), null);
});

test('referenceBounds interpreta rangos y cotas', () => {
  assert.deepEqual(referenceBounds('3,5 - 5,1', {}), { min: 3.5, max: 5.1, minInclusive: true, maxInclusive: true });
  assert.deepEqual(referenceBounds('< 0,04', {}), { min: null, max: 0.04, minInclusive: true, maxInclusive: false });
  assert.deepEqual(referenceBounds('≥ 60', {}), { min: 60, max: null, maxInclusive: true, minInclusive: true });
  assert.equal(referenceBounds('NEGATIVO', {}), null);
});

test('findingAlert marca fuera de rango y respeta el interior del rango', () => {
  const ctx = { unit: 'mEq/L', refValue: '3,5 - 5,1' };
  assert.equal(findingAlert({ ...ctx, result: '6,2' }), true);
  assert.equal(findingAlert({ ...ctx, result: '2,9' }), true);
  assert.equal(findingAlert({ ...ctx, result: '4,0' }), false);
  // Los extremos del rango están dentro.
  assert.equal(findingAlert({ ...ctx, result: '3,5' }), false);
  assert.equal(findingAlert({ ...ctx, result: '5,1' }), false);
});

test('findingAlert entiende un resultado con comparador contra su cota', () => {
  // «<0,01» con referencia «< 0,04» está por debajo: no es alerta.
  assert.equal(findingAlert({ result: '<0,01', refValue: '< 0,04', unit: 'ng/mL' }), false);
  // «>120» con referencia «< 100» supera la cota: sí lo es.
  assert.equal(findingAlert({ result: '>120', refValue: '< 100', unit: 'mg/L' }), true);
});

test('findingAlert compara resultados cualitativos sólo si hay referencia cualitativa', () => {
  assert.equal(findingAlert({ result: 'POSITIVO', refValue: 'NEGATIVO' }), true);
  assert.equal(findingAlert({ result: 'NEGATIVO', refValue: 'NEGATIVO' }), false);
  // Sin referencia no se inventa una alerta.
  assert.equal(findingAlert({ result: 'POSITIVO', refValue: '' }), false);
});

test('normalizeAnalysisName unifica sinónimos y respeta la muestra', () => {
  assert.equal(normalizeAnalysisName('Leucocitos', 'HEMOGRAMA'), 'Recuento Leucocitos');
  // En orina, «Leucocitos» es sedimento urinario, no el recuento hematológico.
  assert.equal(normalizeAnalysisName('Leucocitos', 'ORINA COMPLETA'), 'Leucocitos');
  assert.equal(normalizeAnalysisName('Plaquetas', 'HEMOGRAMA'), 'Recuento de Plaquetas');
  assert.equal(normalizeAnalysisName('Proteína C Reactiva', 'GENERAL'), 'Proteina C Reactiva');
  assert.equal(normalizeAnalysisName('CPK', 'GENERAL'), 'CK Total');
  assert.equal(normalizeAnalysisName('T4 Libre', 'GENERAL'), 'T4L');
  assert.equal(normalizeAnalysisName('Triglicéridos', 'GENERAL'), 'TG');
  assert.equal(normalizeAnalysisName('Rcto. Leucocitos', 'HEMOGRAMA'), 'Recuento Leucocitos');
  assert.equal(normalizeAnalysisName('Neutrófilos', 'HEMOGRAMA'), 'Segmentados');
  assert.equal(normalizeAnalysisName('Vol. Corp. Medio VCM', 'HEMOGRAMA'), 'VCM');
  assert.equal(normalizeAnalysisName('Hb. Corp. Media - HCM', 'HEMOGRAMA'), 'HCM');
  assert.equal(normalizeAnalysisName('Creatinina sérica', 'BIOQUIMICA'), 'Creatinina');
  assert.equal(normalizeAnalysisName('Bilirrubina T.', 'HEPATICO'), 'Bilirrubina Total');
});

test('«PCR» a secas se resuelve según la sección: inflamatorio o molecular', () => {
  // En bioquímica es proteína C reactiva.
  assert.equal(normalizeAnalysisName('PCR', 'BIOQUIMICA'), 'Proteina C Reactiva');
  // En microbiología es reacción en cadena de la polimerasa: se deja como está
  // en vez de rotular un panel viral como marcador inflamatorio.
  assert.equal(normalizeAnalysisName('PCR', 'MICROBIOLOGIA'), 'PCR');
  assert.equal(normalizeAnalysisName('PCR', 'BIOLOGÍA MOLECULAR'), 'PCR');
});

test('isSystemicTrendEligible no mezcla muestras biológicas', () => {
  assert.equal(isSystemicTrendEligible({ section: 'ELECTROLITOS', analysis: 'Sodio', unit: 'mEq/L' }), true);
  assert.equal(isSystemicTrendEligible({ section: 'ORINA COMPLETA', analysis: 'Sodio', unit: 'mEq/L' }), false);
  assert.equal(isSystemicTrendEligible({ section: 'LCR', analysis: 'Glucosa', unit: 'mg/dL' }), false);
  // RAC y RPC son razones urinarias con lectura sistémica: sí entran.
  assert.equal(isSystemicTrendEligible({ section: 'ORINA', analysis: 'RAC', unit: 'mg/g' }), true);
  assert.equal(isSystemicTrendEligible({ section: 'ORINA', analysis: 'RPC', unit: 'mg/g' }), true);
});

test('extractRutBodyFromReportText lee el RUT del informe sin dígito verificador', () => {
  assert.equal(extractRutBodyFromReportText(INFORME), '16940645');
  assert.equal(extractRutBodyFromReportText('sin rut aquí'), '');
});

test('parseReportText interpreta un informe completo', () => {
  const findings = parseReportText(INFORME);
  const byName = Object.fromEntries(findings.map(f => [`${f.section}|${f.analysis}`, f]));

  // Descarta la cabecera administrativa.
  assert.ok(!findings.some(f => /Nombre|Procedencia|Director/i.test(f.analysis)));

  const leuco = byName['HEMOGRAMA|Recuento Leucocitos'];
  assert.equal(leuco.result, '12.500');
  assert.equal(leuco.unit, '/uL');
  assert.equal(leuco.refValue, '4.000 - 10.000');

  const hb = byName['PERFIL BIOQUIMICO|Sodio'];
  assert.equal(hb.unit, 'mEq/L');
  assert.equal(hb.refValue, '135 - 145');

  // El leucocito urinario queda en su propia sección y con su propio nombre.
  assert.ok(byName['ORINA COMPLETA|Leucocitos']);
  assert.ok(!byName['ORINA COMPLETA|Recuento Leucocitos']);

  const nitritos = byName['ORINA COMPLETA|Nitritos'];
  assert.equal(nitritos.result, 'POSITIVO');
  assert.equal(nitritos.qualitative, true);
});

// Un informe a dos columnas puede dejar dos analitos en la misma línea al
// reconstruirse. Antes, el primero se quedaba con el rango del segundo —un
// sodio normal marcado como alterado— y el segundo desaparecía sin dejar
// rastro: una hiperkalemia de 6,8 no llegaba a la pantalla ni al resumen.
test('dos analitos en una línea se separan, cada uno con su rango', () => {
  const f = parseReportText('Sodio: 140 mEq/L 135 - 145 Potasio: 6,8 mEq/L 3,5 - 5,1')
    .map(x => ({ ...x, alert: findingAlert(x) }));

  assert.equal(f.length, 2, 'ningún analito puede perderse');
  assert.deepEqual(f.map(x => x.analysis), ['Sodio', 'Potasio']);
  assert.equal(f[0].refValue, '135 - 145');
  assert.equal(f[0].alert, false, 'un sodio de 140 está dentro de 135-145');
  assert.equal(f[1].result, '6,8');
  assert.equal(f[1].refValue, '3,5 - 5,1');
  assert.equal(f[1].alert, true, 'una hiperkalemia de 6,8 debe marcarse');
});

test('tres analitos en una línea conservan cada uno su unidad', () => {
  const f = parseReportText('Hemoglobina: 11,2 g/dL 13,0 - 17,0 Hematocrito: 34 % 40 - 52 VCM: 88 fL 80 - 100');
  assert.deepEqual(f.map(x => x.analysis), ['Hemoglobina', 'Hematocrito', 'VCM']);
  assert.deepEqual(f.map(x => x.unit), ['g/dL', '%', 'fL']);
});

test('un encabezado de rango por edad o sexo no abre un analito nuevo', () => {
  // «Adultos:» encabeza el rango de la creatinina; separarlo la dejaba sin
  // referencia y por lo tanto sin comparar.
  const [creat] = parseReportText('Creatinina: 1,45 mg/dL Adultos: 0,7 - 1,3');
  assert.equal(creat.analysis, 'Creatinina');
  assert.equal(creat.refValue, '0,7 - 1,3');
  assert.equal(findingAlert(creat), true);

  const f = parseReportText('Hemoglobina: 11,2 g/dL Hombres: 13,0 - 17,0 Hematocrito: 34 % 40 - 52');
  assert.deepEqual(f.map(x => x.analysis), ['Hemoglobina', 'Hematocrito']);
  assert.equal(f[0].refValue, '13,0 - 17,0');
});

test('una línea con un solo analito no se altera al trocear', () => {
  const [f] = parseReportText('Recuento Leucocitos: 12.500 /uL 4.000 - 10.000');
  assert.equal(f.unit, '/uL');
  assert.equal(f.refValue, '4.000 - 10.000');
  assert.equal(findingAlert(f), true);
});

test('parseReportText detecta las alteraciones clínicas del informe', () => {
  const alerts = parseReportText(INFORME)
    .map(f => ({ ...f, alert: findingAlert(f) }))
    .filter(f => f.alert)
    .map(f => f.analysis);

  assert.ok(alerts.includes('Recuento Leucocitos'), 'leucocitosis 12.500 sobre 10.000');
  assert.ok(alerts.includes('Hemoglobina'), 'anemia 11,2 bajo 13,0');
  assert.ok(alerts.includes('Creatinina'), 'creatinina 1,45 sobre 1,3');
  assert.ok(!alerts.includes('Sodio'), 'sodio 138 está dentro de 135-145');
  assert.ok(!alerts.includes('Troponina'), 'troponina <0,01 está bajo su cota');
});

// Regresión del balance 2: los tests anteriores sólo usaban nombres de una
// palabra, y el troceo cortaba en cualquier «palabra: número». Con la forma
// real de SysLab, «Bilirrubina Total» quedaba como «Total», igual que
// «Colesterol Total», y los dos caían en una sola fila.
test('los nombres de varias palabras no se cortan: «Bilirrubina Total» no es «Total»', () => {
  const txt = [
    'QUIMICA SANGUINEA',
    'Bilirrubina Total: 15,4 mg/dL 0,3 - 1,2',
    'Colesterol Total: 210 mg/dL < 200',
    'Proteina C Reactiva: 5 mg/L < 5',
    'Acido Urico: 6,1 mg/dL 3,5 - 7,2',
    'Bilirrubina Directa: 0,4 mg/dL 0,0 - 0,3 Bilirrubina Indirecta: 15,0 mg/dL 0,2 - 0,9',
  ].join('\n');
  const out = parseReportText(txt);
  const findings = Array.isArray(out) ? out : out.findings;
  const names = findings.map(f => f.analysis);
  assert.equal(names.length, 6, `seis analitos, se leyeron: ${names.join(' | ')}`);
  assert.equal(new Set(names).size, 6, 'seis analitos distintos, ninguno pisa a otro');
  for (const n of names) assert.notEqual(n, 'Total');
  assert.match(names[0], /bilirrubina/i);
  assert.match(names[1], /colesterol/i);
  assert.match(names[2], /prote|reactiva|pcr/i);
  assert.match(names[3], /urico/i);
  assert.match(names[4], /bilirrubina.*directa/i);
  assert.match(names[5], /bilirrubina.*indirecta/i);
  assert.equal(findings[0].result, '15,4');
  assert.equal(findings[0].refValue.replace(/\s/g, ''), '0,3-1,2', 'el rango sigue al analito correcto');
  assert.equal(findings[5].result, '15,0');
});

// Balance 3: la clase completa de fallos del troceo, con la forma real de los
// informes. Cada analito conserva su rango y ninguna unidad arrastra un rótulo.
const CORPUS = [
  ['HEMOGRAMA', null],
  ['Volumen Corpuscular Medio: 110 fL 80 - 100 Hb Corpuscular Media: 30 pg 27 - 33', [['Volumen Corpuscular Medio', '110', 'fL', '80 - 100'], ['Hb Corpuscular Media', '30', 'pg', '27 - 33']]],
  ['Hematocrito: 40 % 36 - 46 Recuento de Plaquetas: 250 x10^3/uL 150 - 400', [['Hematocrito', '40', '%', '36 - 46'], ['Recuento de Plaquetas', '250', 'x10^3/uL', '150 - 400']]],
  ['TP: 12 seg Hematocrito: 40 %', [['TP', '12', 'seg', ''], ['Hematocrito', '40', '%', '']]],
  ['QUIMICA', null],
  ['Potasio: 4,2 mEq/L Adultos: 3,5 - 5,0', [['Potasio', '4,2', 'mEq/L', '3,5 - 5,0']]],
  ['Proteina C Reactiva: 5 mg/L Hasta 5 Glucosa: 98 mg/dL 70 - 100', [['Proteina C Reactiva', '5', 'mg/L', '≤ 5'], ['Glucosa', '98', 'mg/dL', '70 - 100']]],
  ['Colesterol Total: 210 mg/dL Adultos: < 200', [['Colesterol Total', '210', 'mg/dL', '< 200']]],
  ['Folato: 5 ng/mL Mayor a 3 Vitamina B12: 300 pg/mL 200 - 900', [['Folato', '5', 'ng/mL', '> 3'], ['Vitamina B12', '300', 'pg/mL', '200 - 900']]],
  ['Insulina: 5 UI Glucosa: 98 mg/dL 70 - 100', [['Insulina', '5', 'UI', ''], ['Glucosa', '98', 'mg/dL', '70 - 100']]],
];

test('corpus real: cada analito conserva nombre, unidad y rango aunque comparta línea con otro', () => {
  const findings = parseReportText(CORPUS.map(([l]) => l).join('\n'));
  const expected = CORPUS.flatMap(([, e]) => e ?? []);
  const got = findings.map(f => [f.analysis, f.result, f.unit, f.refValue]);
  assert.deepEqual(got, expected);
});

test('propiedad: ninguna unidad contiene dos puntos ni un rótulo de grupo', () => {
  const findings = parseReportText(CORPUS.map(([l]) => l).join('\n'));
  for (const f of findings) {
    assert.doesNotMatch(f.unit, /:/, `${f.analysis}: unidad «${f.unit}»`);
    assert.doesNotMatch(f.unit, /Adultos|Ni[ñn]os|Hombres|Mujeres/i, `${f.analysis}: unidad «${f.unit}»`);
  }
});

test('el VCM alto conserva su alerta aunque le siga un analito de tres palabras', () => {
  const [vcm] = parseReportText('HEMOGRAMA\nVolumen Corpuscular Medio: 110 fL 80 - 100 Hb Corpuscular Media: 30 pg 27 - 33');
  assert.equal(vcm.refValue, '80 - 100');
  assert.equal(findingAlert(vcm), true, 'macrocitosis: 110 fuera de 80–100');
});

// Balance 4: dos rótulos de grupo seguidos, cualitativos en texto libre y el
// «4.500» sin unidad.
test('varios rótulos de grupo: la unidad queda limpia y rige la referencia de adultos', () => {
  const [k] = parseReportText('QUIMICA\nPotasio: 4,1 mEq/L Niños: 3,4 - 4,7 Adultos: 3,5 - 5,0');
  assert.equal(k.unit, 'mEq/L');
  assert.equal(k.refValue, '3,5 - 5,0');
  const [solo] = parseReportText('QUIMICA\nCalcio: 9,1 mg/dL Niños: 8,8 - 10,8');
  assert.equal(solo.unit, 'mg/dL');
  assert.equal(solo.refValue, '8,8 - 10,8', 'sin rótulo de adultos, la primera referencia');
});

test('los resultados en texto libre de orina y cultivos se conservan; un dato administrativo no', () => {
  const out = parseReportText(['ORINA', 'Color: AMARILLO Densidad: 1.020', 'Aspecto: Ligeramente turbio',
    'UROCULTIVO', 'Cultivo: Se observa desarrollo de Escherichia coli > 100.000 UFC/mL', 'Germen aislado: Escherichia coli',
    'HEMOGRAMA', 'Medico tratante: Dr. Perez', 'Hemoglobina: 13,5 g/dL 13 - 17'].join('\n'));
  const by = Object.fromEntries(out.map(f => [f.analysis, f]));
  assert.equal(by.Color?.result, 'AMARILLO');
  assert.equal(by.Densidad?.result, '1.020', 'el numérico que seguía al cualitativo ya no se pierde');
  assert.equal(by.Aspecto?.result, 'Ligeramente turbio');
  assert.match(by.Cultivo?.result ?? '', /Escherichia coli/);
  assert.equal(by.Cultivo.qualitative, true);
  assert.equal(by['Germen aislado']?.result, 'Escherichia coli');
  assert.equal(by['Medico tratante'], undefined, 'texto libre sólo donde es un resultado');
  assert.equal(by.Hemoglobina?.refValue, '13 - 17');
});

test('«4.500» sin unidad es ambiguo sólo cuando es un recuento', () => {
  assert.deepEqual(parseMeasurement('4.500', { analysis: 'Recuento Leucocitos', unit: '', refValue: '' }), { comparator: '=', value: 4.5, ambiguous: true });
  assert.deepEqual(parseMeasurement('4.500', { analysis: 'Recuento Leucocitos', unit: '/uL', refValue: '4.000 - 10.000' }), { comparator: '=', value: 4500 });
  assert.deepEqual(parseMeasurement('1.020', { analysis: 'Densidad', unit: '', refValue: '' }), { comparator: '=', value: 1.02 });
});

// Balance 5: el laboratorio marcaba el valor como anormal y el parser lo
// dejaba sin alerta; la referencia por sexo se elegía por posición.
test('una marca de anormalidad al final conserva la referencia y fuerza la alerta', () => {
  const out = parseReportText(['QUIMICA', 'Glucosa: 105 mg/dL 70 - 100 *', 'Calcio: 8,2 mg/dL 8,5 - 10,5 (*)', 'Urea: 60 mg/dL 15 - 45 H', 'Sodio: 140 mEq/L 135 - 145'].join('\n'));
  const by = Object.fromEntries(out.map(f => [f.analysis, f]));
  assert.deepEqual([by.Glucosa.unit, by.Glucosa.refValue, by.Glucosa.flag], ['mg/dL', '70 - 100', '*']);
  assert.equal(findingAlert(by.Glucosa), true);
  assert.equal(by.Calcio.flag, '(*)'); assert.equal(findingAlert(by.Calcio), true);
  assert.equal(by.Urea.flag, 'H'); assert.equal(findingAlert(by.Urea), true);
  assert.equal(by.Sodio.flag, undefined); assert.equal(findingAlert(by.Sodio), false);
});

test('la referencia por sexo se elige con el sexo del paciente; sin él no alerta y lo dice', () => {
  const linea = 'HEMATOLOGIA\nHemoglobina: 13,0 g/dL Mujeres: 12,0 - 16,0 Hombres: 13,5 - 17,5';
  const [hombre] = parseReportText(linea, { sexo: 'Masculino' });
  assert.deepEqual([hombre.refValue, hombre.refGroup, findingAlert(hombre)], ['13,5 - 17,5', 'Hombres', true], 'un hombre con 13,0 está anémico');
  const [mujer] = parseReportText(linea, { sexo: 'F' });
  assert.deepEqual([mujer.refValue, mujer.refGroup, findingAlert(mujer)], ['12,0 - 16,0', 'Mujeres', false]);
  const [sinSexo] = parseReportText(linea);
  assert.equal(sinSexo.refUncertain, true);
  assert.equal(findingAlert(sinSexo), false, 'sin sexo no se alerta por una referencia elegida al azar');
  assert.equal(normalizeSexo('Mujer'), 'mujer'); assert.equal(normalizeSexo('M'), 'hombre'); assert.equal(normalizeSexo(''), '');
});

test('«rango terapéutico», fechas administrativas y rangos como resultado', () => {
  const out = parseReportText(['COAGULACION', 'INR: 1,1 0,8 - 1,2 Rango terapéutico: 2,0 - 3,0', 'Fecha de toma: 01/09/2026', 'Medico solicitante: Dr. X',
    'SEDIMENTO URINARIO', 'Leucocitos: 2 - 4 por campo', 'Bacterias: ESCASAS'].join('\n'));
  const by = Object.fromEntries(out.map(f => [f.analysis, f]));
  assert.equal(by.INR.refValue, '0,8 - 1,2'); assert.equal(findingAlert(by.INR), false, 'el rango terapéutico no es su referencia');
  assert.equal(by['Fecha de toma'], undefined); assert.equal(by['Medico solicitante'], undefined);
  assert.equal(by.Leucocitos.result, '2 - 4 por campo'); assert.equal(by.Leucocitos.qualitative, true);
  assert.equal(by.Bacterias.result, 'ESCASAS');
});
