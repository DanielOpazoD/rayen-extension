/**
 * El centro de contraseñas: un diálogo aparte, detrás del PIN.
 *
 * Tres decisiones que se ven en el código:
 *  · Se entra escribiendo el PIN otra vez, aunque la sesión ya esté abierta.
 *    Es un sitio al que se entra a propósito, no algo que quede a la vista si
 *    alguien se acerca al ordenador mientras el médico atiende.
 *  · Nunca se pinta una contraseña. El campo está siempre vacío: se escribe
 *    para reemplazar, y lo guardado sólo se describe («guardada el …»).
 *  · «Iniciar sesión» sólo aparece donde la extensión puede de verdad. En los
 *    demás se dice por qué y se ofrece abrir el sitio: un botón que no hace
 *    nada es peor que no tenerlo.
 */
import { $, esc, closestOf } from './dom.js';
import { unlockWith, PinError, pinValido } from '../io/crypto-store.js';
import { SISTEMAS, sistemaPorId, puedeEntrarSola } from '../core/credenciales-catalogo.js';
import { listar, guardar, olvidar, olvidarTodo, hayAlguna, exportarRespaldo, importarRespaldo } from '../io/credenciales.js';
import { fraseValida } from '../io/credenciales-respaldo.js';
import { hisConectar, hisCreds } from '../io/his-session.js';
import { toast } from './toast.js';

const fecha = ms => (ms ? new Date(ms).toLocaleDateString('es-CL', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '');

const ETIQUETA = {
  'sin-guardar': { texto: 'sin guardar', tono: '' },
  guardada: { texto: 'guardada', tono: 'ok' },
  caducada: { texto: 'rechazada — vuelve a guardarla', tono: 'bad' },
};

/** Lo que se puede hacer con este sistema, dicho sin rodeos. */
function accionesHTML(s, e) {
  const entrar = puedeEntrarSola(s, e.estado)
    ? `<button type="button" class="btn-mini" data-cred-entrar="${esc(s.id)}">Iniciar sesión</button>` : '';
  const abrir = !puedeEntrarSola(s, e.estado) && s.url
    ? `<button type="button" class="btn-mini" data-cred-abrir="${esc(s.id)}">Abrir el sitio</button>` : '';
  const borrar = e.estado !== 'sin-guardar'
    ? `<button type="button" class="btn-mini" data-cred-olvidar="${esc(s.id)}" data-tip="Borra lo guardado aquí. La sesión que ya esté abierta en el navegador sigue abierta: ciérrala en el propio sistema.">Olvidar</button>` : '';
  return entrar + abrir + borrar;
}

function tarjetaHTML(s, e) {
  const et = ETIQUETA[e.estado];
  const detalle = e.estado === 'caducada'
    ? `El sistema la rechazó el ${fecha(e.caducadaEn)}; no se reintenta sola.`
    : e.estado === 'guardada' ? `Guardada el ${fecha(e.guardadaEn)}.` : '';
  return `<div class="cred-item" data-cred-sistema="${esc(s.id)}">
    <div class="cred-item-h">
      <strong>${esc(s.nombre)}</strong>
      <span class="his-status ${et.tono}">${esc(et.texto)}</span>
    </div>
    ${e.usuario ? `<div class="cred-usuario">Usuario: <b>${esc(e.usuario)}</b></div>` : ''}
    ${detalle ? `<div class="cred-detalle">${esc(detalle)}</div>` : ''}
    ${s.nota ? `<div class="cred-detalle">${esc(s.nota)}</div>` : ''}
    <form class="cred-form" data-cred-form="${esc(s.id)}" autocomplete="off">
      <input type="text" name="usuario" placeholder="${esc(s.usuarioLabel)}" autocomplete="off" value="${esc(e.usuario)}">
      <input type="password" name="clave" placeholder="${e.estado === 'sin-guardar' ? 'Contraseña' : 'Contraseña nueva'}" autocomplete="new-password">
      <button type="submit" class="btn-mini">${e.estado === 'sin-guardar' ? 'Guardar' : 'Reemplazar'}</button>
    </form>
    <div class="cred-acciones">${accionesHTML(s, e)}</div>
  </div>`;
}

async function pintarLista() {
  const estados = await listar();
  $('credLista').innerHTML = SISTEMAS.map(s => tarjetaHTML(s, estados[s.id])).join('');
}

/** El resumen de Preferencias: cuántos accesos hay, sin abrir nada. */
async function pintarResumen() {
  const el = $('credResumen');
  if (!el) return;
  try {
    const estados = Object.values(await listar());
    const n = estados.filter(e => e.estado !== 'sin-guardar').length;
    const cad = estados.filter(e => e.estado === 'caducada').length;
    el.textContent = n === 0 ? 'Ningún acceso guardado todavía.'
      : `${n} de ${SISTEMAS.length} guardados${cad ? ` · ${cad} rechazado${cad > 1 ? 's' : ''}` : ''}.`;
    el.className = `his-status ${cad ? 'warn' : n ? 'ok' : ''}`;
  } catch { el.textContent = ''; }
}

function abrirSitio(url) {
  if (globalThis.chrome?.tabs?.create) chrome.tabs.create({ url });
  else globalThis.open(url, '_blank', 'noopener');
}

// ── Respaldo cifrado ────────────────────────────────────────

function descargar(nombre, objeto) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(objeto, null, 2)], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url; a.download = nombre;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

