const test = require('node:test');
const assert = require('node:assert/strict');

const storage = require('../miniprogram/core/storage');
const profileCore = require('../miniprogram/core/profile');

function createStorageMock() {
  const bag = Object.create(null);
  return {
    bag,
    getStorageSync(key) {
      return bag[key];
    },
    setStorageSync(key, value) {
      bag[key] = value;
    },
    removeStorageSync(key) {
      delete bag[key];
    }
  };
}

test('setUserProfile reads legacy nickname but only stores canonical nickName locally', () => {
  const originalWx = global.wx;
  const wxMock = createStorageMock();
  global.wx = wxMock;

  try {
    storage.setUserProfile({
      nickname: '  球友A  ',
      gender: 'male'
    });

    assert.deepEqual(wxMock.bag.userProfile, {
      nickName: '球友A',
      gender: 'male',
      avatarUrl: '',
      avatar: ''
    });

    const profile = storage.getUserProfile();
    assert.equal(profile.nickName, '球友A');
    assert.equal(Object.prototype.hasOwnProperty.call(profile, 'nickname'), false);
  } finally {
    global.wx = originalWx;
  }
});

test('mergeProfile prefers canonical nickName and removes legacy nickname alias', () => {
  const merged = profileCore.mergeProfile(
    { nickname: '旧昵称', avatar: 'cloud://avatar-old' },
    { nickName: '新昵称', avatarUrl: 'cloud://avatar-new', gender: 'female' }
  );

  assert.equal(merged.nickName, '新昵称');
  assert.equal(merged.avatar, 'cloud://avatar-new');
  assert.equal(merged.avatarUrl, 'cloud://avatar-new');
  assert.equal(merged.gender, 'female');
  assert.equal(Object.prototype.hasOwnProperty.call(merged, 'nickname'), false);
});

test('getProfileNickName keeps backward-compatible reads and filters placeholder nickname', () => {
  assert.equal(storage.getProfileNickName({ nickName: '球友B' }), '球友B');
  assert.equal(storage.getProfileNickName({ nickname: '  球友C  ' }), '球友C');
  assert.equal(storage.getProfileNickName({ nickname: '微信用户' }), '');
  assert.equal(storage.getProfileNickName(null), '');
});
