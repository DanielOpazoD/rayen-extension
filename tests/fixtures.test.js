import { test } from 'node:test';
import assert from 'node:assert/strict';
import { paciente, cita, atencion, sic, OFICIAL } from './helpers/fixtures.js';
import { mergeHistorial } from '../src/core/historial-merge.js';
import { computePendientes } from '../src/core/pendientes.js';
import { anonimizar } from '../src/core/anonimizar.js';

/** Los constructores de datos sintéticos respetan la convención 7 y sirven de entrada a los flujos reales. */
test('los constructores producen nombres de varias palabras y RUN con verificador', () => {
  for (const r of [paciente(), cita(), atencion(), sic().paciente]) {
    assert.match(r.nombre, /\S+\s+\S+/, `${r.nombre} debe tener al menos dos palabras`);
    assert.match(r.run, /^\d{7,8}[\dK]$/);
  }
  for (const p of [...atencion().prestadores, sic().registrador, sic().ejecutor]) assert.match(p.nombre, /\S+\s+\S+/);
});

test('los constructores encajan en los flujos: cruce agenda–historial, pendientes y anonimizador', () => {
  const out = mergeHistorial([cita()], [atencion()]);
  assert.equal(out[0].atencionId, 1);
  assert.equal(out[0].prestador, OFICIAL.nombre);
  const pend = computePendientes([], [sic({ antiguedadDias: 40 })], { hoy: new Date(2026, 8, 5) });
  assert.equal(pend[0]?.tipo, 'sic-nueva');
  const anon = anonimizar({ paciente: paciente(), texto: `Control de ${paciente().nombre}, RUN ${paciente().runStr}.` }, { desplazamientoDias: 0 });
  assert.equal(anon.verificado, true);
  assert.ok(!JSON.stringify(anon.data).includes('Ejemplo'), 'el apellido no sobrevive en el texto libre');
});
