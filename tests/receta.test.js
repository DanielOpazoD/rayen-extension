import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { mapaFarmacosEnUso, estadoPrescripcion, etiquetaEstado, parseRecetaDetalle } from '../src/core/receta.js';
import { parseAntecedentes } from '../src/core/ficha.js';
import { installFakeChrome } from './helpers/fake-chrome.js';
import { fetchRecetaDetalle, olvidarRecetas, recetaDetallePath } from '../src/io/receta.js';

/**
 * La autoridad de «activa» es la lista de fármacos en uso de Rayen (la misma
 * que trae RecuperarAntecedentes y FichaClinica/FarmacoEnUso); la duración
 * escrita sólo decide cuando la receta no aparece ahí. Formas tomadas del HAR
 * «ficha amb» del 04-09-2026, con valores inventados.
 */
const hoy = new Date(2026, 8, 4);

// Como llega de Rayen: RecuperarAntecedentes.farmacoEnUsos.medications
const ANT = { farmacoEnUsos: { medications: [
  { Descripcion: 'Acido Acetilsalicilico 100 mg Comprimidos : 1 Comprimido cada 24 horas por 12 meses \n Nº Receta: 594000001. Estado Receta: Por Despachar', DescripcionArticulo: 'Acido Acetilsalicilico 100 mg Comprimidos', IdReceta: 594000001, FechaReceta: '20260904 104013', EsHearts: false },
  { Descripcion: 'Losartan Potasico 50 mg Comprimidos : 1.5 Comprimidos cada 12 horas por 12 meses \n Nº Receta: 594000001. Estado Receta: Por Despachar', DescripcionArticulo: 'Losartan Potasico 50 mg Comprimidos', IdReceta: 594000001, FechaReceta: '20260904 104013', EsHearts: true },
  { Descripcion: 'Zopiclona 7,5 mg Comprimidos : 1 Comprimido cada 24 horas por 1 mes \n Nº Receta: 593000002. Estado Receta: Despachada', DescripcionArticulo: 'Zopiclona 7,5 mg Comprimidos', IdReceta: 593000002, FechaReceta: '20260101 000000', EsHearts: false },
] } };

test('mapaFarmacosEnUso indexa por número de receta y conserva el estado textual', () => {
  const m = mapaFarmacosEnUso(parseAntecedentes(ANT).farmacos);
  assert.deepEqual([...m.keys()], [594000001, 593000002]);
  assert.equal(m.get(594000001).estado, 'Por Despachar');
  assert.equal(m.get(594000001).n, 2, 'dos prescripciones de la misma receta');
  assert.equal(mapaFarmacosEnUso(undefined).size, 0);
  assert.equal(mapaFarmacosEnUso([{ receta: 0 }, { receta: null }]).size, 0, 'sin número de receta no hay autoridad');
});

test('estadoPrescripcion: Rayen manda sobre la duración escrita; la duración sólo decide fuera de la lista', () => {
  const enUso = mapaFarmacosEnUso(parseAntecedentes(ANT).farmacos);
  // Emitida hace 8 meses «por 1 mes»: la duración la daría por vencida, pero Rayen la tiene en uso.
  const viejaEnUso = estadoPrescripcion({ texto: 'Zopiclona 7,5 mg : 1 comprimido cada 24 horas por 1 mes', fecha8: '20260101', receta: 593000002 }, enUso, { hoy });
  assert.deepEqual(viejaEnUso, { estado: 'activa', fuente: 'rayen', detalle: 'Despachada' });
  // Receta ajena a la lista: respaldo por duración.
  assert.deepEqual(estadoPrescripcion({ texto: 'Amoxicilina 500 mg cada 8 horas por 7 días', fecha8: '20260801', receta: 111 }, enUso, { hoy }), { estado: 'vencida', fuente: 'duracion', detalle: '' });
  assert.deepEqual(estadoPrescripcion({ texto: 'Amoxicilina 500 mg cada 8 horas por 7 días', fecha8: '20260901', receta: 111 }, enUso, { hoy }), { estado: 'activa', fuente: 'duracion', detalle: '' });
  // Suspendida en la ficha: gana a todo, aunque Rayen la liste.
  assert.equal(estadoPrescripcion({ texto: 'Losartan por 12 meses', fecha8: '20260904', receta: 594000001, suspendido: true }, enUso, { hoy }).estado, 'suspendida');
  // Sin lista (antecedentes caídos): sólo duración.
  assert.equal(estadoPrescripcion({ texto: 'Losartan por 12 meses', fecha8: '20260904', receta: 594000001 }, null, { hoy }).fuente, 'duracion');
  assert.equal(estadoPrescripcion({ texto: 'Losartan por 12 meses', fecha8: '20260904', receta: '594000001' }, enUso, { hoy }).fuente, 'rayen', 'el número puede venir como texto');
});

