const test = require('node:test');
const assert = require('node:assert/strict');

const profileActions = require('../miniprogram/pages/lobby/lobbyProfileActions');
const viewModel = require('../miniprogram/pages/lobby/lobbyViewModel');
const avatarDisplay = require('../miniprogram/core/avatarDisplay');

function createDeferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

test('lobby display players keep initials visible before temp url cache resolves', () => {
  const players = viewModel.buildDisplayPlayers([{
    id: 'p_a',
    name: '球友A',
    avatar: 'cloud://avatar/a',
    gender: 'female'
  }], {});

  assert.equal(players[0].avatarRaw, 'cloud://avatar/a');
  assert.equal(players[0].avatarDisplay, '');
  assert.equal(players[0].initial, '球');
});

test('lobby avatar resolution keeps initials visible if temp url request fails', async () => {
  const originalWx = global.wx;
  global.wx = {
    cloud: {
      async getTempFileURL() {
        throw new Error('network failed');
      }
    }
  };

  const ctx = {
    data: {
      displayPlayers: [
        { id: 'p_a', name: '球友A', avatarRaw: 'cloud://avatar/a', avatarDisplay: '' }
      ]
    },
    avatarCache: {},
    setData(update) {
      this.data = { ...this.data, ...(update || {}) };
    },
    applyLobbyPatch(update) {
      this.setData(update);
      return update;
    }
  };

  try {
    await profileActions.resolveDisplayPlayersAvatars.call(ctx);

    assert.deepEqual(ctx.data.displayPlayers, [
      {
        id: 'p_a',
        name: '球友A',
        avatarRaw: 'cloud://avatar/a',
        avatarDisplay: ''
      }
    ]);
  } finally {
    global.wx = originalWx;
  }
});

test('lobby avatar resolution ignores stale async write-back from an older player list', async () => {
  const originalWx = global.wx;
  const first = createDeferred();
  const second = createDeferred();

  global.wx = {
    cloud: {
      getTempFileURL({ fileList }) {
        const key = String((fileList || [])[0] || '');
        if (key === 'cloud://avatar/a') return first.promise;
        if (key === 'cloud://avatar/b') return second.promise;
        return Promise.resolve({ fileList: [] });
      }
    }
  };

  const ctx = {
    data: {
      displayPlayers: [
        { id: 'p_a', name: '球友A', avatarRaw: 'cloud://avatar/a', avatarDisplay: '' }
      ]
    },
    avatarCache: {},
    setData(update) {
      this.data = { ...this.data, ...(update || {}) };
    },
    applyLobbyPatch(update) {
      this.setData(update);
      return update;
    }
  };

  try {
    const staleTask = profileActions.resolveDisplayPlayersAvatars.call(ctx);
    ctx.data.displayPlayers = [
      { id: 'p_b', name: '球友B', avatarRaw: 'cloud://avatar/b', avatarDisplay: '' }
    ];
    const freshTask = profileActions.resolveDisplayPlayersAvatars.call(ctx);

    second.resolve({
      fileList: [
        { fileID: 'cloud://avatar/b', tempFileURL: 'https://tmp.example/b.png' }
      ]
    });
    await freshTask;

    first.resolve({
      fileList: [
        { fileID: 'cloud://avatar/a', tempFileURL: 'https://tmp.example/a.png' }
      ]
    });
    await staleTask;

    assert.deepEqual(ctx.data.displayPlayers, [
      {
        id: 'p_b',
        name: '球友B',
        avatarRaw: 'cloud://avatar/b',
        avatarDisplay: 'https://tmp.example/b.png'
      }
    ]);
    assert.equal(avatarDisplay.getCachedAvatarUrl(ctx.avatarCache, 'cloud://avatar/b'), 'https://tmp.example/b.png');
  } finally {
    global.wx = originalWx;
  }
});

// --- P4: preserve existing avatar display during resolution ---

test('lobby avatar resolution keeps existing avatarDisplay on cache miss', async () => {
  const originalWx = global.wx;
  global.wx = {
    cloud: {
      async getTempFileURL() {
        return { fileList: [{ fileID: 'cloud://avatar/a', tempFileURL: 'https://tmp.example/a_new.png', status: 0 }] };
      }
    }
  };

  const ctx = {
    data: {
      displayPlayers: [
        { id: 'p_a', name: '球友A', avatarRaw: 'cloud://avatar/a', avatarDisplay: 'https://tmp.example/a_old.png' }
      ]
    },
    avatarCache: {},
    setData(update) {
      this.data = { ...this.data, ...(update || {}) };
    },
    applyLobbyPatch(update) {
      this.setData(update);
      return update;
    }
  };

  try {
    await profileActions.resolveDisplayPlayersAvatars.call(ctx);

    // Should have updated to the new resolved url, not cleared
    assert.equal(ctx.data.displayPlayers[0].avatarDisplay, 'https://tmp.example/a_new.png');
    assert.equal(ctx.data.displayPlayers[0].avatarRaw, 'cloud://avatar/a');
  } finally {
    global.wx = originalWx;
  }
});

