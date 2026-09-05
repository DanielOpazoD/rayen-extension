import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractAnyRutBody, buildDetail, buildDetails } from '../src/io/lab-report.js';

// Nota de alcance: la conversión PDF → texto usa pdf.js, que necesita el
// navegador. Estas pruebas cubren la identidad y la tolerancia a fallos, que es
// donde está la lógica clínica. La lectura real de un PDF sólo queda validada
// al ejecutar la extensión.

test('extractAnyRutBody prefiere el formato SysLab', () => {
  assert.equal(extractAnyRutBody('Nombre: X\nRut/Fic: 16.940.645-6\n'), '16940645');
  assert.equal(extractAnyRutBody('RUT/FIC : 17.752.753-K'), '17752753');
});

test('extractAnyRutBody cae a un patrón general cuando el informe no es de SysLab', () => {
  assert.equal(extractAnyRutBody('Paciente\nRUT: 16.940.645-6\nExamenes'), '16940645');
  assert.equal(extractAnyRutBody('Rut del paciente 17752753-K'), '17752753');
});

test('extractAnyRutBody devuelve vacío en vez de adivinar', () => {
  assert.equal(extractAnyRutBody('Informe sin identificación'), '');
  assert.equal(extractAnyRutBody('Orden 12345 folio 99'), '');
  assert.equal(extractAnyRutBody(''), '');
});

const informe = rut => `HOSPITAL DE HANGA ROA
Rut/Fic: ${rut}
HEMOGRAMA
Hemoglobina : 13,5 g/dL 13,0 - 17,0`;

const spec = (rut, expected) => ({
  examId: '7',
  expectedRutBody: expected,
  loadBytes: async () => new Uint8Array([1]),
  toText: async () => informe(rut),
});

test('buildDetail rechaza un informe que declara otro RUN', async () => {
  await assert.rejects(
    () => buildDetail(spec('17.752.753-K', '16940645')),
    /corresponde a otro RUN/
  );
});

test('buildDetail acepta y marca como verificado el informe del RUN pedido', async () => {
  const detail = await buildDetail(spec('16.940.645-6', '16940645'));
  assert.equal(detail.rutVerified, true);
  assert.equal(detail.rutBody, '16940645');
  assert.equal(detail.findings.length, 1);
  assert.equal(detail.findings[0].analysis, 'Hemoglobina');
});

test('un informe sin RUT legible se acepta pero queda marcado como no verificado', async () => {
  // No se descarta —sigue siendo útil— pero la interfaz debe poder decirlo.
  const detail = await buildDetail({
    examId: '7',
    expectedRutBody: '16940645',
    loadBytes: async () => new Uint8Array([1]),
    toText: async () => 'HEMOGRAMA\nHemoglobina : 13,5 g/dL 13,0 - 17,0',
  });
  assert.equal(detail.rutVerified, false);
  assert.equal(detail.findings.length, 1);
});

test('un error de descarga se propaga en vez de producir un informe vacío', async () => {
  await assert.rejects(
    () => buildDetail({
      examId: '7',
      expectedRutBody: '16940645',
      loadBytes: async () => { throw new Error('SysLab respondió HTTP 500.'); },
    }),
    /HTTP 500/
  );
});

test('buildDetails no cancela el lote cuando un informe falla', async () => {
  const specs = [
    { examId: '1', expectedRutBody: '16940645', loadBytes: async () => { throw new Error('SysLab respondió HTTP 500.'); } },
    { examId: '2', expectedRutBody: '16940645', loadBytes: async () => { throw new Error('El informe supera el límite de 6 MB.'); } },
  ];
  const progress = [];
  const { details, errors } = await buildDetails(specs, (done, total) => progress.push(`${done}/${total}`));

  assert.deepEqual(details, []);
  assert.deepEqual(errors.map(e => e.examId), ['1', '2']);
  assert.match(errors[0].message, /HTTP 500/);
  assert.match(errors[1].message, /6 MB/);
  // El progreso avanza informe a informe, no de golpe al final.
  assert.deepEqual(progress, ['1/2', '2/2']);
});

test('buildDetails acota la concurrencia para no saturar SysLab', async () => {
  let active = 0;
  let peak = 0;
  const specs = Array.from({ length: 9 }, (_, i) => ({
    examId: String(i),
    expectedRutBody: '16940645',
    loadBytes: async () => {
      active += 1;
      peak = Math.max(peak, active);
      await new Promise(resolve => setTimeout(resolve, 5));
      active -= 1;
      throw new Error('parada de prueba');
    },
  }));

  const { errors } = await buildDetails(specs);
  assert.equal(errors.length, 9);
  assert.ok(peak <= 3, `no más de 3 descargas simultáneas, hubo ${peak}`);
});

test('buildDetail entrega el sexo al parser para elegir la referencia por grupo', async () => {
  const text = 'Rut/Fic: 16.940.645-6\nHEMATOLOGIA\nHemoglobina: 13,0 g/dL Mujeres: 12,0 - 16,0 Hombres: 13,5 - 17,5';
  const d = await buildDetail({ examId: 'x', expectedRutBody: '16940645', loadBytes: async () => new Uint8Array(), toText: async () => text, sexo: 'Masculino' });
  assert.equal(d.findings[0].refGroup, 'Hombres');
});
