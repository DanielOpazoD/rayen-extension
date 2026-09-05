import { test } from 'node:test';
import assert from 'node:assert/strict';
import { anonimizar, resumenInforme } from '../src/core/anonimizar.js';

const muestra = () => ({
  Id: 500439, IdUsuarioAps: 77123, Rut: '14407675-3', NombreFormateado: 'Napoleón Alexis Icka Pakarati',
  Nombres: 'Napoleón Alexis', ApellidoPaterno: 'Icka', ApellidoMaterno: 'Pakarati',
  FechaDeNacimiento: '19700215 000000', Sexo: { Id: 2, Nombre: 'Hombre' },
  EMail: 'napo@example.cl', Telefonos: [{ TelefonoDescripcion: '+56 9 8765 4321', Eliminado: false }],
  Georeferencias: [{ DireccionFormateada: 'Atamu Tekena 123, Hanga Roa', Latitud: -27.15, Longitud: -109.43 }],
  Atenciones: [{
    Id: 9001, IdUsuarioAps: 77123, FechaAtencion: '20260731 105900', FechaDescarte: '00010101 000000',
    Funcionario: 'Juana Luna Atamu', Prestadores: [{ Id: 439554, NombreCompleto: 'Juana Luna Atamu', NombreInstrumento: 'Médico' }],
    Diagnosticos: [{ Id: 1, Codigo: 'I10', Descripcion: 'Hipertensión arterial crónica' }],
    Anamnesis: [{ MotivoConsulta: 'Cefalea', Evolucion: 'Sr. Icka Pakarati, RUT 14.407.675-3, evoluciona bien. Contacto hija 987654321 y napo@example.cl. Dra. Luna indica control.' }],
    Especialidad: { Id: 12, Nombre: 'Medicina Interna' },
  }],
});

test('anonimizar borra nombres, RUT, contactos y direcciones, y conserva catálogos y estructura', () => {
  const { data, informe, verificado, restos } = anonimizar(muestra(), { desplazamientoDias: 10 });
  assert.equal(verificado, true, `restos: ${restos.join(', ')}`);
  assert.equal(data.NombreFormateado, '<nombre>'); assert.equal(data.ApellidoPaterno, '<apellido>'); assert.equal(data.Rut, '<rut>');
  assert.equal(data.EMail, '<contacto>'); assert.equal(data.Telefonos[0].TelefonoDescripcion, '<contacto>'); assert.equal(data.Telefonos[0].Eliminado, false);
  assert.equal(data.Georeferencias[0].DireccionFormateada, '<direccion>'); assert.equal(data.Georeferencias[0].Latitud, 0);
  assert.equal(data.Sexo.Nombre, 'Hombre', 'el catálogo Sexo no es una persona');
  assert.equal(data.Atenciones[0].Especialidad.Nombre, 'Medicina Interna');
  assert.equal(data.Atenciones[0].Diagnosticos[0].Descripcion, 'Hipertensión arterial crónica');
  assert.equal(data.Atenciones[0].Funcionario, '<nombre>'); assert.equal(data.Atenciones[0].Prestadores[0].NombreCompleto, '<nombre>');
  assert.equal(data.Atenciones[0].Prestadores[0].NombreInstrumento, 'Médico');
  const txt = data.Atenciones[0].Anamnesis[0].Evolucion;
  assert.equal(txt, 'Sr. <nombre> <nombre>, RUT <rut>, evoluciona bien. Contacto hija <fono> y <email>. Dra. <nombre> indica control.');
  assert.ok(informe.nombres >= 6 && informe.ruts >= 2 && informe.contactos >= 4 && informe.direcciones >= 3);
  assert.match(resumenInforme(informe), /nombres · .*RUT/);
});

test('los identificadores se sustituyen de forma consistente y las fechas conservan sus intervalos', () => {
  const { data } = anonimizar(muestra(), { desplazamientoDias: 10 });
  assert.notEqual(data.IdUsuarioAps, 77123);
  assert.equal(data.IdUsuarioAps, data.Atenciones[0].IdUsuarioAps, 'mismo valor → mismo seudónimo');
  assert.notEqual(data.Id, data.IdUsuarioAps);
  assert.equal(data.Atenciones[0].Diagnosticos[0].Codigo, 'I10', 'los códigos clínicos no son identificadores');
  assert.equal(data.Atenciones[0].FechaAtencion, '20260721 105900');
  assert.equal(data.FechaDeNacimiento, '19700205 000000');
  assert.equal(data.Atenciones[0].FechaDescarte, '00010101 000000', 'el centinela de Rayen no se toca');
});

test('el desplazamiento por defecto es aleatorio y no aparece en el resultado', () => {
  const a = anonimizar({ Fecha: '20260904 120000' }), b = anonimizar({ Fecha: '20260904 120000' });
  assert.ok(a.data.Fecha !== '20260904 120000' && b.data.Fecha !== '20260904 120000');
  assert.ok(!('desplazamientoDias' in a) && !JSON.stringify(a).includes('desplazamiento'));
});

test('un nombre que sólo aparece en texto libre sin campo de persona no se detecta: límite documentado', () => {
  // Un nombre metido en una clave que no es de persona ni texto libre con espacios: «Observacion» es texto libre y se limpia;
  // forzamos el fallo con un token que el tokenizador no pudo recoger porque la persona sólo aparece en texto libre.
  const r = anonimizar({ Nota: 'Paciente Tuki refiere dolor', Apellidos: 'Tuki' }, { desplazamientoDias: 1 });
  assert.equal(r.verificado, true);
  const r2 = anonimizar({ Nota: 'Paciente Tuki refiere dolor' }, { desplazamientoDias: 1 });
  assert.equal(r2.verificado, true, 'sin campo de persona no hay token que buscar; el texto queda tal cual');
  assert.equal(r2.data.Nota, 'Paciente Tuki refiere dolor');
});

test('tokens con acento se borran sin importar mayúsculas ni acentos, y las palabras cortas no se tocan', () => {
  const r = anonimizar({ NombreCompleto: 'María José Pakarati Tepano', Nota: 'MARIA jose y pakarati tepano vinieron; la maría luna no.' }, { desplazamientoDias: 1 });
  assert.equal(r.data.Nota, '<nombre> <nombre> y <nombre> <nombre> vinieron; la <nombre> luna no.');
  assert.equal(r.verificado, true);
});

test('si un nombre sobrevive donde el recorrido no llega (una clave), verificado es false y se nombra', () => {
  const r = anonimizar({ NombreCompleto: 'Rosa Tuki', 'Rosa Tuki': { visitas: 3 } }, { desplazamientoDias: 1 });
  assert.equal(r.verificado, false);
  assert.deepEqual(r.restos, ['Rosa', 'Tuki']);
});
