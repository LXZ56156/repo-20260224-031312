const test = require('node:test');
const assert = require('node:assert/strict');

const perm = require('../miniprogram/permission/permission');

test('permission helpers work as expected', () => {
  const t = {
    creatorId: 'u1',
    players: [{ id: 'u1' }, { id: 'u2' }]
  };

  assert.equal(perm.isAdmin(t, 'u1'), true);
  assert.equal(perm.isAdmin(t, 'u3'), false);

  assert.equal(perm.isParticipant(t, 'u2'), true);
  assert.equal(perm.isParticipant(t, 'u3'), false);

  assert.equal(perm.canEditScore(t, 'u1'), true);
  assert.equal(perm.canEditScore(t, 'u2'), true);
  assert.equal(perm.canEditScore(t, 'u3'), false);
});
