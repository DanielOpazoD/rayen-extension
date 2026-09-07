import { test } from 'node:test';
import assert from 'node:assert/strict';
import { diagnosticoCarga, formatearDiagnostico } from '../src/core/diagnostico.js';

/**
 * El diagnóstico se pega en una conversación: lo primero que se prueba es que
 * no lleva ni un dato de paciente. Lo segundo, que sus recuentos distinguen las
 * cuatro formas en que una atención llega a una fila, que es justo lo que hay
 * que validar en la red del hospital.
 */
const fila = (over = {}) => ({ origen: 'cita', diaSemana: 'Vie', fecha8: '20260904', nombre: 'Rosa Ejemplo Tuki', runStr: '25.106.217-K', ...over });
const HOY = new Date(2026, 8, 5, 11, 40);

test('clasifica cada atención por cómo se cruzó, y cuenta por día de la semana', () => {
  const d = diagnosticoCarga({
    allData: [
      fila({ atencionId: 1 }),                                                     // mismo día
      fila({ atencionId: 2, fechaRegistro: '08-09-2026', diaSemana: 'Mar' }),      // cita exacta, ficha cerrada después
      fila({ atencionId: 3, fechaRegistro: '01-09-2026', cruceEstimado: true }),   // estimada por cercanía
      fila({ atencionId: null }),                                                  // cita sin atención
      fila({ origen: 'ficha', id: 'att_9', esUrgencia: true, diaSemana: 'Jue' }),  // suelta, sin cita
    ],
    meses: 6, hoy: HOY, version: '2.57.0',
  });
  assert.deepEqual(d.cruce, { mismoDia: 1, exacta: 1, estimada: 1, sinAtencion: 1, sueltas: 1 });
  assert.equal(d.atenciones.total, 5);
  assert.equal(d.atenciones.urgencias, 1);
  assert.deepEqual([d.atenciones.porDia.Vie, d.atenciones.porDia.Mar, d.atenciones.porDia.Jue, d.atenciones.porDia.Lun], [3, 1, 1, 0]);
  // La urgencia del jueves se marca aparte: una atención espontánea en un día que no atiendo no es una anomalía.
  assert.deepEqual([d.atenciones.urgPorDia.Jue, d.atenciones.urgPorDia.Vie], [1, 0]);
  assert.match(formatearDiagnostico(d), /jue 1 \(1 urg\)/);
  assert.ok(!formatearDiagnostico(d).includes('vie 3 ('), 'sin urgencias no se añade el paréntesis');
  assert.equal(d.registro.conDesfase, 2);
  assert.equal(d.registro.maxDesfase, 4, 'del 04-09 al 08-09');
  assert.equal(d.fecha, '05-09-2026 11:40');
});

test('el texto no contiene ningún dato de paciente', () => {
  const texto = formatearDiagnostico(diagnosticoCarga({
    allData: [fila({ atencionId: 1, note: 'Vive sola', diagnosticos: [{ nombre: 'Diabetes mellitus tipo 2' }] })],
    sics: [{ paciente: { nombre: 'Rosa Ejemplo Tuki', run: '25106217K' }, especialidad: 'Reumatología' }],
    futuras: [fila({ nombre: 'Luis Ejemplo Lagos' })],
    futurasEstado: { dias: 60, hasta8: '20261104', failed: 0 },
    meses: 6, hoy: HOY, version: '2.57.0',
  }));
  for (const prohibido of ['Rosa', 'Ejemplo', 'Tuki', 'Lagos', '25.106.217', '25106217', 'Diabetes', 'Vive sola', 'Reumatología', '20260904', '04-09-2026']) {
    assert.ok(!texto.includes(prohibido), `el diagnóstico no debe contener «${prohibido}»:\n${texto}`);
  }
  assert.match(texto, /Rayen Atenciones 2\.57\.0 · diagnóstico 05-09-2026 11:40/);
  assert.match(texto, /Identidad: profesional \d+ · nodo \d+ \(de la configuración\)/);
  assert.match(texto, /Citas futuras: 1 en 60 días, hasta 04-11-2026/);
});

test('sin agenda futura lo dice, y los días fallidos y la sincronización pendiente se muestran sólo si los hay', () => {
  const sin = formatearDiagnostico(diagnosticoCarga({ meses: 6, hoy: HOY }));
  assert.match(sin, /Citas futuras: no cargadas/);
  assert.match(sin, /Sincronización: sin pendientes/);
  assert.match(sin, /Ficha cerrada otro día: 0$/m, 'sin desfases no se imprime el máximo');
  const con = formatearDiagnostico(diagnosticoCarga({
    futuras: [], futurasEstado: { dias: 30, hasta8: '20261005', failed: 3 },
    syncPendiente: { agenda: 2, historial: 0, sics: 0 }, meses: 6, hoy: HOY,
  }));
  assert.match(con, /3 días fallidos/);
  assert.match(con, /Sincronización pendiente: agenda 2$/m);
  assert.ok(!con.includes('historial 0'), 'una fuente sin pendientes no ocupa sitio');
});

test('una fecha de registro ilegible no rompe el recuento', () => {
  const d = diagnosticoCarga({ allData: [fila({ atencionId: 1, fechaRegistro: 'ayer' })], hoy: HOY });
  assert.deepEqual([d.registro.conDesfase, d.registro.maxDesfase], [1, 0]);
  assert.equal(d.cruce.exacta, 1);
});
