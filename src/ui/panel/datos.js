/** Cabecera (iniciales, nombre, RUN, edad) y el desplegable de datos administrativos. */
import { identidad } from '../../core/identidad.js';
import { esc, $ } from '../dom.js';
import { kv, h4, empty } from './helpers.js';

export function renderHeader(cur) {
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
    if (m.nodoInscripcion && m.nodoInscripcion !== identidad.nodeId) out.push(`<span class="al al-info" data-tip="Inscrito en otro establecimiento">Nodo ${m.nodoInscripcion}</span>`);
  }
  if (ficha.antecedentes.alergias.length || ficha.ram.length) out.push(`<span class="al al-bad">Alergia / RAM registrada</span>`);
  return out;
}

export function renderDatos(cur) {
  const { record, contact, ficha } = cur;
  const m = ficha?.master;
  const tel = m?.telefonos || record.telefono || contact.telefono;
  const dir = m?.direccion || record.direccion || contact.direccion;
  const chips = ficha ? alertChips(ficha) : [];
  const important = ficha ? (ficha.master?.fallecido || ficha.master?.activo === false || ficha.antecedentes.alergias.length || ficha.ram.length) : false;

  $('ppAvatar').classList.toggle('dot', !!important); // el punto rojo de alertas va en las iniciales
  $('ppDatosBody').innerHTML =
    `<div class="pp-datos-grp">${h4('Contacto')}<div class="kv-grid">${kv('Teléfono', tel)}${kv('Dirección', dir)}${kv('Email', m?.email)}</div>${!tel && !dir ? empty(ficha ? 'Sin contacto registrado' : 'Consultando ficha…') : ''}</div>` +
    (m ? `<div class="pp-datos-grp">${h4('Inscripción')}<div class="kv-grid">` +
      kv('Ficha', m.ficha) + kv('Familia', m.familia ? `${m.familia}${m.parentesco ? ` · ${m.parentesco}` : ''}` : '') +
      kv('Nacimiento', m.dob) + kv('Género', m.genero) + kv('Nombre social', m.nombreSocial) + kv('Responde a', m.apodo) +
      kv('Grupo sanguíneo', m.grupoSang) +
      kv('Sexo', m.sexo || record.sexo) + kv('Previsión', m.prevision || record.prevision || contact.prevision) +
      kv('Ocupación', m.ocupacion) + kv('Escolaridad', m.escolaridad) +
      kv('Nacionalidad', m.nacionalidad) + kv('Pueblo originario', m.etnia && m.etnia !== 'Ninguno' ? m.etnia : '') +
      kv('Inscrito desde', m.inscripcion) + kv('Sector', record.sector) +
      `</div></div>` : '') +
    (chips.length ? `<div class="pp-datos-grp">${h4('Alertas y vigencias')}<div class="pp-chips">${chips.join('')}</div></div>` : '');
}
