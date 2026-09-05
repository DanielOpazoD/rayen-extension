/**
 * Cruce de la agenda con el historial diario, sin red ni DOM.
 *
 * `mergeHistorial` enriquece cada cita con la atención que le corresponde
 * (mismo día; si no, la cita exacta que declaró Rayen; si no, la más cercana,
 * marcada como estimada) y añade como filas sueltas las atenciones mías sin
 * cita. `aggregateTeam` resume el día del equipo. Vive en core para que la
 * valla de lint garantice que sigue puro y para probarlo sin arnés de Chrome.
 */
import { matchKey } from './parser.js';
import { diasEntre } from './dates.js';
import { esMiaAtencion } from './sic-rules.js';

/** Per-day aggregate for the whole node (team view) — small enough to keep for every day. */
export function aggregateTeam(atenciones) {
  const agg = { total: atenciones.length, byInstrumento: {}, byPrestador: {}, byTipo: {}, urgencias: 0, espontaneas: 0 };
  const inc = (obj, k) => { if (k) obj[k] = (obj[k] ?? 0) + 1; };
  for (const a of atenciones) {
    inc(agg.byTipo, a.tipoAtencion || '(sin tipo)');
    if (a.esUrgencia)   agg.urgencias++;
    if (a.esEspontanea) agg.espontaneas++;
    // One atención may have several prestadores (e.g. diada); count each
    const seen = new Set();
    for (const p of a.prestadores) {
      if (seen.has(p.id)) continue;
      seen.add(p.id);
      inc(agg.byPrestador, p.nombre);
      inc(agg.byInstrumento, p.instrumento || '(sin instrumento)');
    }
  }
  return agg;
}



/** Estado de agenda que descarta la cita: no vino, se anuló o se suspendió. Cualquier otro puede recibir una ficha. */
const citaDescartada = estado => /\bno\s+(atendid|se\s+present)|anulad|cancelad|suspendid/i.test(String(estado));
const ANTES_DIAS = 14, DESPUES_DIAS = 7;

export function mergeHistorial(citas, atenciones) {
  const idx = new Map();
  for (const a of atenciones) {
    const k = matchKey(a);
    if (!idx.has(k)) idx.set(k, []);
    idx.get(k).push(a);
  }
  for (const list of idx.values()) list.sort((x, y) => x.hora.localeCompare(y.hora));

  const used = new Set();
  const out  = citas.map(c => {
    // Same patient may have several atenciones that day (kinesiólogo, matrona…):
    // sólo se cruza la que registró el propio oficial. Decisión de Daniel
    // (03-09-2026): «quiero ver sólo mis diagnósticos». Antes, una cita
    // atendida sin registro propio heredaba la atención de la matrona y ese
    // diagnóstico ajeno seguía a Pacientes, a Hoy, a las estadísticas y a las
    // exportaciones como si fuera suyo. Quién más atendió ese día queda como
    // pista (`otrosEseDia`), sin heredar nada.
    const cands = (idx.get(matchKey(c)) ?? []).filter(x => !used.has(x.id));
    const a = cands.find(x => esMiaAtencion(x)); // no pasar la función suelta: find() entregaría el índice como officerId
    if (!a) {
      const otros = [...new Set(cands.flatMap(x => x.prestadores.map(p => p.nombre)).filter(Boolean))];
      return otros.length ? { ...c, otrosEseDia: otros.join(', ') } : c;
    }
    used.add(a.id);
    return {
      ...c,
      atencionId:   a.id,
      diagnosticos: a.diagnosticos,
      actividades:  a.actividades,
      prestadores:  a.prestadores,
      adjuntos:     a.adjuntos,
      prestador:    a.prestadores.map(p => p.nombre).join(', '),
      esUrgencia:   a.esUrgencia,
      esEspontanea: a.esEspontanea,
      tipoAtencion: c.tipoAtencion || a.tipoAtencion,
      edadLabel:    a.edadLabel,
      sexo:         c.sexo || a.sexo,
      proximoControl: a.proximoControl ?? [],
    };
  });

  // Ficha guardada otro día: la consulta por nodo no trae FechaCita, así que una
  // atención mía sin cita ese día se cruza con la cita más cercana del mismo
  // paciente, hasta 14 días antes (ficha cerrada tarde) o 7 después (ficha
  // abierta la víspera, como los jueves para las citas del viernes). La fecha
  // que manda es la de la cita (decisión de Daniel, 04-09-2026); el guardado
  // queda en `fechaRegistro`.
  const enlazar = (i, a, estimado) => {
    used.add(a.id);
    out[i] = {
      ...out[i],
      atencionId: a.id, diagnosticos: a.diagnosticos, actividades: a.actividades, prestadores: a.prestadores, adjuntos: a.adjuntos,
      prestador: a.prestadores.map(p => p.nombre).join(', '), esUrgencia: a.esUrgencia, esEspontanea: a.esEspontanea,
      tipoAtencion: out[i].tipoAtencion || a.tipoAtencion, edadLabel: a.edadLabel, sexo: out[i].sexo || a.sexo,
      proximoControl: a.proximoControl ?? [], fechaRegistro: a.fechaAtencion, ...(estimado ? { cruceEstimado: true } : {}),
    };
  };
  // Cruce exacto: la cita que Rayen mismo declara (resolverCitas), por id o por su fecha.
  const porId = new Map(), porRunDia = new Map();
  out.forEach((c, i) => { if (c.origen === 'cita' && !c.atencionId) { porId.set(c.id, i); porRunDia.set(matchKey(c), i); } });
  for (const a of atenciones) {
    if (used.has(a.id) || !esMiaAtencion(a)) continue;
    let i = a.idCita ? porId.get(a.idCita) : undefined;
    if (i === undefined && a.fechaCita8) i = porRunDia.get(matchKey({ ...a, fecha8: a.fechaCita8 }));
    if (i !== undefined && !out[i].atencionId) enlazar(i, a, false);
  }
  // Heurística, sólo para lo que no pudo resolverse: la cita más cercana, marcada como estimada.
  const porRun = new Map();
  out.forEach((c, i) => { if (c.origen === 'cita' && !c.atencionId && !citaDescartada(c.estado)) { const k = matchKey({ ...c, fecha8: '' }); (porRun.get(k) ?? porRun.set(k, []).get(k)).push(i); } });
  for (const a of atenciones) {
    if (used.has(a.id) || !esMiaAtencion(a) || a.esUrgencia || a.idCita || a.fechaCita8) continue;
    const dist = i => diasEntre(out[i].fecha8, a.fecha8); // > 0: cita antes del guardado; < 0: después
    const cands = (porRun.get(matchKey({ ...a, fecha8: '' })) ?? []).filter(i => !out[i].atencionId && dist(i) !== 0 && dist(i) <= ANTES_DIAS && -dist(i) <= DESPUES_DIAS);
    if (!cands.length) continue;
    enlazar(cands.sort((x, y) => Math.abs(dist(x)) - Math.abs(dist(y)) || dist(y) - dist(x))[0], a, true);
  }

  for (const a of atenciones) {
    if (used.has(a.id) || !esMiaAtencion(a)) continue;
    out.push({
      ...a,
      id:          `att_${a.id}`,
      atencionId:  a.id,
      nombres: '', ap: '', am: '',
      prevision: '', sector: '', razon: '', telefono: '', direccion: '',
      estado:      a.esEspontanea ? 'Espontánea' : 'Sin cita',
      esIC: false, icCitadoPor: '', icSIC: '',
      prestador:   a.prestadores.map(p => p.nombre).join(', '),
    });
  }
  return out;
}
