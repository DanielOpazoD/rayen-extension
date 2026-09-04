import { isMedicalVisit } from './patient-report.js';
import { humanError } from './errors.js';
import { patientKey } from './notes.js';
import { dateToInt } from './parser.js';
import { esc, stateDot, sicTone, $, initTablist, activateOnKey, skeletonCards } from './dom.js';
import { certificadoPath, sicPdfPath, recetaPdfPath, openPDF } from './pdf.js';
import { getToken } from './auth.js';
import { loadFicha, SECTION_LABELS } from './ficha.js';
import { CONFIG } from './config.js';
import { whenLabel } from './table.js';
import { buildPatientReport, SCOPE_LABEL } from './patient-report.js';
import { openReport } from './export.js';
import { copyToClipboard } from './toast.js';

// ── State ─────────────────────────────────────────────────────
let cur = null;          // { record, key, visits, sics, contact, ficha }
let activeTab = 'dx';    // remembered across patients
let atFilter = 'medicina'; // Medicina | Otros, también recordado
let navigate = null;     // (dir) => void, supplied by the host

let opener = null;       // quien tenía el foco al abrir; lo recupera al cerrar

// Diálogo modal de verdad: mientras está abierto, cabecera y contenido quedan
// inertes (sin foco, sin clics, sin lector de pantalla); cerrado, el propio
// panel queda inerte e invisible. Antes el fondo seguía tabulable bajo el velo y
// el panel cerrado conservaba catorce controles alcanzables con Tab.
const shielded = () => [document.getElementById('mainContent'), document.getElementById('topbar')].filter(Boolean);
const isOpen = () => $('patientPanel').classList.contains('open');

function close() {
  if (!isOpen()) return;
  const id = cur?.record?.id;
  const panel = $('patientPanel');
  panel.classList.remove('open');
  $('panelBackdrop').classList.remove('open');
  panel.inert = true;
  for (const node of shielded()) node.inert = false;
  cur = null;
  if (opener?.isConnected) opener.focus({ preventScroll: true });
  opener = null;
  // The host brings the table back to the row this patient came from
  document.dispatchEvent(new CustomEvent('rayen:panel-closed', { detail: { id } }));
}

const isMine = v => (v.prestadores ?? []).some(p => p.id === CONFIG.officerId);
const kv = (label, value) => value ? `<div class="kv"><span class="k">${esc(label)}</span><span class="v">${esc(value)}</span></div>` : '';
const h4 = t => `<h4>${esc(t)}</h4>`;
const empty = t => `<div class="pp-empty">${esc(t)}</div>`;

/**
 * Call once at app startup to wire up static panel controls.
 * @param {{ saveNote: (record: object, text: string) => Promise<boolean>, onNavigate?: (dir: number, record: object) => void }} hooks
 *   saveNote is the host's single note-writing path (it updates every row,
 *   shows the toast and offers undo); the panel never writes on its own.
 */
let labSearch = null;

