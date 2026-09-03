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

for (const file of ['README.md', 'ARCHITECTURE.md', 'DOCUMENTATION_MAP.md', 'MAPA_API.html', 'CHANGELOG.md']) {
  await access(file);
}

assert.match(readme, /\(ARCHITECTURE\.md\)/, 'README.md must link to ARCHITECTURE.md');
assert.match(readme, /\(DOCUMENTATION_MAP\.md\)/, 'README.md must link to DOCUMENTATION_MAP.md');
assert.match(documentationMap, /\(ARCHITECTURE\.md\)/, 'DOCUMENTATION_MAP.md must link to ARCHITECTURE.md');
assert.match(documentationMap, /\(MAPA_API\.html\)/, 'DOCUMENTATION_MAP.md must link to MAPA_API.html');

globalThis.console.log(`Mapa arquitectónico vigente: ${actual.length} módulos documentados.`);
