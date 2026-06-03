const crypto = require('node:crypto');
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();
const common = require('./lib/common');
const playerHelper = require('./lib/player');

const SHARE_ENTRY_PAGE = 'pages/share-entry/index';
const SHARE_CODE_WIDTH = 280;
const SHARE_SCENE_PATTERN = /^[0-9A-Za-z!#$&'()*+,/:;=?@._~-]{1,32}$/;

function ok(traceId, code, message, extra = {}) {
  return common.okResult(code, message, {
    traceId,
    ...extra
  });
}

function fail(traceId, code, message, extra = {}) {
  return common.failResult(code, message, {
    traceId,
    ...extra
  });
}

function normalizeEnvVersion(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'develop' || normalized === 'trial') return normalized;
  return 'release';
}

function canGenerateShareCode(tournament, openid) {
  const oid = String(openid || '').trim();
  if (!oid || !tournament || typeof tournament !== 'object') return false;
  if (String(tournament.creatorId || '').trim() === oid) return true;
  return playerHelper.isParticipantInTournament(tournament, oid);
}

function buildCloudPath(tournamentId, envVersion) {
  const digest = crypto.createHash('sha1')
    .update(`${String(tournamentId || '').trim()}\n${String(envVersion || '').trim()}`)
    .digest('hex');
  return `share-codes/${envVersion}/${digest}.png`;
}

function extractCodeBuffer(result) {
  if (Buffer.isBuffer(result)) return result;
  if (result && Buffer.isBuffer(result.buffer)) return result.buffer;
  return null;
}

async function readTournament(tournamentId) {
  try {
    const result = await db.collection('tournaments').doc(tournamentId).get();
    return result && result.data ? result.data : null;
  } catch (err) {
    if (common.isDocNotExists(err)) return null;
    throw err;
  }
}

async function createShareCode(scene, envVersion) {
  const api = cloud && cloud.openapi && cloud.openapi.wxacode;
  if (!api || typeof api.getUnlimited !== 'function') {
    throw new Error('wxacode.getUnlimited unavailable');
  }
  const result = await api.getUnlimited({
    page: SHARE_ENTRY_PAGE,
    scene,
    checkPath: envVersion === 'release',
    envVersion,
    width: SHARE_CODE_WIDTH
  });
  const buffer = extractCodeBuffer(result);
  if (!buffer || !buffer.length) {
    throw new Error('wxacode.getUnlimited returned empty buffer');
  }
  return buffer;
}

exports.main = async (event) => {
  const wxContext = cloud.getWXContext();
  const openid = String((wxContext && wxContext.OPENID) || '').trim();
  const traceId = String((event && event.__traceId) || '').trim();
  const tournamentId = String((event && event.tournamentId) || '').trim();
  const envVersion = normalizeEnvVersion(event && event.envVersion);
  console.info('[generateShareCode]', traceId || '-', tournamentId || '-', envVersion);

  if (!tournamentId) {
    return fail(traceId, 'TOURNAMENT_ID_REQUIRED', '缺少 tournamentId', {
      state: 'invalid'
    });
  }
  if (!SHARE_SCENE_PATTERN.test(tournamentId)) {
    return fail(traceId, 'SHARE_CODE_SCENE_INVALID', '赛事标识无法用于生成小程序码', {
      state: 'invalid'
    });
  }

  const tournament = await readTournament(tournamentId);
  if (!tournament) {
    return fail(traceId, 'TOURNAMENT_NOT_FOUND', '赛事不存在', {
      state: 'not_found'
    });
  }
  if (!canGenerateShareCode(tournament, openid)) {
    return fail(traceId, 'PERMISSION_DENIED', '仅创建者或已加入的玩家可生成分享卡片', {
      state: 'forbidden'
    });
  }

  const fileContent = await createShareCode(tournamentId, envVersion);
  if (!cloud || typeof cloud.uploadFile !== 'function') {
    throw new Error('cloud.uploadFile unavailable');
  }
  const cloudPath = buildCloudPath(tournamentId, envVersion);
  const uploaded = await cloud.uploadFile({
    cloudPath,
    fileContent
  });
  const fileID = String((uploaded && uploaded.fileID) || '').trim();
  if (!fileID) {
    throw new Error('cloud.uploadFile returned empty fileID');
  }

  return ok(traceId, 'SHARE_CODE_READY', '小程序码已准备', {
    state: 'ready',
    fileID
  });
};

exports._private = {
  SHARE_ENTRY_PAGE,
  SHARE_CODE_WIDTH,
  normalizeEnvVersion,
  canGenerateShareCode,
  buildCloudPath,
  extractCodeBuffer
};
