import { $ } from './dom.js';
import { PERIODS } from '../core/period.js';

/** Small DOM patterns that every tab repeats. Pure wiring, no data. */

export function setStatus(msg, cls = 'idle') {
  const el = $('statusBar');
  el.textContent = msg;
  el.className = cls;
  el.title = msg; // en el riel el texto puede recortarse; el completo queda a mano
  remeasure(); // el estado comparte riel con las pestañas: su ancho decide si desbordan
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

/**
 * Menús desplegables con un solo registro. Abrir uno cierra los demás que no
 * lo contengan; cerrar uno cierra los que anidan dentro (Preferencias dentro
 * del panel «⋯» quedaba marcado abierto e invisible); Escape cierra el más
 * interno y devuelve el foco a su botón. Cada menú mantiene `aria-expanded`.
 */
const MENUS = [];
function closeMenu(m) {
  if (!m.menu.classList.contains('open')) return;
  for (const o of MENUS) if (o !== m && m.menu.contains(o.menu)) closeMenu(o);
  m.menu.classList.remove('open');
  m.btn.setAttribute('aria-expanded', 'false');
}
export function initMenu(btnId, menuId, wrapId, onOpen = null) {
  const m = { btn: $(btnId), menu: $(menuId), wrap: wrapId ? $(wrapId) : null };
  MENUS.push(m);
  m.btn.addEventListener('click', e => {
    e.stopPropagation();
    if (m.menu.classList.contains('open')) { closeMenu(m); return; }
    for (const o of MENUS) if (o !== m && !o.menu.contains(m.menu)) closeMenu(o);
    m.menu.classList.add('open');
    m.btn.setAttribute('aria-expanded', 'true');
    onOpen?.();
  });
  m.menu.addEventListener('click', e => e.stopPropagation());
  if (MENUS.length > 1) return;
  document.addEventListener('click', e => {
    for (const o of MENUS) if (!o.wrap || !o.wrap.contains(e.target)) closeMenu(o);
  });
  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    const open = MENUS.filter(o => o.menu.classList.contains('open'));
    if (!open.length) return;
    const inner = open.find(o => !open.some(p => p !== o && o.menu.contains(p.menu))) ?? open[open.length - 1];
    closeMenu(inner);
    inner.btn.focus();
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
let observed = false;
function measureChrome() {
  const pane = document.querySelector('.tab-pane.active');
  const bar  = pane?.querySelector('.toolbar');
  const fp   = pane?.querySelector('.filter-panel:not([hidden])');
  const h = ($('topbar')?.offsetHeight ?? 0) + (bar?.offsetHeight ?? 0) + (fp?.offsetHeight ?? 0)
          + (pane?.querySelector('.stats')?.offsetHeight ?? 0) + 48;
  document.documentElement.style.setProperty('--chrome-h', `${h}px`);
  const tabs = document.querySelector('.tabs');
  if (tabs) {
    tabs.classList.toggle('overflowing', tabs.scrollWidth > tabs.clientWidth + 1);
    // El riel cambia de tamaño cuando aparece o crece el estado de sincronización;
    // se observa desde la primera medición, cuando el riel ya existe (el arnés
    // de desarrollo monta el DOM después de evaluar los módulos).
    if (!observed && typeof ResizeObserver !== 'undefined') {
      observed = true;
      new ResizeObserver(remeasure).observe(tabs);
    }
  }
}
export const remeasure = () => requestAnimationFrame(measureChrome);
window.addEventListener('resize', remeasure);

