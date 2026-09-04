import { buildStats } from '../stats.js';
import { renderCharts } from '../charts.js';
import { toast } from '../toast.js';
import { $ } from '../dom.js';
import { state, on } from '../state.js';
import { showTab } from '../actions.js';
import * as atenciones from './atenciones.js';
import * as interconsultas from './interconsultas.js';

/** Tiles and charts. Every bar is a filter in disguise. */

export function init() {
  $('chartsSection').addEventListener('click', e => {
    const g = e.target.closest('[data-f]');
    if (!g) return;
    const raw = g.dataset.f;
    const i = raw.indexOf(':');
    const campo = raw.slice(0, i), valor = raw.slice(i + 1);
    if (campo === 'sicEsp') { interconsultas.applyFilter('sicEsp', valor); showTab('interconsultas'); }
    else if (atenciones.applyFilter(campo, valor) === false) {
      toast(`No hay un filtro de tabla para «${valor}»`, { tone: 'warn' });
      return;
    } else showTab('atenciones');
    toast(`Filtrado por «${valor}»`, { tone: 'info' });
  });

  on('data', () => {
    buildStats(state.allData, state.team);
    if (!state.allData.length) {
      // Sin datos, los gráficos anteriores —con nombres de diagnósticos— seguían
      // en pantalla después de «Vaciar caché». Se vuelve al estado inicial.
      $('chartsSection').innerHTML = '';
      ['statsBar', 'chartsSection'].forEach(id => { $(id).style.display = 'none'; });
      $('statsEmpty').style.display = '';
      return;
    }
    renderCharts(state.allData, state.team, $('chartsSection'), state.sics);
    ['statsBar', 'chartsSection'].forEach(id => { $(id).style.display = ''; });
    $('statsEmpty').style.display = 'none';
  });
}
