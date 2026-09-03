import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

/**
 * Two contracts nothing else checks:
 *  1. every element id the JS asks for exists (in app.html or created by JS);
 *  2. every export is imported somewhere (app, src, dev or a test).
 * The first would have caught v2.0.0, which crashed on a removed button.
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
// A pure helper exported only so a test can reach it is fine; an export nobody
// imports — not even a test — is dead weight.
const consumers = [...appFiles, 'report.js', 'popup-init.js', 'dev/fixture.js', 'dev/chrome-stub.js', ...testFiles];

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
