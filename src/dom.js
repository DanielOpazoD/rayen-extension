/** HTML-escapes a value for safe interpolation into innerHTML. */
export function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

export const $ = id => document.getElementById(id);

/** Semantic tone for an appointment/atención state. */
export function stateTone(estado = '') {
  if (estado === 'Completado')                return 'ok';
  if (/presentó/i.test(estado))               return 'bad';
  if (estado === 'Iniciado')                  return 'warn';
  if (/^(Espontánea|Sin cita)$/.test(estado)) return 'info';
  return 'neutral';
}

/** Semantic tone for a SIC lifecycle group. */
export function sicTone(grupo = '') {
  return ({ pendiente: 'warn', enviada: 'info', atendida: 'ok', cerrada: 'neutral', fallida: 'bad' })[grupo] ?? 'neutral';
}

/**
 * A state reads as a coloured dot plus its label — quieter than a filled pill
 * and it keeps the meaning in the text, not only in the colour.
 */
export function stateDot(estado, { tone, small = false } = {}) {
  return `<span class="st st-${tone ?? stateTone(estado)}${small ? ' sm' : ''}">${esc(estado)}</span>`;
}

/**
 * One floating tooltip for every element with [data-tip]. A single fixed div
 * avoids the clipping that ::after tooltips suffer inside overflow:hidden cells.
 */
export function initTooltips() {
  const tt = document.createElement('div');
  tt.id = 'tt';
  tt.hidden = true;
  document.body.appendChild(tt);
  let cur = null;
  const hide = () => { cur = null; tt.hidden = true; };

  const show = el => {
    const text = el.dataset.tip;
    if (!text) return;
    cur = el;
    tt.textContent = text;
    tt.hidden = false;
    const r = el.getBoundingClientRect();
    const w = tt.offsetWidth, h = tt.offsetHeight;
    let x = r.left, y = r.bottom + 6;
    if (x + w > window.innerWidth - 8) x = Math.max(8, window.innerWidth - w - 8);
    if (y + h > window.innerHeight - 8) y = r.top - h - 6;
    tt.style.left = `${x}px`;
    tt.style.top  = `${y}px`;
  };

  document.addEventListener('mouseover', e => {
    const el = e.target.closest('[data-tip]');
    if (el && el !== cur) show(el);
  });
  document.addEventListener('mouseout', e => {
    const el = e.target.closest('[data-tip]');
    if (el && el === cur && !el.contains(e.relatedTarget)) hide();
  });
  // Keyboard: the same tooltip on focus (elements with tabindex or native focus)
  document.addEventListener('focusin', e => {
    const el = e.target.closest('[data-tip]');
    if (el) show(el);
  });
  document.addEventListener('focusout', hide);
  document.addEventListener('scroll', hide, true);
  document.addEventListener('click', hide, true);
}

/**
 * WAI-ARIA tablist: click or ←/→/Home/End select a tab; roving tabindex.
 * @param {HTMLElement} nav  element with role="tablist" containing [role="tab"] buttons
 * @param {(id: string) => void} onSelect  receives the tab's `data-*` id (dataset[key])
 * @param {string} key  dataset key holding the tab id (e.g. 'tab' or 'pt')
 * @returns {(id: string) => void} function to select a tab programmatically
 */
export function initTablist(nav, onSelect, key) {
  const tabs = () => [...nav.querySelectorAll('[role="tab"]')];
  const select = (id, focus = false) => {
    for (const t of tabs()) {
      const on = t.dataset[key] === id;
      t.classList.toggle('active', on);
      t.setAttribute('aria-selected', String(on));
      t.tabIndex = on ? 0 : -1;
      if (on && focus) t.focus();
    }
    onSelect(id);
  };
  nav.addEventListener('click', e => {
    const t = e.target.closest('[role="tab"]');
    if (t) select(t.dataset[key]);
  });
  nav.addEventListener('keydown', e => {
    const list = tabs();
    const i = list.findIndex(t => t === document.activeElement);
    if (i < 0) return;
    const next = e.key === 'ArrowRight' ? (i + 1) % list.length
               : e.key === 'ArrowLeft'  ? (i - 1 + list.length) % list.length
               : e.key === 'Home' ? 0 : e.key === 'End' ? list.length - 1 : -1;
    if (next < 0) return;
    e.preventDefault();
    select(list[next].dataset[key], true);
  });
  return select;
}

/** Enter/Space on a focused role="button" element behaves like a click. */
export function activateOnKey(container) {
  container.addEventListener('keydown', e => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const el = e.target.closest('[role="button"],[data-col],tr[tabindex]');
    if (!el || el.tagName === 'BUTTON' || el.tagName === 'TEXTAREA' || el.tagName === 'INPUT') return;
    e.preventDefault();
    el.click();
  });
}

/**
 * Brings a row back into view and pulses it. Closing a panel or jumping from a
 * chart used to drop you somewhere in a thousand rows with no idea where you
 * had been; the pulse answers "here" without moving anything.
 */
export function revealRow(selector, { scroll = true } = {}) {
  const el = document.querySelector(selector);
  if (!el) return false;
  if (scroll) el.scrollIntoView({ block: 'center', behavior: prefersReduced() ? 'auto' : 'smooth' });
  el.classList.remove('flash-row');
  void el.offsetWidth;          // restart the animation if it is already running
  el.classList.add('flash-row');
  setTimeout(() => el.classList.remove('flash-row'), 1600);
  return true;
}

function prefersReduced() {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
}

/**
 * Placeholder rows shaped like the real ones. A skeleton says "this is a table
 * and it is on its way"; the word "Cargando…" says neither.
 */
export function skeletonRows(rows = 8, cols = 10) {
  const cell = i => `<td><span class="sk" style="width:${[70, 90, 40, 30, 55, 80, 85, 50, 75, 60][i % 10]}%"></span></td>`;
  return Array.from({ length: rows }, () =>
    `<tr class="sk-row">${Array.from({ length: cols }, (_, i) => cell(i)).join('')}</tr>`).join('');
}

/** Skeleton blocks for card-shaped content (Hoy, patient panel). */
export function skeletonCards(n = 3) {
  return Array.from({ length: n }, () =>
    `<div class="sk-card"><span class="sk" style="width:22%"></span><span class="sk" style="width:64%"></span>` +
    `<span class="sk" style="width:45%"></span></div>`).join('');
}

/** Refills a <select> keeping its first (placeholder) option and, if possible, the current value. */
export function fillSelect(el, values, keep = true) {
  const cur = el.value;
  el.innerHTML = el.options[0].outerHTML;
  for (const v of values) {
    const o = document.createElement('option');
    o.value = o.textContent = v;
    el.appendChild(o);
  }
  if (keep && values.includes(cur)) el.value = cur;
}
