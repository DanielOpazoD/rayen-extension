import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  EXAM_REQUEST_TEXTS,
  PRAIS_PREVISION,
  buildExamRequestLayout,
  buildExamRequestOpenState,
  examRequestKey,
  previsionForFonasaLevel,
  previsionMarks,
  resolveExamRequestPrevision,
  runExamRequestPrint,
  toggleExamSelection,
} from '../src/exam-request.js';
import {
  EXAM_CATEGORIES,
  FONASA_LEVELS,
  PROCEDENCIA_OPTIONS,
} from '../src/exam-request-catalog.js';

/** Todas las filas del impreso: secciones, pie de columna y pie de página. */
function filasDeLaMaqueta(layout) {
  const filas = [];
  for (const columna of layout.columns) {
    for (const seccion of columna.sections) filas.push(...seccion.rows);
    if (columna.footer) filas.push(...columna.footer.rows);
  }
  filas.push(...layout.footer.section.rows);
  return filas;
}

// ── Selección de exámenes ────────────────────────────────────────────────────

test('marcar y desmarcar una casilla sin tocar la selección anterior', () => {
  const inicial = new Set(['hematologia|HEMOGRAMA']);

  const conGlicemia = toggleExamSelection(inicial, 'bioquimica|GLICEMIA');
  const sinHemograma = toggleExamSelection(conGlicemia, 'hematologia|HEMOGRAMA');

  assert.equal(inicial.size, 1, 'el Set recibido no se muta');
  assert.ok(!inicial.has('bioquimica|GLICEMIA'));
  assert.ok(conGlicemia.has('hematologia|HEMOGRAMA'));
  assert.ok(conGlicemia.has('bioquimica|GLICEMIA'));
  assert.ok(!sinHemograma.has('hematologia|HEMOGRAMA'));
  assert.equal(sinHemograma.size, 1);
});

test('marcar dos veces la misma casilla la deja desmarcada', () => {
  const clave = examRequestKey('orina-parasitos', 'ACAROTEST');
  const ida = toggleExamSelection(new Set(), clave);
  const vuelta = toggleExamSelection(ida, clave);

  assert.equal(ida.size, 1);
  assert.equal(vuelta.size, 0);
});

// El mismo examen impreso en dos secciones son dos casillas distintas: marcar
// una no puede marcar la otra.
test('la clave lleva la sección, no sólo el nombre del examen', () => {
  assert.equal(examRequestKey('bioquimica', 'GLICEMIA'), 'bioquimica|GLICEMIA');
  assert.notEqual(
    examRequestKey('orina-parasitos', 'TEST DE EMBARAZO'),
    examRequestKey('virologia-otros', 'TEST DE EMBARAZO'),
  );
});

test('el formulario se abre sin exámenes marcados: no hereda los del paciente anterior', () => {
  const estado = buildExamRequestOpenState('FONASA B');

  assert.equal(estado.selectedExams.size, 0);
  assert.equal(estado.procedencia, 'Hospitalización');
  assert.ok(PROCEDENCIA_OPTIONS.includes(estado.procedencia), 'la procedencia por omisión existe en el impreso');
  assert.equal(estado.prevision, 'FONASA B');
});

test('cada apertura trae su propio Set: dos solicitudes no comparten marcas', () => {
  const primera = buildExamRequestOpenState();
  const segunda = buildExamRequestOpenState();

  primera.selectedExams.add('bioquimica|GLICEMIA');
  assert.equal(segunda.selectedExams.size, 0);
});

// ── Resolución de previsión ──────────────────────────────────────────────────

test('la previsión se normaliza a mayúsculas y sin espacios sobrantes', () => {
  assert.equal(resolveExamRequestPrevision('Fonasa b'), 'FONASA B');
  assert.equal(resolveExamRequestPrevision('  fonasa   b  '), 'FONASA B');
  assert.equal(resolveExamRequestPrevision('Isapre Colmena'), 'ISAPRE COLMENA');
});