test('etiquetaEstado dice quién lo afirma', () => {
  assert.equal(etiquetaEstado({ estado: 'activa', fuente: 'rayen', detalle: 'Por Despachar' }), 'en uso según Rayen · Por Despachar');
  assert.equal(etiquetaEstado({ estado: 'activa', fuente: 'rayen', detalle: '' }), 'en uso según Rayen');
  assert.equal(etiquetaEstado({ estado: 'vencida', fuente: 'duracion', detalle: '' }), 'vencida por duración escrita');
  assert.equal(etiquetaEstado({ estado: 'suspendida', fuente: 'rayen', detalle: '' }), 'suspendida');
});

// Farmacia/Receta/id=…;TraerPrescripciones=true;TraerAnexoReceta=true
const DETALLE = { Resultado: [{
  Id: 594000001, Estado: 1, IdTipoReceta: 47, FechaGeneracion: '20260904 104013', TerminoVigencia: '20261203 000000', Periodicidad: 30,
  FechaProximoDespacho: '20261004 000000', FechaHoraCierreReceta: '00010101 000000', EsExterna: false,
  Prescripciones: [
    { Id: 1, IdReceta: 594000001, DescripcionArticulo: 'Losartan Potasico 50 mg Comprimidos ', Descripcion: 'Losartan Potasico 50 mg Comprimidos : 1.5 Comprimidos cada 12 horas por 12 meses', Observacion: 'Losartan 50 mg: 2 comprimido AM, 1 comprimido noche', TotalRecetado: 1080, CantidadDespachada: 90, SaldoPendiente: 990, SuspenderTratamiento: 0, FechaSuspendeTratamiento: '00010101 000000', FechaProximoDespacho: '20261004 000000', Controlado: false, Psicotropico: false, EsBorrado: false },
    { Id: 2, IdReceta: 594000001, DescripcionArticulo: 'Zopiclona 7,5 mg Comprimidos ', Descripcion: 'Zopiclona 7,5 mg Comprimidos : 1 Comprimido cada 24 horas por 12 meses', Observacion: '', TotalRecetado: 360, CantidadDespachada: 0, SaldoPendiente: 360, SuspenderTratamiento: 1, FechaSuspendeTratamiento: '20260910 120000', FechaProximoDespacho: '20261004 000000', Controlado: false, Psicotropico: true, EsBorrado: false },
    { Id: 3, IdReceta: 594000001, Descripcion: 'Borrada', EsBorrado: true },
  ],
}], MonthLimit: 0 };

