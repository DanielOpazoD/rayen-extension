/** Estado de la ficha dentro de Datos, con su tono en el avatar. */
import { esc, $ } from '../dom.js';
import { humanError } from '../../core/errors.js';
import { esMiaAtencion } from '../../core/sic-rules.js';

/**
 * El estado de la ficha («Ficha completa · 4 atenciones (1 mías) desde…») vive
 * detrás de un botón muy discreto. Lo que no se oculta es el tono: un punto
 * ámbar o rojo en el botón avisa de ficha parcial, sin sesión o error, y el
 * nombre accesible del botón lleva el texto completo.
 */
export function setFichaStatus(html, tone = '') {
  const box = $('ppFichaStatus');
  box.innerHTML = html;
  // El estado vive dentro de Datos (avatar). El tono se ve en el propio avatar:
  // punto ámbar (parcial, sin sesión) o rojo (fallo), sin abrir nada.
  const av = $('ppAvatar');
  av.classList.toggle('ficha-warn', tone === 'warn');
  av.classList.toggle('ficha-bad', tone === 'bad');
  const texto = box.textContent.replace(/\s+/g, ' ').trim();
  av.dataset.ficha = texto;
  av.setAttribute('aria-label', `Datos del paciente${texto ? `. Ficha: ${texto}` : ''}`);
}

const humanFichaError = e => { const m = String(e).match(/^([^:]{2,40}):\s*(.+)$/); return m ? `${m[1]}: ${humanError(m[2], 'Eloisa')}` : humanError(e, 'Eloisa'); };

/** Texto y tono para una ficha cargada: completa o parcial, cuántas atenciones, desde cuándo, a qué hora. */
export function fichaStatusHtml(ficha) {
  const mineN = ficha.visits.filter(v => esMiaAtencion(v)).length;
  const n = ficha.visits.length;
  // Sólo fuentes («Historial: …»); el aviso de sesión vencida no es una fuente.
  const fallos = ficha.errors.filter(e => /^[^:]{2,40}:\s/.test(e)).length;
  const estado = fallos ? `Ficha parcial · ${fallos} ${fallos === 1 ? 'fuente falló' : 'fuentes fallaron'}` : 'Ficha completa';
  const hora = new Date(ficha.savedAt).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit', hour12: false });
  const html = `<span>${estado} · ${n} ${n === 1 ? 'atención' : 'atenciones'} (${mineN} mías)${n ? ` desde ${esc(ficha.visits[n - 1].fechaAtencion)}` : ''} · ${hora}</span>` +
    `<button class="btn-mini" id="ppReload" aria-label="Volver a pedir la ficha a Eloisa" data-tip="Volver a pedir la ficha a Eloisa"><svg class="i i-sm" viewBox="0 0 24 24" aria-hidden="true"><path d="M21 12a9 9 0 1 1-6.22-8.56"/><polyline points="21 3 21 9 15 9"/></svg></button>` +
    (fallos ? `<span class="al al-warn" tabindex="0" role="img" aria-label="${fallos} ${fallos === 1 ? 'fuente falló' : 'fuentes fallaron'}" data-tip="${esc(ficha.errors.map(humanFichaError).join('\n'))}">⚠</span>` : '');
  return { html, tone: fallos ? 'warn' : '' };
}
