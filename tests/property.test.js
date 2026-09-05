import { test } from 'node:test';
import assert from 'node:assert/strict';
import fc from 'fast-check';
import { toDate8, fromDate8, diasEntre, date8FromDMY } from '../src/core/dates.js';
import { fmtDate, computeDv } from '../src/core/parser.js';
import { anonimizar } from '../src/core/anonimizar.js';
import { mergeHistorial } from '../src/core/historial-merge.js';
import { cita, atencion, OFICIAL } from './helpers/fixtures.js';

/**
 * Propiedades: lo que debe cumplirse para CUALQUIER entrada, no para los tres
 * ejemplos que se nos ocurrieron. fast-check genera cientos de casos y, si uno
 * falla, lo reduce al mínimo que reproduce el problema.
 */
const NUM_RUNS = 300;
const fechaLocal = fc.date({ min: new Date(1950, 0, 1), max: new Date(2100, 11, 31), noInvalidDate: true })
  .map(d => new Date(d.getFullYear(), d.getMonth(), d.getDate()));

test('dates: toDate8 y fromDate8 son inversas y fmtDate/date8FromDMY cierran el círculo', () => {
  fc.assert(fc.property(fechaLocal, d => {
    const d8 = toDate8(d);
    const back = fromDate8(d8);
    assert.equal(back.getTime(), d.getTime());
    assert.equal(date8FromDMY(fmtDate(d8)), d8);
  }), { numRuns: NUM_RUNS });
});

test('dates: diasEntre es antisimétrica, cero en la diagonal y suma por transitividad', () => {
  fc.assert(fc.property(fechaLocal, fechaLocal, fechaLocal, (a, b, c) => {
    const [a8, b8, c8] = [a, b, c].map(toDate8);
    assert.equal(diasEntre(a8, b8), -diasEntre(b8, a8) || 0); // «|| 0»: strict equal distingue -0 de 0
    assert.equal(diasEntre(a8, a8), 0);
    assert.equal(diasEntre(a8, b8) + diasEntre(b8, c8), diasEntre(a8, c8));
  }), { numRuns: NUM_RUNS });
});

// RUN chileno con verificador correcto, en los tres formatos que aparecen en Rayen y en texto libre.
const runValido = fc.integer({ min: 1_000_000, max: 27_999_999 }).map(n => {
  const body = String(n), dv = computeDv(body);
  const puntos = body.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return { body, dv, formatos: [`${body}${dv}`, `${body}-${dv}`, `${puntos}-${dv}`] };
});
const palabra = fc.stringMatching(/^[A-Z][a-z]{4,9}$/).filter(w => !/^(Sra|Dr|Dra|San|Van|Von)$/.test(w));

test('anonimizar: ningún RUN válido sobrevive en texto libre, en ningún formato, y la verificación final lo confirma', () => {
  fc.assert(fc.property(runValido, fc.integer({ min: 0, max: 2 }), (r, i) => {
    const texto = `Paciente con RUN ${r.formatos[i]} evoluciona bien; control en 30 días.`;
    const out = anonimizar({ Anamnesis: [{ Evolucion: texto }] }, { desplazamientoDias: 0 });
    const salida = JSON.stringify(out.data);
    assert.ok(!salida.includes(r.body), `el cuerpo ${r.body} sobrevivió en «${salida}»`);
    assert.ok(salida.includes('<rut>'));
    assert.equal(out.verificado, true, `restos: ${out.restos.join(', ')}`);
  }), { numRuns: NUM_RUNS });
});

test('anonimizar: las palabras del nombre del paciente nunca sobreviven en el texto libre', () => {
  fc.assert(fc.property(palabra, palabra, palabra, (n1, ap1, ap2) => {
    fc.pre(new Set([n1, ap1, ap2]).size === 3);
    const data = {
      NombreFormateado: `${ap1} ${ap2} ${n1}`, Nombres: n1, ApellidoPaterno: ap1, ApellidoMaterno: ap2,
      Anamnesis: [{ Evolucion: `${n1} ${ap1} acude con su madre; la Sra. ${ap2} relata tos.` }],
    };
    const out = anonimizar(data, { desplazamientoDias: 0 });
    const evolucion = out.data.Anamnesis[0].Evolucion;
    for (const w of [n1, ap1, ap2]) assert.ok(!evolucion.includes(w), `«${w}» sobrevivió en «${evolucion}»`);
    assert.equal(out.verificado, true, `restos: ${out.restos.join(', ')}`);
  }), { numRuns: NUM_RUNS });
});

// Agenda e historial del mismo paciente en fechas distintas y cercanas.
const dia8 = fc.integer({ min: 1, max: 28 }).map(d => `202609${String(d).padStart(2, '0')}`);
const estadoCita = fc.constantFrom('Completado', 'Confirmado', 'Atendido', 'No Atendido', 'Anulada');

test('mergeHistorial: ninguna atención se usa dos veces, ninguna cita recibe dos, y las mías nunca desaparecen', () => {
  fc.assert(fc.property(
    fc.uniqueArray(fc.tuple(dia8, estadoCita), { minLength: 0, maxLength: 5, selector: t => t[0] }),
    fc.uniqueArray(dia8, { minLength: 0, maxLength: 5 }),
    (citasSpec, diasAt) => {
      const citas = citasSpec.map(([d8, estado], i) => cita({ id: 100 + i, fecha8: d8, fechaAtencion: fmtDate(d8), estado }));
      const ats = diasAt.map((d8, i) => atencion({ id: 1 + i, fecha8: d8, fechaAtencion: fmtDate(d8) }));
      const out = mergeHistorial(citas, ats);
      const usadas = out.map(r => r.atencionId).filter(Boolean);
      assert.equal(new Set(usadas).size, usadas.length, 'una atención no se cuelga de dos filas');
      assert.equal(out.filter(r => r.origen === 'cita').length, citas.length, 'ninguna cita se pierde ni se duplica');
      assert.equal(usadas.length, ats.length, 'toda atención mía aparece: cruzada o como fila suelta');
      for (const r of out) if (r.origen === 'cita' && r.atencionId) assert.equal(r.prestador, OFICIAL.nombre);
    },
  ), { numRuns: NUM_RUNS });
});
