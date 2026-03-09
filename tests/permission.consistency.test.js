const test = require('node:test');
const assert = require('node:assert/strict');

const frontend = require('../miniprogram/permission/permission');
const submitScorePermission = require('../cloudfunctions/submitScore/lib/permission');
const scoreLockPermission = require('../cloudfunctions/scoreLock/lib/permission');

const fixtureTournament = {
  creatorId: 'admin',
  players: [{ id: 'admin' }, { id: 'member' }]
};

const cases = [
  { openid: 'admin', expected: { isAdmin: true, isParticipant: true, canEditScore: true } },
  { openid: 'member', expected: { isAdmin: false, isParticipant: true, canEditScore: true } },
  { openid: 'guest', expected: { isAdmin: false, isParticipant: false, canEditScore: false } }
];

for (const mod of [
  { name: 'frontend', api: frontend },
  { name: 'submitScore', api: submitScorePermission },
  { name: 'scoreLock', api: scoreLockPermission }
]) {
  test(`${mod.name} permission helpers match shared expectations`, () => {
    for (const item of cases) {
      assert.equal(mod.api.isAdmin(fixtureTournament, item.openid), item.expected.isAdmin);
      assert.equal(mod.api.isParticipant(fixtureTournament, item.openid), item.expected.isParticipant);
      assert.equal(mod.api.canEditScore(fixtureTournament, item.openid), item.expected.canEditScore);
    }
  });
}
