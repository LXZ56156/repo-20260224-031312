const cloud = require('./cloud');
const actionGuard = require('./actionGuard');
const clientRequest = require('./clientRequest');
const joinError = require('./joinTournamentError');
const storage = require('./storage');
const profileCore = require('./profile');
const avatarPolicy = require('./avatarPolicy');

function buildJoinPayload(options = {}) {
  const profile = options.profile && typeof options.profile === 'object' ? options.profile : {};
  const localProfile = options.localProfile && typeof options.localProfile === 'object'
    ? options.localProfile
    : (storage.getUserProfile() || {});
  const nickname = String(options.nickname || '').trim()
    || storage.getProfileNickName(profile)
    || storage.getProfileNickName(localProfile);
  const avatar = [
    options.avatar,
    profile.avatar,
    profile.avatarUrl,
    localProfile.avatar,
    localProfile.avatarUrl
  ].map(avatarPolicy.normalizePersistableAvatar).find(Boolean) || '';
  const gender = storage.normalizeGender(
    options.gender || profile.gender || localProfile.gender || 'unknown'
  );
  const mode = String(options.mode || '').trim();
  const squadChoice = mode === 'squad_doubles'
    ? String(options.squadChoice || 'A').trim().toUpperCase()
    : '';

  return {
    tournamentId: String(options.tournamentId || '').trim(),
    nickname,
    avatar,
    gender,
    squadChoice
  };
}

async function ensureJoinProfile(options = {}) {
  const action = String(options.action || 'join').trim() || 'join';
  const redirect = String(options.redirect || '').trim();
  return profileCore.ensureProfileForAction(action, redirect, { silent: options.silent === true });
}

function callJoinTournament(payload, options = {}) {
  const action = String(options.action || 'join').trim() || 'join';
  const fallbackMessage = options.fallbackMessage || '加入失败，请稍后重试';
  const tournamentId = String((payload && payload.tournamentId) || '').trim();
  const guardKey = `core:joinTournament:${tournamentId}:${action}`;
  const clientRequestId = clientRequest.resolveClientRequestId(
    options.clientRequestId || (payload && payload.clientRequestId),
    action === 'profile_update' ? 'join_profile' : 'join'
  );
  const requestPayload = {
    ...(payload && typeof payload === 'object' ? payload : {}),
    action,
    clientRequestId
  };
  return actionGuard.runCriticalWrite(guardKey, async () => {
    let res = await cloud.call('joinTournament', requestPayload);
    if (res && res.ok === false && joinError.isConflictResult(res) && options.retryOnConflict !== false) {
      res = await cloud.call('joinTournament', requestPayload);
    }
    if (res && res.ok === false) {
      throw joinError.normalizeJoinFailure(res, fallbackMessage, { action });
    }
    return res;
  });
}

module.exports = {
  buildJoinPayload,
  ensureJoinProfile,
  callJoinTournament
};
