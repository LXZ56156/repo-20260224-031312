const test = require('node:test');
const assert = require('node:assert/strict');

const frontend = require('../miniprogram/core/playerUtils');
const cloud = require('../cloudfunctions/scoreLock/lib/player');

test('frontend and cloud shared player helpers prefer nickName over nickname consistently', () => {
  const player = {
    id: 'u_1',
    nickName: '新昵称',
    nickname: '旧昵称'
  };

  assert.equal(frontend.safePlayerName(player), '新昵称');
  assert.equal(cloud.safePlayerName(player), '新昵称');
  assert.equal(frontend.extractPlayerId(player), 'u_1');
  assert.equal(cloud.extractPlayerId(player), 'u_1');
});
