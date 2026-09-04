/**
 * Hoja «Informe con IA» dentro del panel del paciente. Todo lo local ocurre
 * aquí (registro → contexto → prompt → informe); lo único que sale de la
 * máquina es lo que la persona copia con el botón, y antes lo ve tal cual.
 * Proveedor: manual. El de API queda en src/ai/provider.js, apagado.
 */
import { $, esc } from './dom.js';
import { CONFIG } from '../core/config.js';
import { PLANTILLAS, prepararInforme, cerrarInforme, markdownAHtml } from '../ai/index.js';
import { openReport } from './export.js';
import { toast } from './toast.js';

let datos = null;      // { record, ficha, visits, sics } del panel
let prep = null;       // resultado de prepararInforme
let informe = null;    // { respuesta, markdown }
let opener = null;
let getLabItems = () => [];

const VENTANAS = [[6, 'Últimos 6 meses'], [12, 'Últimos 12 meses'], [24, 'Últimos 24 meses'], [0, 'Todo el registro']];

function preparar() {
  const meta = $('iaCtxMeta');
  prep = null; informe = null;
  $('iaInforme').innerHTML = ''; $('iaInformeMeta').textContent = ''; $('iaImprimir').disabled = true; $('iaCopiarMd').disabled = true;
  try {
    const ventana = Number($('iaVentana').value) || null;
    prep = prepararInforme({
      plantilla: $('iaPlantilla').value,
      datos: { record: datos.record, ficha: datos.ficha, visits: datos.visits, sics: datos.sics, laboratorio: getLabItems(datos.record) ?? [], officerId: CONFIG.officerId },
      opciones: { ventanaMeses: ventana, fechasReales: $('iaFechasReales').checked },
    });
    const c = prep.contexto;
    $('iaFuentes').innerHTML = prep.registro.fuentes.map(f => `<span class="ia-fuente ${f.estado}">${esc(f.id)} · ${esc(f.estado)}${f.n ? ` · ${f.n}` : ''}</span>`).join('');
    meta.textContent = `${c.incluido.atenciones} atenciones, ${c.incluido.problemas} problemas, ${c.incluido.interconsultas} interconsultas · ≈ ${c.tokensAprox.toLocaleString('es-CL')} tokens${c.omitido.length ? ` · omitido: ${c.omitido.join('; ')}` : ''} · sin nombre ni RUN (comprobado)`;
    meta.className = 'ia-meta ok';
    $('iaContexto').value = c.texto;
    $('iaPrompt').value = `${prep.prompt.system}\n\n=====\n\n${prep.prompt.user}`;
    $('iaCopiar').disabled = false;
  } catch (err) {
    meta.textContent = err.message; meta.className = 'ia-meta err';
    $('iaContexto').value = ''; $('iaPrompt').value = ''; $('iaCopiar').disabled = true;
  }
}

async function copiar(texto, aviso) {
  try { await navigator.clipboard.writeText(texto); toast(aviso); }
  catch { toast('No se pudo copiar: selecciona el texto y cópialo a mano.', 'warn'); }
}

function armar() {
  if (!prep) return;
  const texto = $('iaRespuesta').value.trim();
  if (!texto) { $('iaInformeMeta').textContent = 'Pega primero la respuesta del modelo.'; return; }
  informe = cerrarInforme({ plantilla: prep.plantilla, registro: prep.registro, contexto: prep.contexto, respuestaTexto: texto, proveedor: 'manual' });
  $('iaInforme').innerHTML = markdownAHtml(informe.markdown);
  const f = informe.respuesta.faltantes.map(id => prep.plantilla.secciones.find(s => s.id === id)?.titulo ?? id);
  $('iaInformeMeta').textContent = f.length ? `El modelo no entregó: ${f.join(', ')}. Revisa el informe antes de usarlo.` : 'Todas las secciones presentes. Revisa el informe antes de usarlo.';
  $('iaImprimir').disabled = false; $('iaCopiarMd').disabled = false;
}

export function openIa(d) {
  datos = d;
  opener = document.activeElement;
  const sheet = $('iaSheet');
  sheet.hidden = false;
  $('iaRespuesta').value = '';
  preparar();
  $('iaClose').focus();
}

export function closeIa() {
  const sheet = $('iaSheet');
  if (sheet.hidden) return;
  sheet.hidden = true;
  opener?.focus?.();
}

export function initIaPanel({ labItems } = {}) {
  if (typeof labItems === 'function') getLabItems = labItems;
  $('iaPlantilla').innerHTML = PLANTILLAS.map(p => `<option value="${p.id}">${esc(p.nombre)}</option>`).join('');
  $('iaVentana').innerHTML = VENTANAS.map(([v, l]) => `<option value="${v}"${v === 12 ? ' selected' : ''}>${l}</option>`).join('');
  $('iaPlantilla').addEventListener('change', () => { const p = PLANTILLAS.find(x => x.id === $('iaPlantilla').value); if (p) { $('iaVentana').value = String(p.ventanaMeses ?? 0); $('iaFechasReales').checked = !!p.fechasReales; } preparar(); });
  $('iaVentana').addEventListener('change', preparar);
  $('iaFechasReales').addEventListener('change', preparar);
  $('iaCopiar').addEventListener('click', () => copiar($('iaPrompt').value, 'Prompt copiado. Pégalo en el modelo autorizado y trae la respuesta.'));
  $('iaArmar').addEventListener('click', armar);
  $('iaCopiarMd').addEventListener('click', () => informe && copiar(informe.markdown, 'Informe copiado en Markdown.'));
  $('iaImprimir').addEventListener('click', () => informe && openReport(`<article class="ia-informe">${markdownAHtml(informe.markdown)}</article>`));
  $('iaClose').addEventListener('click', closeIa);
  // Escape cierra la hoja, no el panel de atrás.
  $('iaSheet').addEventListener('keydown', e => { if (e.key === 'Escape') { e.stopPropagation(); closeIa(); } });
}