test('parseRecetaDetalle: vigencia, despacho y suspensión por prescripción', () => {
  const d = parseRecetaDetalle(DETALLE, { hoy });
  assert.equal(d.id, 594000001);
  assert.equal(d.emitida, '04-09-2026');
  assert.equal(d.vigenteHasta, '03-12-2026');
  assert.equal(d.vencida, false);
  assert.equal(d.proximoDespacho, '04-10-2026');
  assert.equal(d.periodicidad, 30);
  assert.equal(d.cerrada, false);
  assert.equal(d.prescripciones.length, 2, 'la borrada no cuenta');
  const [los, zop] = d.prescripciones;
  assert.equal(los.label, 'Losartan Potasico 50 mg Comprimidos');
  assert.equal(los.posologia, '1.5 Comprimidos cada 12 horas por 12 meses');
  assert.deepEqual([los.total, los.despachado, los.saldo, los.suspendida], [1080, 90, 990, false]);
  assert.equal(los.observacion, 'Losartan 50 mg: 2 comprimido AM, 1 comprimido noche');
  assert.equal(zop.suspendida, true);
  assert.equal(zop.fechaSuspension, '10-09-2026');
  assert.equal(zop.psicotropico, true);
});

test('parseRecetaDetalle: vencida por TerminoVigencia, cerrada, objeto suelto y respuestas vacías', () => {
  const vieja = parseRecetaDetalle({ Id: 7, TerminoVigencia: '20260101 000000', FechaHoraCierreReceta: '20260102 090000', Prescripciones: [] }, { hoy });
  assert.equal(vieja.vencida, true);
  assert.equal(vieja.vigenteHasta, '01-01-2026');
  assert.equal(vieja.cerrada, true);
  assert.deepEqual(vieja.prescripciones, []);
  assert.equal(parseRecetaDetalle({ Id: 8, TerminoVigencia: '00010101 000000' }, { hoy }).vencida, false, 'sin fecha no se da por vencida');
  assert.equal(parseRecetaDetalle({ Resultado: [] }), null);
  assert.equal(parseRecetaDetalle(null), null);
  assert.equal(parseRecetaDetalle({ Resultado: [{ Estado: 1 }] }), null, 'sin Id no es una receta');
  // Sin SaldoPendiente se calcula; sin «:» la posología queda vacía.
  const p = parseRecetaDetalle({ Id: 9, Prescripciones: [{ Id: 1, Descripcion: 'Paracetamol 500 mg', TotalRecetado: 20, CantidadDespachada: 5 }] }).prescripciones[0];
  assert.deepEqual([p.label, p.posologia, p.saldo], ['Paracetamol 500 mg', '', 15]);
});

// ── io: una llamada por receta ──

