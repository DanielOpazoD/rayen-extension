import { $ } from './dom.js';
import { PERIODS } from './period.js';

/** Small DOM patterns that every tab repeats. Pure wiring, no data. */

export function setStatus(msg, cls = 'idle') {
  const el = $('statusBar');
  el.textContent = msg;
  el.className = cls;
}

export const debounce = (fn, ms) => { let t; return () => { clearTimeout(t); t = setTimeout(fn, ms); }; };

/** Period chips writing into a hidden input the filters read. */
export function initChips(containerId, hiddenId, onChange) {
  const box = $(containerId), hidden = $(hiddenId);
  const set = key => {
    hidden.value = key;
    box.querySelectorAll('.chip').forEach(c => {
      const on = c.dataset.per === key;
      c.classList.toggle('on', on);
      c.setAttribute('aria-pressed', String(on));
    });
  };
  box.innerHTML = Object.entries(PERIODS).map(([k, l]) =>
    `<button type="button" class="chip ${k === hidden.value ? 'on' : ''}" data-per="${k}" aria-pressed="${k === hidden.value}">${l}</button>`).join('');
  box.addEventListener('click', e => {
    const b = e.target.closest('.chip');
    if (!b) return;
    set(b.dataset.per);
    onChange();
  });
  return { set, reset: () => set('todo') };
}

/** The «Filtros · n» fold. Returns the function that refreshes the count. */
export function initFilterFold(btnId, panelId, ids, perId) {
  const btn = $(btnId), panel = $(panelId);
  btn.addEventListener('click', () => {
    const open = panel.hasAttribute('hidden');
    panel.toggleAttribute('hidden', !open);
    btn.setAttribute('aria-expanded', String(open));
    btn.classList.toggle('on', open);
    remeasure();
    if (open) panel.querySelector('select')?.focus();
  });
  return function updateCount() {
    const n = ids.filter(id => $(id).value).length + ($(perId).value !== 'todo' ? 1 : 0);
    btn.textContent = n ? `Filtros · ${n}` : 'Filtros';
    btn.classList.toggle('on', n > 0 || !panel.hasAttribute('hidden'));
  };
}

/** A dropdown that opens on its button, closes on outside click, keeps aria-expanded honest. */
export function initMenu(btnId, menuId, wrapId, onOpen = null) {
  $(btnId).addEventListener('click', e => {
    e.stopPropagation();
    const open = $(menuId).classList.toggle('open');
    e.currentTarget.setAttribute('aria-expanded', String(open));
    if (open) onOpen?.();
  });
  $(menuId).addEventListener('click', e => e.stopPropagation());
  document.addEventListener('click', e => {
    if (!wrapId || !e.target.closest(`#${wrapId}`)) { $(menuId).classList.remove('open'); $(btnId).setAttribute('aria-expanded', 'false'); }
  });
}

/** Sortable header state for one table: marks `active`, clears the rest. */
export function markSorted(headers, active, dir) {
  headers.forEach(t => { t.classList.remove('sorted'); t.removeAttribute('data-dir'); t.setAttribute('aria-sort', 'none'); });
  if (!active) return;
  active.classList.add('sorted');
  active.dataset.dir = dir > 0 ? 'asc' : 'desc';
  active.setAttribute('aria-sort', dir > 0 ? 'ascending' : 'descending');
}

/**
 * The tables fill whatever the controls leave. Measuring beats a hardcoded
 * offset: fold the filters and the table grows by itself.
 */
function measureChrome() {
  const pane = document.querySelector('.tab-pane.active');
  const bar  = pane?.querySelector('.toolbar');
  const fp   = pane?.querySelector('.filter-panel:not([hidden])');
  const h = ($('topbar')?.offsetHeight ?? 0) + (bar?.offsetHeight ?? 0) + (fp?.offsetHeight ?? 0)
          + (pane?.querySelector('.stats')?.offsetHeight ?? 0) + 48;
  document.documentElement.style.setProperty('--chrome-h', `${h}px`);
}
export const remeasure = () => requestAnimationFrame(measureChrome);
window.addEventListener('resize', remeasure);
