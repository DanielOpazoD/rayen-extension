import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { installFakeChrome } from './helpers/fake-chrome.js';
import { diasFuturos, loadAgendaFutura } from '../src/io/agenda-futura.js';
import { CONFIG } from '../src/core/config.js';

/**
 * La agenda futura es una fuente aparte: una cita que aún no ocurrió no puede
 * contar como atención. Eloisa devuelve sólo el día de inicio aunque el
 * endpoint acepte un rango (verificado en tres capturas), así que cada día es
 * una petición y lo que importa es qué días se piden y qué se guarda.
 */
const HOY = new Date(2026, 8, 5); // sábado 05-09-2026

const cita = (d8, hh, nombre = 'Rosa Ejemplo Tuki') => ({
  Id: Number(`${d8.slice(4)}${hh}`), FechaHoraInicio: `${d8} ${hh}0000`, Razon: 'Control',
  Tag: { Nombre: 'Agendado' }, TipoDeAtencion: { Nombre: 'Consulta Médica' },
  UsuarioAps: { Id: 42, Rut: '25106217K', NombreFormateado: nombre, FechaDeNacimiento: '20190415 000000', Sexo: { Nombre: 'Mujer' } },
});

let pedidos, fake;
function servir(porDia) {
  pedidos = [];
  globalThis.fetch = async url => {
    const d8 = String(url).match(/FechaHoraInicio=(\d{8})/)?.[1] ?? '';
    pedidos.push(d8);
    const r = porDia[d8];
    if (r === 'falla') return new Response('boom', { status: 500 });
    return new Response(JSON.stringify(r ?? []), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
}
beforeEach(() => { fake = installFakeChrome(); });

test('diasFuturos empieza mañana, no hoy, y cruza el mes', () => {
  assert.deepEqual(diasFuturos(3, HOY), ['20260906', '20260907', '20260908']);
  assert.deepEqual(diasFuturos(1, new Date(2026, 8, 30)), ['20261001']);
  assert.equal(diasFuturos(60, HOY).length, 60);
  assert.equal(diasFuturos(60, HOY).at(-1), '20261104');
});

test('pide un día por petición y devuelve las citas ordenadas por día y hora', async () => {
  servir({ '20260907': [cita('20260907', '11'), cita('20260907', '09')], '20260908': [cita('20260908', '10')] });
  const r = await loadAgendaFutura('tok', { dias: 4, hoy: HOY });
  assert.deepEqual(pedidos, ['20260906', '20260907', '20260908', '20260909'], 'un día por llamada, desde mañana');
  assert.deepEqual(r.citas.map(c => `${c.fecha8} ${c.hora}`), ['20260907 09:00', '20260907 11:00', '20260908 10:00']);
  assert.deepEqual([r.desde8, r.hasta8, r.failed, r.fromCache], ['20260906', '20260909', 0, false]);
  assert.equal(r.citas[0].nombre, 'Rosa Ejemplo Tuki');
});

test('con dias 0 no toca la red: la preferencia apagada no consulta nada', async () => {
  servir({});
  const r = await loadAgendaFutura('tok', { dias: 0, hoy: HOY });
  assert.deepEqual([r.citas, r.dias, pedidos], [[], 0, []]);
});

test('la caché se reutiliza mientras esté fresca y empiece el mismo día', async () => {
  servir({ '20260906': [cita('20260906', '09')] });
  await loadAgendaFutura('tok', { dias: 2, hoy: HOY });
  assert.equal(pedidos.length, 2);

  servir({ '20260906': [cita('20260906', '09')] });
  const cacheada = await loadAgendaFutura('tok', { dias: 2, hoy: HOY });
  assert.deepEqual(pedidos, [], 'dentro del TTL no se vuelve a preguntar');
  assert.equal(cacheada.fromCache, true);
  assert.equal(cacheada.citas.length, 1);

  // Al día siguiente la ventana se corrió: la caché ya no vale aunque siga fresca.
  servir({});
  const manana = await loadAgendaFutura('tok', { dias: 2, hoy: new Date(2026, 8, 6) });
  assert.equal(manana.fromCache, false);
  assert.deepEqual(pedidos, ['20260907', '20260908']);

  // Cambiar la ventana también la invalida.
  servir({});
  await loadAgendaFutura('tok', { dias: 3, hoy: new Date(2026, 8, 6) });
  assert.equal(pedidos.length, 3);
});

test('force ignora la caché fresca', async () => {
  servir({ '20260906': [cita('20260906', '09')] });
  await loadAgendaFutura('tok', { dias: 1, hoy: HOY });
  servir({ '20260906': [cita('20260906', '09')] });
  const r = await loadAgendaFutura('tok', { dias: 1, hoy: HOY, force: true });
  assert.equal(r.fromCache, false);
  assert.deepEqual(pedidos, ['20260906']);
});

test('un día caído se cuenta, lo demás se entrega y nada se guarda a medias', async () => {
  servir({ '20260906': [cita('20260906', '09')], '20260907': 'falla' });
  const r = await loadAgendaFutura('tok', { dias: 2, hoy: HOY });
  assert.equal(r.failed, 1);
  assert.equal(r.citas.length, 1, 'lo que llegó se entrega');
  assert.equal(fake.local.get(CONFIG.futurasKey), undefined, 'media agenda futura no se guarda como si fuera entera');
  // Y para probar que la comprobación vale: una tanda completa sí se guarda.
  servir({ '20260906': [cita('20260906', '09')], '20260907': [] });
  await loadAgendaFutura('tok', { dias: 2, hoy: HOY });
  assert.equal(fake.local.get(CONFIG.futurasKey).citas.length, 1);
});

test('lo guardado se lee tal cual: las citas de la caché conservan su forma', async () => {
  servir({ '20260906': [cita('20260906', '09')] });
  const primera = await loadAgendaFutura('tok', { dias: 1, hoy: HOY });
  servir({});
  const segunda = await loadAgendaFutura('tok', { dias: 1, hoy: HOY });
  assert.deepEqual(segunda.citas, primera.citas);
});
