import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';

const readJson = async file => JSON.parse(await readFile(file, 'utf8'));
const [pkg, lock, manifest] = await Promise.all([
  readJson('package.json'),
  readJson('package-lock.json'),
  readJson('manifest.json'),
]);

assert.equal(manifest.manifest_version, 3, 'manifest.json must use Manifest V3');
assert.equal(manifest.version, pkg.version, 'manifest.json and package.json versions differ');
assert.equal(lock.version, pkg.version, 'package-lock.json and package.json versions differ');
assert.equal(lock.packages?.['']?.version, pkg.version, 'root package-lock version differs');
assert.deepEqual(manifest.host_permissions, ['https://clinicohangaroa.eloisa.cl/*'], 'unexpected host permission');

const required = [
  'app.html', 'app.js', 'popup.html', 'popup-init.js', 'report.html', 'report.js',
  ...Object.values(manifest.icons ?? {}),
  ...Object.values(manifest.action?.default_icon ?? {}),
];
await Promise.all([...new Set(required)].map(file => access(file)));

globalThis.console.log(`Extensión Rayen v${pkg.version}: fuente válida`);
