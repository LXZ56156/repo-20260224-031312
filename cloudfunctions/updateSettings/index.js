const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;
const common = require('./lib/common');
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
  const tournamentId = String((event && event.tournamentId) || '').trim();
  const nameProvided = !!(event && Object.prototype.hasOwnProperty.call(event, 'name'));
  const normalizedName = normalizeTournamentName(event && event.name);
  const totalMatches = parsePosInt(event && event.totalMatches);
  // 并行场地（每轮最多场数）上限 10
  const courts = parsePosInt(event && event.courts, 10);
  const allowOpenTeamInput = event && Object.prototype.hasOwnProperty.call(event, 'allowOpenTeam')
    ? event.allowOpenTeam === true
    : null;
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
  if (nameProvided && !normalizedName) {
    return common.failResult('SETTINGS_INVALID', '赛事名称不能为空', { traceId, state: 'invalid' });
  }

  try {
    return await db.runTransaction(async (transaction) => {
      const docRes = await transaction.collection('tournaments').doc(tournamentId).get();
      const t = common.assertTournamentExists(docRes.data);
      common.assertCreator(t, OPENID);
      common.assertDraft(t, '非草稿阶段不可修改');

      const players = Array.isArray(t.players) ? t.players : [];
      const mode = String(t.mode || 'multi_rotate').trim().toLowerCase();
      const allowOpenTeam = allowOpenTeamInput === null ? (t.allowOpenTeam === true) : allowOpenTeamInput;
      const checked = validateSettings(players, totalMatches, courts, mode, allowOpenTeam, t.pairTeams || []);
      const oldVersion = Number(t.version) || 1;
      const currentRules = (t.rules && typeof t.rules === 'object') ? t.rules : {};
      const currentEndCondition = (currentRules.endCondition && typeof currentRules.endCondition === 'object')
        ? currentRules.endCondition
        : {};
      const resolvedTotalMatches = checked.patch.totalMatches || Number(t.totalMatches) || 1;
      const resolvedEndConditionType = mode === 'squad_doubles'
        ? (endConditionTypeInput || normalizeEndConditionType(currentEndCondition.type))
        : 'total_matches';
      const resolvedEndConditionTarget = resolvedEndConditionType === 'total_matches'
        ? resolvedTotalMatches
        : parseTargetInt(
          endConditionTargetInput,
          currentEndCondition.target || resolvedTotalMatches
        );
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
      if (nameProvided) data.name = normalizedName;
      if (allowOpenTeamInput !== null) {
        data.allowOpenTeam = allowOpenTeamInput;
      }
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
      return common.okResult('SETTINGS_UPDATED', '已保存比赛参数', {
        traceId,
        state: 'updated',
        version: oldVersion + 1
      });
    });
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
    message.includes('人数') ||
    message.includes('队伍') ||
    message.includes('结束条件')
  ) {
    return common.failResult('SETTINGS_INVALID', message, { traceId, state: 'invalid' });
  }
  return null;
}
