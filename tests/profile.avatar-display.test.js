const test = require('node:test');
const assert = require('node:assert/strict');

const profileCore = require('../miniprogram/core/profile');

const profilePagePath = require.resolve('../miniprogram/pages/profile/index.js');

function loadProfilePageDefinition() {
  const originalPage = global.Page;
  let definition = null;
  global.Page = (options) => {
    definition = options;
  };
  delete require.cache[profilePagePath];
  require(profilePagePath);
  global.Page = originalPage;
  return definition;
}

function createProfilePageContext(definition) {
  const ctx = {
    data: JSON.parse(JSON.stringify(definition.data || {})),
    setData(update) {
      this.data = { ...this.data, ...(update || {}) };
    }
  };
  for (const [key, value] of Object.entries(definition || {})) {
    if (typeof value === 'function') ctx[key] = value;
  }
  return ctx;
}

test('profile page resolves cloud avatar display and keeps raw file id for saving', async () => {
  const originalWx = global.wx;
  global.wx = {
    cloud: {
      async getTempFileURL() {
        return {
          fileList: [
            { fileID: 'cloud://avatar/profile', tempFileURL: 'https://temp/avatar/profile.png' }
          ]
        };
      }
    }
  };

  try {
    const definition = loadProfilePageDefinition();
    const ctx = createProfilePageContext(definition);

    ctx.applyProfile({
      nickName: '球友',
      gender: 'male',
      avatar: 'cloud://avatar/profile'
    });

    assert.equal(ctx.data.avatar, 'cloud://avatar/profile');
    assert.equal(ctx.data.avatarRaw, 'cloud://avatar/profile');
    assert.equal(ctx.data.avatarDisplay, profileCore.DEFAULT_AVATAR);

    await Promise.resolve();
    await Promise.resolve();

    assert.equal(ctx.data.avatarDisplay, 'https://temp/avatar/profile.png');
  } finally {
    global.wx = originalWx;
    delete require.cache[profilePagePath];
  }
});

test('profile page avatar error falls back to default image', () => {
  const definition = loadProfilePageDefinition();
  const ctx = createProfilePageContext(definition);

  ctx.avatarCache = {
    'cloud://avatar/profile': 'https://broken/avatar.png'
  };
  ctx.setData({ avatarRaw: 'cloud://avatar/profile', avatarDisplay: 'https://broken/avatar.png' });
  ctx.onAvatarError();

  assert.equal(ctx.data.avatarDisplay, profileCore.DEFAULT_AVATAR);
});
