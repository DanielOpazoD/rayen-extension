import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { installFakeChrome } from './helpers/fake-chrome.js';
import { createPin, unlockWith, clearKey, hasKey, isEncrypted, migratePlain, changePin, readMeta, META_KEY, PinError, setIteracionesParaPruebas } from '../src/io/crypto-store.js';
setIteracionesParaPruebas(2000);
import { storageGet, storageSet, clearEverything } from '../src/io/cache.js';

let fake;
beforeEach(() => { fake = installFakeChrome(); clearKey(); });

test('con PIN creado todo lo que se guarda queda cifrado en disco y se lee igual', async () => {
  await createPin('123456');
  await storageSet('rayen_prefs_v1', { months: 6, notas: 'Vive sola' });
  const disco = fake.local.get('rayen_prefs_v1');
  assert.ok(isEncrypted(disco)); assert.ok(!JSON.stringify(disco).includes('Vive sola'), 'nada legible en disco');
  assert.deepEqual(await storageGet('rayen_prefs_v1'), { months: 6, notas: 'Vive sola' });
});

test('sin la clave, un valor cifrado no se entrega ni a medias', async () => {
  await createPin('123456'); await storageSet('k', { secreto: 1 });
  clearKey();
  await assert.rejects(storageGet('k'), err => err.name === 'LockedError');
  await assert.rejects(unlockWith('000000'), err => err instanceof PinError);
  assert.equal(hasKey(), false);
  await unlockWith('123456');
  assert.deepEqual(await storageGet('k'), { secreto: 1 });
});

test('el primer arranque con PIN cifra lo que estaba en claro y no toca la meta', async () => {
  fake.local.set('rayen_notes_v1', { run_1: 'nota' }); fake.local.set('rayen_prefs_v1', { months: 3 });
  await createPin('654321');
  assert.equal(await migratePlain(), 2);
  assert.ok(isEncrypted(fake.local.get('rayen_notes_v1')) && isEncrypted(fake.local.get('rayen_prefs_v1')));
  assert.ok(!isEncrypted(fake.local.get(META_KEY)));
  assert.deepEqual(await storageGet('rayen_notes_v1'), { run_1: 'nota' });
});

test('cambiar el PIN vuelve a cifrar todo: el viejo deja de servir y el nuevo abre', async () => {
  await createPin('111111'); await storageSet('a', 'x'); await storageSet('b', [1, 2]);
  await assert.rejects(changePin('222222', '333333'), err => err instanceof PinError);
  await changePin('111111', '333333');
  clearKey();
  await assert.rejects(unlockWith('111111'), err => err instanceof PinError);
  await unlockWith('333333');
  assert.equal(await storageGet('a'), 'x'); assert.deepEqual(await storageGet('b'), [1, 2]);
});

test('sin PIN creado (pruebas, arnés) el almacenamiento sigue en claro, y «Eliminar todo» descarta la clave', async () => {
  await storageSet('p', { a: 1 });
  assert.deepEqual(fake.local.get('p'), { a: 1 });
  await createPin('123456');
  await clearEverything();
  assert.equal(hasKey(), false); assert.equal(await readMeta(), null);
});
