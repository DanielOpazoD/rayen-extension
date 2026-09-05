/** Estado de la ficha detrás del botón discreto «Ficha», con su punto de tono. */
import { esc, $ } from '../dom.js';
import { humanError } from '../../core/errors.js';
import { isMineVisit } from './helpers.js';

/**
 * El estado de la ficha («Ficha completa · 4 atenciones (1 mías) desde…») vive
 * detrás de un botón muy discreto. Lo que no se oculta es el tono: un punto
 * ámbar o rojo en el botón avisa de ficha parcial, sin sesión o error, y el
 * nombre accesible del botón lleva el texto completo.
 */
export function setFichaStatus(html, tone = '') {
  const box = $('ppFichaStatus');
  box.innerHTML = html;
  const dot = $('ppFichaDot');
  dot.hidden = !tone;
  dot.className = `dot ${tone}`;
  const texto = box.textContent.replace(/\s+/g, ' ').trim();
  $('ppFichaToggle').setAttribute('aria-label', `Estado de la ficha clínica: ${texto || 'sin datos'}`);
  $('ppFichaToggle').title = texto;
}

const humanFichaError = e => { const m = String(e).match(/^([^:]{2,40}):\s*(.+)$/); return m ? `${m[1]}: ${humanError(m[2], 'Eloisa')}` : humanError(e, 'Eloisa'); };

/** Texto y tono para una ficha cargada: completa o parcial, cuántas atenciones, desde cuándo, a qué hora. */
export function fichaStatusHtml(ficha) {
  const mineN = ficha.visits.filter(isMineVisit).length;
  const n = ficha.visits.length;
  const fallos = ficha.errors.length;
  const estado = fallos ? `Ficha parcial · ${fallos} ${fallos === 1 ? 'fuente falló' : 'fuentes fallaron'}` : 'Ficha completa';
  const hora = new Date(ficha.savedAt).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit', hour12: false });
  const html = `<span>${estado} · ${n} ${n === 1 ? 'atención' : 'atenciones'} (${mineN} mías)${n ? ` desde ${esc(ficha.visits[n - 1].fechaAtencion)}` : ''} · ${hora}</span>` +
    `<button class="btn-mini" id="ppReload" aria-label="Volver a pedir la ficha a Eloisa" data-tip="Volver a pedir la ficha a Eloisa">↻</button>` +
    (fallos ? `<span class="al al-warn" tabindex="0" role="img" aria-label="${fallos} ${fallos === 1 ? 'fuente falló' : 'fuentes fallaron'}" data-tip="${esc(ficha.errors.map(humanFichaError).join('\n'))}">⚠</span>` : '');
  return { html, tone: fallos ? 'warn' : '' };
}