export function initPanel({ saveNote, onNavigate, onLabSearch } = {}) {
  const panel = $('patientPanel');
  panel.inert = true;
  // Tab y Shift+Tab dan la vuelta dentro del diálogo.
  panel.addEventListener('keydown', e => {
    if (e.key !== 'Tab') return;
    const focusables = [...panel.querySelectorAll('button,[href],input,select,textarea,[tabindex]:not([tabindex="-1"])')]
      .filter(el => !el.disabled && el.offsetParent !== null);
    if (!focusables.length) return;
    const first = focusables[0], last = focusables[focusables.length - 1];
    const at = document.activeElement;
    if (e.shiftKey && (at === first || at === panel)) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && at === last) { e.preventDefault(); first.focus(); }
  });
  navigate = onNavigate;
  labSearch = onLabSearch;
  $('ppClose').addEventListener('click', close);
  $('panelBackdrop').addEventListener('click', close);

  $('ppSaveNote').addEventListener('click', async () => {
    if (!cur) return;
    const btn = $('ppSaveNote');
    const saved = await saveNote(cur.record, $('ppNoteText').value);
    btn.textContent = saved ? '✓ Guardado' : '✗ No guardado';
    setTimeout(() => { btn.textContent = 'Guardar nota'; }, 1800);
  });

  // PDF menu: the patient's clinical history, by scope
  $('ppPdfBtn').addEventListener('click', e => {
    e.stopPropagation();
    const open = $('ppPdfMenu').classList.toggle('open');
    e.currentTarget.setAttribute('aria-expanded', String(open));
  });
  document.addEventListener('click', e => {
    if (!e.target.closest('#ppPdfWrap')) $('ppPdfMenu').classList.remove('open');
  });
  $('ppPdfMenu').addEventListener('click', async e => {
    const b = e.target.closest('button[data-scope]');
    if (!b || !cur) return;
    $('ppPdfMenu').classList.remove('open');
    const scope = b.dataset.scope;
    b.disabled = true;
    try {
      const { fragment, css } = buildPatientReport(cur, scope);
      await openReport(fragment, css);
    } catch (err) {
      $('ppFichaStatus').innerHTML = `<span class="al al-bad">No se pudo generar el informe. ${esc(humanError(err, 'Eloisa'))}</span>`;
    } finally { b.disabled = false; }
  });

  // Los datos administrativos se abren desde las iniciales del paciente: un
  // botón menos en una cabecera que ya iba apretada.
  $('ppAvatar').addEventListener('click', () => {
    const hidden = $('ppDatos').toggleAttribute('hidden');
    $('ppAvatar').classList.toggle('on', !hidden);
    $('ppAvatar').setAttribute('aria-expanded', String(!hidden));
  });
  // Pestañas internas Medicina / Otros dentro de Atenciones.
  $('ppPaneAt').addEventListener('click', e => {
    const seg = e.target.closest('[data-seg]');
    if (!seg) return;
    atFilter = seg.dataset.seg;
    renderAt();
  });

  $('ppLabBtn').addEventListener('click', () => {
    // Se cierra antes de saltar: con el diálogo abierto el resto queda inerte y
    // la pestaña Laboratorio no se podría usar.
    if (!cur?.record?.run || !labSearch) return;
    const run = cur.record.run;
    close();
    labSearch(run, cur.record.sexo);
  });

  // Tabs: click or ←/→; remembered across patients
  showTab = initTablist(document.querySelector('.pp-tabs'), id => {
    activeTab = id;
    document.querySelectorAll('.pp-pane').forEach(p => p.classList.toggle('active', p.dataset.pt === id));
  }, 'pt');

  // Sticky tab strip sits right under the header, whatever its height
  const head = $('ppHeader');
  const setHead = () => $('patientPanel').style.setProperty('--pp-head', `${head.offsetHeight}px`);
  if ('ResizeObserver' in window) new ResizeObserver(setHead).observe(head);
  setHead();

  activateOnKey($('patientPanel')); // Enter/Space on visit headers

  $('ppPrev').addEventListener('click', () => navigate?.(-1, cur?.record));
  $('ppNext').addEventListener('click', () => navigate?.(1, cur?.record));
  // ←/→ walk the patient list while the panel is open, unless you are typing
  document.addEventListener('keydown', e => {
    if (!cur || $('patientPanel').classList.contains('open') === false) return;
    if (/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
    if (e.key === 'ArrowLeft')  { e.preventDefault(); navigate?.(-1, cur?.record); }
    if (e.key === 'ArrowRight') { e.preventDefault(); navigate?.(1, cur?.record); }
  });

  // The RUN is the thing most often retyped elsewhere: one click copies it
  $('ppHeader').addEventListener('click', e => {
    const r = e.target.closest('.copy-run');
    if (r) { e.stopPropagation(); copyToClipboard(r.dataset.run, 'RUN copiado'); }
  });

  $('patientPanel').addEventListener('click', async e => {
    const pdf = e.target.closest('button[data-pdf]');
    if (pdf) {
      pdf.disabled = true;
      const err = await openPDF(pdf.dataset.pdf);
      pdf.disabled = false;
      if (err) { pdf.textContent = '✗'; pdf.title = err; }
      return;
    }
    const tog = e.target.closest('.pp-vhead');
    if (tog && tog.closest('.pp-visit.has-body') && !e.target.closest('button')) {
      const open = tog.closest('.pp-visit').classList.toggle('expanded');
      tog.setAttribute('aria-expanded', String(open));
      return;
    }
    if (e.target.closest('#ppReload') && cur) loadAndRenderFicha(true);
  });

  document.addEventListener('keydown', e => { if (e.key === 'Escape') close(); });
}

