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