async function exportar(msg) {
  const frase = /** @type {HTMLInputElement} */ ($('credFrase')).value;
  if (!fraseValida(frase)) { msg('La frase necesita al menos 12 caracteres.', 'warn'); return; }
  if (!await hayAlguna()) { msg('No hay accesos que respaldar todavía.', 'warn'); return; }
  const fichero = await exportarRespaldo(frase);   // las claves en claro no salen de io/
  const hoy = new Date().toISOString().slice(0, 10);
  descargar(`rayen-accesos-${hoy}.json`, fichero);
  /** @type {HTMLInputElement} */ ($('credFrase')).value = '';
  msg('Respaldo descargado. Guárdalo donde guardarías una llave.', 'ok');
}

async function importar(file, msg) {
  const frase = /** @type {HTMLInputElement} */ ($('credFrase')).value;
  if (!frase) { msg('Escribe la frase con la que se creó ese respaldo.', 'warn'); return; }
  let fichero;
  try { fichero = JSON.parse(await file.text()); }
  catch { msg('Ese fichero no es un respaldo legible.', 'bad'); return; }
  try {
    // Fusiona, no reemplaza: un respaldo con un acceso no puede borrar los otros.
    const r = await importarRespaldo(fichero, frase);
    /** @type {HTMLInputElement} */ ($('credFrase')).value = '';
    await pintarLista();
    await pintarResumen();
    const partes = [r.añadidas && `${r.añadidas} añadido(s)`, r.reemplazadas && `${r.reemplazadas} reemplazado(s)`,
      r.descartadas && `${r.descartadas} descartado(s) por venir dañados`].filter(Boolean);
    msg(partes.length ? `Respaldo cargado: ${partes.join(' · ')}.` : 'El respaldo no traía accesos utilizables.',
      r.descartadas ? 'warn' : 'ok');
  } catch (e) {
    msg(e?.message || 'No se pudo abrir el respaldo.', 'bad');
  }
}

// ── El diálogo ──────────────────────────────────────────────

function cerrar() {
  $('credVault').hidden = true;
  $('credBody').hidden = true;                 // volver a pedir el PIN la próxima vez
  $('credPinForm').hidden = false;
  /** @type {HTMLInputElement} */ ($('credPin')).value = '';
  $('credPinMsg').textContent = '';
  // La frase es lo único que protege un fichero que sale de la máquina: no se
  // queda escrita en el campo el resto de la sesión.
  /** @type {HTMLInputElement} */ ($('credFrase')).value = '';
  $('credRespaldoMsg').textContent = '';
  $('credLista').innerHTML = '';               // nada guardado queda en el DOM
}

function abrir() {
  $('credVault').hidden = false;
  /** @type {HTMLInputElement} */ ($('credPin')).focus();
}

/** Inicia sesión de verdad, sólo donde el transporte lo permite. */
async function entrar(id, msg) {
  if (id !== 'rce') return;                    // hoy es el único con login silencioso
  const { user, pass } = await hisCreds();
  if (!user || !pass) { msg('No hay acceso guardado y vigente para el RCE.', 'warn'); return; }
  msg('Iniciando sesión en el RCE…');
  const r = await hisConectar(user, pass);
  await pintarLista();
  await pintarResumen();
  msg(r.ok ? 'Sesión iniciada en el RCE.' : `El RCE rechazó el acceso: ${r.error ?? ''}`, r.ok ? 'ok' : 'bad');
}

