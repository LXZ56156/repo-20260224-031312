const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const profileCore = require('../miniprogram/core/profile');
const profilePagePath = require.resolve('../miniprogram/pages/profile/index.js');

function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}

function createContext() {
  const originalPage = global.Page;
  let definition;
  global.Page = (options) => { definition = options; };
  try {
    delete require.cache[profilePagePath];
    require(profilePagePath);
  } finally {
    global.Page = originalPage;
  }
  const ctx = {
    data: JSON.parse(JSON.stringify(definition.data)),
    setData(update) {
      for (const [key, value] of Object.entries(update)) {
        if (key.startsWith('fieldErrors.')) this.data.fieldErrors[key.slice(12)] = value;
        else this.data[key] = value;
      }
    }
  };
  for (const [key, value] of Object.entries(definition)) {
    if (typeof value === 'function') ctx[key] = value;
  }
  ctx.seedLocalAvatarPreview = () => true;
  ctx.preWarmAvatarUrl = () => {};
  ctx.focusNicknameInput = () => {};
  return ctx;
}

function withAvatarMocks(t) {
  const originalWx = global.wx;
  const originalUpload = profileCore.uploadAvatarFromTemp;
  const originalQuickFill = profileCore.ensureAuthThenQuickFill;
  global.wx = { showLoading() {}, hideLoading() {}, showToast() {} };
  t.after(() => {
    global.wx = originalWx;
    profileCore.uploadAvatarFromTemp = originalUpload;
    profileCore.ensureAuthThenQuickFill = originalQuickFill;
    delete require.cache[profilePagePath];
  });
}

test('profile ignores a second avatar choice until the first upload completes', async (t) => {
  withAvatarMocks(t);
  const upload = deferred();
  const calls = [];
  profileCore.uploadAvatarFromTemp = async (tempPath) => {
    calls.push(tempPath);
    return upload.promise;
  };
  const ctx = createContext();
  const firstChoice = ctx.onChooseAvatar({ detail: { avatarUrl: 'wxfile://first.png' } });
  assert.equal(ctx.data.avatarUploading, true);
  try {
    await ctx.onChooseAvatar({ detail: { avatarUrl: 'wxfile://second.png' } });
    assert.equal(ctx.data.avatarDisplay, 'wxfile://first.png');
    assert.equal(ctx.data.pendingAvatarTempPath, 'wxfile://first.png');
    assert.deepEqual(calls, ['wxfile://first.png']);
  } finally {
    upload.resolve('cloud://avatar/first');
    await firstChoice;
  }
  assert.equal(ctx.data.avatar, 'cloud://avatar/first');
  assert.equal(ctx.data.avatarDisplay, 'wxfile://first.png');
  assert.equal(ctx.data.pendingAvatarTempPath, '');
});

test('profile quick fill cannot replace an avatar during a normal upload', async (t) => {
  withAvatarMocks(t);
  const upload = deferred();
  let quickFillCalls = 0;
  profileCore.uploadAvatarFromTemp = () => upload.promise;
  profileCore.ensureAuthThenQuickFill = async () => {
    quickFillCalls += 1;
    return { cancelled: true };
  };
  const ctx = createContext();
  const firstChoice = ctx.onChooseAvatar({ detail: { avatarUrl: 'wxfile://first.png' } });
  try {
    await ctx.onQuickFillChooseAvatar({ detail: { avatarUrl: 'wxfile://quick.png' } });
    assert.equal(quickFillCalls, 0);
    assert.equal(ctx.data.pendingAvatarTempPath, 'wxfile://first.png');
  } finally {
    upload.resolve('cloud://avatar/first');
    await firstChoice;
  }
});

test('profile normal avatar choice cannot interrupt quick fill', async (t) => {
  withAvatarMocks(t);
  const quickFill = deferred();
  const uploadCalls = [];
  profileCore.ensureAuthThenQuickFill = () => quickFill.promise;
  profileCore.uploadAvatarFromTemp = async (tempPath) => {
    uploadCalls.push(tempPath);
    return 'cloud://avatar/quick';
  };
  const ctx = createContext();
  const firstChoice = ctx.onQuickFillChooseAvatar({ detail: { avatarUrl: 'wxfile://quick.png' } });
  assert.equal(ctx.data.quickFillLoading, true);
  try {
    await ctx.onChooseAvatar({ detail: { avatarUrl: 'wxfile://normal.png' } });
    assert.deepEqual(uploadCalls, []);
    assert.equal(ctx.data.pendingAvatarTempPath, '');
  } finally {
    quickFill.resolve({ cancelled: false, avatarTempPath: 'wxfile://quick.png' });
    await firstChoice;
  }
  assert.deepEqual(uploadCalls, ['wxfile://quick.png']);
  assert.equal(ctx.data.avatarDisplay, 'wxfile://quick.png');
  assert.equal(ctx.data.avatar, 'cloud://avatar/quick');
});

test('profile avatar entry points cannot mutate the form during saving', async (t) => {
  withAvatarMocks(t);
  let uploadCalls = 0;
  let quickFillCalls = 0;
  profileCore.uploadAvatarFromTemp = async () => { uploadCalls += 1; return 'cloud://avatar/new'; };
  profileCore.ensureAuthThenQuickFill = async () => { quickFillCalls += 1; return { cancelled: true }; };
  const ctx = createContext();
  ctx.setData({ saving: true, avatar: 'cloud://avatar/saved', avatarDisplay: 'wxfile://saved.png' });
  await ctx.onChooseAvatar({ detail: { avatarUrl: 'wxfile://normal.png' } });
  await ctx.onQuickFillChooseAvatar({ detail: { avatarUrl: 'wxfile://quick.png' } });
  assert.equal(uploadCalls, 0);
  assert.equal(quickFillCalls, 0);
  assert.equal(ctx.data.avatar, 'cloud://avatar/saved');
  assert.equal(ctx.data.avatarDisplay, 'wxfile://saved.png');
});

test('profile disables both native avatar buttons while either upload or save is busy', () => {
  const wxml = fs.readFileSync(path.join(__dirname, '../miniprogram/pages/profile/index.wxml'), 'utf8');
  const avatarButtons = wxml.match(/<button\b[^>]*open-type="chooseAvatar"[^>]*>/g) || [];
  assert.equal(avatarButtons.length, 2);
  for (const button of avatarButtons) {
    const disabled = button.match(/disabled="\{\{([^}]+)\}\}"/);
    assert.ok(disabled, 'native avatar button must be disabled before its chooser is opened');
    for (const busy of ['avatarUploading', 'quickFillLoading', 'saving']) {
      assert.ok(disabled[1].includes(busy), `disabled expression must include ${busy}`);
    }
  }
});