let showTab = () => {}; // assigned in initPanel (WAI-ARIA tablist with roving tabindex)

function setTabCount(id, n) {
  const b = document.querySelector(`.pp-tab[data-pt="${id}"] .cnt`);
  if (b) b.textContent = n ? String(n) : '';
}

// ── Header + datos ────────────────────────────────────────────

function renderHeader() {
  const { record, contact } = cur;
  const initials = [record.ap?.[0], record.nombres?.[0]].filter(Boolean).join('').toUpperCase()
    || record.nombre.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase() || '?';
  $('ppAvatar').textContent = initials;
  $('ppName').textContent = record.nombre;
  $('ppName').title = record.nombre;
  // El RUN va primero: es el identificador clínico y se recortaba al final.
  // Sólo lo que identifica: RUN y edad. Sexo y previsión viven en Datos.
  $('ppMeta').textContent = [
    record.runStr ? `RUN ${record.runStr}` : '',
    record.edadLabel || contact.edad || (record.edad != null ? `${record.edad} años` : ''),
  ].filter(Boolean).join(' · ');
}

function alertChips(ficha) {
  const out = [];
  for (const r of ficha.riesgo) out.push(`<span class="al al-risk" data-tip="Riesgo multimorbilidad · ingreso ${esc(r.fecha)}">Estrato ${esc(r.estrato)}</span>`);
  for (const v of ficha.vigencia) out.push(`<span class="al ${v.ok && !/no vigente/i.test(v.mensaje) ? 'al-ok' : 'al-warn'}">${esc(v.mensaje)}</span>`);
  const m = ficha.master;
  if (m) {
    if (m.fallecido) out.push(`<span class="al al-bad">Fallecido ${esc(m.fallecido)}</span>`);
    if (!m.activo)   out.push(`<span class="al al-warn">Inscripción pasivada${m.pasivacion ? `: ${esc(m.pasivacion)}` : ''}</span>`);
    if (m.cuidador)  out.push(`<span class="al al-info">Cuidador</span>`);
    if (m.movilidadReducida) out.push(`<span class="al al-info">Movilidad reducida</span>`);
    if (m.nodoInscripcion && m.nodoInscripcion !== CONFIG.nodeId) out.push(`<span class="al al-info" data-tip="Inscrito en otro establecimiento">Nodo ${m.nodoInscripcion}</span>`);
  }
  if (ficha.antecedentes.alergias.length || ficha.ram.length) out.push(`<span class="al al-bad">Alergia / RAM registrada</span>`);
  return out;
}

