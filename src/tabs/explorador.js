import { getRawSamples } from '../api.js';
import { explorerFetch, QUICK_LINKS, summarizeExtraFields } from '../explorer.js';
import { getFichaCaptures } from '../ficha.js';
import { anonimizar, resumenInforme } from '../anonimizar.js';
import { localDateStr } from '../parser.js';
import { esc, $ } from '../dom.js';

/** Raw API explorer, for discovering fields the UI does not show yet. */

export function renderExtras() {
  const extras = summarizeExtraFields(getRawSamples());
  if (!extras.length) return;
  $('extraFieldsBody').innerHTML = extras.map(({ key, count, sample }) => {
    const sampleStr = sample === null ? '—'
      : typeof sample === 'object' ? JSON.stringify(sample).slice(0, 80)
      : String(sample).slice(0, 80);
    return `<tr><td>${esc(key)}</td><td>${count}</td><td>${esc(sampleStr)}</td></tr>`;
  }).join('');
  $('extraFields').style.display = '';
}

// ── Capturas de la sesión y copia anonimizada ──
// Fuentes: las respuestas crudas de la ficha del último paciente abierto y las
// citas de la agenda; además, cualquier JSON pegado en el cuadro de respuesta.
let fuente = 'explorador';
function listarCapturas() {
  const sel = $('explorerCaptures');
  const citas = getRawSamples();
  const items = [...getFichaCaptures().map(c => ({ key: c.label, label: `${c.label} · último paciente abierto`, data: c.data })),
    ...(citas.length ? [{ key: 'citas', label: `Citas de la agenda (${citas.length} muestras)`, data: citas }] : [])];
  sel.innerHTML = `<option value="">Capturas de esta sesión…</option>` + items.map((it, i) => `<option value="${i}">${esc(it.label)}</option>`).join('');
  sel.disabled = !items.length;
  return items;
}
function mostrar(data, origen) {
  $('explorerOut').value = JSON.stringify(data, null, 2);
  $('explorerMeta').textContent = origen;
  $('explorerMeta').className = 'explorer-meta';
}
const slug = s => s.toLowerCase().normalize('NFD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'captura';

function descargarAnonimizada() {
  const meta = $('explorerAnonMeta');
  let data;
  try { data = JSON.parse($('explorerOut').value); }
  catch { meta.textContent = 'No hay un JSON válido en el cuadro de respuesta.'; meta.className = 'explorer-meta err'; return; }
  const r = anonimizar(data);
  if (!r.verificado) {
    meta.textContent = `No se descargó: quedarían restos (${r.restos.join(', ')}). Avísame con el nombre del campo, sin el valor.`;
    meta.className = 'explorer-meta err';
    return;
  }
  const version = globalThis.chrome?.runtime?.getManifest?.().version ?? '';
  const cuerpo = { extension: `rayen-extension ${version}`.trim(), fuente, anonimizado: r.informe, datos: r.data };
  const nombre = `captura-anonimizada-${slug(fuente)}.json`;
  const url = URL.createObjectURL(new Blob([JSON.stringify(cuerpo, null, 2)], { type: 'application/json' }));
  const a = Object.assign(document.createElement('a'), { href: url, download: nombre });
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  meta.textContent = `Descargado ${nombre} · ${resumenInforme(r.informe)} · comprobación final sin restos.`;
  meta.className = 'explorer-meta ok';
}

export function init() {
  let capturas = listarCapturas();
  document.querySelector('.tabs')?.addEventListener('click', () => { capturas = listarCapturas(); });
  $('explorerCaptures').addEventListener('change', e => {
    const it = capturas[Number(e.target.value)];
    if (!it) return;
    fuente = it.key;
    mostrar(it.data, `${it.label} · respuesta guardada en memoria, sin volver a consultar`);
    $('explorerAnonMeta').textContent = '';
  });
  $('btnExplorerAnon').addEventListener('click', descargarAnonimizada);
  $('explorerOut').addEventListener('input', () => { fuente = 'pegado'; });

  QUICK_LINKS.forEach(({ label, url }) => {
    const btn = document.createElement('button');
    btn.className = 'ql-btn';
    btn.textContent = label;
    btn.addEventListener('click', () => { $('explorerUrl').value = url.replaceAll('{YYYYMMDD}', localDateStr(new Date())); });
    $('explorerQl').appendChild(btn);
  });

  $('btnExplorerFetch').addEventListener('click', async () => {
    const url = $('explorerUrl').value.trim();
    if (!url) return;
    const meta = $('explorerMeta'), out = $('explorerOut');
    meta.textContent = 'Consultando…';
    meta.className   = 'explorer-meta';
    out.value        = '';
    const { ok, status, data, raw } = await explorerFetch(url);
    meta.textContent = `HTTP ${status} ${ok ? '✓' : '✗'}  ·  ${new Date().toLocaleTimeString('es-CL')}`;
    meta.className   = `explorer-meta ${ok ? 'ok' : 'err'}`;
    out.value = data !== null ? JSON.stringify(data, null, 2) : raw;
    fuente = url.replace(/^.*\/api\/rayen\//i, '').split(/[/?;]/)[0] || 'explorador';
    $('explorerAnonMeta').textContent = '';
  });
}
