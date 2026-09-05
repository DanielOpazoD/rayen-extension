import { esc, targetOf, closestOf } from './dom.js';

/**
 * Command palette (⌘K / Ctrl+K): one door into every patient.
 * Matches on name and RUN, scores prefix hits above substring hits, and
 * returns the record so the host can open the panel.
 */
let el = null, input = null, list = null;
let items = [], active = 0;
/** @type {(record: object) => void} */
let onPick = () => {};

const norm = s => String(s ?? '').toLowerCase()
  .normalize('NFD').replace(/[̀-ͯ]/g, '');   // ignore accents

/** Ranks patients against a query. Exported for tests. */
export function searchPatients(patients, query, limit = 12) {
  const q = norm(query).trim();
  if (!q) return patients.slice(0, limit);
  const terms = q.split(/\s+/);
  const out = [];
  for (const p of patients) {
    const name = norm(p.nombre);
    const run  = norm(p.runStr).replace(/[.-]/g, '');
    const qRun = q.replace(/[.-]/g, '');
    let score = 0;
    if (run && run.startsWith(qRun)) score += 100;
    else if (run && run.includes(qRun)) score += 40;
    // Every term must appear somewhere in the name
    if (terms.every(t => name.includes(t))) {
      score += 50;
      if (terms.some(t => name.split(/\s+/).some(w => w.startsWith(t)))) score += 25;
    }
    if (score > 0) out.push({ p, score });
  }
  return out.sort((a, b) => b.score - a.score || a.p.nombre.localeCompare(b.p.nombre))
            .slice(0, limit).map(x => x.p);
}

function render() {
  list.innerHTML = items.length
    ? items.map((p, i) => `<div class="pal-item ${i === active ? 'on' : ''}" data-i="${i}" role="option" aria-selected="${i === active}">
        <span class="pal-name">${esc(p.nombre)}</span>
        <span class="pal-meta">${esc(p.runStr)}${p.edad != null ? ` · ${p.edad} a` : ''}${p.fechaAtencion ? ` · últ. ${p.fechaAtencion}` : ''}</span>
      </div>`).join('')
    : `<div class="pal-empty">Sin coincidencias</div>`;
  list.querySelector('.pal-item.on')?.scrollIntoView({ block: 'nearest' });
}

function close() { el.hidden = true; input.value = ''; }

/**
 * @param {() => object[]} getPatients  deduped patient records, freshest first
 * @param {(record: object) => void} pick
 */
export function initPalette(getPatients, pick) {
  onPick = pick;
  el = document.createElement('div');
  el.id = 'palette';
  el.hidden = true;
  el.innerHTML = `<div class="pal-box" role="dialog" aria-modal="true" aria-label="Buscar paciente">
      <input id="palInput" type="text" placeholder="Buscar paciente por nombre o RUN…" autocomplete="off" role="combobox" aria-expanded="true" aria-controls="palList">
      <div id="palList" class="pal-list" role="listbox"></div>
      <div class="pal-foot">↑↓ moverse · ↵ abrir · Esc cerrar</div>
    </div>`;
  document.body.appendChild(el);
  input = /** @type {HTMLInputElement} */ (el.querySelector('#palInput'));
  list  = el.querySelector('#palList');

  const refresh = () => { items = searchPatients(getPatients(), input.value); active = 0; render(); };

  input.addEventListener('input', refresh);
  input.addEventListener('keydown', e => {
    if (e.key === 'ArrowDown') { e.preventDefault(); active = Math.min(active + 1, items.length - 1); render(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); active = Math.max(active - 1, 0); render(); }
    else if (e.key === 'Enter') { e.preventDefault(); if (items[active]) { close(); onPick(items[active]); } }
    else if (e.key === 'Escape') { e.preventDefault(); close(); }
  });
  list.addEventListener('click', e => {
    const it = closestOf(e, '.pal-item');
    if (it) { close(); onPick(items[+it.dataset.i]); }
  });
  el.addEventListener('click', e => { if (targetOf(e) === el) close(); });

  document.addEventListener('keydown', e => {
    const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(targetOf(e).tagName);
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); open(); }
    else if (e.key === '/' && !typing && el.hidden) { e.preventDefault(); open(); }
  });

  function open() {
    el.hidden = false;
    input.focus();
    refresh();
  }
  return { open, close };
}
