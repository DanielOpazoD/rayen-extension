/**
 * Sin ciclos de importación en src/: un ciclo hace que el orden de carga
 * decida qué símbolo está definido, y eso se rompe en silencio al mover código.
 */
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

async function files(dir) {
  const out = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...await files(p)); else if (p.endsWith('.js')) out.push(p);
  }
  return out;
}
const all = (await files('src')).map(f => f.split(path.sep).join('/'));
const graph = new Map();
for (const f of all) {
  const src = await readFile(f, 'utf8');
  const deps = [...src.matchAll(/(?:^import\s[^'"]*?from\s*|^export\s[^'"]*?from\s*)['"](\.[^'"]+)['"]/gm)]
    .map(m => path.posix.normalize(path.posix.join(path.posix.dirname(f), m[1])))
    .filter(d => d.startsWith('src/'));
  graph.set(f, deps);
}
const state = new Map(), cycles = [];
function visit(n, stack) {
  if (state.get(n) === 'done') return;
  if (state.get(n) === 'active') { cycles.push([...stack.slice(stack.indexOf(n)), n]); return; }
  state.set(n, 'active'); stack.push(n);
  for (const d of graph.get(n) ?? []) visit(d, stack);
  stack.pop(); state.set(n, 'done');
}
for (const f of all) visit(f, []);
if (cycles.length) {
  globalThis.console.error('Ciclos de importación:');
  for (const c of cycles) globalThis.console.error('  ' + c.join(' → '));
  globalThis.process.exit(1);
}
globalThis.console.log(`Sin ciclos de importación: ${all.length} módulos.`);