let calls;
beforeEach(() => {
  installFakeChrome();
  olvidarRecetas();
  calls = [];
  globalThis.fetch = async url => {
    calls.push(String(url));
    if (String(url).includes('id=404')) return new Response('boom', { status: 500 });
    return new Response(JSON.stringify(DETALLE), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
});

test('fetchRecetaDetalle pide la URL de Eloisa con las banderas de prescripciones y memoriza por receta', async () => {
  const d = await fetchRecetaDetalle('tok', 594000001);
  assert.equal(d.id, 594000001);
  assert.equal(calls.length, 1);
  assert.ok(calls[0].endsWith(recetaDetallePath(594000001)));
  assert.match(calls[0], /\/API\/api\/rayen\/Farmacia\/Receta\/id=594000001;TraerPrescripciones=true;TraerAnexoReceta=true$/);
  await fetchRecetaDetalle('tok', '594000001');
  assert.equal(calls.length, 1, 'segunda vez sin red, aunque el id venga como texto');
  await fetchRecetaDetalle('tok', 594000001, { force: true });
  assert.equal(calls.length, 2);
  olvidarRecetas();
  await fetchRecetaDetalle('tok', 594000001);
  assert.equal(calls.length, 3, 'recargar la ficha vacía la memoria');
});

test('fetchRecetaDetalle propaga el error y no memoriza el fallo', async () => {
  await assert.rejects(fetchRecetaDetalle('tok', 404));
  await assert.rejects(fetchRecetaDetalle('tok', 404));
  assert.equal(calls.length, 2);
});

// ── Bordes que la mutación mostró sin defender (Stryker, 05-09-2026: receta.js 69 %) ──

test('mapaFarmacosEnUso: recorta el estado, conserva la fecha y no inventa nada cuando faltan', () => {
  const m = mapaFarmacosEnUso([{ receta: 5, estado: '  Por Despachar ', fecha: '04-09-2026' }, { receta: 6 }]);
  assert.deepEqual(m.get(5), { estado: 'Por Despachar', fecha: '04-09-2026', n: 1 });
  assert.deepEqual(m.get(6), { estado: '', fecha: '', n: 1 });
});

test('estadoPrescripcion: la suspendida y el respaldo devuelven la forma completa, y el respaldo usa la fecha «hoy» que se le pasa', () => {
  assert.deepEqual(estadoPrescripcion({ texto: 'x', fecha8: '20260904', receta: 1, suspendido: true }, new Map()), { estado: 'suspendida', fuente: 'rayen', detalle: '' });
  // Receta de 2020 «por 12 meses»: activa si hoy es julio de 2020, vencida con el reloj real. Si se ignorara `hoy`, esto fallaría.
  assert.deepEqual(estadoPrescripcion({ texto: 'Losartan por 12 meses', fecha8: '20200101', receta: 9 }, new Map(), { hoy: new Date(2020, 6, 1) }), { estado: 'activa', fuente: 'duracion', detalle: '' });
});

test('parseRecetaDetalle: nombre y posología con y sin el separador « : », y sin artículo', () => {
  const det = p => parseRecetaDetalle({ Id: 1, Prescripciones: [p] }).prescripciones[0];
  // Con separador y artículo: el artículo manda en el nombre; la posología es lo que sigue al separador.
  assert.deepEqual([det({ Descripcion: 'Losartan 50 mg : 1 comprimido cada 12 horas', DescripcionArticulo: 'Losartan Potasico 50 mg ' }).label, det({ Descripcion: 'Losartan 50 mg : 1 comprimido cada 12 horas', DescripcionArticulo: 'Losartan Potasico 50 mg ' }).posologia],
    ['Losartan Potasico 50 mg', '1 comprimido cada 12 horas']);
  // Sin separador pero con artículo al inicio: se quita el artículo y los dos puntos pegados.
  assert.deepEqual([det({ Descripcion: 'Metformina 850 mg: 1 comprimido cada 12 horas', DescripcionArticulo: 'Metformina 850 mg' }).label, det({ Descripcion: 'Metformina 850 mg: 1 comprimido cada 12 horas', DescripcionArticulo: 'Metformina 850 mg' }).posologia],
    ['Metformina 850 mg', '1 comprimido cada 12 horas']);
  // Descripción igual al artículo: no hay posología.
  assert.equal(det({ Descripcion: 'Aspirina 100 mg', DescripcionArticulo: 'Aspirina 100 mg' }).posologia, '');
  // Sin artículo ni separador: el nombre es la descripción entera.
  assert.deepEqual([det({ Descripcion: 'Aspirina 100 mg' }).label, det({ Descripcion: 'Aspirina 100 mg' }).posologia], ['Aspirina 100 mg', '']);
});

test('parseRecetaDetalle: cada campo de la prescripción tiene su valor por defecto y su lectura', () => {
  const det = p => parseRecetaDetalle({ Id: 1, Prescripciones: [p] }).prescripciones[0];
  const vacia = det({ Descripcion: 'X' });
  assert.deepEqual([vacia.id, vacia.observacion, vacia.suspendida, vacia.fechaSuspension, vacia.total, vacia.despachado, vacia.saldo, vacia.proximoDespacho, vacia.controlado, vacia.psicotropico],
    [0, '', false, '', 0, 0, 0, '', false, false]);
  const llena = det({ Id: 7, Descripcion: 'X', Observacion: ' 2 puff SOS ', SuspenderTratamiento: true, FechaSuspendeTratamiento: '20260910 120000', TotalRecetado: 20, CantidadDespachada: 25, FechaProximoDespacho: '20261004 000000', Controlado: true, Psicotropico: 1 });
  assert.deepEqual([llena.id, llena.observacion, llena.suspendida, llena.fechaSuspension, llena.saldo, llena.proximoDespacho, llena.controlado, llena.psicotropico],
    [7, '2 puff SOS', true, '10-09-2026', 0, '04-10-2026', true, true]);
  assert.equal(det({ Descripcion: 'X', SuspenderTratamiento: false }).suspendida, false);
  assert.equal(det({ Descripcion: 'X', SuspenderTratamiento: 0 }).suspendida, false);
  assert.equal(det({ Descripcion: 'X', TotalRecetado: 20, CantidadDespachada: 5, SaldoPendiente: 3 }).saldo, 3, 'el saldo que declara Rayen manda sobre el cálculo');
  assert.equal(det({ Descripcion: 'X', TotalRecetado: 20, CantidadDespachada: 5 }).saldo, 15, 'sin saldo declarado, se calcula');
});

test('parseRecetaDetalle: fechas que no son fechas, vigencia que vence hoy mismo, y banderas de la receta', () => {
  const hoy = new Date(2026, 8, 4);
  assert.equal(parseRecetaDetalle({ Id: 1, TerminoVigencia: '2026' }).vigenteHasta, '', 'cuatro dígitos no son una fecha');
  assert.equal(parseRecetaDetalle({ Id: 1, TerminoVigencia: 'x20261203 000000' }).vigenteHasta, '', 'la fecha debe empezar en el primer carácter');
  assert.equal(parseRecetaDetalle({ Id: 1, TerminoVigencia: '20260904 235959' }, { hoy }).vencida, false, 'vence hoy: todavía vigente');
  assert.equal(parseRecetaDetalle({ Id: 1, TerminoVigencia: '20260903 235959' }, { hoy }).vencida, true);
  assert.equal(parseRecetaDetalle({ Id: 1, TerminoVigencia: '20261203 101010' }).vigenteHasta, '03-12-2026', 'se lee sólo la fecha, no la hora');
  const r = parseRecetaDetalle({ Id: 1, EsExterna: true, FechaGeneracion: '00010101 000000', FechaProximoDespacho: '20261004 000000', Prescripciones: 'no es lista' });
  assert.deepEqual([r.externa, r.emitida, r.proximoDespacho, r.prescripciones], [true, '', '04-10-2026', []]);
  assert.equal(parseRecetaDetalle({ Id: 1 }).externa, false);
  assert.equal(parseRecetaDetalle({ Id: 0, TerminoVigencia: '20261203 000000' }), null, 'Id 0 no es una receta');
});

test('parseRecetaDetalle: los dos puntos pegados y el separador, tal como los escribe Rayen', () => {
  const det = p => parseRecetaDetalle({ Id: 1, Prescripciones: [p] }).prescripciones[0];
  assert.equal(det({ Descripcion: 'Metformina 850 mg :1 comp cada 12 h', DescripcionArticulo: 'Metformina 850 mg' }).posologia, '1 comp cada 12 h', 'espacio antes de los dos puntos, ninguno después');
  assert.equal(det({ Descripcion: 'Metformina 850 mg 1 comp: noche', DescripcionArticulo: 'Metformina 850 mg' }).posologia, '1 comp: noche', 'los dos puntos de más adentro no se tocan');
  assert.deepEqual([det({ Descripcion: 'Losartan 50 mg : 1 comp' }).label, det({ Descripcion: 'Losartan 50 mg : 1 comp' }).posologia], ['Losartan 50 mg', '1 comp'], 'sin artículo, el nombre es lo que precede al separador');
  assert.equal(det({ Descripcion: 'X', SuspenderTratamiento: '0' }).suspendida, false, '«0» como texto tampoco es suspensión');
  assert.equal(det({ Descripcion: 'X', SuspenderTratamiento: null }).suspendida, false);
  assert.equal(parseRecetaDetalle({ Id: 1, TerminoVigencia: '2026' }, { hoy }).vencida, false, 'una no-fecha no vence nada');
  assert.equal(parseRecetaDetalle('texto'), null);
  assert.equal(parseRecetaDetalle(5), null);
});