test('sin previsión en la ficha se asume FONASA, no un vacío', () => {
  assert.equal(resolveExamRequestPrevision(), 'FONASA');
  assert.equal(resolveExamRequestPrevision(''), 'FONASA');
  assert.equal(resolveExamRequestPrevision('   '), 'FONASA');
  assert.equal(resolveExamRequestPrevision(null), 'FONASA');
});

test('un tramo FONASA marca su casilla y sólo la suya', () => {
  const marcas = previsionMarks('FONASA C');

  assert.equal(marcas.fonasa, 'C');
  assert.equal(marcas.prais, false);
});

// El tramo decide cuánto paga el paciente: inventarlo es peor que dejarlo en
// blanco para que lo escriba quien completa el formulario.
test('FONASA sin tramo no marca ningún tramo', () => {
  assert.deepEqual(previsionMarks('FONASA'), { fonasa: null, prais: false });
});

test('una isapre no marca casilla: el impreso la escribe en su línea en blanco', () => {
  assert.deepEqual(previsionMarks('ISAPRE COLMENA'), { fonasa: null, prais: false });
});

// PRAIS es un programa de reparación; PARTICULAR es pagar de su bolsillo. Que
// una marque la casilla de la otra falsea quién financia el examen.
test('PARTICULAR no marca la casilla PRAIS', () => {
  assert.equal(previsionMarks('PARTICULAR').prais, false);
  assert.equal(previsionMarks(PRAIS_PREVISION).prais, true);
});

test('previsión ausente o basura no marca nada', () => {
  for (const valor of [undefined, null, '', '   ', 'FONASA E', 'fonasab']) {
    assert.deepEqual(previsionMarks(valor), { fonasa: null, prais: false }, String(valor));
  }
});

test('marcar un tramo produce una previsión que vuelve a leerse como ese tramo', () => {
  for (const tramo of FONASA_LEVELS) {
    const prevision = previsionForFonasaLevel(tramo);
    assert.equal(prevision, `FONASA ${tramo}`);
    assert.equal(previsionMarks(prevision).fonasa, tramo);
  }
  assert.equal(previsionForFonasaLevel('b'), 'FONASA B', 'acepta minúsculas de la UI');
});

test('previsionForFonasaLevel lanza con un tramo que no existe en el impreso', () => {
  assert.throws(() => previsionForFonasaLevel('E'), /Tramo FONASA desconocido: E/);
  assert.throws(() => previsionForFonasaLevel(''), /desconocido/);
  assert.throws(() => previsionForFonasaLevel(undefined), /desconocido/);
});

// ── Maqueta de impresión ─────────────────────────────────────────────────────

test('la maqueta reparte el formulario en tres columnas', () => {
  const layout = buildExamRequestLayout();

  assert.equal(layout.columns.length, 3);
  assert.deepEqual(layout.columns[0].sections.map(s => s.id), ['bioquimica']);
  assert.deepEqual(layout.columns[1].sections.map(s => s.id), ['hematologia', 'coagulacion', 'microbiologicos']);
  assert.deepEqual(layout.columns[2].sections.map(s => s.id), ['hormonas', 'orina-parasitos', 'virologia-otros']);
});

test('hematología va a dos columnitas y microbiológicos absorbe el alto sobrante', () => {
  const [, segunda] = buildExamRequestLayout().columns;

  assert.equal(segunda.sections[0].columns, 2);
  assert.equal(segunda.sections[1].columns, 1);
  assert.equal(segunda.sections[2].fill, true, 'la última sección estira la columna');
  assert.equal(segunda.sections[0].fill, false);
});

