/**
 * Cobertura de core, io y ai con el runner nativo. `node --test` ejecuta cada
 * archivo en un proceso hijo que no escribe la cobertura V8, y con
 * `--test-isolation=none` las pruebas comparten globales y 28 fallan; por eso
 * cada archivo corre en su propio proceso, en línea, con NODE_V8_COVERAGE.
 * La interfaz (src/ui) no se mide aquí: la cubren los recorridos de Playwright.
 */
import { spawnSync } from 'node:child_process';
import { readdirSync, rmSync } from 'node:fs';

const DIR = '.coverage';
const LINES = 90, BRANCHES = 75;
rmSync(DIR, { recursive: true, force: true });
const files = readdirSync('tests').filter(f => f.endsWith('.test.js')).sort();
let failed = 0;
for (const f of files) {
  const r = spawnSync(globalThis.process.execPath, [`tests/${f}`], { env: { ...globalThis.process.env, NODE_V8_COVERAGE: DIR }, stdio: 'pipe' });
  if (r.status !== 0) { failed += 1; globalThis.process.stderr.write(`✖ ${f}\n${r.stderr}`); }
}
if (failed) { globalThis.console.error(`${failed} archivos de prueba fallaron; la cobertura no vale.`); globalThis.process.exit(1); }
const report = spawnSync('npx', ['c8', 'report', '--temp-directory', DIR, '--reporter=text-summary', '--reporter=text',
  '--include', 'src/core/**', '--include', 'src/io/**', '--include', 'src/ai/**', '--all', '--src', '.',
  '--check-coverage', `--lines=${LINES}`, `--branches=${BRANCHES}`], { stdio: 'inherit' });
globalThis.process.exit(report.status ?? 1);
