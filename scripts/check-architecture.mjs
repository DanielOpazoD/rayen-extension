import assert from 'node:assert/strict';
import { access, readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

async function listJavaScriptFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async entry => {
    const target = path.join(dir, entry.name);
    return entry.isDirectory() ? listJavaScriptFiles(target) : target.endsWith('.js') ? [target] : [];
  }));
  return nested.flat();
}

const [architecture, documentationMap, readme] = await Promise.all([
  readFile('ARCHITECTURE.md', 'utf8'),
  readFile('DOCUMENTATION_MAP.md', 'utf8'),
  readFile('README.md', 'utf8'),
]);

const map = architecture.match(/<!-- module-map:start -->([\s\S]*?)<!-- module-map:end -->/);
assert.ok(map, 'ARCHITECTURE.md must contain the module-map markers');

const documented = [...map[1].matchAll(/`(src\/[^`]+\.js)`/g)].map(match => match[1]);
const actual = (await listJavaScriptFiles('src')).map(file => file.split(path.sep).join('/')).sort();

assert.equal(new Set(documented).size, documented.length, 'the architecture map contains duplicate modules');
assert.deepEqual([...documented].sort(), actual, 'ARCHITECTURE.md must document every src/**/*.js module exactly once');
const LAYERS = ['src/core/', 'src/io/', 'src/ui/', 'src/ai/'];
for (const file of actual) assert.ok(LAYERS.some(layer => file.startsWith(layer)), `${file} debe vivir en una capa: ${LAYERS.join(', ')}`);

// Cada módulo debe figurar bajo el encabezado de SU capa: un módulo de io listado
// como núcleo promete una pureza que el lint no vigila.
const HEADINGS = [['src/core/', '**Núcleo'], ['src/io/', '**Entrada/salida'], ['src/ui/', '**Interfaz'], ['src/ai/', '**Inteligencia artificial']];
let currentLayer = null;
const misplaced = [];
for (const line of map[1].split('\n')) {
  const heading = HEADINGS.find(([, h]) => line.startsWith(h));
  if (heading) { currentLayer = heading[0]; continue; }
  const m = line.match(/^- `(src\/[^`]+\.js)`/);
  if (m && !m[1].startsWith(currentLayer ?? '')) misplaced.push(`${m[1]} está bajo ${currentLayer ?? 'ningún encabezado'}`);
}
assert.deepEqual(misplaced, [], 'ARCHITECTURE.md lista módulos bajo la capa equivocada');

for (const file of ['README.md', 'ARCHITECTURE.md', 'DOCUMENTATION_MAP.md', 'MAPA_API.html', 'CHANGELOG.md']) {
  await access(file);
}

assert.match(readme, /\(ARCHITECTURE\.md\)/, 'README.md must link to ARCHITECTURE.md');
assert.match(readme, /\(DOCUMENTATION_MAP\.md\)/, 'README.md must link to DOCUMENTATION_MAP.md');
assert.match(documentationMap, /\(ARCHITECTURE\.md\)/, 'DOCUMENTATION_MAP.md must link to ARCHITECTURE.md');
assert.match(documentationMap, /\(MAPA_API\.html\)/, 'DOCUMENTATION_MAP.md must link to MAPA_API.html');

// Toda ruta src/… citada en la documentación debe existir: una tabla «dónde tocar»
// con rutas viejas es peor que ninguna.
const existing = new Set(actual);
for (const [name, text] of [['ARCHITECTURE.md', architecture], ['README.md', readme], ['DOCUMENTATION_MAP.md', documentationMap]]) {
  const phantom = [...new Set([...text.matchAll(/src\/[A-Za-z0-9_./-]+\.js/g)].map(m => m[0]))].filter(p => !existing.has(p));
  assert.deepEqual(phantom, [], `${name} cita módulos que no existen`);
}

globalThis.console.log(`Mapa arquitectónico vigente: ${actual.length} módulos documentados; rutas citadas verificadas.`);
