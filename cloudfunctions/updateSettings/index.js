const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;
const common = require('./lib/common');
const modeHelper = require('./lib/mode');
const shareActivity = require('./lib/share-activity');
const {
  parsePosInt,
  parseTargetInt,
  validateSettings,
  normalizeGender,
  normalizeTournamentName,
  normalizePoints,
  normalizeEndConditionType
} = require('./logic');

exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext();
  const traceId = String((event && event.__traceId) || '').trim();
  const clientRequestId = String((event && event.clientRequestId) || '').trim();
  const tournamentId = String((event && event.tournamentId) || '').trim();
  const nameProvided = !!(event && Object.prototype.hasOwnProperty.call(event, 'name'));
  const normalizedName = normalizeTournamentName(event && event.name);
  const totalMatches = parsePosInt(event && event.totalMatches);
  // 并行场地（每轮最多场数）上限 10
  const courts = parsePosInt(event && event.courts, 10);
  const pointsPerGame = event && Object.prototype.hasOwnProperty.call(event, 'pointsPerGame')
    ? normalizePoints(event.pointsPerGame)
    : null;
  const endConditionTypeInput = event && Object.prototype.hasOwnProperty.call(event, 'endConditionType')
    ? normalizeEndConditionType(event.endConditionType)
    : null;
  const endConditionTargetInput = event && Object.prototype.hasOwnProperty.call(event, 'endConditionTarget')
    ? parseTargetInt(event.endConditionTarget, 1)
    : null;
  const playerGenderPatch = (event && typeof event.playerGenderPatch === 'object' && event.playerGenderPatch)
    ? event.playerGenderPatch
    : null;
  if (!tournamentId) {
    return common.failResult('TOURNAMENT_ID_REQUIRED', '缺少 tournamentId', { traceId, state: 'invalid' });
  }
  let shareUpdateTournament = null;
  try {
    const result = await db.runTransaction(async (transaction) => {
      const docRes = await transaction.collection('tournaments').doc(tournamentId).get();
      const t = common.assertTournamentExists(docRes.data);
      common.assertCreator(t, OPENID);
      common.assertDraft(t, '非草稿阶段不可修改');
      if (clientRequestId && String(t.lastClientRequestId || '').trim() === clientRequestId) {
        return common.okResult('SETTINGS_UPDATED', '已保存比赛参数', {
          traceId,
          state: 'deduped',
          deduped: true,
          clientRequestId,
          version: Number(t.version) || 1
        });
      }

      const players = Array.isArray(t.players) ? t.players : [];
      const fixedRotationPreset = modeHelper.resolveRotationPreset(t.presetKey);
      const syncedName = nameProvided
        ? modeHelper.getSynchronizedTournamentName(normalizedName, t.mode || modeHelper.MODE_MULTI_ROTATE, t.presetKey)
        : '';
      if (nameProvided && !syncedName) {
        throw new Error('赛事名称不能为空');
      }
      const wantsParamConfig = totalMatches !== null
        || courts !== null
        || pointsPerGame !== null
        || endConditionTypeInput !== null
        || endConditionTargetInput !== null;
      if (wantsParamConfig && players.length < 4 && !fixedRotationPreset) {
        throw new Error('满 4 人后才可设置比赛参数');
      }
      const mode = String(t.mode || 'multi_rotate').trim().toLowerCase();
      const oldVersion = Number(t.version) || 1;
      const currentRules = (t.rules && typeof t.rules === 'object') ? t.rules : {};
      const currentEndCondition = (currentRules.endCondition && typeof currentRules.endCondition === 'object')
        ? currentRules.endCondition
        : {};
      const resolvedTotalMatches = totalMatches !== null ? totalMatches : (Number(t.totalMatches) || 1);
      const resolvedCourts = courts !== null ? courts : (Number(t.courts) || 1);
      const resolvedEndConditionType = mode === 'squad_doubles'
        ? (endConditionTypeInput || normalizeEndConditionType(currentEndCondition.type))
        : 'total_matches';
      const resolvedEndConditionTarget = resolvedEndConditionType === 'total_matches'
        ? resolvedTotalMatches
        : parseTargetInt(
          endConditionTargetInput,
          currentEndCondition.target || resolvedTotalMatches
        );
      const checked = validateSettings(players, totalMatches, courts, mode, t.pairTeams || [], {
        resolvedTotalMatches,
        resolvedCourts,
        endConditionType: resolvedEndConditionType,
        endConditionTarget: resolvedEndConditionTarget,
        presetKey: t.presetKey,
        playerLimit: t.playerLimit
      });
      const nextRules = {
        ...currentRules,
        gamesPerMatch: 1,
        pointsPerGame: pointsPerGame || normalizePoints(currentRules.pointsPerGame),
        endCondition: {
          type: resolvedEndConditionType,
          target: resolvedEndConditionTarget
        },
        unfinishedPolicy: String(currentRules.unfinishedPolicy || 'admin_decide')
      };

      const data = { updatedAt: db.serverDate(), version: _.inc(1) };
      Object.assign(data, checked.patch);
      if (clientRequestId) data.lastClientRequestId = clientRequestId;
      if (nameProvided) data.name = syncedName;
      if (nameProvided || pointsPerGame !== null || endConditionTypeInput !== null || endConditionTargetInput !== null || totalMatches !== null) {
        data.rules = nextRules;
      }
      if (playerGenderPatch) {
        const nextPlayers = players.map((player) => {
          const id = String(player && player.id || '');
          if (!id) return player;
          if (!Object.prototype.hasOwnProperty.call(playerGenderPatch, id)) return player;
          return { ...player, gender: normalizeGender(playerGenderPatch[id]) };
        });
        data.players = nextPlayers;
      }
      common.assertNoReservedRootKeys(data, ['_id'], '赛事设置更新数据');

      const updRes = await transaction.collection('tournaments').where({ _id: tournamentId, version: oldVersion }).update({ data });
      common.assertOptimisticUpdate(updRes, '写入冲突，请重试');
      shareUpdateTournament = {
        ...t,
        ...data,
        players: data.players || players
      };
      return common.okResult('SETTINGS_UPDATED', '已保存比赛参数', {
        traceId,
        state: 'updated',
        ...(clientRequestId ? { clientRequestId } : {}),
        version: oldVersion + 1
      });
    });
    if (result && result.ok && shareUpdateTournament) {
      await shareActivity.updateDraftMessageBestEffort(cloud, shareUpdateTournament, modeHelper, console, {
        db,
        source: 'updateSettings',
        tournamentId,
        traceId
      });
    }
    return result;
  } catch (err) {
    const mapped = mapUpdateSettingsFailure(err, traceId);
    if (mapped) return mapped;
    throw common.normalizeConflictError(err, '保存失败');
  }
};

function mapUpdateSettingsFailure(err, traceId = '') {
  const message = String((err && err.message) || '').trim();
  if (!message) return null;
  if (common.isConflictError(err)) {
    return common.failResult('VERSION_CONFLICT', '写入冲突，请重试', { traceId, state: 'conflict' });
  }
  if (message.includes('赛事不存在')) {
    return common.failResult('TOURNAMENT_NOT_FOUND', message, { traceId, state: 'not_found' });
  }
  if (message.includes('无权限')) {
    return common.failResult('PERMISSION_DENIED', message, { traceId, state: 'forbidden' });
  }
  if (message.includes('非草稿阶段不可修改')) {
    return common.failResult('SETTINGS_DRAFT_ONLY', message, { traceId, state: 'forbidden' });
  }
  if (
    message.includes('赛事名称') ||
    message.includes('总场次') ||
    message.includes('场地') ||
    message.includes('参数') ||
    message.includes('满 4 人') ||
    message.includes('人数') ||
    message.includes('名单') ||
    message.includes('成员') ||
    message.includes('队伍') ||
    message.includes('结束条件')
  ) {
    return common.failResult('SETTINGS_INVALID', message, { traceId, state: 'invalid' });
  }
  return null;
}
