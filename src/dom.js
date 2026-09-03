/** HTML-escapes a value for safe interpolation into innerHTML. */
export function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

export const $ = id => document.getElementById(id);

/** Badge class for an appointment/atención state. */
export function stateClass(estado = '') {
  if (estado === 'Completado')       return 'bc';
  if (/presentó/i.test(estado))      return 'bn';
  if (estado === 'Iniciado')         return 'bi';
  if (/^(Espontánea|Sin cita)$/.test(estado)) return 'bf';
  return 'bx';
}

/** Badge class for a SIC lifecycle group. */
export function sicClass(grupo = '') {
  return ({ pendiente: 'bi', enviada: 'bic', atendida: 'bc', cerrada: 'bg', fallida: 'bn' })[grupo] ?? 'bx';
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
