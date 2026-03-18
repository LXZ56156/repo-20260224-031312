const cloud = require('./cloud');
const actionGuard = require('./actionGuard');
const clientRequest = require('./clientRequest');
const joinError = require('./joinTournamentError');
const storage = require('./storage');
const profileCore = require('./profile');

function buildJoinPayload(options = {}) {
  const profile = options.profile && typeof options.profile === 'object' ? options.profile : {};
  const localProfile = options.localProfile && typeof options.localProfile === 'object'
    ? options.localProfile
    : (storage.getUserProfile() || {});
  const nickname = String(options.nickname || '').trim()
    || storage.getProfileNickName(profile)
    || storage.getProfileNickName(localProfile);
  const avatar = String(options.avatar || '').trim()
    || String(profile.avatar || profile.avatarUrl || '').trim()
    || String(localProfile.avatar || localProfile.avatarUrl || '').trim();
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
  return profileCore.ensureProfileForAction(action, redirect);
}

async function callJoinTournament(payload, options = {}) {
  const action = String(options.action || 'join').trim() || 'join';
  const fallbackMessage = options.fallbackMessage || '加入失败，请稍后重试';
  const tournamentId = String((payload && payload.tournamentId) || '').trim();
  const guardKey = `core:joinTournament:${tournamentId}`;
  const clientRequestId = clientRequest.resolveClientRequestId(
    options.clientRequestId || (payload && payload.clientRequestId),
    action === 'profile_update' ? 'join_profile' : 'join'
  );
  const requestPayload = {
    ...(payload && typeof payload === 'object' ? payload : {}),
    clientRequestId
  };
  if (actionGuard.isBusy(guardKey)) return { ok: true, deduped: true, clientRequestId };
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
