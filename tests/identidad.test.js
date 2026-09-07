import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { identidad, identidadDeSesion, aplicarIdentidad, restablecerIdentidad } from '../src/core/identidad.js';
import { CONFIG } from '../src/core/config.js';

/**
 * De estos dos números depende qué atención es «mía». Adoptar uno equivocado
 * sería peor que no buscar ninguno: la aplicación mostraría el trabajo de otra
 * persona. Por eso las claves están ancladas y sólo se adoptan enteros válidos.
 */
beforeEach(() => restablecerIdentidad());

test('sin sesión se conserva la identidad de la configuración', () => {
  for (const sesion of [null, undefined, {}, 'texto', 42, []]) {
    restablecerIdentidad();
    const r = aplicarIdentidad(sesion);
    assert.deepEqual([r.officerId, r.nodeId, r.origen, r.cambio], [CONFIG.officerId, CONFIG.nodeId, 'config', false], String(sesion));
  }
});

test('encuentra la identidad esté donde esté dentro de la sesión', () => {
  const plano = identidadDeSesion({ idFuncionario: 777, idNodo: 42, rut: '11111111-1', nombreCompleto: 'Nombre Apellido Otro' });
  assert.deepEqual([plano.officerId, plano.nodeId, plano.rut, plano.nombre], [777, 42, '11111111-1', 'Nombre Apellido Otro']);
  const anidado = identidadDeSesion({ usuario: { perfil: { IdFuncionarioPrestador: 777, IdNodo: 42 } } });
  assert.deepEqual([anidado.officerId, anidado.nodeId], [777, 42]);
  assert.deepEqual(anidado.rutas, { officerId: 'usuario.perfil.IdFuncionarioPrestador', nodeId: 'usuario.perfil.IdNodo' });
  // Como texto también, que es como viaja media API de Rayen.
  assert.equal(identidadDeSesion({ funcionarioId: '777' }).officerId, 777);
  // Lo de fuera manda sobre lo enterrado: una clave del primer nivel describe la sesión.
  assert.equal(identidadDeSesion({ idNodo: 5, sub: { idNodo: 9 } }).nodeId, 5);
});

test('no adopta claves parecidas que hablan de otra persona o de otro sitio', () => {
  const r = identidadDeSesion({
    IdNodoOrigen: 1, IdNodoDestino: 2, IdFuncionarioRegistrador: 3, IdFuncionarioPrestadorEjecutor: 4,
    IdUsuarioAps: 5, IdFuncionarioCierraAtencionUrgencia: 6,
  });
  assert.deepEqual([r.officerId, r.nodeId], [undefined, undefined]);
});

test('descarta valores que no son un identificador', () => {
  for (const v of [0, -3, 1.5, '', 'abc', null, true, '12a', '1234567890']) {
    assert.equal(identidadDeSesion({ idFuncionario: v }).officerId, undefined, `«${v}» no es un id`);
  }
});

test('adopta lo que la sesión declara y avisa cuando no coincide con la configuración', () => {
  const r = aplicarIdentidad({ idFuncionario: 777, idNodo: 42, rut: '11111111-1' });
  assert.deepEqual([identidad.officerId, identidad.nodeId, identidad.origen], [777, 42, 'sesion']);
  assert.equal(r.cambio, true);
  assert.deepEqual(r.antes, { officerId: CONFIG.officerId, nodeId: CONFIG.nodeId });
  assert.equal(identidad.rut, '11111111-1');
  // La misma identidad que ya estaba no es un cambio.
  restablecerIdentidad();
  const igual = aplicarIdentidad({ idFuncionario: CONFIG.officerId, idNodo: CONFIG.nodeId });
  assert.equal(igual.cambio, false);
  assert.equal(igual.origen, 'sesion');
});

test('si la sesión sólo declara una de las dos, la otra se conserva y el origen es mixto', () => {
  const r = aplicarIdentidad({ idNodo: 42 });
  assert.deepEqual([identidad.officerId, identidad.nodeId, r.origen], [CONFIG.officerId, 42, 'mixto']);
  assert.equal(r.cambio, true);
});

test('restablecerIdentidad vuelve a la configuración', () => {
  aplicarIdentidad({ idFuncionario: 777, idNodo: 42, rut: 'x' });
  restablecerIdentidad();
  assert.deepEqual([identidad.officerId, identidad.nodeId, identidad.rut, identidad.origen], [CONFIG.officerId, CONFIG.nodeId, '', 'config']);
});