function renderDatos() {
  const { record, contact, ficha } = cur;
  const m = ficha?.master;
  const tel = m?.telefonos || record.telefono || contact.telefono;
  const dir = m?.direccion || record.direccion || contact.direccion;
  const chips = ficha ? alertChips(ficha) : [];
  const important = ficha ? (ficha.master?.fallecido || ficha.master?.activo === false || ficha.antecedentes.alergias.length || ficha.ram.length) : false;

  $('ppAvatar').classList.toggle('dot', !!important); // el punto rojo de alertas va en las iniciales
  $('ppDatos').innerHTML =
    `<div class="pp-datos-grp">${h4('Contacto')}<div class="kv-grid">${kv('Teléfono', tel)}${kv('Dirección', dir)}${kv('Email', m?.email)}</div>${!tel && !dir ? empty(ficha ? 'Sin contacto registrado' : 'Consultando ficha…') : ''}</div>` +
    (m ? `<div class="pp-datos-grp">${h4('Inscripción')}<div class="kv-grid">` +
      kv('Ficha', m.ficha) + kv('Familia', m.familia ? `${m.familia}${m.parentesco ? ` · ${m.parentesco}` : ''}` : '') +
      kv('Nacimiento', m.dob) + kv('Género', m.genero) + kv('Nombre social', m.nombreSocial) + kv('Responde a', m.apodo) +
      kv('Previsión', m.prevision) + kv('Grupo sanguíneo', m.grupoSang) +
      kv('Sexo', m.sexo || record.sexo) + kv('Previsión', m.prevision || record.prevision || contact.prevision) +
      kv('Ocupación', m.ocupacion) + kv('Escolaridad', m.escolaridad) +
      kv('Nacionalidad', m.nacionalidad) + kv('Pueblo originario', m.etnia && m.etnia !== 'Ninguno' ? m.etnia : '') +
      kv('Inscrito desde', m.inscripcion) + kv('Sector', record.sector) +
      `</div></div>` : '') +
    (chips.length ? `<div class="pp-datos-grp">${h4('Alertas y vigencias')}<div class="pp-chips">${chips.join('')}</div></div>` : '');
}

// ── Panes ─────────────────────────────────────────────────────

function problemList(visits) {
  const seen = new Map();
  for (const v of visits) for (const d of v.diagnosticos ?? []) {
    const k = d.clasificacion || d.nombre;
    if (!k || /no informado/i.test(k)) continue;
    if (!seen.has(k)) seen.set(k, { ...d, fecha: v.fechaAtencion, n: 0 });
    seen.get(k).n++;
  }
  return [...seen.values()];
}

function renderDx() {
  const { visits, ficha } = cur;
  const src = ficha?.visits?.length ? ficha.visits : visits;
  const probs = problemList(src);
  const a = ficha?.antecedentes;
  let html = '';

  html += h4(ficha?.visits?.length ? 'Diagnósticos (historial completo, todos los profesionales)' : 'Diagnósticos (mis atenciones)');
  html += probs.length ? probs.map(d =>
    `<div class="pp-row"><span class="pp-row-t">${esc(d.nombre)}${d.clasificacion && d.clasificacion !== d.nombre ? ` <em>${esc(d.clasificacion)}</em>` : ''}${d.esAuge ? ' <span class="bges">GES</span>' : ''}</span>` +
    `<span class="pp-row-m">${d.fecha}</span></div>`).join('')
    : empty('Sin diagnósticos registrados');

  if (a?.morbidos.length) html += h4('Antecedentes mórbidos') + a.morbidos.map(m =>
    `<div class="pp-row"><span class="pp-row-t">${esc(m.label)}</span><span class="pp-row-m">${esc(m.fecha)}</span></div>`).join('');
  if (a?.alergias.length || ficha?.ram.length) html += h4('Alergias / RAM') + [...a.alergias, ...ficha.ram].map(x =>
    `<div class="pp-row"><span class="pp-row-t">${esc(x.label)}</span><span class="pp-row-m">${esc(x.details.join(' · '))}</span></div>`).join('');
  if (ficha?.programas.length) html += h4('Programas de salud') + ficha.programas.map(p =>
    `<div class="pp-row"><span class="pp-row-t">${esc(p.nombre)}</span><span class="pp-row-m">${p.vigente ? 'ingreso' : `estado ${esc(p.estado)}`} · ${esc(p.fecha)}</span></div>`).join('');

  $('ppPaneDx').innerHTML = html;
  setTabCount('dx', probs.length);
}

