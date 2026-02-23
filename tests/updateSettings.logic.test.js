const test = require('node:test');
const assert = require('node:assert/strict');

const logic = require('../cloudfunctions/updateSettings/logic');

function makePlayers(n) {
  return Array.from({ length: n }, (_, i) => ({ id: `p${i + 1}`, name: `P${i + 1}` }));
}

test('parsePosInt normalizes numeric input', () => {
  assert.equal(logic.parsePosInt('', 10), null);
  assert.equal(logic.parsePosInt('3.8', 10), 3);
  assert.equal(logic.parsePosInt('18', 10), 10);
  assert.equal(logic.parsePosInt('abc', 10), null);
});

test('validateSettings allows preconfiguration when players less than 4', () => {
  const out = logic.validateSettings(makePlayers(3), 1, 1);
  assert.equal(out.maxMatches, 0);
  assert.equal(out.patch.totalMatches, 1);
  assert.equal(out.patch.courts, 1);
  assert.equal(out.patch.settingsConfigured, true);
});

test('validateSettings rejects totalMatches over max', () => {
  assert.throws(
    () => logic.validateSettings(makePlayers(4), 9, 1),
    /总场次不能超过最大可选/
  );
});

test('validateSettings builds patch and sets settingsConfigured only when both present', () => {
  const partial = logic.validateSettings(makePlayers(8), 5, null);
  assert.equal(partial.patch.totalMatches, 5);
  assert.equal(Object.prototype.hasOwnProperty.call(partial.patch, 'settingsConfigured'), false);

  const full = logic.validateSettings(makePlayers(8), 5, 2);
  assert.equal(full.patch.totalMatches, 5);
  assert.equal(full.patch.courts, 2);
  assert.equal(full.patch.settingsConfigured, true);
});
