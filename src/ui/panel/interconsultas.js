/** Pestaña Interconsultas: Mías / De otros, y las derivaciones registradas en atenciones. */
import { isMine as isMineSic } from '../../core/sic-rules.js';
import { esc, stateDot, sicTone, $ } from '../dom.js';
import { sicPdfPath } from '../../io/pdf.js';
import { segGroup, h4, empty, setTabCount } from './helpers.js';

export function renderIc(cur, icFilter) {
  const { sics, ficha } = cur;
  const mias = sics.filter(isMineSic), ajenas = sics.filter(s => !isMineSic(s));
  const shown = icFilter === 'otros' ? ajenas : mias;
  let html = segGroup('ic', 'Interconsultas', [['mias', 'Mías', mias.length], ['otros', 'De otros', ajenas.length]], icFilter);
  html += shown.length ? shown.map(s => `
      <div class="pp-sic">
        <div class="pp-sic-h"><strong>${esc(s.fecha)}</strong> ${stateDot(s.estado, { tone: sicTone(s.grupo) })}
          <span class="spacer"></span><button class="btn-mini" data-pdf="${esc(sicPdfPath(s.id))}" data-tip="Solicitud PDF">PDF</button></div>
        <div class="pp-sic-b"><b>${esc(s.especialidad)}</b>${s.cie10 ? ` · <span class="cie">${esc(s.cie10)}</span>` : ''} ${esc(s.diagnostico)}
          ${s.registrador.nombre ? `<br><span class="muted">Solicitó ${esc(s.registrador.nombre)}${s.motivo ? ` · ${esc(s.motivo)}` : ''}</span>` : ''}
          ${s.fundamentos ? `<p class="pp-fund">${esc(s.fundamentos)}</p>` : ''}
          </div>
      </div>`).join('')
    : empty(icFilter === 'otros' ? 'Sin interconsultas de otros profesionales' : 'Sin interconsultas tuyas en el período cargado');

  const deriv = (ficha?.visits ?? []).flatMap(v => (v.sections.derivaciones ?? []).map(d => ({ ...d, fecha: v.fechaAtencion })));
  if (deriv.length) html += h4('Derivaciones registradas en atenciones') + deriv.map(d =>
    `<div class="pp-row"><span class="pp-row-t">${esc(d.label)}</span><span class="pp-row-m">${esc(d.details.join(' · '))}${d.details.length ? ' · ' : ''}${esc(d.fecha)}</span></div>`).join('');

  $('ppPaneIc').innerHTML = html;
  setTabCount('ic', sics.length);
}
