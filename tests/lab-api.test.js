import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buscarOrdenesPorRut, normalizeOrden, DEFAULT_YEARS_BACK,
  ordenRutBody, ordersMatchRut,
} from '../src/lab-api.js';

/**
 * La forma de esta petición está tomada de tráfico real del portal
 * ProactiveLIS (HAR del 03-09-2026, paciente con 4 órdenes). Se fija aquí
 * porque un solo parámetro equivocado —`rangofecharut=true`— hacía que el
 * servidor devolviera cero órdenes para pacientes que sí tenían exámenes,
 * sin ningún error visible.
 */
function capturarPeticion(run) {
  const llamadas = [];
  const original = globalThis.fetch;
  globalThis.fetch = async url => {
    llamadas.push(String(url));
    return {
      ok: true,
      status: 200,
      url: String(url),
      headers: { get: () => 'application/json' },
      json: async () => [],
      text: async () => '[]',
    };
  };
  return run().finally(() => { globalThis.fetch = original; }).then(() => llamadas);
}

test('la búsqueda por RUT envía exactamente los parámetros del portal real', async () => {
  const [url] = await capturarPeticion(() =>
    buscarOrdenesPorRut('11.957.001-8', { desde: '2025-01-03', hasta: '2026-09-03' })
  );
  const q = new URL(url).searchParams;

  assert.equal(q.get('tipoBusqueda'), '1');
  assert.equal(q.get('tipoDocumento'), '1');
  assert.equal(q.get('rutPaciente'), '11.957.001-8');
  // El parámetro que rompía la búsqueda.
  assert.equal(q.get('rangofecharut'), 'false');
  assert.equal(q.get('procedencia'), '-1');
  assert.equal(q.get('subprocedencia'), '-1');
  assert.equal(q.get('prestacion'), '-1');
  assert.equal(q.get('numeroOrden'), '-1');
  assert.equal(q.get('desde'), '2025-01-03');
  assert.equal(q.get('hasta'), '2026-09-03');
  assert.equal(q.get('verConDoc'), 'false');
});

test('sin fechas explícitas la ventana por omisión abarca dos años', async () => {
  const [url] = await capturarPeticion(() => buscarOrdenesPorRut('11.957.001-8'));
  const q = new URL(url).searchParams;
  const desde = new Date(q.get('desde'));
  const hasta = new Date(q.get('hasta'));
  const años = (hasta - desde) / (365.25 * 24 * 3600 * 1000);

  assert.equal(DEFAULT_YEARS_BACK, 2);
  assert.ok(años > 1.9 && años < 2.1, `la ventana por omisión debe ser de 2 años, fue ${años.toFixed(2)}`);
  assert.match(q.get('desde'), /^\d{4}-\d{2}-\d{2}$/, 'el portal espera yyyy-MM-dd');
});

// Registro real devuelto por el portal, recortado a los campos que se usan.
const ORDEN_REAL = {
  OrdenId: 2831479,
  NumeroOrden: '02131899',
  FechaOrden: '/Date(1764168289483)/',
  numDocumentoCompleto: '0119570018',
  Paciente: { NombreCompletoPaciente: 'MANUEL CONSTANZO PARRA', Sexo: 'M' },
  Procedencia: { Descripcion: 'HOSPITALES - HOSPITAL HANGA ROA' },
  ProcedenciaDetalle: { Descripcion: 'HOSPITAL HANGA ROA' },
  usaSubProcedencia: true,
  AreasString: 'QUÍMICA',
  CantidadPrtValidadas: { cantPrtOrdenes: 2, CantPrtValidadas: 2, CantPrtRechazadas: 0 },
  ListadoPrestacionesEstado: [
    { NombrePrestacion: 'FERRITINA', EstadoPrestacion: ' Validada ', FechaValidacion: '26/11/2025' },
  ],
  OrdenEncryptada: '4BgQ+InBxSQQhZgpEHW3ew==',
  contieneDocumentos: false,
};

test('normalizeOrden interpreta un registro real del portal', () => {
  const o = normalizeOrden(ORDEN_REAL);
  assert.equal(o.numero, '02131899');
  assert.equal(o.nombrePaciente, 'MANUEL CONSTANZO PARRA');
  assert.equal(o.areas, 'QUÍMICA');
  assert.equal(o.validadas, 2);
  assert.equal(o.totalPrestaciones, 2);
  assert.equal(o.rechazadas, 0);
  assert.equal(o.ordenEncryptada, '4BgQ+InBxSQQhZgpEHW3ew==');
  // La fecha .NET debe convertirse en una fecha real, no quedar como texto.
  assert.ok(o.fecha instanceof Date);
  assert.equal(o.fecha.getFullYear(), 2025);
  // El estado de la prestación llega con espacios alrededor en el portal.
  assert.equal(o.prestaciones[0].estado, 'Validada');
  assert.equal(o.prestaciones[0].nombre, 'FERRITINA');
});

// El portal emite el documento relleno con ceros y con el dígito verificador
// pegado: el RUT 11.957.001-8 llega como «0119570018» (valor real del HAR).
test('ordenRutBody decodifica el documento que declara la orden', () => {
  assert.equal(ordenRutBody({ numDocumentoCompleto: '0119570018' }), '11957001');
  assert.equal(ordenRutBody({ numDocumentoCompleto: '0169406456' }), '16940645');
  assert.equal(ordenRutBody({ rut: '11.957.001-8' }), '11957001');
  assert.equal(ordenRutBody({}), '');
  assert.equal(ordenRutBody(null), '');
});

// Hanga Roa ya verificaba la identidad de lo que devolvía el servidor;
// Salvador no. Sin esta comprobación, una respuesta atrasada de otro paciente
// podía pintarse bajo el RUT que estuviera en pantalla.
test('ordersMatchRut acepta el lote del RUN consultado', () => {
  const lote = [{ numDocumentoCompleto: '0119570018' }, { numDocumentoCompleto: '0119570018' }];
  assert.equal(ordersMatchRut(lote, '11957001'), true);
  assert.equal(ordersMatchRut(lote, '11.957.001-8'), true);
});

test('ordersMatchRut rechaza el lote entero si una orden es de otro paciente', () => {
  const mezclado = [{ numDocumentoCompleto: '0119570018' }, { numDocumentoCompleto: '0169406456' }];
  assert.equal(ordersMatchRut(mezclado, '11957001'), false);
});

test('ordersMatchRut exige un RUN esperado plausible', () => {
  assert.equal(ordersMatchRut([{ numDocumentoCompleto: '0119570018' }], '123'), false);
  assert.equal(ordersMatchRut([{ numDocumentoCompleto: '0119570018' }], ''), false);
  assert.equal(ordersMatchRut('no es lista', '11957001'), false);
});

test('una orden sin documento no puede desmentirse y no bloquea el lote', () => {
  // No es la que puede colar a otro paciente: sin documento, no afirma nada.
  assert.equal(ordersMatchRut([{ NumeroOrden: '02131899' }], '11957001'), true);
});
