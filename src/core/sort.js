/** Orden de la tabla de atenciones, sin DOM. */
import { dateToInt } from './parser.js';

function sortValue(p, col) {
  if (col === 'fechaAtencion') return dateToInt(p.fechaAtencion) * 10000 + (parseInt(String(p.hora).replace(':', '')) || 0);
  if (col === 'edad')        return Number(p[col]) || 0;
  if (col === 'diagnostico') return (p.diagnosticos?.[0]?.nombre ?? '').toLowerCase();
  return String(p[col] ?? '').toLowerCase();
}

/**
 * @param {object[]} data
 * @param {string} sortCol  id de columna (COLUMNS de ui/table.js)
 * @param {number} sortDir  1 ascendente, -1 descendente
 */
export function sortRecords(data, sortCol, sortDir) {
  return data.slice().sort((a, b) => {
    const va = sortValue(a, sortCol), vb = sortValue(b, sortCol);
    return (va < vb ? -1 : va > vb ? 1 : 0) * sortDir || String(a.hora).localeCompare(String(b.hora));
  });
}
