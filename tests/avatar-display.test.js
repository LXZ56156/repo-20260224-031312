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

test('buildAvatarDisplay keeps cloud avatar hidden until temp url is cached', () => {
  const item = avatarDisplay.buildAvatarDisplay({
    id: 'u_1',
    name: '球友A',
    avatar: 'cloud://avatar/u_1'
  }, {});

  assert.equal(item.avatarRaw, 'cloud://avatar/u_1');
  assert.equal(item.avatarDisplay, '');
  assert.equal(item.initial, '球');
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
  let requested = [];

  try {
    global.wx = {
      cloud: {
        async getTempFileURL({ fileList }) {
          requested = fileList;
          return {
            fileList: [
              { fileID: 'cloud://avatar/a', tempFileURL: 'https://temp/avatar/a.png', status: 0 },
              { fileID: 'cloud://avatar/b', tempFileURL: '', status: -1 }
            ]
          };
        }
      }
    };

    const result = await avatarDisplay.resolveCloudAvatarFileIds(['cloud://avatar/a', 'cloud://avatar/b'], cache);

    assert.equal(result.updated, true);
    assert.deepEqual(requested, ['cloud://avatar/a', 'cloud://avatar/b']);
    assert.equal(avatarDisplay.getCachedAvatarUrl(cache, 'cloud://avatar/a'), 'https://temp/avatar/a.png');
    assert.equal(Object.prototype.hasOwnProperty.call(cache, 'cloud://avatar/b'), false);
  } finally {
    global.wx = originalWx;
  }
});

test('resolveCloudAvatarFileIds chunks temp url requests at official batch limit', async () => {
  const originalWx = global.wx;
  const cache = {};
  const calls = [];

  try {
    global.wx = {
      cloud: {
        async getTempFileURL({ fileList }) {
          calls.push(fileList);
          return {
            fileList: fileList.map((fileID) => ({
              fileID,
              tempFileURL: `https://temp/${fileID.slice('cloud://'.length)}.png`,
              status: 0
            }))
          };
        }
      }
    };

    const fileIds = Array.from({ length: 51 }, (_, index) => `cloud://avatar/${index}`);
    const result = await avatarDisplay.resolveCloudAvatarFileIds(fileIds, cache);

    assert.equal(result.updated, true);
    assert.equal(calls.length, 2);
    assert.equal(calls[0].length, 50);
    assert.equal(calls[1].length, 1);
    assert.equal(avatarDisplay.getCachedAvatarUrl(cache, 'cloud://avatar/50'), 'https://temp/avatar/50.png');
  } finally {
    global.wx = originalWx;
  }
});

test('expired and failed cloud avatar cache entries are not used as display urls', () => {
  const cache = {};
  avatarDisplay.setCachedAvatarUrl(cache, 'cloud://avatar/old', 'https://temp/old.png', {
    now: 1000,
    ttlMs: 100
  });
  avatarDisplay.markAvatarUrlFailed(cache, 'cloud://avatar/fail', {
    now: 1000,
    retryDelayMs: 100
  });

  assert.equal(avatarDisplay.getCachedAvatarUrl(cache, 'cloud://avatar/old', { now: 1200 }), '');
  assert.equal(avatarDisplay.shouldResolveCloudAvatarFileId('cloud://avatar/old', cache, { now: 1200 }), true);
  assert.equal(avatarDisplay.getCachedAvatarUrl(cache, 'cloud://avatar/fail', { now: 1050 }), '');
  assert.equal(avatarDisplay.shouldResolveCloudAvatarFileId('cloud://avatar/fail', cache, { now: 1050 }), false);
  assert.equal(avatarDisplay.shouldResolveCloudAvatarFileId('cloud://avatar/fail', cache, { now: 1200 }), true);
});
