const test = require('node:test');
const assert = require('node:assert/strict');

const frontend = require('../miniprogram/permission/permission');
const submitScorePermission = require('../cloudfunctions/submitScore/lib/permission');
const scoreLockPermission = require('../cloudfunctions/scoreLock/lib/permission');

const fixtureTournament = {
  creatorId: 'admin',
  refereeId: 'member_a',
  players: [{ id: 'admin' }, { id: 'member_a' }, { id: 'member_b' }]
};

const modules = [
  { name: 'frontend', api: frontend },
  { name: 'submitScore', api: submitScorePermission },
  { name: 'scoreLock', api: scoreLockPermission }
];

const cases = [
  { openid: 'admin', expected: true },
  { openid: 'member_a', expected: true },
  { openid: 'member_b', expected: true },
  { openid: 'guest', expected: false }
];

for (const mod of modules) {
  test(`${mod.name} keeps score-entry permission on admin/participant matrix`, () => {
    for (const item of cases) {
      assert.equal(mod.api.canEditScore(fixtureTournament, item.openid), item.expected);
    }
  });
}