function sectionHTML(id, items) {
  return `<div class="pp-sec"><span class="pp-sec-l">${esc(SECTION_LABELS[id] ?? id)}</span>` +
    items.map(it => `<div class="pp-item ${it.suspendido ? 'susp' : ''}"><span>${esc(it.label)}</span>${it.details.length ? `<small>${esc(it.details.join(' · '))}</small>` : ''}</div>`).join('') +
    `</div>`;
}

function fichaVisitHTML(v, agendaByAtencion) {
  const mine = isMine(v);
  const cita = agendaByAtencion.get(v.id);
  const who  = v.prestadores.map(p => p.id === CONFIG.officerId ? 'Tú' : `${p.nombre}${p.instrumento ? ` (${p.instrumento})` : ''}`).join(', ');
  const secs = Object.entries(v.sections);
  const hasBody = v.anamnesis.motivo || v.anamnesis.historia || secs.length || v.actividades.length || v.adjuntos.length;
  return `
    <div class="pp-visit ${mine ? 'mine' : ''} ${hasBody ? 'has-body' : ''}">
      <div class="pp-vhead" ${hasBody ? 'role="button" tabindex="0" aria-expanded="false"' : ''}>
        <strong class="pp-date">${v.fechaAtencion}</strong>
        <span class="pp-hora">${esc(whenLabel(v))}</span>
        <span class="pp-tipo">${esc(v.tipoAtencion)}</span>
        ${v.esUrgencia ? `<span class="flag flag-urg" data-tip="Urgencia">U</span>` : ''}
        ${v.esEspontanea ? `<span class="flag flag-esp" data-tip="Espontánea">E</span>` : ''}
        <span class="spacer"></span>
        ${cita ? `<button class="btn-mini" data-pdf="${esc(certificadoPath(cita.id))}" data-tip="Certificado de atención">Cert.</button>` : ''}
        ${hasBody ? `<span class="caret">▾</span>` : ''}
      </div>
      <div class="pp-who ${mine ? 'me' : ''}">${esc(who)}</div>
      ${(v.diagnosticos ?? []).map(d =>
        `<span class="pp-dx">${esc(d.nombre)}${d.esAuge ? ' <span class="bges">GES</span>' : ''}</span>`
      ).join('')}
      <div class="pp-body">
        ${v.anamnesis.motivo   ? `<div class="pp-sec"><span class="pp-sec-l">Motivo de consulta</span><p>${esc(v.anamnesis.motivo)}</p></div>` : ''}
        ${v.anamnesis.historia ? `<div class="pp-sec"><span class="pp-sec-l">Historia / evolución</span><p>${esc(v.anamnesis.historia)}</p></div>` : ''}
        ${secs.map(([id, items]) => sectionHTML(id, items)).join('')}
        ${v.actividades.length ? `<div class="pp-sec"><span class="pp-sec-l">Actividades</span><p>${v.actividades.map(a => esc(a.descripcion || a.codigo)).join(' · ')}</p></div>` : ''}
        ${v.adjuntos.length ? `<div class="pp-sec"><span class="pp-sec-l">Adjuntos</span><p>📎 ${v.adjuntos.map(a => esc(a.nombre)).join(', ')}</p></div>` : ''}
      </div>
    </div>`;
}

function agendaVisitHTML(v) {
  return `
    <div class="pp-visit ${v.origen === 'cita' ? '' : 'mine'}">
      <div class="pp-vhead">
        <strong class="pp-date">${v.fechaAtencion}</strong>
        <span class="pp-hora">${esc(whenLabel(v))}</span>
        <span class="pp-tipo">${esc(v.tipoAtencion)}</span>
        <span class="spacer"></span>
        ${stateDot(v.estado)}
        ${v.origen === 'cita' && v.estado === 'Completado' ? `<button class="btn-mini" data-pdf="${esc(certificadoPath(v.id))}" data-tip="Certificado de atención">Cert.</button>` : ''}
      </div>
      ${v.razon ? `<span class="pp-razon">${esc(v.razon)}</span>` : ''}
      ${(v.diagnosticos ?? []).map(d => `<span class="pp-dx">${esc(d.nombre)}</span>`).join('')}
    </div>`;
}

