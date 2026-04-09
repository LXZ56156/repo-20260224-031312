const test = require('node:test');
const assert = require('node:assert/strict');

const shared = require('../cloudfunctions/startTournament/schedulerShared');

test('schedulerShared normalizes seeds consistently', () => {
  assert.equal(shared.normalizeSeed(undefined), 1);
  assert.equal(shared.normalizeSeed(0), 1);
  assert.equal(shared.normalizeSeed(-17), 17);
});

test('schedulerShared counts combinations and doubles matchups deterministically', () => {
  assert.equal(shared.countComb(6, 2), 15);
  assert.equal(shared.countComb(8, 4), 70);
  assert.equal(shared.countDoublesMatchups(8), 210);
});

test('schedulerShared enumerates combinations and computes spread consistently', () => {
  const combos = [];
  shared.enumerateCombinations(['c', 'a', 'b'], 2, (combo) => {
    combos.push(combo.join(','));
    return true;
  });
  assert.deepEqual(combos, ['a,b', 'a,c', 'b,c']);
  assert.equal(shared.computeCountSpread({ a: 1, b: 3, c: 2 }, ['a', 'b', 'c']), 2);
});
