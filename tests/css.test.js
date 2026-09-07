import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/**
 * Dos reglas de nivel superior para la misma clase son normales cuando se
 * complementan (una pone la caja, otra la tipografía). Lo que nunca es
 * intencional es que asignen la MISMA propiedad con valores distintos: eso
 * significa que dos elementos diferentes comparten nombre y uno pisa al otro.
 * Ocurrió de verdad: el icono «i» del registro tardío (v2.46.1) se llamó
 * `.pp-info` como el contenedor del nombre en la cabecera del panel, y le puso
 * `flex:none` y 14 px de ancho encima de su `flex:1`. El nombre y el RUN del
 * paciente quedaron invisibles durante nueve versiones.
 */
const css = readFileSync(new URL('../styles/app.css', import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

/** Reglas de nivel superior (fuera de @media y @supports): [selector, cuerpo]. */
function topLevelRules(text) {
  const out = [];
  let depth = 0, buf = '', sel = '';
  for (const ch of text) {
    if (ch === '{') {
      depth += 1;
      if (depth === 1) { sel = buf.trim(); buf = ''; } else buf += ch;
    } else if (ch === '}') {
      depth -= 1;
      if (depth === 0) { if (!sel.startsWith('@')) out.push([sel, buf]); buf = ''; } else buf += ch;
    } else buf += ch;
  }
  return out;
}

const declaraciones = cuerpo => new Map(cuerpo.split(';').map(d => d.split(':')).filter(p => p.length >= 2)
  .map(([prop, ...v]) => [prop.trim(), v.join(':').trim()]));

test('ninguna clase tiene dos reglas base que asignen la misma propiedad con distinto valor', () => {
  // Sólo reglas cuyo selector sea exactamente una clase. Una regla agrupada
  // («.sync-meta,.sync-pending{color:…}») con su excepción inmediata es
  // deliberada; dos reglas propias que se contradicen, no.
  const porClase = new Map();
  for (const [sel, cuerpo] of topLevelRules(css)) {
    const p = sel.trim();
    if (!/^\.[A-Za-z0-9_-]+$/.test(p)) continue;
    if (!porClase.has(p)) porClase.set(p, new Map());
    const vistas = porClase.get(p);
    for (const [prop, valor] of declaraciones(cuerpo)) {
      if (vistas.has(prop) && vistas.get(prop) !== valor) {
        assert.fail(`${p} define «${prop}» dos veces con valores distintos («${vistas.get(prop)}» y «${valor}»): dos elementos comparten nombre de clase`);
      }
      vistas.set(prop, valor);
    }
  }
  assert.ok(porClase.size > 100, 'la hoja de estilos se leyó y tiene reglas base');
});
