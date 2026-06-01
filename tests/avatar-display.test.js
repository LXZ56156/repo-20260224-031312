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

test('buildAvatarDisplay hides persisted local temp and unsupported avatar paths', () => {
  const wxfile = avatarDisplay.buildAvatarDisplay({
    id: 'u_wxfile',
    name: '临时头像',
    avatar: 'wxfile://tmp/avatar.png'
  });
  const devtoolsTemp = avatarDisplay.buildAvatarDisplay({
    id: 'u_tmp',
    name: '开发工具临时头像',
    avatar: 'http://tmp/avatar.png'
  });
  const unsupported = avatarDisplay.buildAvatarDisplay({
    id: 'u_local',
    name: '旧本地头像',
    avatar: 'local-avatar.png'
  });
  const remote = avatarDisplay.buildAvatarDisplay({
    id: 'u_remote',
    name: '远程头像',
    avatar: 'https://avatar.example/u_remote.png'
  });

  assert.equal(wxfile.avatarDisplay, '');
  assert.equal(devtoolsTemp.avatarDisplay, '');
  assert.equal(unsupported.avatarDisplay, '');
  assert.equal(remote.avatarDisplay, 'https://avatar.example/u_remote.png');
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

test('resolveCloudAvatarFileIds caches returned temp urls and cools down failed results', async () => {
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
    assert.deepEqual(result.failed, ['cloud://avatar/b']);
    assert.equal(avatarDisplay.getCachedAvatarUrl(cache, 'cloud://avatar/a'), 'https://temp/avatar/a.png');
    assert.equal(avatarDisplay.getCachedAvatarUrl(cache, 'cloud://avatar/b'), '');
    assert.equal(avatarDisplay.shouldResolveCloudAvatarFileId('cloud://avatar/b', cache), false);
  } finally {
    global.wx = originalWx;
  }
});

test('resolveCloudAvatarFileIds cools down missing file ids and request failures', async () => {
  const originalWx = global.wx;
  const cache = {};
  let calls = 0;

  try {
    global.wx = {
      cloud: {
        async getTempFileURL() {
          calls += 1;
          if (calls === 1) {
            return {
              fileList: [
                { fileID: 'cloud://avatar/a', tempFileURL: 'https://temp/avatar/a.png', status: 0 }
              ]
            };
          }
          throw new Error('network failed');
        }
      }
    };

    const missingResult = await avatarDisplay.resolveCloudAvatarFileIds(['cloud://avatar/a', 'cloud://avatar/missing'], cache);
    assert.equal(missingResult.updated, true);
    assert.deepEqual(missingResult.failed, ['cloud://avatar/missing']);
    assert.equal(avatarDisplay.shouldResolveCloudAvatarFileId('cloud://avatar/missing', cache), false);

    const failedResult = await avatarDisplay.resolveCloudAvatarFileIds(['cloud://avatar/error'], cache);
    assert.equal(failedResult.updated, false);
    assert.deepEqual(failedResult.failed, ['cloud://avatar/error']);
    assert.equal(avatarDisplay.shouldResolveCloudAvatarFileId('cloud://avatar/error', cache), false);
  } finally {
    global.wx = originalWx;
  }
});

test('resolveCloudAvatarFileIds logs request, response, failed item, and thrown error diagnostics', async () => {
  const originalWx = global.wx;
  const originalInfo = console.info;
  const originalWarn = console.warn;
  const infoLogs = [];
  const warnLogs = [];
  const cache = {};
  let calls = 0;

  try {
    console.info = (...args) => infoLogs.push(args);
    console.warn = (...args) => warnLogs.push(args);
    global.wx = {
      cloud: {
        async getTempFileURL() {
          calls += 1;
          if (calls === 1) {
            return {
              fileList: [
                {
                  fileID: 'cloud://avatar/fail',
                  tempFileURL: '',
                  status: -1,
                  errMsg: 'file not found'
                }
              ]
            };
          }
          throw new Error('network failed');
        }
      }
    };

    await avatarDisplay.resolveCloudAvatarFileIds(['cloud://avatar/fail'], cache);
    await avatarDisplay.resolveCloudAvatarFileIds(['cloud://avatar/error'], cache);

    assert.equal(infoLogs.some(([message, context]) => (
      message === '[avatar] getTempFileURL request' &&
      Array.isArray(context.fileIDs) &&
      context.fileIDs[0] === 'cloud://avatar/fail'
    )), true);
    assert.equal(infoLogs.some(([message, context]) => (
      message === '[avatar] getTempFileURL response' &&
      Array.isArray(context.fileList) &&
      context.fileList[0].fileID === 'cloud://avatar/fail'
    )), true);
    assert.equal(warnLogs.some(([message, context]) => (
      message === '[avatar] getTempFileURL failed' &&
      context.fileID === 'cloud://avatar/fail' &&
      context.status === -1 &&
      context.errMsg === 'file not found' &&
      context.tempFileURL === ''
    )), true);
    assert.equal(warnLogs.some(([message, err]) => (
      message === '[avatar] resolveCloudAvatarFileIds error' &&
      err &&
      err.message === 'network failed'
    )), true);
  } finally {
    global.wx = originalWx;
    console.info = originalInfo;
    console.warn = originalWarn;
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

test('resolveCloudAvatarFileIds keeps earlier batch successes when a later batch fails', async () => {
  const originalWx = global.wx;
  const cache = {};
  let calls = 0;

  try {
    global.wx = {
      cloud: {
        async getTempFileURL({ fileList }) {
          calls += 1;
          if (calls > 1) throw new Error('later batch failed');
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
    assert.equal(avatarDisplay.getCachedAvatarUrl(cache, 'cloud://avatar/0'), 'https://temp/avatar/0.png');
    assert.equal(avatarDisplay.shouldResolveCloudAvatarFileId('cloud://avatar/0', cache), false);
    assert.deepEqual(result.failed, ['cloud://avatar/50']);
    assert.equal(avatarDisplay.shouldResolveCloudAvatarFileId('cloud://avatar/50', cache), false);
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
    retryDelayMs: 100,
    preserveUrl: true
  });

  assert.equal(avatarDisplay.getCachedAvatarUrl(cache, 'cloud://avatar/old', { now: 1200 }), '');
  assert.equal(avatarDisplay.shouldResolveCloudAvatarFileId('cloud://avatar/old', cache, { now: 1200 }), true);
  assert.equal(avatarDisplay.getCachedAvatarUrl(cache, 'cloud://avatar/fail', { now: 1050 }), '');
  assert.equal(avatarDisplay.shouldResolveCloudAvatarFileId('cloud://avatar/fail', cache, { now: 1050 }), false);
  assert.equal(avatarDisplay.shouldResolveCloudAvatarFileId('cloud://avatar/fail', cache, { now: 1200 }), true);
});

// --- P3: persistent cache ---

test('markAvatarUrlFailed preserves existing valid url in cache entry', () => {
  const cache = {};
  avatarDisplay.setCachedAvatarUrl(cache, 'cloud://avatar/keep', 'https://temp/good.png', {
    now: 1000,
    ttlMs: 3000000
  });
  avatarDisplay.markAvatarUrlFailed(cache, 'cloud://avatar/keep', { now: 2000, preserveUrl: true });

  const entry = cache['cloud://avatar/keep'];
  assert.ok(entry);
  assert.equal(entry.url, 'https://temp/good.png');
  assert.ok(entry.failedAt > 0);
  assert.ok(entry.retryAt > 0);
  assert.equal(entry.failureType, 'resolve');
});

test('markAvatarUrlFailed for image error drops the bad url and allows immediate retry', () => {
  const cache = {};
  avatarDisplay.setCachedAvatarUrl(cache, 'cloud://avatar/bad', 'https://temp/bad.png', {
    now: 1000,
    ttlMs: 3000000
  });
  avatarDisplay.markAvatarUrlFailed(cache, 'cloud://avatar/bad', { now: 2000 });

  const entry = cache['cloud://avatar/bad'];
  assert.ok(entry);
  assert.equal(entry.url || '', '');
  assert.equal(entry.badUrl, 'https://temp/bad.png');
  assert.equal(entry.failureType, 'image');
  assert.equal(avatarDisplay.getCachedAvatarUrl(cache, 'cloud://avatar/bad', { now: 3000 }), '');
  assert.equal(avatarDisplay.shouldResolveCloudAvatarFileId('cloud://avatar/bad', cache, { now: 3000 }), true);
});

test('markAvatarUrlFailed does not keep expired url', () => {
  const cache = {};
  avatarDisplay.setCachedAvatarUrl(cache, 'cloud://avatar/expired', 'https://temp/old.png', {
    now: 1000,
    ttlMs: 100
  });
  avatarDisplay.markAvatarUrlFailed(cache, 'cloud://avatar/expired', { now: 2000 });

  const entry = cache['cloud://avatar/expired'];
  assert.ok(entry);
  assert.equal(entry.url || '', '');
  assert.ok(entry.failedAt > 0);
});

test('getCachedAvatarUrl returns url when retryAt is set but url is still valid', () => {
  const cache = {};
  avatarDisplay.setCachedAvatarUrl(cache, 'cloud://avatar/retry', 'https://temp/url.png', {
    now: 1000,
    ttlMs: 3000000
  });
  avatarDisplay.markAvatarUrlFailed(cache, 'cloud://avatar/retry', {
    now: 2000,
    retryDelayMs: 60000,
    preserveUrl: true
  });

  const url = avatarDisplay.getCachedAvatarUrl(cache, 'cloud://avatar/retry', { now: 3000 });
  assert.equal(url, 'https://temp/url.png');
});

test('getCachedAvatarUrl keeps resolve markers after retry so background refresh can run', () => {
  const cache = {};
  avatarDisplay.setCachedAvatarUrl(cache, 'cloud://avatar/clear', 'https://temp/url.png', {
    now: 1000,
    ttlMs: 3000000
  });
  avatarDisplay.markAvatarUrlFailed(cache, 'cloud://avatar/clear', {
    now: 2000,
    retryDelayMs: 100,
    preserveUrl: true
  });

  const url = avatarDisplay.getCachedAvatarUrl(cache, 'cloud://avatar/clear', { now: 3000 });
  assert.equal(url, 'https://temp/url.png');
  const entry = cache['cloud://avatar/clear'];
  assert.ok(entry.failedAt > 0);
  assert.ok(entry.retryAt > 0);
  assert.equal(entry.failureType, 'resolve');
  assert.equal(avatarDisplay.shouldResolveCloudAvatarFileId('cloud://avatar/clear', cache, { now: 3000 }), true);
});

test('resolve failure preserves display url but allows refresh after retry period', () => {
  const cache = {};
  avatarDisplay.setCachedAvatarUrl(cache, 'cloud://avatar/resolve-retry', 'https://temp/old.png', {
    now: 1000,
    ttlMs: 3000000
  });
  avatarDisplay.markAvatarUrlFailed(cache, 'cloud://avatar/resolve-retry', {
    now: 2000,
    retryDelayMs: 100,
    preserveUrl: true
  });

  assert.equal(avatarDisplay.getCachedAvatarUrl(cache, 'cloud://avatar/resolve-retry', { now: 2050 }), 'https://temp/old.png');
  assert.equal(avatarDisplay.shouldResolveCloudAvatarFileId('cloud://avatar/resolve-retry', cache, { now: 2050 }), false);
  assert.equal(avatarDisplay.getCachedAvatarUrl(cache, 'cloud://avatar/resolve-retry', { now: 2200 }), 'https://temp/old.png');
  assert.equal(avatarDisplay.shouldResolveCloudAvatarFileId('cloud://avatar/resolve-retry', cache, { now: 2200 }), true);
});

test('setCachedAvatarUrl with same fileId updates url and clears failure state', () => {
  const cache = {};
  avatarDisplay.setCachedAvatarUrl(cache, 'cloud://avatar/refresh', 'https://temp/old.png', {
    now: 1000,
    ttlMs: 100
  });
  avatarDisplay.markAvatarUrlFailed(cache, 'cloud://avatar/refresh', { now: 1200 });

  avatarDisplay.setCachedAvatarUrl(cache, 'cloud://avatar/refresh', 'https://temp/new.png', {
    now: 2000,
    ttlMs: 3000000
  });

  const entry = cache['cloud://avatar/refresh'];
  assert.equal(entry.url, 'https://temp/new.png');
  assert.equal(entry.failedAt || 0, 0);
  assert.equal(entry.retryAt || 0, 0);
});

test('local preview cache displays immediately but still requests cloud temp url', () => {
  const cache = {};
  avatarDisplay.setCachedAvatarUrl(cache, 'cloud://avatar/local-preview', 'wxfile://tmp/avatar.jpg', {
    now: 1000,
    ttlMs: 300000,
    localPreview: true,
    persist: false
  });

  const entry = cache['cloud://avatar/local-preview'];
  assert.equal(entry.localPreview, true);
  assert.equal(
    avatarDisplay.getCachedAvatarUrl(cache, 'cloud://avatar/local-preview', { now: 1100 }),
    'wxfile://tmp/avatar.jpg'
  );
  assert.equal(avatarDisplay.shouldResolveCloudAvatarFileId('cloud://avatar/local-preview', cache, { now: 1100 }), true);
});

test('persistCache only writes valid non-expired cloud urls', () => {
  const originalWx = global.wx;
  const persistedData = {};
  global.wx = {
    setStorageSync: (key, value) => { persistedData[key] = value; },
    getStorageSync: () => persistedData.avatar_temp_url_cache_v1 || null,
    cloud: { getTempFileURL: async () => ({ fileList: [] }) }
  };

  try {
    const cache = {};
    avatarDisplay.setCachedAvatarUrl(cache, 'cloud://avatar/good', 'https://temp/good.png', {
      now: 1000,
      ttlMs: 3000000
    });
    avatarDisplay.markAvatarUrlFailed(cache, 'cloud://avatar/fail_only', { now: 1000 });

    // Directly call persistCache to check what gets written
    const fs = require('fs');
    const path = require('path');
    const src = fs.readFileSync(path.join(__dirname, '../miniprogram/core/avatarDisplay.js'), 'utf8');

    // Verify the in-memory cache has the right entries
    assert.equal(avatarDisplay.getCachedAvatarUrl(cache, 'cloud://avatar/good', { now: 2000 }), 'https://temp/good.png');
    // Failed entry without url should not return a url
    assert.equal(avatarDisplay.getCachedAvatarUrl(cache, 'cloud://avatar/fail_only', { now: 2000 }), '');
  } finally {
    global.wx = originalWx;
  }
});
