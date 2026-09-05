import { $, esc, qsa } from './dom.js';

/** Compact serialization for a multi-value filter kept in a hidden input. */
export function decodeMultiValue(value) {
  if (Array.isArray(value)) return [...new Set(value.filter(Boolean).map(String))];
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? [...new Set(parsed.filter(Boolean).map(String))] : [String(value)];
  } catch {
    return [String(value)];
  }
}

/** Accessible checkbox popover for filters that accept more than one value. */
export function initMultiSelect({ inputId, buttonId, menuId, allLabel = 'Todos', onChange }) {
  const input = $(inputId);
  const button = $(buttonId);
  const menu = $(menuId);
  const optionsBox = menu.querySelector('[data-multi-options]');
  let options = [];

  const values = () => decodeMultiValue(input.value);
  const updateButton = () => {
    const selected = values();
    button.textContent = selected.length === 0 ? allLabel
      : selected.length === 1 ? selected[0]
      : `${selected.length} seleccionados`;
    button.classList.toggle('has-value', selected.length > 0);
    button.title = selected.join('\n');
    button.setAttribute('aria-label', `Tipo de atención: ${selected.length ? selected.join(', ') : allLabel}`);
  };
  const renderOptions = () => {
    const selected = new Set(values());
    optionsBox.innerHTML = options.map(value => `
      <label class="multi-option">
        <input type="checkbox" value="${esc(value)}" ${selected.has(value) ? 'checked' : ''}>
        <span>${esc(value)}</span>
      </label>`).join('') || '<span class="multi-empty">Sin tipos disponibles</span>';
  };
  const setValues = (next, { notify = true } = {}) => {
    const allowed = new Set(options);
    const normalized = decodeMultiValue(next).filter(value => allowed.has(value));
    input.value = normalized.length ? JSON.stringify(normalized) : '';
    renderOptions();
    updateButton();
    if (notify) onChange?.();
  };
  const close = () => {
    menu.hidden = true;
    button.setAttribute('aria-expanded', 'false');
  };

  button.addEventListener('click', event => {
    event.stopPropagation();
    const open = menu.hidden;
    menu.hidden = !open;
    button.setAttribute('aria-expanded', String(open));
    if (open) /** @type {HTMLElement|null} */ (menu.querySelector('input:checked, input'))?.focus();
  });
  menu.addEventListener('click', event => event.stopPropagation());
  menu.addEventListener('change', () => {
    setValues(qsa(menu, 'input:checked').map(item => item.value));
  });
  menu.querySelector('[data-multi-clear]').addEventListener('click', () => setValues([]));
  document.addEventListener('click', close);
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && !menu.hidden) {
      close();
      button.focus();
    }
  });

  close();
  updateButton();
  return {
    values,
    setValues,
    setOptions(next) {
      options = [...new Set(next.filter(Boolean).map(String))].sort();
      setValues(values(), { notify: false });
    },
  };
}