// El tubo verde no está en el catálogo: es una nota al pie de la primera
// columna y sólo existe en la maqueta.
test('el pie de la primera columna trae los exámenes de tubo verde', () => {
  const layout = buildExamRequestLayout();

  assert.equal(layout.columns[0].footer.label, 'TUBO VERDE');
  assert.deepEqual(
    layout.columns[0].footer.rows.map(r => r.exam),
    ['ELECTROLITOS PLASMATICOS', 'LACTATO'],
  );
  assert.equal(layout.columns[1].footer, undefined);
  assert.equal(layout.columns[2].footer, undefined);
  const enElCatalogo = EXAM_CATEGORIES.flatMap(c => c.exams);
  for (const fila of layout.columns[0].footer.rows) {
    assert.ok(!enElCatalogo.includes(fila.exam), `${fila.exam} no debe estar también en el catálogo`);
  }
});

test('el pie de página lleva inmunología y las líneas que se completan a mano', () => {
  const { footer } = buildExamRequestLayout();

  assert.equal(footer.section.id, 'inmunologia');
  assert.equal(footer.section.title, 'INMUNOLOGIA/SEROLOGÍA');
  assert.deepEqual(footer.fields, [
    { label: 'OTROS', lines: 2 },
    { label: 'MEDICO TRATANTE', lines: 1 },
    { label: 'FIRMA', lines: 1 },
  ]);
});

test('las secciones fusionadas concatenan sus categorías en el orden impreso', () => {
  const [, , tercera] = buildExamRequestLayout().columns;
  const orinaParasitos = tercera.sections[1];
  const virologiaOtros = tercera.sections[2];

  assert.equal(orinaParasitos.title, 'Orina / Parásitos');
  assert.equal(orinaParasitos.rows[0].exam, 'SEDIMENTO URINARIO');
  assert.equal(orinaParasitos.rows.at(-1).exam, 'ACAROTEST');
  assert.equal(virologiaOtros.title, 'Virología / Otros');
  assert.equal(virologiaOtros.rows[0].exam, 'ROTAVIRUS');
  assert.equal(virologiaOtros.rows.at(-1).exam, 'MICOLOGICO DIRECTO');
});

test('el tubo se imprime sólo donde el catálogo lo declara', () => {
  const layout = buildExamRequestLayout();

  assert.equal(layout.columns[0].sections[0].tube, 'TUBO AMARILLO – ROJO');
  assert.equal(layout.columns[1].sections[0].tube, 'TUBO LILA');
  assert.equal(layout.columns[1].sections[2].tube, undefined, 'microbiológicos no lleva tubo');
  assert.equal(layout.columns[2].sections[1].tube, undefined, 'las fusionadas no inventan tubo');
  assert.equal(layout.footer.section.tube, 'TUBO AMARILLO – ROJO');
});

// Si alguien agrega un examen al catálogo y olvida darle sitio en la maqueta,
// el médico no podría pedirlo: la casilla no se imprimiría en ninguna parte.
test('el catálogo completo cabe en la maqueta, cada examen exactamente una vez', () => {
  const impresos = filasDeLaMaqueta(buildExamRequestLayout()).map(f => f.exam);
  const delCatalogo = EXAM_CATEGORIES.flatMap(c => c.exams);

  for (const examen of delCatalogo) {
    assert.equal(
      impresos.filter(e => e === examen).length,
      1,
      `${examen} debe aparecer una sola vez en la maqueta`,
    );
  }
  assert.equal(impresos.length, delCatalogo.length + 2, 'el catálogo más los dos de tubo verde');
});

test('ninguna casilla comparte clave con otra: marcar una no marca dos', () => {
  const claves = filasDeLaMaqueta(buildExamRequestLayout()).map(f => f.key);

  assert.equal(new Set(claves).size, claves.length);
});

test('cada fila trae la clave que le corresponde a su sección', () => {
  const layout = buildExamRequestLayout();

  for (const columna of layout.columns) {
    for (const seccion of columna.sections) {
      for (const fila of seccion.rows) {
        assert.equal(fila.key, examRequestKey(seccion.id, fila.exam));
      }
    }
    for (const fila of columna.footer?.rows ?? []) {
      assert.equal(fila.key, examRequestKey(columna.footer.id, fila.exam));
    }
  }
  for (const fila of layout.footer.section.rows) {
    assert.equal(fila.key, examRequestKey(layout.footer.section.id, fila.exam));
  }
});

