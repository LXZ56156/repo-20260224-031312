const test = require('node:test');
const assert = require('node:assert/strict');

const profileStorage = require('../miniprogram/core/storage/profile');

test('isProfileComplete requires nickname, avatar and gender', () => {
  assert.equal(profileStorage.isProfileComplete({
    nickName: '球友A',
    avatar: 'cloud://avatar/a',
    gender: 'female'
  }), true);

  assert.equal(profileStorage.isProfileComplete({
    nickName: '球友A',
    avatar: '',
    gender: 'female'
  }), false);

  assert.equal(profileStorage.isProfileComplete({
    nickName: '球友A',
    avatar: 'cloud://avatar/a',
    gender: 'unknown'
  }), false);
});
