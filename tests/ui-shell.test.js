import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = file => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
const html = read('app.html');
const css = read('styles/app.css');
const dev = read('dev/index.html');

test('la aplicación carga una única hoja visual local y empaquetada', () => {
  const stylesheets = [...html.matchAll(/<link\b[^>]*rel="stylesheet"[^>]*href="([^"]+)"[^>]*>/g)].map(match => match[1]);
  assert.deepEqual(stylesheets, ['styles/app.css']);
  assert.doesNotMatch(html, /<style\b/i, 'app.html no debe volver a concentrar estilos');

  const pkg = JSON.parse(read('package.json'));
  assert.match(pkg.scripts.pack, /\bsrc styles icons\b/, 'el ZIP debe incluir la hoja visual');
  assert.match(dev, /querySelectorAll\('link\[href\]'\)/, 'el arnés debe trasladar recursos enlazados');
  assert.match(dev, /new URL\(link\.getAttribute\('href'\), appRoot\)/, 'el arnés debe resolverlos desde la raíz de la app');
});

test('los contratos visuales cubren foco, movimiento, modo oscuro y pantallas estrechas', () => {
  assert.match(css, /:focus-visible/);
  assert.match(css, /prefers-reduced-motion:reduce/);
  assert.match(css, /prefers-color-scheme:dark/);
  assert.match(css, /@media\s*\(max-width:620px\)/);
  assert.match(css, /\.tabs\{[^}]*overflow-x:auto/);
});

test('los destinos de navegación accesible existen y cada pestaña controla un panel', () => {
  const ids = new Set([...html.matchAll(/\bid="([A-Za-z0-9_-]+)"/g)].map(match => match[1]));
  const references = [...html.matchAll(/\b(?:aria-controls|aria-labelledby)="([^"]+)"/g)]
    .flatMap(match => match[1].split(/\s+/));

  assert.deepEqual(references.filter(id => !ids.has(id)), [], 'referencias ARIA sin destino');
  assert.match(html, /<a class="skip-link" href="#mainContent">Saltar al contenido<\/a>/);
  assert.match(html, /<main id="mainContent" tabindex="-1">/);

  const tabs = [...html.matchAll(/<button\b[^>]*role="tab"[^>]*>/g)].map(match => match[0]);
  assert.ok(tabs.length >= 6, 'debe existir la navegación principal por pestañas');
  for (const tab of tabs) {
    const panelId = tab.match(/aria-controls="([^"]+)"/)?.[1];
    assert.ok(panelId, `pestaña sin aria-controls: ${tab}`);
    assert.match(html, new RegExp(`<[^>]+id="${panelId}"[^>]+role="tabpanel"`));
  }
});
