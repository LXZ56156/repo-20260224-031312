const test = require('node:test');
const assert = require('node:assert/strict');

const avatarDisplay = require('../miniprogram/core/avatarDisplay');

test('buildAvatarDisplay prefers cached cloud avatar url and keeps initial fallback data', () => {
  const item = avatarDisplay.buildAvatarDisplay({
    id: 'u_1',
    nickName: '球友A',
    avatar: 'cloud://avatar/u_1'
  }, {
    'cloud://avatar/u_1': 'https://temp/avatar/u_1.png'
  });

  assert.equal(item.id, 'u_1');
  assert.equal(item.name, '球友A');
  assert.equal(item.avatarRaw, 'cloud://avatar/u_1');
  assert.equal(item.avatarDisplay, 'https://temp/avatar/u_1.png');
  assert.equal(item.initial, '球');
  assert.match(item.colorClass, /^pcolor-[0-5]$/);
});

test('collectCloudAvatarFileIds retries cloud avatars when cached value is empty', () => {
  const pending = avatarDisplay.collectCloudAvatarFileIds({
    rows: [
      { avatarRaw: 'cloud://avatar/a' },
      { nested: [{ avatarRaw: 'cloud://avatar/b' }] }
    ]
  }, {
    'cloud://avatar/a': '',
    'cloud://avatar/b': 'https://temp/avatar/b.png'
  });

  assert.deepEqual(pending, ['cloud://avatar/a']);
});

test('resolveCloudAvatarFileIds caches returned temp urls but does not persist empty results', async () => {
  const originalWx = global.wx;
  const cache = {};

  try {
    global.wx = {
      cloud: {
        async getTempFileURL() {
          return {
            fileList: [
              { fileID: 'cloud://avatar/a', tempFileURL: 'https://temp/avatar/a.png' },
              { fileID: 'cloud://avatar/b', tempFileURL: '' }
            ]
          };
        }
      }
    };

    const result = await avatarDisplay.resolveCloudAvatarFileIds(['cloud://avatar/a', 'cloud://avatar/b'], cache);

    assert.equal(result.updated, true);
    assert.equal(cache['cloud://avatar/a'], 'https://temp/avatar/a.png');
    assert.equal(Object.prototype.hasOwnProperty.call(cache, 'cloud://avatar/b'), false);
  } finally {
    global.wx = originalWx;
  }
});