function renderAt() {
  const { visits, ficha } = cur;
  let html;
  if (ficha?.visits?.length) {
    const agendaByAtencion = new Map(visits.filter(v => v.atencionId && v.origen === 'cita').map(v => [v.atencionId, v]));
    const medicina = ficha.visits.filter(isMedicalVisit);
    const otros = ficha.visits.filter(v => !isMedicalVisit(v));
    const shown = atFilter === 'otros' ? otros : medicina;
    const seg = (key, label, n) => `<button type="button" data-seg="${key}" aria-pressed="${atFilter === key}">${label} <span class="cnt">${n}</span></button>`;
    html = `<div class="pp-seg" role="group" aria-label="Tipo de atención">${seg('medicina', 'Medicina', medicina.length)}${seg('otros', 'Otros', otros.length)}</div>` +
      (shown.length ? shown.map(v => fichaVisitHTML(v, agendaByAtencion)).join('')
        : empty(atFilter === 'otros' ? 'Sin atenciones de otros profesionales' : 'Sin atenciones médicas'));
    setTabCount('at', ficha.visits.length);
  } else {
    // Sólo agenda: todas son atenciones propias, es decir, de Medicina. Las
    // pestañas internas se muestran igual para que la vista no cambie de forma.
    const seg = (key, label, n) => `<button type="button" data-seg="${key}" aria-pressed="${atFilter === key}">${label} <span class="cnt">${n}</span></button>`;
    html = `<div class="pp-seg" role="group" aria-label="Tipo de atención">${seg('medicina', 'Medicina', visits.length)}${seg('otros', 'Otros', 0)}</div>` +
      (ficha ? `<div class="pp-empty">La ficha electrónica no tiene atenciones registradas; se muestra la agenda.</div>` : '') +
      (atFilter === 'otros' ? empty('Sin atenciones de otros profesionales')
        : (visits.length ? visits.map(agendaVisitHTML).join('') : empty('Sin atenciones')));
    setTabCount('at', visits.length);
  }
  $('ppPaneAt').innerHTML = html;
}

function renderIc() {
  const { sics, ficha } = cur;
  let html = '';
  html += sics.length ? sics.map(s => `
      <div class="pp-sic">
        <div class="pp-sic-h"><strong>${esc(s.fecha)}</strong> ${stateDot(s.estado, { tone: sicTone(s.grupo) })}
          <span class="spacer"></span><button class="btn-mini" data-pdf="${esc(sicPdfPath(s.id))}" data-tip="Solicitud PDF">PDF</button></div>
        <div class="pp-sic-b"><b>${esc(s.especialidad)}</b>${s.cie10 ? ` · <span class="cie">${esc(s.cie10)}</span>` : ''} ${esc(s.diagnostico)}
          ${s.registrador.nombre ? `<br><span class="muted">Solicitó ${esc(s.registrador.nombre)}${s.motivo ? ` · ${esc(s.motivo)}` : ''}</span>` : ''}
          ${s.fundamentos ? `<p class="pp-fund">${esc(s.fundamentos)}</p>` : ''}
          </div>
      </div>`).join('')
    : empty('Sin interconsultas en el período cargado');

  const deriv = (ficha?.visits ?? []).flatMap(v => (v.sections.derivaciones ?? []).map(d => ({ ...d, fecha: v.fechaAtencion })));
  if (deriv.length) html += h4('Derivaciones registradas en atenciones') + deriv.map(d =>
    `<div class="pp-row"><span class="pp-row-t">${esc(d.label)}</span><span class="pp-row-m">${esc(d.details.join(' · '))}${d.details.length ? ' · ' : ''}${esc(d.fecha)}</span></div>`).join('');

  $('ppPaneIc').innerHTML = html;
  setTabCount('ic', sics.length);
}

