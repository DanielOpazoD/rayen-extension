/**
 * Las atenciones del HIS de Hanga Roa (el RCE) dentro de la pestaña Atenciones
 * del panel, arriba de las de Eloisa y con un icono que marca su origen.
 *
 * Se pintan con la MISMA gramática que una atención de Eloisa (`pp-visit`,
 * `pp-vhead`, `pp-sec`): el médico lee su historia sin cambiar de forma ni de
 * pestaña, y el icono de origen es lo único que distingue de qué sistema viene
 * cada una. El contenido clínico se trae al desplegar, no al abrir el panel:
 * son tantas peticiones al HIS como atenciones tenga el paciente.
 */
import { esc } from '../dom.js';
import { HIS_LABEL, ordenarAtenciones } from '../../core/his-parse.js';
import { fichaTieneContenido, signosVitalesLista } from '../../core/his-ficha.js';

// Icono de origen: un edificio (el HIS), distinto de todo lo de Eloisa.
const ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 21h18"/><path d="M5 21V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16"/><path d="M9 7h2M9 11h2M9 15h2M13 7h2M13 11h2M13 15h2"/></svg>';

const badge = `<span class="his-origen" data-tip="${esc(HIS_LABEL)}">${ICON}HIS</span>`;

/**
 * Clave de una ficha en el mapa. `PURG0005.php?id=N` y `PAMB0005.php?id=N` son
 * documentos distintos, de tablas distintas del HIS: nada garantiza que sus
 * ids no se crucen. Con la clave puesta sólo en el id, una urgencia y una
 * ambulatoria que compartieran número se pisaban, y la segunda mostraba el
 * contenido clínico de la primera bajo otra fecha y otro servicio.
 * @param {{idCuenta: string, tipoFicha: string}} a
 */
export const claveFicha = a => `${a.tipoFicha}:${a.idCuenta}`;
const envoltura = inner => `<div class="his-block"><div class="his-head">${badge}${inner}</div></div>`;

/** Una sección del cuerpo, con el mismo marcado que las de Eloisa. Vacía → nada. */
const sec = (titulo, texto) => texto
  ? `<div class="pp-sec"><span class="pp-sec-l">${esc(titulo)}</span><p>${esc(texto)}</p></div>` : '';

/** Signos vitales: sólo urgencia los trae. Los rótulos salen del núcleo, para
    que el informe imprimible liste exactamente los mismos. */
function signosHTML(sv) {
  const items = signosVitalesLista(sv).map(([l, v]) => `<span class="his-sv"><b>${esc(l)}</b>${esc(v)}</span>`);
  if (!items.length) return '';
  return `<div class="pp-sec"><span class="pp-sec-l">Signos vitales${sv?.hora ? ` · ${esc(sv.hora)}` : ''}</span><div class="his-svs">${items.join('')}</div></div>`;
}

/**
 * El contenido clínico de una ficha del RCE, con el marcado de una atención de
 * Eloisa. Sólo se pinta lo que tiene valor: el HIS deja muchos campos vacíos y
 * una tarjeta llena de rótulos sin dato no se lee.
 * @param {import('../../core/his-ficha.js').FichaHis} f
 */
function hisFichaHTML(f) {
  const cierre = [f.cierre?.condicion && `Condición: ${f.cierre.condicion}`,
    f.cierre?.destino && `Destino: ${f.cierre.destino}`,
    f.cierre?.pronostico && `Pronóstico médico legal: ${f.cierre.pronostico}`,
    f.cierre?.fechaSalida && `Salida: ${[f.cierre.fechaSalida, f.cierre.horaSalida].filter(Boolean).join(' ')}`,
  ].filter(Boolean).join(' · ');
  return sec('Motivo de consulta', f.meta?.motivoConsulta) +
    sec('Anamnesis', f.atencion?.anamnesis) +
    sec('Examen físico', f.atencion?.examenFisico) +
    sec('Hipótesis diagnóstica', f.atencion?.hipotesis) +
    signosHTML(f.signosVitales) +
    sec('Indicaciones / plan', f.atencion?.indicaciones) +
    sec('Indicaciones al alta', f.atencion?.indicacionesAlta) +
    sec('Cierre', cierre);
}

