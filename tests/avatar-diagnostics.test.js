const test = require('node:test');
const assert = require('node:assert/strict');

const avatarDiagnostics = require('../miniprogram/core/avatarDiagnostics');

test('avatar diagnostics scans players, rounds and rankings without mutating tournament data', () => {
  const tournament = {
    _id: 't_avatar',
    version: 3,
    players: [
      { id: 'u_empty', avatar: '' },
      { id: 'u_wxfile', avatar: 'wxfile://tmp/avatar.png' },
      { id: 'u_cloud', avatar: 'cloud://avatars/u_cloud.png' }
    ],
    rounds: [{
      matches: [{
        teamA: [{ id: 'u_tmp', avatar: 'http://tmp/avatar.png' }],
        teamB: [{ id: 'u_http', avatar: 'https://avatar.example/u_http.png' }]
      }],
      restPlayers: [{ id: 'u_invalid', avatar: 'local-avatar.png' }]
    }],
    rankings: [
      { playerId: 'u_rank', avatar: 'file://tmp/rank.png' }
    ]
  };

  const before = JSON.stringify(tournament);
  const report = avatarDiagnostics.scanTournamentAvatarIssues(tournament);

  assert.equal(JSON.stringify(tournament), before);
  assert.deepEqual(report.emptyAvatars.map((item) => item.location), ['players[0]']);
  assert.deepEqual(report.temporaryAvatars.map((item) => item.location), [
    'players[1]',
    'rounds[0].matches[0].teamA[0]',
    'rankings[0]'
  ]);
  assert.deepEqual(report.unsupportedAvatars.map((item) => item.location), [
    'rounds[0].restPlayers[0]'
  ]);
  assert.deepEqual(report.cloudAvatars.map((item) => item.avatar), [
    'cloud://avatars/u_cloud.png'
  ]);
});

test('avatar diagnostics reports cloud avatars whose getTempFileURL lookup fails', async () => {
  const originalWx = global.wx;
  const originalWarn = console.warn;
  const warnings = [];
  global.wx = {
    cloud: {
      async getTempFileURL() {
        return {
          fileList: [{
            fileID: 'cloud://avatars/missing.png',
            tempFileURL: '',
            status: -1,
            errMsg: 'permission denied'
          }]
        };
      }
    }
  };
  console.warn = (...args) => warnings.push(args);

  try {
    const report = await avatarDiagnostics.diagnoseTournamentAvatars({
      _id: 't_avatar',
      version: 1,
      players: [{ id: 'u_missing', avatar: 'cloud://avatars/missing.png' }],
      rounds: [],
      rankings: []
    });

    assert.deepEqual(report.cloudResolveFailed, ['cloud://avatars/missing.png']);
    assert.equal(warnings.some(([message]) => message === '[avatar] tournament diagnostic'), true);
  } finally {
    global.wx = originalWx;
    console.warn = originalWarn;
  }
});
