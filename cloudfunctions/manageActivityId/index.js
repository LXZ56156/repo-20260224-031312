const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();
const common = require('./lib/common');
const modeHelper = require('./lib/mode');
const shareActivity = require('./lib/share-activity');

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

async function readTournament(tournamentId) {
  try {
    const docRes = await db.collection('tournaments').doc(tournamentId).get();
    return docRes && docRes.data ? docRes.data : null;
  } catch (err) {
    if (common.isDocNotExists(err)) return null;
    throw err;
  }
}

function buildReadyResult(traceId, tournament) {
  const activity = shareActivity.getActivity(tournament, { allowedStates: [0] });
  if (!activity) {
    return fail(traceId, 'SHARE_ACTIVITY_UNAVAILABLE', '动态分享暂不可用', {
      state: 'invalid'
    });
  }
  return ok(traceId, 'SHARE_ACTIVITY_READY', '动态分享已准备', {
    state: 'ready',
    activityId: activity.activityId,
    activityExpireTime: activity.expireAtMs
  });
}

function ensureCreatable(traceId, tournament) {
  if (!tournament) {
    return fail(traceId, 'TOURNAMENT_NOT_FOUND', '赛事不存在', {
      state: 'not_found'
    });
  }
  if (String(tournament.status || '') !== 'draft') {
    return fail(traceId, 'SHARE_ACTIVITY_DRAFT_ONLY', '仅未开赛赛事可使用动态分享', {
      state: 'forbidden'
    });
  }
  if (shareActivity.resolveRoomLimit(tournament, modeHelper) <= 0) {
    return fail(traceId, 'SHARE_ACTIVITY_LIMIT_REQUIRED', '无固定人数上限的赛事不使用动态分享', {
      state: 'invalid'
    });
  }
  return null;
}

async function createActivityId() {
  const api = cloud && cloud.openapi && cloud.openapi.updatableMessage;
  if (!api || typeof api.createActivityId !== 'function') {
    throw new Error('updatableMessage.createActivityId unavailable');
  }
  return api.createActivityId();
}

exports.main = async (event) => {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;
  const traceId = String((event && event.__traceId) || '').trim();
  const action = String((event && event.action) || 'getOrCreate').trim();
  const tournamentId = String((event && event.tournamentId) || '').trim();
  const versionType = shareActivity.normalizeVersionType(event && event.versionType);
  console.info('[manageActivityId]', traceId || '-', action || '-', tournamentId || '-', openid || '-');

  if (!tournamentId) {
    return fail(traceId, 'TOURNAMENT_ID_REQUIRED', '缺少 tournamentId', {
      state: 'invalid'
    });
  }
  if (action !== 'getOrCreate') {
    return fail(traceId, 'ACTION_INVALID', 'action 不合法', {
      state: 'invalid'
    });
  }

  try {
    const current = await readTournament(tournamentId);
    const unavailable = ensureCreatable(traceId, current);
    if (unavailable) return unavailable;
    if (shareActivity.isActivityUsable(current, { allowedStates: [0] })) {
      return buildReadyResult(traceId, current);
    }

    const now = Date.now();
    const created = await createActivityId();
    const createdActivityId = shareActivity.extractCreatedActivityId(created);
    if (!createdActivityId) {
      throw new Error('createActivityId returned empty activityId');
    }
    const expireAtMs = shareActivity.normalizeCreatedExpireAtMs(created, now);

    const committed = await db.runTransaction(async (transaction) => {
      const docRef = transaction.collection('tournaments').doc(tournamentId);
      const docRes = await docRef.get();
      const t = common.assertTournamentExists(docRes.data);
      const blocked = ensureCreatable(traceId, t);
      if (blocked) return blocked;
      if (shareActivity.isActivityUsable(t, { allowedStates: [0] })) {
        return buildReadyResult(traceId, t);
      }
      const patch = shareActivity.buildCreatedPatch(
        createdActivityId,
        expireAtMs,
        versionType,
        db.serverDate()
      );
      await docRef.update({
        data: common.assertNoReservedRootKeys(patch, ['_id'], '动态分享 activity 写入数据')
      });
      return ok(traceId, 'SHARE_ACTIVITY_READY', '动态分享已准备', {
        state: 'ready',
        activityId: createdActivityId,
        activityExpireTime: shareActivity.normalizeExpireAtMs(expireAtMs)
      });
    });

    return committed;
  } catch (err) {
    if (common.isDocNotExists(err) || String((err && err.message) || '').includes('赛事不存在')) {
      return fail(traceId, 'TOURNAMENT_NOT_FOUND', '赛事不存在', {
        state: 'not_found'
      });
    }
    if (common.isCollectionNotExists(err)) {
      throw new Error('数据库集合 tournaments 不存在：请在云开发控制台创建 tournaments 后再试。');
    }
    throw common.normalizeConflictError(err, '动态分享准备失败');
  }
};