export function initCredenciales() {
  if (!$('credVault')) return;
  const pinMsg = (t, tono = '') => { $('credPinMsg').textContent = t; $('credPinMsg').className = `his-status ${tono}`; };
  const respMsg = (t, tono = '') => { $('credRespaldoMsg').textContent = t; $('credRespaldoMsg').className = `his-status ${tono}`; };

  $('btnCredenciales')?.addEventListener('click', abrir);
  $('credClose').addEventListener('click', cerrar);
  $('credVault').addEventListener('click', e => { if (e.target === $('credVault')) cerrar(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && !$('credVault').hidden) cerrar(); });

  $('credPinForm').addEventListener('submit', async e => {
    e.preventDefault();
    const pin = /** @type {HTMLInputElement} */ ($('credPin')).value;
    if (!pinValido(pin)) { pinMsg('El PIN son seis dígitos.', 'warn'); return; }
    try {
      await unlockWith(pin);                   // comprueba; con el mismo PIN la clave no cambia
    } catch (err) {
      pinMsg(err instanceof PinError ? 'PIN incorrecto.' : 'No se pudo comprobar el PIN.', 'bad');
      return;
    }
    /** @type {HTMLInputElement} */ ($('credPin')).value = '';
    pinMsg('');
    $('credPinForm').hidden = true;
    $('credBody').hidden = false;
    // Fuera del try del PIN: un fallo al pintar no es un PIN incorrecto, y
    // decirlo así dejaba al médico reescribiendo un PIN que era el correcto.
    try { await pintarLista(); }
    catch { pinMsg('Los accesos no se pudieron leer.', 'bad'); }
  });

  // Guardar / reemplazar: un submit por tarjeta.
  $('credLista').addEventListener('submit', async e => {
    e.preventDefault();
    const form = /** @type {HTMLFormElement} */ (e.target);
    const id = form.dataset.credForm;
    if (!id) return;
    const usuario = /** @type {HTMLInputElement} */ (form.elements.namedItem('usuario')).value.trim();
    const clave = /** @type {HTMLInputElement} */ (form.elements.namedItem('clave')).value;
    if (!usuario || !clave) { toast('Escribe usuario y contraseña.', { tone: 'info' }); return; }
    await guardar(id, usuario, clave);
    await pintarLista();
    await pintarResumen();
    toast(`Acceso guardado: ${sistemaPorId(id)?.nombre ?? id}`, { tone: 'info' });
  });

  $('credLista').addEventListener('click', async e => {
    const entrarBtn = closestOf(e, '[data-cred-entrar]');
    if (entrarBtn) {
      entrarBtn.disabled = true;               // sin ráfagas de login contra el hospital
      try { await entrar(entrarBtn.dataset.credEntrar, respMsg); }
      finally { entrarBtn.disabled = false; }
      return;
    }
    const abrirBtn = closestOf(e, '[data-cred-abrir]');
    if (abrirBtn) { abrirSitio(sistemaPorId(abrirBtn.dataset.credAbrir)?.url ?? ''); return; }
    const olv = closestOf(e, '[data-cred-olvidar]');
    if (olv) { await olvidar(olv.dataset.credOlvidar); await pintarLista(); await pintarResumen(); }
  });

  $('credExportar').addEventListener('click', () => exportar(respMsg).catch(err => respMsg(err.message, 'bad')));
  $('credImportar').addEventListener('click', () => $('credFichero').click());
  $('credFichero').addEventListener('change', async e => {
    const file = /** @type {HTMLInputElement} */ (e.target).files?.[0];
    if (file) await importar(file, respMsg);
    /** @type {HTMLInputElement} */ (e.target).value = '';
  });

  $('credOlvidarTodo').addEventListener('click', async () => {
    if (!globalThis.confirm('¿Olvidar los accesos de los cinco sistemas? Habrá que volver a escribirlos.')) return;
    await olvidarTodo();
    await pintarLista();
    await pintarResumen();
    respMsg('Todos los accesos olvidados.', 'warn');
  });

  pintarResumen();
}
