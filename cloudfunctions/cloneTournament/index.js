const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();
const common = require('./lib/common');
const modeHelper = require('./lib/mode');
const logic = require('./logic');

function toPosInt(value, fallback = 0) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 1) return fallback;
  return Math.floor(n);
}

function buildClonePresetFields(source, mode) {
  if (mode !== modeHelper.MODE_MULTI_ROTATE) return {};
  const preset = modeHelper.resolveRotationPreset(source && source.presetKey);
  if (!preset) return { presetKey: modeHelper.PRESET_CUSTOM };
  return {
    presetKey: preset.key,
    playerLimit: preset.playerLimit
  };
}

exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext();
  const sourceTournamentId = String((event && event.sourceTournamentId) || '').trim();
  const traceId = String((event && event.__traceId) || '').trim();
  const clientRequestId = String((event && event.clientRequestId) || '').trim();
  const renamed = logic.normalizeName(event && event.name);

  if (!sourceTournamentId) {
    return common.failResult('SOURCE_TOURNAMENT_ID_REQUIRED', '缺少 sourceTournamentId', {
      traceId,
      state: 'invalid',
      ...(clientRequestId ? { clientRequestId } : {})
    });
  }

  if (clientRequestId) {
    await common.ensureCollection(db, common.CLIENT_REQUEST_LOG_COLLECTION);
  }
  const requestLogOptions = {
    scope: 'clone_tournament',
    subjectKey: `clone_source:${sourceTournamentId}`,
    operatorOpenId: OPENID,
    clientRequestId
  };

  try {
    return await common.runTransactionCompat(db, async (transaction) => {
      if (clientRequestId) {
        const requestLog = await common.getClientRequestLog(transaction, requestLogOptions);
        if (common.isSuccessfulClientRequestLog(requestLog) && String(requestLog.resourceId || '').trim()) {
          return common.okResult('TOURNAMENT_CLONED', '已复制赛事', {
            traceId,
            state: 'deduped',
            deduped: true,
            ...(clientRequestId ? { clientRequestId } : {}),
            tournamentId: String(requestLog.resourceId || '').trim()
          });
        }
      }

      const tournaments = transaction.collection('tournaments');
      let source = null;
      try {
        const docRes = await tournaments.doc(sourceTournamentId).get();
        source = docRes && docRes.data ? docRes.data : null;
      } catch (err) {
        if (common.isDocNotExists(err)) {
          return common.failResult('TOURNAMENT_NOT_FOUND', '赛事不存在', {
            traceId,
            state: 'not_found',
            ...(clientRequestId ? { clientRequestId } : {})
          });
        }
        throw err;
      }
      if (!source) {
        return common.failResult('TOURNAMENT_NOT_FOUND', '赛事不存在', {
          traceId,
          state: 'not_found',
          ...(clientRequestId ? { clientRequestId } : {})
        });
      }
      if (String(source.creatorId || '') !== String(OPENID || '')) {
        return common.failResult('PERMISSION_DENIED', '仅创建者可复制自己的赛事', {
          traceId,
          state: 'forbidden',
          ...(clientRequestId ? { clientRequestId } : {})
        });
      }

      const totalMatches = toPosInt(source.totalMatches, 0);
      const courts = toPosInt(source.courts, 0);
      const settingsConfigured = Boolean(source.settingsConfigured) && totalMatches >= 1 && courts >= 1;
      const nextName = renamed || `${logic.normalizeName(source.name) || '比赛'}（副本）`;
      const rules = source && source.rules && typeof source.rules === 'object'
        ? source.rules
        : { gamesPerMatch: 1, pointsPerGame: 21, endCondition: { type: 'total_matches', target: 1 }, unfinishedPolicy: 'admin_decide' };
      const modeRaw = String(source.mode || '').trim().toLowerCase();
      const mode = modeHelper.normalizeMode(modeRaw);
      const presetFields = buildClonePresetFields(source, mode);
      const copied = logic.copyPlayers(source.players, OPENID, undefined, {
        preserveSquad: mode === 'squad_doubles'
      });
      const players = copied.players;
      const playerIds = Array.from(new Set(players.map((item) => String(item && item.id || '').trim()).filter(Boolean)));
      const pairTeams = mode === 'fixed_pair_rr'
        ? logic.copyPairTeams(source.pairTeams, copied.playerIdMap)
        : [];
      const data = common.assertNoReservedRootKeys({
        name: nextName,
        status: 'draft',
        creatorId: OPENID,
        mode,
        ...presetFields,
        refereeId: '',
        settingsConfigured,
        totalMatches,
        courts,
        rules,
        players,
        playerIds,
        pairTeams,
        cloneSourceTournamentId: sourceTournamentId,
        clientRequestId,
        rounds: [],
        rankings: [],
        scheduleSeed: null,
        fairnessScore: 0,
        fairnessJson: '',
        playerStatsJson: '',
        schedulerMetaJson: '',
        createdAt: db.serverDate(),
        updatedAt: db.serverDate(),
        version: 1
      }, ['_id'], '赛事复制数据');

      const addRes = await tournaments.add({
        data
      });
      const tournamentId = String(addRes && addRes._id || '').trim();
      if (clientRequestId) {
        await common.upsertClientRequestLog(transaction, db, {
          ...requestLogOptions,
          status: 'succeeded',
          resourceType: 'tournament',
          resourceId: tournamentId,
          responseCode: 'TOURNAMENT_CLONED',
          responseState: 'created'
        });
      }

      return common.okResult('TOURNAMENT_CLONED', '已复制赛事', {
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
        return common.okResult('TOURNAMENT_CLONED', '已复制赛事', {
          traceId,
          state: 'deduped',
          deduped: true,
          ...(clientRequestId ? { clientRequestId } : {}),
          tournamentId: String(requestLog.resourceId || '').trim()
        });
      }
    }
    if (common.isDocNotExists(err) || String((err && err.message) || '').includes('赛事不存在')) {
      return common.failResult('TOURNAMENT_NOT_FOUND', '赛事不存在', {
        traceId,
        state: 'not_found',
        ...(clientRequestId ? { clientRequestId } : {})
      });
    }
    if (String((err && err.message) || '').includes('仅创建者可复制自己的赛事')) {
      return common.failResult('PERMISSION_DENIED', '仅创建者可复制自己的赛事', {
        traceId,
        state: 'forbidden',
        ...(clientRequestId ? { clientRequestId } : {})
      });
    }
    if (common.isConflictError(err)) {
      return common.failResult('VERSION_CONFLICT', '写入冲突，请刷新后重试', {
        traceId,
        state: 'conflict',
        ...(clientRequestId ? { clientRequestId } : {})
      });
    }
    throw common.normalizeConflictError(err, '复制赛事失败');
  }
};
