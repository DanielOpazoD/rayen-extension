import { test } from 'node:test';
import assert from 'node:assert/strict';
import { humanError } from '../src/errors.js';

// Antes la interfaz mostraba «HSR: error — Failed to fetch» y «Error: HTTP 500
// /Citas/ListaPacientesCitados/…»: frases para el programador, no para quien
// atiende pacientes.
class AuthError extends Error {}
class SyslabAuthError extends Error {}

test('un fallo de red dice con quién no se pudo hablar y qué revisar', () => {
  assert.equal(humanError(new TypeError('Failed to fetch'), 'el portal del Hospital Salvador'),
    'No se pudo conectar con el portal del Hospital Salvador. Revisa la conexión o la red del hospital.');
});

test('un error de sesión invita a iniciar sesión en el sitio correcto', () => {
  assert.match(humanError(new AuthError('401'), 'Eloisa'), /sesión de Eloisa.*inicia sesión/);
  assert.match(humanError(new Error('HTTP 403 /FichaClinica/x'), 'Eloisa'), /sesión de Eloisa/);
  // SysLab ya redacta sus mensajes para la persona: se respetan, con mayúscula y punto.
  assert.equal(humanError(new SyslabAuthError('abre SysLab en una pestaña e inicia sesión'), 'SysLab'),
    'Abre SysLab en una pestaña e inicia sesión.');
});

test('un HTTP 5xx no muestra la ruta interna', () => {
  const out = humanError(new Error('HTTP 502 /Citas/ListaPacientesCitados/5576/FechaHoraInicio=…'), 'Eloisa');
  assert.equal(out, 'Eloisa tuvo un error interno (código 502). Inténtalo más tarde.');
  assert.doesNotMatch(out, /Citas|\//);
});

test('un mensaje ya redactado se conserva; uno vacío o técnico cae en la frase genérica', () => {
  assert.equal(humanError(new Error('SysLab devolvió órdenes que no corresponden al RUN consultado.'), 'SysLab'),
    'SysLab devolvió órdenes que no corresponden al RUN consultado.');
  assert.equal(humanError(new TypeError("Cannot read properties of undefined (reading 'x')")), 'Ocurrió un error inesperado. Inténtalo de nuevo.');
  assert.equal(humanError(undefined), 'Ocurrió un error inesperado. Inténtalo de nuevo.');
  assert.equal(humanError(new Error('')), 'Ocurrió un error inesperado. Inténtalo de nuevo.');
});

test('el mensaje nunca es más largo que una frase ni trae saltos de línea', () => {
  const out = humanError(new Error('x'.repeat(400) + '\n' + 'stack line'));
  assert.ok(out.length <= 161);
  assert.doesNotMatch(out, /\n/);
});
