const test = require('node:test');
const assert = require('node:assert/strict');
const { setImmediate } = require('node:timers');
const avatars = require('../miniprogram/core/avatarDisplay');

function setup(t) {
  const oldWx = global.wx;
  const calls = [];
  const cloud = { getTempFileURL({ fileList }) {
    let resolve, reject;
    const promise = new Promise((done, fail) => { resolve = done; reject = fail; });
    calls.push({ ids: fileList, resolve, reject });
    return promise;
  } };
  global.wx = { cloud };
  const succeed = (call) => call.resolve({ fileList: call.ids.map((fileID) => ({ fileID, status: 0, tempFileURL: 'https://temp.example/' + fileID.split('/').at(-1) })) });
  t.after(() => { calls.forEach(succeed); global.wx = oldWx; });
  return { calls, succeed, cloud };
}

test('three cold calls for one avatar share the SDK request and update every caller cache', async (t) => {
  const { calls, succeed } = setup(t);
  const shared = {}, separate = {};
  const tasks = [shared, shared, separate].map((cache) => avatars.resolveCloudAvatarFileIds(['cloud://efficiency/a'], cache));
  assert.equal(calls.length, 1);
  succeed(calls[0]);
  const results = await Promise.all(tasks);
  assert.ok(results.every((result) => result.updated));
  assert.deepEqual(results.map((result) => result.requested), Array(3).fill(['cloud://efficiency/a']));
  assert.equal(avatars.getCachedAvatarUrl(shared, 'cloud://efficiency/a'), 'https://temp.example/a');
  assert.equal(avatars.getCachedAvatarUrl(separate, 'cloud://efficiency/a'), 'https://temp.example/a');
});

test('overlapping avatar lists request the shared file ID only once', async (t) => {
  const { calls, succeed } = setup(t);
  const first = {}, second = {};
  const a = avatars.resolveCloudAvatarFileIds(['cloud://efficiency/a', 'cloud://efficiency/b'], first);
  const b = avatars.resolveCloudAvatarFileIds(['cloud://efficiency/b', 'cloud://efficiency/c'], second);
  assert.deepEqual(calls.map((call) => call.ids), [['cloud://efficiency/a', 'cloud://efficiency/b'], ['cloud://efficiency/c']]);
  calls.forEach(succeed);
  const results = await Promise.all([a, b]);
  assert.ok(results.every((result) => result.updated));
  assert.equal(avatars.getCachedAvatarUrl(second, 'cloud://efficiency/b'), 'https://temp.example/b');
});

test('shared SDK rejection preserves each caller cooldown and permits retry after expiry', async (t) => {
  const { calls, succeed } = setup(t);
  let now = Date.now();
  t.mock.method(Date, 'now', () => now);
  const caches = [{}, {}, {}];
  const tasks = caches.map((cache) => avatars.resolveCloudAvatarFileIds(['cloud://efficiency/retry'], cache));
  assert.equal(calls.length, 1);
  calls[0].reject(new Error('SDK unavailable'));
  const results = await Promise.all(tasks);
  assert.ok(results.every((result) => result.updated === false && result.failed[0] === 'cloud://efficiency/retry'));
  assert.ok(caches.every((cache) => !avatars.shouldResolveCloudAvatarFileId('cloud://efficiency/retry', cache)));
  now += 60_001;
  const retry = avatars.resolveCloudAvatarFileIds(['cloud://efficiency/retry'], caches[0]);
  assert.equal(calls.length, 2);
  succeed(calls[1]);
  assert.equal((await retry).updated, true);
});

test('a pending final avatar in another call is reused after the first 50-item batch', async (t) => {
  const { calls, succeed } = setup(t);
  const ids = Array.from({ length: 51 }, (_, i) => 'cloud://efficiency/batch-' + i);
  const all = avatars.resolveCloudAvatarFileIds(ids, {});
  const last = avatars.resolveCloudAvatarFileIds([ids[50]], {});
  assert.deepEqual(calls.map((call) => call.ids.length), [50, 1]);
  succeed(calls[0]);
  await new Promise(setImmediate);
  assert.equal(calls.length, 2);
  succeed(calls[1]);
  const results = await Promise.all([all, last]);
  assert.equal(results[0].requested.length, 51);
  assert.ok(results.every((result) => result.updated));
});

test('one failed joined avatar does not inherit another file success', async (t) => {
  const { calls } = setup(t);
  const mixed = avatars.resolveCloudAvatarFileIds(['cloud://efficiency/good', 'cloud://efficiency/bad'], {});
  const failed = avatars.resolveCloudAvatarFileIds(['cloud://efficiency/bad'], {});
  assert.equal(calls.length, 1);
  calls[0].resolve({ fileList: [
    { fileID: 'cloud://efficiency/good', status: 0, tempFileURL: 'https://temp.example/good' },
    { fileID: 'cloud://efficiency/bad', status: -1, tempFileURL: '' }
  ] });
  const [mixedResult, failedResult] = await Promise.all([mixed, failed]);
  assert.equal(mixedResult.updated, true);
  assert.equal(failedResult.updated, false);
  assert.deepEqual(failedResult.failed, ['cloud://efficiency/bad']);
});

test('different SDK instances never share an in-flight avatar request', async (t) => {
  const { calls, succeed } = setup(t);
  const first = avatars.resolveCloudAvatarFileIds(['cloud://efficiency/provider'], {});
  const other = [];
  global.wx.cloud = { getTempFileURL({ fileList }) {
    return new Promise((resolve) => { other.push({ ids: fileList, resolve }); });
  } };
  const second = avatars.resolveCloudAvatarFileIds(['cloud://efficiency/provider'], {});
  assert.equal(calls.length, 1);
  assert.equal(other.length, 1);
  succeed(calls[0]);
  succeed(other[0]);
  await Promise.all([first, second]);
});
