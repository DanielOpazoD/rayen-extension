import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

/**
 * Three contracts nothing else checks:
 *  1. every element id the JS asks for exists (in app.html or created by JS);
 *  2. every export is imported somewhere (app, src, dev or a test);
 *  3. every named import resolves to an export of its module (the browser
 *     refuses to boot on a missing one, and node --test never loads the UI).
 * The first would have caught v2.0.0, which crashed on a removed button; the
 * third, v2.49.0, which moved `fmtFecha` and left one importer behind.
 */
const read = f => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');
function jsFiles(dir) {
  const base = new URL(`../${dir}/`, import.meta.url);
  return readdirSync(base, { withFileTypes: true }).flatMap(entry => {
    const rel = `${dir}/${entry.name}`;
    return entry.isDirectory() ? jsFiles(rel) : entry.name.endsWith('.js') ? [rel] : [];
  });
}
const srcFiles = jsFiles('src');
const appFiles = ['app.js', ...srcFiles];
const testFiles = jsFiles('tests').filter(f => f.endsWith('.test.js'));
// Los recorridos de Playwright también consumen exportaciones: los pasos que se
// inyectan en la pestaña de SysLab sólo se pueden probar en un navegador real.
const e2eFiles = jsFiles('e2e').filter(f => f.endsWith('.spec.js'));
// A pure helper exported only so a test can reach it is fine; an export nobody
// imports — not even a test — is dead weight.
const consumers = [...appFiles, 'report.js', 'popup-init.js', 'dev/fixture.js', 'dev/chrome-stub.js', ...testFiles, ...e2eFiles];

test('every $(id) / getElementById(id) resolves to an element in app.html or one the JS creates', () => {
  const html = read('app.html');
  const known = new Set([...html.matchAll(/\bid="([A-Za-z0-9_-]+)"/g)].map(m => m[1]));
  for (const f of appFiles) {
    const js = read(f);
    for (const m of js.matchAll(/\bid="([A-Za-z0-9_-]+)"|\.id\s*=\s*'([A-Za-z0-9_-]+)'/g)) known.add(m[1] ?? m[2]);
  }
  const missing = [];
  for (const f of appFiles) {
    for (const m of read(f).matchAll(/\$\('([A-Za-z0-9_-]+)'\)|getElementById\('([A-Za-z0-9_-]+)'\)/g)) {
      const id = m[1] ?? m[2];
      if (!known.has(id)) missing.push(`${f}: #${id}`);
    }
  }
  assert.deepEqual(missing, [], 'ids referenced but never defined');
});

test('every export in src/ is imported somewhere', () => {
  const importedBy = new Map();
  for (const f of consumers) {
    for (const m of read(f).matchAll(/import\s+([\s\S]*?)\s+from\s+['"]([^'"]+)['"]/g)) {
      const [, spec, target] = m;
      if (!target.startsWith('.')) continue;
      const mod = path.posix.normalize(path.posix.join(path.posix.dirname(f), target)).replace(/\.js$/, '');
      if (!importedBy.has(mod)) importedBy.set(mod, new Set());
      if (/^\*\s+as\s+/.test(spec.trim())) importedBy.get(mod).add('*');
      const named = spec.match(/\{([^}]+)\}/)?.[1] ?? '';
      for (const name of named.split(',').map(s => s.trim().split(/\s+as\s+/)[0]).filter(Boolean)) importedBy.get(mod).add(name);
    }
  }
  const dead = [];
  for (const f of srcFiles) {
    const mod = f.slice(0, -3);
    for (const m of read(f).matchAll(/^export\s+(?:async\s+)?(?:function|const|let|class)\s+([A-Za-z_$][\w$]*)/gm)) {
      if (!importedBy.get(mod)?.has('*') && !importedBy.get(mod)?.has(m[1])) dead.push(`${f}: ${m[1]}`);
    }
  }
  assert.deepEqual(dead, [], 'exports nobody imports — delete them or un-export them');
});

test('every named import resolves to an export of its module', () => {
  const exportsOf = new Map();
  const exportNames = f => {
    if (exportsOf.has(f)) return exportsOf.get(f);
    const names = new Set();
    const js = read(f);
    for (const m of js.matchAll(/^export\s+(?:async\s+)?(?:function|const|let|class)\s+([A-Za-z_$][\w$]*)/gm)) names.add(m[1]);
    for (const m of js.matchAll(/^export\s+\{([^}]+)\}/gm)) for (const n of m[1].split(',')) names.add(n.trim().split(/\s+as\s+/).pop());
    exportsOf.set(f, names);
    return names;
  };
  const broken = [];
  for (const f of [...consumers, ...jsFiles('dev')]) {
    for (const m of read(f).matchAll(/import\s+\{([^}]+)\}\s+from\s+['"](\.[^'"]+\.js)['"]/g)) {
      const target = path.posix.normalize(path.posix.join(path.posix.dirname(f), m[2]));
      if (!target.startsWith('src/') && !target.startsWith('dev/')) continue;
      let names;
      try { names = exportNames(target); } catch { broken.push(`${f}: módulo inexistente ${target}`); continue; }
      for (const raw of m[1].split(',')) {
        const name = raw.trim().split(/\s+as\s+/)[0];
        if (name && !names.has(name)) broken.push(`${f}: '${name}' no lo exporta ${target}`);
      }
    }
  }
  assert.deepEqual(broken, [], 'imports que el navegador rechazaría al arrancar');
});