/**
 * Una atención del HIS. El cuerpo se rellena al desplegar (`estado` lo dice);
 * mientras tanto la cabecera ya muestra lo que trae el listado.
 * @param {import('../../core/his-parse.js').AtencionHis} a
 * @param {{estado?:string, ficha?:any, error?:string, abierta?:boolean}} [det]  lo ya traído de esta ficha, y si está desplegada
 */
function visitHTML(a, det) {
  const urg = a.tipoFicha === 'urgencia';
  const abierta = Boolean(det?.abierta);
  const cuerpo =
    det?.estado === 'cargando' ? '<div class="pp-empty">trayendo la ficha del HIS…</div>'
    : det?.estado === 'error' ? `<div class="pp-empty his-err">No se pudo leer esta ficha: ${esc(det.error ?? '')}</div>`
    : det?.estado === 'ok'
      ? (fichaTieneContenido(det.ficha)
        ? hisFichaHTML(det.ficha)
        : '<div class="pp-empty">El HIS no registró contenido clínico en esta atención.</div>')
    : '';
  const f = det?.estado === 'ok' ? det.ficha : null;
  const medico = f?.meta?.medico ? `<div class="pp-who">${esc(f.meta.medico)}</div>` : '';
  // Como en Eloisa, los diagnósticos van FUERA del cuerpo: se leen con la
  // tarjeta cerrada, que es como el médico recorre la historia de un vistazo.
  const dx = [f?.diagnosticos?.principal, f?.diagnosticos?.secundario, f?.diagnosticos?.complementario]
    .filter(Boolean).map(d => `<span class="pp-dx">${esc(d)}</span>`).join('');
  return `
    <div class="pp-visit his-visit has-body${abierta ? ' expanded' : ''}" data-his-id="${esc(a.idCuenta)}" data-his-tipo="${esc(a.tipoFicha)}">
      <div class="pp-vhead" role="button" tabindex="0" aria-expanded="${abierta ? 'true' : 'false'}">
        <strong class="pp-date">${esc(a.fecha)}</strong>
        ${f?.meta?.horaAtencion ? `<span class="pp-hora">${esc(f.meta.horaAtencion)}</span>` : ''}
        <span class="pp-tipo">${esc(a.tipoAtencion)}</span>
        <span class="his-serv">${esc(a.servicio)}</span>
        ${urg ? '<span class="flag flag-urg" data-tip="Urgencia">U</span>' : ''}
        <span class="spacer"></span>
        <button class="btn-mini his-open" data-his-id="${esc(a.idCuenta)}" data-his-tipo="${esc(a.tipoFicha)}" data-tip="Abrir la ficha imprimible en el HIS">Abrir</button>
        <span class="pp-expand" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M6 9l6 6 6-6"/></svg></span>
      </div>
      ${medico}${dx}
      <div class="pp-body">${cuerpo}</div>
    </div>`;
}

/**
 * HTML del bloque del HIS para la pestaña Atenciones.
 * @param {{estado:string, atenciones?:object[], error?:string, fichas?:Map<string,object>}|null} his
 * @returns {string} vacío si no hay que mostrar nada (paciente sin HIS configurado)
 */
export function hisBlockHTML(his) {
  if (!his) return '';
  if (his.estado === 'cargando') return envoltura('<small>cargando atenciones del HIS…</small>');
  if (his.estado === 'sin-sesion') return envoltura('<small>Conéctate al HIS en Preferencias para ver estas atenciones.</small>');
  if (his.estado === 'error') return envoltura(`<small class="his-err">HIS no disponible: ${esc(his.error ?? '')}</small>`);

  const rows = ordenarAtenciones(his.atenciones ?? []);
  if (!rows.length) return envoltura('<small>sin atenciones en el HIS</small>');
  const head = `<small>${rows.length} ${rows.length === 1 ? 'atención' : 'atenciones'} en el HIS</small>`;
  return `<div class="his-block"><div class="his-head">${badge}${head}</div>` +
    rows.map(a => visitHTML(a, his.fichas?.get(claveFicha(a)))).join('') + `</div>`;
}
