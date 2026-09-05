import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isMine, contactsFromSICs } from '../src/core/sic-rules.js';

/**
 * Reglas puras de interconsultas. Antes no tenían prueba propia: se probaban
 * de rebote desde state.js. Formas como las deja parseSIC (io/sic.js).
 */
const sic = (over = {}) => ({
  paciente: { run: '25106217K', telefono: '9 1111 1111', direccion: 'Calle Ejemplo 1', prevision: 'FONASA B', tipoUsuario: 'Inscrito', edad: '41' },
  registrador: { id: 1 }, ejecutor: { id: 2 },
  ...over,
});

test('isMine: la SIC es mía si la registré o la ejecuto; el oficial se puede inyectar', () => {
  assert.equal(isMine(sic(), 1), true, 'registrador');
  assert.equal(isMine(sic(), 2), true, 'ejecutor');
  assert.equal(isMine(sic(), 3), false);
  assert.equal(isMine(sic({ registrador: null, ejecutor: undefined }), 1), false, 'sin prestadores no lanza');
});

test('contactsFromSICs: un contacto por RUN, y una SIC posterior sólo rellena lo que falta sin borrar lo que había', () => {
  const m = contactsFromSICs([
    sic(),
    sic({ paciente: { run: '25106217K', telefono: '', direccion: 'Otra dirección 9', prevision: '', tipoUsuario: '', edad: '' } }),
    sic({ paciente: { run: null, telefono: '9 0000 0000' } }),
  ]);
  assert.equal(m.size, 1, 'sin RUN no hay contacto');
  const c = m.get('25106217K');
  assert.equal(c.telefono, '9 1111 1111', 'el vacío posterior no borra el teléfono');
  assert.equal(c.direccion, 'Otra dirección 9', 'el dato nuevo reemplaza');
  assert.deepEqual([c.prevision, c.tipoUsuario, c.edad], ['FONASA B', 'Inscrito', '41']);
  assert.equal(contactsFromSICs([]).size, 0);
});
