import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizePdfText, groupPdfTextItemsIntoLines } from '../src/io/lab-pdf-text.js';

/** Fragmento con la forma que entrega `getTextContent()` de pdf.js. */
const frag = (str, x, y) => ({ str, transform: [1, 0, 0, 1, x, y] });

test('normalizePdfText corrige los artefactos de codificación del informe', () => {
  // Sin esto, «Nitr¢geno Ureico» no coincide con ningún alias y el analito
  // desaparece del análisis sin ningún error visible.
  assert.equal(normalizePdfText('Nitr¢geno Ureico'), 'Nitrógeno Ureico');
  assert.equal(normalizePdfText('N° de ingreso'), 'No de ingreso');
});

test('normalizePdfText compacta espacios y saltos sin perder la separación de bloques', () => {
  assert.equal(normalizePdfText('a  \t  b'), 'a b');
  assert.equal(normalizePdfText('a\r\nb'), 'a\n\nb'.replace('\n\n', '\n\n'));
  assert.equal(normalizePdfText('a\n\n\n\n\nb'), 'a\n\nb');
  assert.equal(normalizePdfText('  hola  '), 'hola');
  assert.equal(normalizePdfText(null), '');
});

test('groupPdfTextItemsIntoLines arma filas y las ordena de arriba abajo', () => {
  // Sin matriz de viewport la coordenada vertical crece hacia arriba.
  const lines = groupPdfTextItemsIntoLines([
    frag('1,10', 200, 680),
    frag('Creatinina', 50, 680),
    frag('13,5', 200, 700),
    frag('Hemoglobina', 50, 700),
  ]);
  assert.deepEqual(lines, ['Hemoglobina 13,5', 'Creatinina 1,10']);
});

test('con la matriz del viewport la vertical se invierte y el orden se mantiene', () => {
  // Viewport estándar sin rotación: [1,0,0,-1,0,alto].
  const lines = groupPdfTextItemsIntoLines([
    frag('Creatinina', 50, 680),
    frag('1,10', 200, 680),
    frag('Hemoglobina', 50, 700),
    frag('13,5', 200, 700),
  ], [1, 0, 0, -1, 0, 792]);
  assert.deepEqual(lines, ['Hemoglobina 13,5', 'Creatinina 1,10']);
});

test('un informe rotado 90° sólo se reconstruye aplicando la matriz', () => {
  // En una página /Rotate 90 los fragmentos de una misma fila visual comparten
  // la x del PDF, no la y. Es el caso que motiva aplicar el viewport.
  const items = [
    frag('Hemoglobina', 100, 50),
    frag('13,5', 100, 200),
    frag('Creatinina', 130, 50),
    frag('1,10', 130, 200),
  ];

  // Sin la matriz, se agrupan por la vertical equivocada y quedan pegados los
  // dos analitos en una línea y sus dos valores en otra: la tabla es ilegible.
  assert.deepEqual(groupPdfTextItemsIntoLines(items), ['13,5 1,10', 'Hemoglobina Creatinina']);

  // Con la matriz de rotación, x'=y e y'=x: las filas se recomponen.
  const rotado = groupPdfTextItemsIntoLines(items, [0, 1, 1, 0, 0, 0]);
  assert.deepEqual(rotado, ['Hemoglobina 13,5', 'Creatinina 1,10']);
});

test('el dos puntos separado se pega a su etiqueta sin romper las horas', () => {
  assert.deepEqual(groupPdfTextItemsIntoLines([frag('Rut/Fic', 10, 100), frag(':', 60, 100), frag('16.940.645-6', 70, 100)]),
    ['Rut/Fic: 16.940.645-6']);
  // Una hora viene sin espacios alrededor del dos puntos: queda intacta.
  assert.deepEqual(groupPdfTextItemsIntoLines([frag('Hora', 10, 100), frag('10:15', 90, 100)]),
    ['Hora 10:15']);
  // Y con el dos puntos suelto, se pega a la etiqueta sin tocar la hora.
  assert.deepEqual(groupPdfTextItemsIntoLines([frag('Hora', 10, 100), frag(':', 40, 100), frag('10:15', 90, 100)]),
    ['Hora: 10:15']);
});

test('groupPdfTextItemsIntoLines descarta fragmentos vacíos o malformados', () => {
  const lines = groupPdfTextItemsIntoLines([
    frag('Sodio', 50, 100),
    frag('   ', 80, 100),
    { str: 'sin transform' },
    null,
    frag('138', 200, 100),
  ]);
  assert.deepEqual(lines, ['Sodio 138']);
  assert.deepEqual(groupPdfTextItemsIntoLines(null), []);
});
