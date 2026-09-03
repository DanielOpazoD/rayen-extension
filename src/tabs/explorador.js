import { getRawSamples } from '../api.js';
import { explorerFetch, QUICK_LINKS, summarizeExtraFields } from '../explorer.js';
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

export function init() {
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
  });
}
