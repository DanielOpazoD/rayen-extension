import { renderToday } from '../today.js';
import { $ } from '../dom.js';
import { date8ToIso, isoToDate8 } from '../period.js';
import { localDateStr } from '../parser.js';
import { monthGrid, monthLabel, countsByDay, shiftMonth, DIAS_CORTOS } from '../calendar.js';
import { esc } from '../dom.js';
import { state, on, pendientes } from '../state.js';
import { jumpToSIC, openPatientById, openPatientByRun } from '../actions.js';

/** The morning brief: novedades and the day's agenda. */

let todayDate = '';   // '' = hoy (con fallback a la última jornada)
let calYear = null, calMonth = null; // mes que muestra el calendario; null = el del día mostrado

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
  const shown = renderToday(allData, sics, { novedades, especialidades: prefs.watchEsp, dia8: todayDate || undefined });
  $('dayNav').style.display = allData.length ? '' : 'none';
  if (shown) $('dayPick').value = date8ToIso(shown);
  $('dayHint').textContent = todayDate ? '' : 'Hoy, o la última jornada con datos';
  renderCalendar(allData, shown);
  updateBadge();
}

/**
 * Calendario del mes: cada día con su número de atenciones; hoy con contorno,
 * el día mostrado con fondo. Clic en un día lo abre; ‹ › cambian de mes.
 */
function renderCalendar(allData, shown) {
  const base = shown || localDateStr(new Date());
  if (calYear == null) { calYear = +base.slice(0, 4); calMonth = +base.slice(4, 6) - 1; }
  const today8 = localDateStr(new Date());
  const weeks = monthGrid(calYear, calMonth, countsByDay(allData), { today8, selected8: shown || '' });
  $('calTitle').textContent = monthLabel(calYear, calMonth);
  $('calGrid').innerHTML = `<div class="cal-row cal-dow" role="row">${DIAS_CORTOS.map(d => `<span role="columnheader">${d}</span>`).join('')}</div>` +
    weeks.map(w => `<div class="cal-row" role="row">${w.map(c => {
      const label = `${c.day} · ${c.count ? `${c.count} ${c.count === 1 ? 'atención' : 'atenciones'}` : 'sin atenciones'}`;
      const cls = ['cal-d', c.inMonth ? '' : 'out', c.count ? 'has' : '', c.isToday ? 'today' : '', c.weekend ? 'we' : ''].filter(Boolean).join(' ');
      return `<button type="button" role="gridcell" class="${cls}" data-date8="${c.date8}" aria-pressed="${c.isSelected}" aria-label="${esc(label)}"><span class="cal-n">${c.day}</span>${c.count ? `<span class="cal-c">${c.count}</span>` : ''}</button>`;
    }).join('')}</div>`).join('');
}

export function init() {
  $('calPrev').addEventListener('click', () => { ({ year: calYear, month: calMonth } = shiftMonth(calYear, calMonth, -1)); renderCalendar(state.allData, todayDate || isoToDate8($('dayPick').value)); });
  $('calNext').addEventListener('click', () => { ({ year: calYear, month: calMonth } = shiftMonth(calYear, calMonth, 1)); renderCalendar(state.allData, todayDate || isoToDate8($('dayPick').value)); });
  $('calGrid').addEventListener('click', e => {
    const cell = e.target.closest('button[data-date8]');
    if (!cell) return;
    todayDate = cell.dataset.date8;
    calYear = +todayDate.slice(0, 4); calMonth = +todayDate.slice(4, 6) - 1;
    refresh();
  });
  $('dayToday').addEventListener('click', () => { todayDate = ''; calYear = null; refresh(); });
  $('dayPick').addEventListener('change', () => { todayDate = isoToDate8($('dayPick').value); calYear = null; refresh(); });

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
