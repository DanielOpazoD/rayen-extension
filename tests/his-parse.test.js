import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseConsficha, limpiarCelda, esLogin } from '../src/core/his-parse.js';

/**
 * El parser del HIS Hanga Roa contra su HTML real (fixture del proyecto RCE
 * VISOR). La regla que custodia: una atención sin link a ficha no es abrible y
 * no se muestra; la fecha se normaliza a ISO; urgencia y ambulatorio se
 * distinguen por el nombre del documento (PURG0005 vs PAMB0005).
 */
const html = readFileSync(new URL('./fixtures/his-consficha.html', import.meta.url), 'utf8');

test('parseConsficha lee las atenciones abribles y descarta las que no tienen ficha', () => {
  const rows = parseConsficha(html, '12.345.678-9');
  assert.equal(rows.length, 2, 'la fila «Control sin documento» (sin link) queda fuera');

  const amb = rows.find(r => r.idCuenta === '111');
  assert.equal(amb.tipoFicha, 'ambulatorio');
  assert.equal(amb.fecha, '2026-04-22', 'DD-MM-YYYY → ISO');
  assert.equal(amb.servicio, 'NEFROLOGIA');
  assert.equal(amb.tipoAtencion, 'AMB TLM Nefrología');
  assert.equal(amb.rut, '12.345.678-9', 'propaga el RUT tal como lo escribió el usuario');

  const urg = rows.find(r => r.idCuenta === '222');
  assert.equal(urg.tipoFicha, 'urgencia');
  assert.equal(urg.fecha, '2026-01-15');
});

test('limpiarCelda quita tags, entidades y colapsa espacios', () => {
  assert.equal(limpiarCelda('<b>Hola</b>&nbsp;&amp; chao'), 'Hola & chao');
  assert.equal(limpiarCelda('  a   b  '), 'a b');
});

test('esLogin reconoce el form de login y las páginas degradadas del HIS', () => {
  assert.equal(esLogin('<form action="acceso1.php"><input name="password"></form>'), true);
  assert.equal(esLogin('<div>Error de Acceso. Vuelva a iniciar</div>'), true);
  assert.equal(esLogin(html), false, 'la tabla de resultados no es una página de login');
});