function renderRx() {
  const { ficha } = cur;
  if (!ficha) { $('ppPaneRx').innerHTML = empty('Consultando ficha…'); return; }
  let html = '';
  const f = ficha.antecedentes.farmacos;
  if (f.length) html += h4('Fármacos en uso') + f.map(x =>
    `<div class="pp-row"><span class="pp-row-t">${esc(x.label)}${x.hearts ? ' <span class="al al-info">HEARTS</span>' : ''}</span>` +
    `<span class="pp-row-m">${esc([x.posologia, x.estado ? `receta ${x.estado.toLowerCase()}` : '', x.fecha].filter(Boolean).join(' · '))}</span></div>`).join('');

  const withRx = ficha.visits.filter(v => v.sections.prescripciones || v.sections.recetas || v.sections.prescExtra);
  let n = 0;
  if (withRx.length) {
    html += h4('Recetas por atención');
    for (const v of withRx) {
      const prest = v.prestadores[0]?.id ?? CONFIG.officerId;
      const who = v.prestadores.map(p => p.nombre).join(', ');
      html += `<div class="pp-rx"><div class="pp-rx-h"><strong>${esc(v.fechaAtencion)}</strong><span class="muted">${esc(who)}</span></div>`;
      for (const r of v.sections.recetas ?? []) {
        n++;
        html += `<div class="pp-rx-r"><span>${esc(r.label)}</span><small>${esc(r.details.join(' · '))}</small>` +
          `<button class="btn-mini" data-pdf="${esc(recetaPdfPath(v.id, r.raw.Id, prest))}" data-tip="Receta emitida (PDF)">PDF</button></div>`;
      }
      for (const p of [...(v.sections.prescripciones ?? []), ...(v.sections.prescExtra ?? [])]) {
        html += `<div class="pp-item ${p.suspendido ? 'susp' : ''}"><span>${esc(p.label)}</span>${p.details.length ? `<small>${esc(p.details.join(' · '))}</small>` : ''}</div>`;
      }
      html += `</div>`;
    }
  }
  if (!html) html = empty('Sin recetas ni prescripciones registradas');
  $('ppPaneRx').innerHTML = html;
  setTabCount('rx', n || f.length);
}

function renderAll() {
  renderHeader();
  renderDatos();
  renderDx();
  renderAt();
  renderIc();
  renderRx();
}

// ── Ficha loading ─────────────────────────────────────────────

