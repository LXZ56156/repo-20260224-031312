const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const common = require('./lib/common');
const modeHelper = require('./lib/mode');

async function ensureTournamentsCollection() {
  try {
    if (typeof db.createCollection === 'function') {
      await db.createCollection('tournaments');
    }
  } catch (_) {}
}

function intOr(v, d, maxV) {
  const n = Number(v);
  if (!Number.isFinite(n)) return d;
  const nn = Math.floor(n);
  if (nn < 1) return d;
  return Number.isFinite(maxV) ? Math.min(nn, maxV) : nn;
}

function normalizeGender(gender) {
  const v = String(gender || '').trim().toLowerCase();
  if (v === 'male' || v === 'female') return v;
  return 'unknown';
}

function normalizePoints(points) {
  const p = Number(points);
  if (p === 11 || p === 15 || p === 21) return p;
  return 21;
}

function normalizeEndConditionType(type) {
  const v = String(type || '').trim().toLowerCase();
  if (v === 'total_matches' || v === 'total_rounds' || v === 'target_wins') return v;
  return 'total_matches';
}

exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext();
  const traceId = String((event && event.__traceId) || '').trim();
  const clientRequestId = String((event && event.clientRequestId) || '').trim();
  const nickname = String((event && event.nickname) || '').trim();
  const avatar = String((event && (event.avatar || event.avatarUrl)) || '').trim();
  const preset = modeHelper.resolveRotationPreset(event && event.presetKey);
  const presetKey = preset ? preset.key : 'custom';
  const mode = preset ? modeHelper.MODE_MULTI_ROTATE : modeHelper.normalizeMode(event && event.mode);
  const name = modeHelper.getSynchronizedTournamentName(event && event.name, mode, presetKey);
  const creatorGender = normalizeGender(event && event.creatorGender);
  if (!name) {
    return common.failResult('SETTINGS_INVALID', '赛事名称不能为空', {
      traceId,
      state: 'invalid',
      ...(clientRequestId ? { clientRequestId } : {})
    });
  }

  await ensureTournamentsCollection();
  if (clientRequestId) {
    await common.ensureCollection(db, common.CLIENT_REQUEST_LOG_COLLECTION);
  }

  const requestLogOptions = {
    scope: 'create_tournament',
    subjectKey: `creator:${OPENID}`,
    operatorOpenId: OPENID,
    clientRequestId
  };

  const defaultTotalMatches = preset ? preset.defaultTotalMatches : 1;
  const rules = {
    gamesPerMatch: 1,
    pointsPerGame: normalizePoints(21),
    endCondition: {
      type: normalizeEndConditionType('total_matches'),
      target: defaultTotalMatches
    },
    unfinishedPolicy: 'admin_decide'
  };
  // Product requirement: do not expose openid fragments as the default displayed name.
  // If user does not provide a nickname, default to a friendly sequential name.
  const creatorPlayer = {
    id: OPENID,
    name: nickname || '球员1',
    type: 'user',
    avatar: avatar || '',
    gender: creatorGender,
    squad: ''
  };

  try {
    return await common.runTransactionCompat(db, async (transaction) => {
      if (clientRequestId) {
        const requestLog = await common.getClientRequestLog(transaction, requestLogOptions);
        if (common.isSuccessfulClientRequestLog(requestLog) && String(requestLog.resourceId || '').trim()) {
          return common.okResult('TOURNAMENT_CREATED', '已创建比赛', {
            traceId,
            state: 'deduped',
            deduped: true,
            ...(clientRequestId ? { clientRequestId } : {}),
            tournamentId: String(requestLog.resourceId || '').trim()
          });
        }
      }

      const data = {
        name,
        status: 'draft',
        creatorId: OPENID,
        mode,
        refereeId: '',
        presetKey,
        ...(preset ? { playerLimit: preset.playerLimit } : {}),
        settingsConfigured: !!preset,
        totalMatches: preset ? preset.defaultTotalMatches : 0,
        courts: preset ? preset.defaultCourts : 0,
        rules,
        players: [creatorPlayer],
        playerIds: [OPENID],
        pairTeams: [],
        rounds: [],
        rankings: [],
        scheduleSeed: null,
        fairnessScore: 0,
        // Avoid nested-object updates causing DB dot-path conflicts.
        fairnessJson: '',
        playerStatsJson: '',
        createdAt: db.serverDate(),
        updatedAt: db.serverDate(),
        version: 1
      };
      if (clientRequestId) data.clientRequestId = clientRequestId;
      common.assertNoReservedRootKeys(data, ['_id'], '赛事创建数据');
      const res = await transaction.collection('tournaments').add({
        data
      });
      const tournamentId = String(res && res._id || '').trim();
      if (clientRequestId) {
        await common.upsertClientRequestLog(transaction, db, {
          ...requestLogOptions,
          status: 'succeeded',
          resourceType: 'tournament',
          resourceId: tournamentId,
          responseCode: 'TOURNAMENT_CREATED',
          responseState: 'created'
        });
      }
      return common.okResult('TOURNAMENT_CREATED', '已创建比赛', {
        state: 'created',
        traceId,
        ...(clientRequestId ? { clientRequestId } : {}),
        tournamentId
      });
    });
  } catch (err) {
    if (clientRequestId) {
      const requestLog = await common.getClientRequestLog(db, requestLogOptions);
      if (common.isSuccessfulClientRequestLog(requestLog) && String(requestLog.resourceId || '').trim()) {
        return common.okResult('TOURNAMENT_CREATED', '已创建比赛', {
          traceId,
          state: 'deduped',
          deduped: true,
          ...(clientRequestId ? { clientRequestId } : {}),
          tournamentId: String(requestLog.resourceId || '').trim()
        });
      }
    }
    if (common.isCollectionNotExists(err)) {
      throw new Error('数据库集合 tournaments 不存在：请在云开发控制台（数据库 -> 创建集合）创建 tournaments 后再试。');
    }
    throw err;
  }
};
