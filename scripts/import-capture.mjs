/**
 * Importa una captura anonimizada (descargada desde el Explorador API) como
 * fixture del arnés: `node scripts/import-capture.mjs <archivo.json> <endpoint>`
 * endpoint ∈ master | historial | antecedentes | programas | vigencias | riesgo | ram.
 *
 * Antes de copiar vuelve a pasar el anonimizador y busca RUT, correos y
 * teléfonos: si algo queda, no importa. Los fixtures no se versionan (.gitignore).
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { anonimizar } from '../src/core/anonimizar.js';

const ENDPOINTS = ['master', 'historial', 'antecedentes', 'programas', 'vigencias', 'riesgo', 'ram'];
const [, , archivo, endpoint] = globalThis.process.argv;
const fail = msg => { globalThis.console.error(msg); globalThis.process.exit(1); };
if (!archivo || !ENDPOINTS.includes(endpoint)) fail(`Uso: node scripts/import-capture.mjs <archivo.json> <${ENDPOINTS.join('|')}>`);

const cap = JSON.parse(await readFile(archivo, 'utf8'));
if (!cap || typeof cap !== 'object' || !('datos' in cap) || !cap.anonimizado) fail('No es una captura del Explorador (falta «datos» o «anonimizado»).');
const otra = anonimizar(cap.datos, { desplazamientoDias: 0 });
if (!otra.verificado) fail(`La captura conserva restos: ${otra.restos.join(', ')}.`);
const texto = JSON.stringify(cap.datos);
const patrones = [[/\b\d{1,2}\.\d{3}\.\d{3}-[\dkK]\b|\b\d{7,8}-[\dkK]\b/, 'RUT'], [/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/, 'correo'], [/\+56\s?\d[\d\s]{7,}\d|\b9\s?\d{4}\s?\d{4}\b/, 'teléfono']];
for (const [re, que] of patrones) if (re.test(texto)) fail(`La captura contiene un ${que} en el texto: no se importa.`);
if (otra.informe.nombres > 0) fail(`La captura todavía tenía ${otra.informe.nombres} campos de nombre sin anonimizar: no se importa.`);

const dir = path.join('dev', 'fixtures');
await mkdir(dir, { recursive: true });
const destino = `${endpoint}.json`;
await writeFile(path.join(dir, destino), JSON.stringify(cap, null, 2));
let manifest = {};
try { manifest = JSON.parse(await readFile(path.join(dir, 'manifest.json'), 'utf8')); } catch { /* primero */ }
manifest[endpoint] = destino;
await writeFile(path.join(dir, 'manifest.json'), JSON.stringify(manifest, null, 2));
globalThis.console.log(`Importada como dev/fixtures/${destino}; el arnés la servirá para ${endpoint}. Sin RUT, correos ni teléfonos; ${otra.informe.identificadores} identificadores ya eran correlativos.`);