test('la maqueta se entrega fresca: anotarla no contamina la siguiente solicitud', () => {
  const primera = buildExamRequestLayout();
  primera.columns[0].sections[0].rows.push({ exam: 'EXAMEN FANTASMA', key: 'x' });
  primera.footer.fields[0].label = 'OTRA COSA';

  const segunda = buildExamRequestLayout();
  assert.ok(!segunda.columns[0].sections[0].rows.some(f => f.exam === 'EXAMEN FANTASMA'));
  assert.equal(segunda.footer.fields[0].label, 'OTROS');
});

// ── Textos e impresión ───────────────────────────────────────────────────────

test('la única acción del formulario es imprimir', () => {
  assert.equal(EXAM_REQUEST_TEXTS.printLabel, 'Imprimir');
  for (const texto of Object.values(EXAM_REQUEST_TEXTS)) {
    assert.doesNotMatch(
      texto,
      /envi|remit|folio|registrad/i,
      `el formulario no se envía a ninguna parte: «${texto}»`,
    );
  }
});

test('los textos institucionales del impreso', () => {
  assert.equal(EXAM_REQUEST_TEXTS.formTitle, 'Solicitud de Exámenes de Laboratorio');
  assert.equal(EXAM_REQUEST_TEXTS.institution, 'Hospital Hanga Roa');
  assert.equal(EXAM_REQUEST_TEXTS.unit, 'Unidad de Laboratorio');
  assert.equal(EXAM_REQUEST_TEXTS.network, 'Red Salud Oriente');
  assert.equal(EXAM_REQUEST_TEXTS.modalTitle, 'Solicitud de Laboratorio');
});

/** Ventana falsa con temporizadores manuales: nada de esperas reales. */
function ventanaFalsa({ printLanza = false } = {}) {
  const pendientes = [];
  return {
    impresiones: 0,
    setTimeout(fn, ms) {
      pendientes.push({ fn, ms });
      return pendientes.length;
    },
    print() {
      this.impresiones += 1;
      if (printLanza) throw new Error('impresión bloqueada');
    },
    /** Ejecuta el temporizador pendiente más antiguo. */
    correr() {
      const siguiente = pendientes.shift();
      assert.ok(siguiente, 'no había temporizador pendiente');
      siguiente.fn();
      return siguiente.ms;
    },
    pendientes,
  };
}

// El navegador estampa el título del documento en la cabecera de cada hoja, y
// esta hoja es un impreso oficial del laboratorio.
test('el título se vacía para imprimir y se repone después', () => {
  const documentRef = { title: 'Rayen — Hospital Hanga Roa' };
  const windowRef = ventanaFalsa();

  runExamRequestPrint({ documentRef, windowRef, printDelayMs: 150, restoreDelayMs: 1000 });
  assert.equal(documentRef.title, '', 'vacío ya antes de que corra el temporizador');
  assert.equal(windowRef.impresiones, 0);

  assert.equal(windowRef.correr(), 150);
  assert.equal(windowRef.impresiones, 1);
  assert.equal(documentRef.title, '', 'sigue vacío mientras el diálogo está abierto');

  assert.equal(windowRef.correr(), 1000);
  assert.equal(documentRef.title, 'Rayen — Hospital Hanga Roa');
  assert.equal(windowRef.pendientes.length, 0);
});

// Si la reposición colgara del camino feliz, la pestaña se quedaría sin título
// hasta que alguien la recargue.
test('el título se repone aunque la impresión falle', () => {
  const documentRef = { title: 'Rayen' };
  const windowRef = ventanaFalsa({ printLanza: true });

  runExamRequestPrint({ documentRef, windowRef });
  assert.throws(() => windowRef.correr(), /impresión bloqueada/);
  windowRef.correr();

  assert.equal(documentRef.title, 'Rayen');
});
