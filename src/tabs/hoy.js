import { renderToday } from '../today.js';
import { $ } from '../dom.js';
import { date8ToIso, isoToDate8 } from '../period.js';
import { localDateStr } from '../parser.js';
import { state, on, pendientes } from '../state.js';
import { jumpToSIC, openPatientById, openPatientByRun } from '../actions.js';

/** The morning brief: novedades, pendientes and the day's agenda. */

let todayDate = '';   // '' = hoy (con fallback a la última jornada)

/**
 * The badge counts things that need attention, not appointments. An agenda is
 * something you already know about; an overdue loop is not.
 */
function updateBadge() {
  try {
    const n = pendientes().length;
    chrome.action.setBadgeText({ text: n > 0 ? String(n) : '' });
    chrome.action.setBadgeBackgroundColor({ color: n > 0 ? '#a02a2a' : '#1a7f5f' });
    chrome.action.setTitle({ title: n > 0 ? `${n} pendiente${n > 1 ? 's' : ''} · Rayen Atenciones` : 'Rayen Atenciones' });
  } catch { /* not in extension context */ }
}

/** Cheap: pure functions over data already in memory. */
export function refresh() {
  const { allData, sics, novedades, prefs } = state;
  const shown = renderToday(allData, sics, { pendientes: pendientes(), novedades, especialidades: prefs.watchEsp, dia8: todayDate || undefined });
  $('dayNav').style.display = allData.length ? '' : 'none';
  if (shown) $('dayPick').value = date8ToIso(shown);
  $('dayHint').textContent = todayDate ? '' : 'Hoy (o la última jornada con datos)';
  updateBadge();
}

function shiftDay(n) {
  const base = isoToDate8($('dayPick').value) || localDateStr(new Date());
  const d = new Date(+base.slice(0, 4), +base.slice(4, 6) - 1, +base.slice(6, 8));
  d.setDate(d.getDate() + n);
  todayDate = localDateStr(d);
  refresh();
}

export function init() {
  $('dayPrev').addEventListener('click', () => shiftDay(-1));
  $('dayNext').addEventListener('click', () => shiftDay(1));
  $('dayToday').addEventListener('click', () => { todayDate = ''; refresh(); });
  $('dayPick').addEventListener('change', () => { todayDate = isoToDate8($('dayPick').value); refresh(); });

  // Patient cards open the same panel as the table
  $('todayContent').addEventListener('click', e => {
    const sic = e.target.closest('[data-sic]');
    if (sic) { jumpToSIC({ id: sic.dataset.sic }); return; }
    const byRun = e.target.closest('.pat-run[data-run]');
    if (byRun) { openPatientByRun(byRun.dataset.run); return; }
    const card = e.target.closest('.pat-link[data-id]');
    if (card) openPatientById(card.dataset.id);
  });

  on('data', refresh);
  on('notes', refresh);
}