test('lobby avatar resolution keeps existing display when resolve fails', async () => {
  const originalWx = global.wx;
  global.wx = {
    cloud: {
      async getTempFileURL() {
        throw new Error('network failed');
      }
    }
  };

  const ctx = {
    data: {
      displayPlayers: [
        { id: 'p_a', name: '球友A', avatarRaw: 'cloud://avatar/a', avatarDisplay: 'https://tmp.example/a_old.png' }
      ]
    },
    avatarCache: {},
    setData(update) {
      this.data = { ...this.data, ...(update || {}) };
    },
    applyLobbyPatch(update) {
      this.setData(update);
      return update;
    }
  };

  try {
    await profileActions.resolveDisplayPlayersAvatars.call(ctx);

    // Should keep the old display value, not clear to ''
    assert.equal(ctx.data.displayPlayers[0].avatarDisplay, 'https://tmp.example/a_old.png');
    assert.equal(ctx.data.displayPlayers[0].avatarRaw, 'cloud://avatar/a');
  } finally {
    global.wx = originalWx;
  }
});

test('buildDisplayPlayers inherits avatarDisplay from prev list for same avatarRaw', () => {
  const prev = [
    { id: 'p_a', name: '球友A', avatarRaw: 'cloud://avatar/a', avatarDisplay: 'https://tmp.example/a.png' }
  ];
  const players = viewModel.buildDisplayPlayers([{
    id: 'p_a',
    name: '球友A',
    avatar: 'cloud://avatar/a'
  }], {}, prev);

  assert.equal(players[0].avatarRaw, 'cloud://avatar/a');
  assert.equal(players[0].avatarDisplay, 'https://tmp.example/a.png');
});

test('buildDisplayPlayers prefers cache over prev list inheritance', () => {
  const prev = [
    { id: 'p_a', name: '球友A', avatarRaw: 'cloud://avatar/a', avatarDisplay: 'https://tmp.example/prev.png' }
  ];
  const cache = { 'cloud://avatar/a': { url: 'https://tmp.example/cached.png', expiresAt: Date.now() + 3600000 } };
  const players = viewModel.buildDisplayPlayers([{
    id: 'p_a',
    name: '球友A',
    avatar: 'cloud://avatar/a'
  }], cache, prev);

  assert.equal(players[0].avatarDisplay, 'https://tmp.example/cached.png');
});

test('onDisplayPlayerAvatarError drops bad cached url and schedules re-resolve', () => {
  const cache = {};
  avatarDisplay.setCachedAvatarUrl(cache, 'cloud://avatar/keep', 'https://temp/good.png', {
    now: Date.now(),
    ttlMs: 3000000
  });
  let resolveCalled = false;

  const ctx = {
    data: {
      displayPlayers: [
        { id: 'p_a', name: '球友A', avatarRaw: 'cloud://avatar/keep', avatarDisplay: 'https://temp/good.png' }
      ]
    },
    avatarCache: cache,
    setData(update) {
      this.data = { ...this.data, ...(update || {}) };
    },
    applyLobbyPatch(update) {
      this.setData(update);
      return update;
    },
    resolveDisplayPlayersAvatars() {
      resolveCalled = true;
    }
  };

  profileActions.onDisplayPlayerAvatarError.call(ctx, {
    currentTarget: { dataset: { avatarRaw: 'cloud://avatar/keep' } }
  });

  assert.equal(ctx.data.displayPlayers[0].avatarDisplay, '');
  assert.equal(avatarDisplay.getCachedAvatarUrl(cache, 'cloud://avatar/keep'), '');
  assert.equal(avatarDisplay.shouldResolveCloudAvatarFileId('cloud://avatar/keep', cache), true);
  assert.equal(resolveCalled, true);
});

test('lobby avatar resolution refreshes a cloud avatar after image error', async () => {
  const originalWx = global.wx;
  const cache = {};
  avatarDisplay.setCachedAvatarUrl(cache, 'cloud://avatar/retry', 'https://temp/bad.png', {
    now: Date.now(),
    ttlMs: 3000000
  });
  avatarDisplay.markAvatarUrlFailed(cache, 'cloud://avatar/retry');

  global.wx = {
    cloud: {
      async getTempFileURL() {
        return {
          fileList: [
            { fileID: 'cloud://avatar/retry', tempFileURL: 'https://temp/fresh.png', status: 0 }
          ]
        };
      }
    }
  };

  const ctx = {
    data: {
      displayPlayers: [
        { id: 'p_a', name: '球友A', avatarRaw: 'cloud://avatar/retry', avatarDisplay: '' }
      ]
    },
    avatarCache: cache,
    setData(update) {
      this.data = { ...this.data, ...(update || {}) };
    },
    applyLobbyPatch(update) {
      this.setData(update);
      return update;
    }
  };

  try {
    await profileActions.resolveDisplayPlayersAvatars.call(ctx);
    assert.equal(ctx.data.displayPlayers[0].avatarDisplay, 'https://temp/fresh.png');
    assert.equal(avatarDisplay.getCachedAvatarUrl(cache, 'cloud://avatar/retry'), 'https://temp/fresh.png');
  } finally {
    global.wx = originalWx;
  }
});
