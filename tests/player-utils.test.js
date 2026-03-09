const test = require('node:test');
const assert = require('node:assert/strict');

const playerUtils = require('../miniprogram/core/playerUtils');

test('playerUtils extracts player ids and safe names consistently', () => {
  assert.equal(playerUtils.extractPlayerId('u_1'), 'u_1');
  assert.equal(playerUtils.extractPlayerId({ id: 'u_2' }), 'u_2');
  assert.equal(playerUtils.extractPlayerId({ playerId: 'u_3' }), 'u_3');
  assert.equal(playerUtils.safePlayerName({ id: 'guest_abc1234' }), '1234');
  assert.equal(playerUtils.safePlayerName({ id: 'u_4', name: '成员A001' }), 'A001');
  assert.equal(playerUtils.safePlayerName({ id: 'u_5', nickName: '老王' }), '老王');
});

test('playerUtils detects tournament participants from playerIds and players', () => {
  assert.equal(playerUtils.isParticipantInTournament({
    playerIds: ['u_1', 'u_2'],
    players: [{ id: 'u_3' }]
  }, 'u_2'), true);
  assert.equal(playerUtils.isParticipantInTournament({
    players: [{ playerId: 'u_3' }]
  }, 'u_3'), true);
  assert.equal(playerUtils.isParticipantInTournament({
    players: [{ id: 'u_4' }]
  }, 'u_2'), false);
});