async function loadAndRenderFicha(force = false) {
  const me = cur;
  const { record } = me;
  $('ppFichaStatus').innerHTML = `<span class="muted">Cargando ficha clínica…</span>`;
  // Show the shape of what is coming instead of an empty pane
  for (const id of ['ppPaneDx', 'ppPaneAt', 'ppPaneIc', 'ppPaneRx']) {
    if (!$(id).innerHTML.trim()) $(id).innerHTML = skeletonCards(3);
  }
  let token = null;
  try { token = await getToken(); } catch { /* no extension context */ }
  if (!token) { $('ppFichaStatus').innerHTML = `<span class="al al-warn">Sin sesión en Eloisa — solo agenda</span>`; return; }
  if (!record.run && !record.idUsp) { $('ppFichaStatus').innerHTML = `<span class="al al-warn">Paciente sin RUN — no se puede consultar la ficha</span>`; return; }
  try {
    const ficha = await loadFicha(token, { run: record.run, idUsp: record.idUsp }, { force });
    if (cur !== me) return; // user moved to another patient meanwhile
    me.ficha = ficha;
    renderAll();
    const mineN = ficha.visits.filter(isMine).length;
    // Antes decía «Ficha completa · 0 atenciones» junto a siete errores 503, con
    // la hora con segundos y las rutas HTTP en el tooltip.
    const n = ficha.visits.length;
    const fallos = ficha.errors.length;
    const estado = fallos ? `Ficha parcial · ${fallos} ${fallos === 1 ? 'fuente falló' : 'fuentes fallaron'}` : 'Ficha completa';
    const hora = new Date(ficha.savedAt).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit', hour12: false });
    const humanFichaError = e => { const m = String(e).match(/^([^:]{2,40}):\s*(.+)$/); return m ? `${m[1]}: ${humanError(m[2], 'Eloisa')}` : humanError(e, 'Eloisa'); };
    $('ppFichaStatus').innerHTML =
      `<span>${estado} · ${n} ${n === 1 ? 'atención' : 'atenciones'} (${mineN} mías)${n ? ` desde ${esc(ficha.visits[n - 1].fechaAtencion)}` : ''} · ${hora}</span>` +
      `<button class="btn-mini" id="ppReload" aria-label="Volver a pedir la ficha a Eloisa" data-tip="Volver a pedir la ficha a Eloisa">↻</button>` +
      (fallos ? `<span class="al al-warn" tabindex="0" role="img" aria-label="${fallos} ${fallos === 1 ? 'fuente falló' : 'fuentes fallaron'}" data-tip="${esc(ficha.errors.map(humanFichaError).join('\n'))}">⚠</span>` : '');
  } catch (err) {
    if (cur === me) $('ppFichaStatus').innerHTML = `<span class="al al-bad">Ficha clínica: ${esc(humanError(err, 'Eloisa'))}</span>`;
  }
}

/**
 * Opens the patient panel. Renders agenda data at once, then fetches the full
 * ficha (10 years, all professionals) and re-renders every pane.
 * @param {object} record
 * @param {{ allData, sics, contacts, pos?: {i: number, n: number} }} ctx
 *   pos drives the ‹ › controls: where this patient sits in the current list.
 */
/** Keeps the open panel's textarea in step when a note changes elsewhere (undo, inline edit). */
export function syncNote(record) {
  if (cur && patientKey(cur.record) === patientKey(record)) $('ppNoteText').value = record.note ?? '';
}

export function openPanel(record, { allData, sics = [], contacts = new Map(), pos = null }) {
  const wasOpen = isOpen();
  if (!wasOpen) opener = document.activeElement; // antes de dejar inerte el fondo, que le quita el foco
  const key = patientKey(record);
  cur = {
    record, key,
    visits: allData.filter(r => patientKey(r) === key)
      .sort((a, b) => dateToInt(b.fechaAtencion) - dateToInt(a.fechaAtencion) || b.hora.localeCompare(a.hora)),
    sics: record.run ? sics.filter(s => s.paciente.run === record.run) : [],
    contact: record.run ? contacts.get(record.run) ?? {} : {},
    ficha: null,
  };
  $('ppDatos').setAttribute('hidden', '');
  $('ppAvatar').classList.remove('on');
  $('ppAvatar').setAttribute('aria-expanded', 'false');
  $('ppPdfMenu').classList.remove('open');
  $('ppPdfMenu').querySelectorAll('button[data-scope]').forEach(b => { b.textContent = SCOPE_LABEL[b.dataset.scope]; });
  $('ppNoteText').value = record.note ?? '';
  $('ppPos').textContent = pos ? `${pos.i + 1}/${pos.n}` : '';
  $('ppPrev').disabled = !pos || pos.i <= 0;
  $('ppNext').disabled = !pos || pos.i >= pos.n - 1;
  renderAll();
  showTab(activeTab);
  const panel = $('patientPanel');
  panel.inert = false;
  panel.classList.add('open');
  $('panelBackdrop').classList.add('open');
  if (!wasOpen) {
    for (const node of shielded()) node.inert = true;
    panel.focus({ preventScroll: true }); // el lector anuncia «diálogo, <nombre>»; Tab sigue al primer control
  }
  panel.scrollTop = 0;
  loadAndRenderFicha();
}
