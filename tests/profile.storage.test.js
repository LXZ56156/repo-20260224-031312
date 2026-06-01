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

test('profile storage drops wxfile and local temp avatars from long-term profile data', () => {
  const wxfile = profileStorage.sanitizeUserProfile({
    nickName: '球友A',
    avatar: 'wxfile://tmp/avatar.png',
    gender: 'female'
  });
  const devtoolsTemp = profileStorage.sanitizeUserProfile({
    nickName: '球友B',
    avatarUrl: 'http://tmp/avatar.png',
    gender: 'male'
  });

  assert.equal(wxfile.avatar, '');
  assert.equal(wxfile.avatarUrl, '');
  assert.equal(devtoolsTemp.avatar, '');
  assert.equal(devtoolsTemp.avatarUrl, '');
  assert.equal(profileStorage.isProfileComplete(wxfile), false);
  assert.equal(profileStorage.isProfileComplete(devtoolsTemp), false);
});
