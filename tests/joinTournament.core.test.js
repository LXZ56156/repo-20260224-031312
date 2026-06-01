const test = require('node:test');
const assert = require('node:assert/strict');

const cloud = require('../miniprogram/core/cloud');
const joinTournamentCore = require('../miniprogram/core/joinTournament');
const storage = require('../miniprogram/core/storage');

test('joinTournament core builds payload from profile and local fallback consistently', () => {
  const originalGetUserProfile = storage.getUserProfile;
  storage.getUserProfile = () => ({
    nickName: '本地昵称',
    avatar: 'cloud://avatar-local',
    gender: 'female'
  });

  try {
    const payload = joinTournamentCore.buildJoinPayload({
      tournamentId: 't_1',
      mode: 'squad_doubles',
      squadChoice: 'b',
      profile: {
        nickName: '云端昵称',
        gender: 'male'
      }
    });

    assert.deepEqual(payload, {
      tournamentId: 't_1',
      nickname: '云端昵称',
      avatar: 'cloud://avatar-local',
      gender: 'male',
      squadChoice: 'B'
    });
  } finally {
    storage.getUserProfile = originalGetUserProfile;
  }
});

test('joinTournament core never forwards persisted wxfile avatar paths', () => {
  const originalGetUserProfile = storage.getUserProfile;
  storage.getUserProfile = () => ({
    nickName: '本地昵称',
    avatar: 'wxfile://tmp/local.png',
    gender: 'female'
  });

  try {
    const payload = joinTournamentCore.buildJoinPayload({
      tournamentId: 't_1',
      avatar: 'http://tmp/devtools.png',
      profile: {
        avatar: 'https://avatar.example/profile.png'
      }
    });

    assert.equal(payload.avatar, 'https://avatar.example/profile.png');
  } finally {
    storage.getUserProfile = originalGetUserProfile;
  }
});

test('joinTournament core retries version conflicts once and returns success', async () => {
  const originalCall = cloud.call;
  const calls = [];

  cloud.call = async (_name, payload) => {
    calls.push(payload);
    if (calls.length === 1) {
      return { ok: false, code: 'VERSION_CONFLICT', message: '写入冲突' };
    }
    return { ok: true };
  };

  try {
    const result = await joinTournamentCore.callJoinTournament({ tournamentId: 't_1' }, {
      action: 'join',
      fallbackMessage: '加入失败'
    });
    assert.deepEqual(result, { ok: true });
    assert.equal(calls.length, 2);
    assert.equal(calls[0].action, 'join');
    assert.equal(calls[1].action, 'join');
  } finally {
    cloud.call = originalCall;
  }
});

test('joinTournament core forwards profile_update action to cloud function', async () => {
  const originalCall = cloud.call;
  const calls = [];

  cloud.call = async (_name, payload) => {
    calls.push(payload);
    return { ok: true };
  };

  try {
    const result = await joinTournamentCore.callJoinTournament({ tournamentId: 't_1' }, {
      action: 'profile_update',
      fallbackMessage: '保存失败'
    });
    assert.deepEqual(result, { ok: true });
    assert.equal(calls.length, 1);
    assert.equal(calls[0].action, 'profile_update');
    assert.match(calls[0].clientRequestId, /^join_profile_/);
  } finally {
    cloud.call = originalCall;
  }
});
