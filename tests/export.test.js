import { test } from 'node:test';
import assert from 'node:assert/strict';
import { csvCell } from '../src/ui/export.js';

test('csvCell quotes every value and doubles inner quotes', () => {
  assert.equal(csvCell('Pérez'), '"Pérez"');
  assert.equal(csvCell('dice "hola"'), '"dice ""hola"""');
  assert.equal(csvCell(42), '"42"');
  assert.equal(csvCell(null), '""');
  assert.equal(csvCell(undefined), '""');
});

test('csvCell neutralises formula-leading characters (CSV injection)', () => {
  assert.equal(csvCell('=HYPERLINK("http://x")'), '"\'=HYPERLINK(""http://x"")"');
  assert.equal(csvCell('+1'), '"\'+1"');
  assert.equal(csvCell('-5'), '"\'-5"');
  assert.equal(csvCell('@cmd'), '"\'@cmd"');
  assert.equal(csvCell('\tx'), '"\'\tx"');
  assert.equal(csvCell('17.752.753-K'), '"17.752.753-K"', 'a RUN with an inner dash is untouched');
});
