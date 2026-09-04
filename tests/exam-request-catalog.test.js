import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  EXAM_CATEGORIES,
  PROCEDENCIA_OPTIONS,
  FONASA_LEVELS,
  getExamCategoryById,
} from '../src/exam-request-catalog.js';

// Recuentos clavados a mano contra el impreso: si alguien borra un examen al
// reordenar el catálogo, esto lo delata antes de que llegue a una solicitud.
const EXAMENES_POR_CATEGORIA = {
  bioquimica: 21,
  hematologia: 8,
  coagulacion: 5,
  hormonas: 5,
  microbiologicos: 7,
  orina: 3,
  parasitologia: 3,
  virologia: 4,
  inmunologia: 4,
  otros: 5,
};
const TOTAL_EXAMENES = 65;

test('el catálogo trae las 10 categorías del formulario, en orden', () => {
  assert.equal(EXAM_CATEGORIES.length, 10);
  assert.deepEqual(
    EXAM_CATEGORIES.map(c => c.id),
    ['bioquimica', 'hematologia', 'coagulacion', 'hormonas', 'microbiologicos',
      'orina', 'parasitologia', 'virologia', 'inmunologia', 'otros'],
  );
});

test('cada categoría conserva su recuento de exámenes', () => {
  for (const categoria of EXAM_CATEGORIES) {
    assert.equal(categoria.exams.length, EXAMENES_POR_CATEGORIA[categoria.id], categoria.id);
  }
  const total = EXAM_CATEGORIES.reduce((suma, c) => suma + c.exams.length, 0);
  assert.equal(total, TOTAL_EXAMENES);
});

test('ids únicos: dos categorías con el mismo id ocultarían una en el lookup', () => {
  const ids = EXAM_CATEGORIES.map(c => c.id);
  assert.equal(new Set(ids).size, ids.length);
});

test('ninguna etiqueta vacía y ningún examen repetido dentro de su categoría', () => {
  for (const categoria of EXAM_CATEGORIES) {
    assert.ok(categoria.id.trim().length > 0, 'id vacío');
    assert.ok(categoria.name.trim().length > 0, `nombre vacío en ${categoria.id}`);
    assert.ok(categoria.exams.length > 0, `categoría sin exámenes: ${categoria.id}`);
    for (const examen of categoria.exams) {
      assert.equal(typeof examen, 'string');
      assert.ok(examen.trim().length > 0, `examen vacío en ${categoria.id}`);
      assert.equal(examen, examen.trim(), `examen con espacios al borde en ${categoria.id}: ${examen}`);
    }
    const unicos = new Set(categoria.exams);
    assert.equal(unicos.size, categoria.exams.length, `examen repetido en ${categoria.id}`);
  }
});

test('el tubo sólo lo declaran las categorías que lo llevan impreso', () => {
  assert.equal(getExamCategoryById('bioquimica').tube, 'TUBO AMARILLO – ROJO');
  assert.equal(getExamCategoryById('hematologia').tube, 'TUBO LILA');
  assert.equal(getExamCategoryById('coagulacion').tube, 'TUBO CELESTE');
  assert.equal(getExamCategoryById('hormonas').tube, 'TUBO AMARILLO – ROJO');
  assert.equal(getExamCategoryById('inmunologia').tube, 'TUBO AMARILLO – ROJO');
  for (const id of ['microbiologicos', 'orina', 'parasitologia', 'virologia', 'otros']) {
    assert.equal(getExamCategoryById(id).tube, undefined, id);
  }
});

// Etiquetas que un corrector ortográfico "arreglaría" y que deben quedarse como
// están: son las del impreso que lee el laboratorio.
test('las rarezas tipográficas del impreso se conservan literales', () => {
  assert.ok(getExamCategoryById('parasitologia').exams.includes('COPROPARASITARO'));
  assert.ok(getExamCategoryById('hormonas').exams.includes('SUB. UND Β- HCG'), 'beta griega');
  assert.equal(getExamCategoryById('inmunologia').name, 'INMUNOLOGIA/SEROLOGÍA');
  assert.ok(getExamCategoryById('coagulacion').exams.includes('TIEMPO DE SANGRÍA'));
  assert.ok(getExamCategoryById('bioquimica').exams.includes('GOT – GPT'), 'raya, no guion');
});

test('los exámenes de tubo verde no viven en bioquímica', () => {
  const bioquimica = getExamCategoryById('bioquimica');
  assert.ok(!bioquimica.exams.includes('ELECTROLITOS PLASMATICOS'));
  assert.ok(!bioquimica.exams.includes('LACTATO'));
});

test('getExamCategoryById resuelve por id, no por posición', () => {
  assert.equal(getExamCategoryById('bioquimica').name, 'BIOQUIMICA');
  assert.equal(getExamCategoryById('inmunologia').name, 'INMUNOLOGIA/SEROLOGÍA');
  assert.equal(getExamCategoryById('otros'), EXAM_CATEGORIES[9]);
});

test('getExamCategoryById lanza con un id inexistente en vez de devolver nada', () => {
  assert.throws(() => getExamCategoryById('cardiologia'), /Categoría de exámenes desconocida: cardiologia/);
  assert.throws(() => getExamCategoryById(''), /desconocida/);
  assert.throws(() => getExamCategoryById(undefined), /desconocida/);
  assert.throws(() => getExamCategoryById('BIOQUIMICA'), /desconocida/, 'el id distingue mayúsculas');
});

// Con un objeto plano como índice, estos ids heredados devolverían algo truthy
// y el formulario armaría una sección con basura.
test('los nombres heredados de Object.prototype no son categorías', () => {
  for (const id of ['constructor', 'toString', 'hasOwnProperty', '__proto__']) {
    assert.throws(() => getExamCategoryById(id), /desconocida/, id);
  }
});

test('el catálogo está congelado: nadie lo contamina para el resto de la sesión', () => {
  assert.throws(() => EXAM_CATEGORIES.push({ id: 'x', name: 'X', exams: ['Y'] }), TypeError);
  assert.throws(() => { getExamCategoryById('orina').exams.push('EXAMEN FANTASMA'); }, TypeError);
  assert.throws(() => { getExamCategoryById('orina').name = 'OTRA COSA'; }, TypeError);
  assert.throws(() => PROCEDENCIA_OPTIONS.push('Pabellón'), TypeError);
  assert.throws(() => FONASA_LEVELS.push('E'), TypeError);
});

test('PROCEDENCIA_OPTIONS: las 6 procedencias del impreso, sin etiquetas vacías', () => {
  assert.deepEqual(
    [...PROCEDENCIA_OPTIONS],
    ['Infantil', 'Adulto', 'Maternal', 'Policlínico', 'Hospitalización', 'Urgencia'],
  );
  for (const opcion of PROCEDENCIA_OPTIONS) assert.ok(opcion.trim().length > 0);
});

test('FONASA_LEVELS: los cuatro tramos, sin etiquetas vacías', () => {
  assert.deepEqual([...FONASA_LEVELS], ['A', 'B', 'C', 'D']);
  for (const tramo of FONASA_LEVELS) assert.ok(tramo.trim().length > 0);
});
