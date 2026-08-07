const test = require('node:test');
const assert = require('node:assert/strict');

const cloudLogic = require('../cloudfunctions/waterSession/waterLogic');
const clientLedger = require('../miniprogram/core/waterLedger');

const players = [
  { id: 'a', name: '阿杰' },
  { id: 'b', name: '小林' },
  { id: 'c', name: 'Chris' },
  { id: 'd', name: '王姐' }
];

test('standalone water accepts a single 1v1 game and keeps total net at zero', () => {
  const entry = cloudLogic.normalizeGameEntry({
    winnerIds: ['a'],
    loserIds: ['b'],
    unitsPerPlayer: 1
  }, players);
  const ledger = clientLedger.deriveLedger(players, [entry]);

  assert.equal(entry.type, 'game');
  const byId = Object.fromEntries(ledger.map((item) => [item.id, [item.won, item.treat, item.net]]));
  assert.deepEqual(byId, {
    a: [1, 0, 1],
    b: [0, 1, -1],
    c: [0, 0, 0],
    d: [0, 0, 0]
  });
  assert.equal(ledger.reduce((sum, item) => sum + item.net, 0), 0);
});

test('standalone water accepts equal 2v2 sides and rejects unequal or overlapping sides', () => {
  assert.doesNotThrow(() => cloudLogic.normalizeGameEntry({
    winnerIds: ['a', 'b'],
    loserIds: ['c', 'd'],
    unitsPerPlayer: 3
  }, players));

  assert.throws(() => cloudLogic.normalizeGameEntry({
    winnerIds: ['a', 'b'],
    loserIds: ['c'],
    unitsPerPlayer: 1
  }, players), /双方人数要相同/);

  assert.throws(() => cloudLogic.normalizeGameEntry({
    winnerIds: ['a'],
    loserIds: ['a'],
    unitsPerPlayer: 1
  }, players), /不能同时/);
});

test('direct plus and minus both normalize to an explicit from-to transfer', () => {
  const plus = cloudLogic.normalizeDirectEntry({
    playerId: 'a',
    counterpartyId: 'b',
    direction: 'plus',
    units: 2
  }, players);
  const minus = cloudLogic.normalizeDirectEntry({
    playerId: 'a',
    counterpartyId: 'b',
    direction: 'minus',
    units: 4
  }, players);

  assert.deepEqual(plus, {
    type: 'transfer',
    fromPlayerId: 'b',
    toPlayerId: 'a',
    units: 2
  });
  assert.deepEqual(minus, {
    type: 'transfer',
    fromPlayerId: 'a',
    toPlayerId: 'b',
    units: 4
  });
});

test('water units use the approved standalone range and default to one', () => {
  assert.equal(cloudLogic.normalizeUnits(undefined), 1);
  assert.equal(cloudLogic.normalizeUnits('99'), 99);
  assert.throws(() => cloudLogic.normalizeUnits(0), /1.*99/);
  assert.throws(() => cloudLogic.normalizeUnits(100), /1.*99/);
});

test('manual names are trimmed, deduplicated and capped without requiring four players', () => {
  assert.deepEqual(cloudLogic.normalizeManualNames(' 阿杰\n小林、阿杰, Chris '), ['阿杰', '小林', 'Chris']);
  assert.deepEqual(cloudLogic.normalizeManualNames('阿杰'), ['阿杰']);
});
