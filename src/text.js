/**
 * Dos ayudas de texto que vivían repetidas en varios módulos.
 * (Las copias dentro de los scripts que se inyectan en la pestaña de SysLab
 * no pueden importar y se quedan donde están.)
 */

/** Espacios colapsados y recortados; null/undefined → ''. */
export const cleanText = value => String(value == null ? '' : value).replace(/\s+/g, ' ').trim();

/** Eloisa entrega muchos catálogos como `{ Nombre }` o como texto plano. */
export const nameOf = v => (typeof v === 'string' ? v : (v?.Nombre ?? ''));
