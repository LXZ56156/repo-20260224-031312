const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();
const _ = db.command;
const logic = require('./logic');
const modeHelper = require('./lib/mode');
const common = require('./lib/common');

function normalizeTeamSignature(team) {
  const ids = Array.isArray(team && team.playerIds) ? team.playerIds : [];
  return ids.map((id) => String(id || '').trim()).filter(Boolean).sort().join('|');
}

function hasEquivalentTeam(teams, playerIds) {
  const signature = normalizeTeamSignature({ playerIds });
  if (!signature) return false;
  return (Array.isArray(teams) ? teams : []).some((team) => normalizeTeamSignature(team) === signature);
}

function areTeamSetsEquivalent(left, right) {
  const a = (Array.isArray(left) ? left : []).map(normalizeTeamSignature).filter(Boolean).sort();
  const b = (Array.isArray(right) ? right : []).map(normalizeTeamSignature).filter(Boolean).sort();
  return JSON.stringify(a) === JSON.stringify(b);
}

exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext();
  const tournamentId = String((event && event.tournamentId) || '').trim();
  const action = logic.normalizeAction(event && event.action);
  const traceId = String((event && event.__traceId) || '').trim();
  const clientRequestId = String((event && event.clientRequestId) || '').trim();
  if (!tournamentId) return common.failResult('TOURNAMENT_ID_REQUIRED', '缺少 tournamentId', { traceId, state: 'invalid', clientRequestId });
  if (!action) return common.failResult('ACTION_REQUIRED', 'action 不支持', { traceId, state: 'invalid', clientRequestId });

  try {
    const docRes = await db.collection('tournaments').doc(tournamentId).get();
    const t = docRes && docRes.data;
    if (!t) return common.failResult('TOURNAMENT_NOT_FOUND', '赛事不存在', { traceId, state: 'not_found', clientRequestId });
    if (String(t.creatorId || '') !== String(OPENID || '')) {
      return common.failResult('PERMISSION_DENIED', '仅管理员可管理队伍', { traceId, state: 'forbidden', clientRequestId });
    }
    if (String(t.status || '') !== 'draft') {
      return common.failResult('PAIR_TEAMS_DRAFT_ONLY', '仅草稿阶段可管理队伍', { traceId, state: 'forbidden', clientRequestId });
    }
    if (modeHelper.normalizeMode(t.mode) !== 'fixed_pair_rr') {
      return common.failResult('MODE_UNSUPPORTED', '仅固搭循环赛支持队伍管理', { traceId, state: 'invalid', clientRequestId });
    }

    const players = Array.isArray(t.players) ? t.players : [];
    const validPlayerIds = logic.buildValidPlayerIds(players);
    const teamsRaw = Array.isArray(t.pairTeams) ? t.pairTeams.slice() : [];
    const teams = logic.sanitizeExistingTeams(teamsRaw, validPlayerIds);
    const payloadPlayerIds = logic.normalizePlayerIds(event && event.playerIds);

    if (action === 'create' && hasEquivalentTeam(teams, payloadPlayerIds)) {
      return common.okResult('PAIR_TEAMS_DEDUPED', '队伍已同步', {
        traceId,
        state: 'deduped',
        deduped: true,
        clientRequestId,
        pairTeams: teams,
        warnings: []
      });
    }
    if (action === 'delete') {
      const teamId = String((event && event.teamId) || '').trim();
      if (teamId && !teams.some((item) => String(item && item.id || '') === teamId)) {
        return common.okResult('PAIR_TEAMS_DEDUPED', '队伍已同步', {
          traceId,
          state: 'deduped',
          deduped: true,
          clientRequestId,
          pairTeams: teams,
          warnings: []
        });
      }
    }

    const actionRes = logic.applyAction({
      action,
      teams,
      players,
      validPlayerIds,
      event
    });
    if (!actionRes.ok) {
      return common.failResult(actionRes.code || 'PAIR_TEAMS_INVALID', actionRes.message || '队伍操作失败', {
        traceId,
        state: 'invalid',
        clientRequestId
      });
    }

    const nextTeams = Array.isArray(actionRes.pairTeams) ? actionRes.pairTeams : teams;
    const teamsUnchanged = areTeamSetsEquivalent(nextTeams, teams);
    if (teamsUnchanged) {
      return common.okResult('PAIR_TEAMS_DEDUPED', '队伍已同步', {
        traceId,
        state: 'deduped',
        deduped: true,
        clientRequestId,
        pairTeams: teams,
        warnings: Array.isArray(actionRes.warnings) ? actionRes.warnings : []
      });
    }

    const oldVersion = Number(t.version) || 1;
    const updRes = await db.collection('tournaments').where({ _id: tournamentId, version: oldVersion }).update({
      data: common.assertNoReservedRootKeys({
        pairTeams: nextTeams,
        updatedAt: db.serverDate(),
        version: _.inc(1)
      }, ['_id'], '队伍管理写入数据')
    });
    if (!updRes || !updRes.stats || Number(updRes.stats.updated || 0) <= 0) {
      return common.failResult('VERSION_CONFLICT', '写入冲突，请刷新后重试', {
        traceId,
        state: 'conflict',
        clientRequestId
      });
    }

    return common.okResult('PAIR_TEAMS_UPDATED', '队伍已更新', {
      traceId,
      state: 'updated',
      clientRequestId,
      pairTeams: nextTeams,
      warnings: Array.isArray(actionRes.warnings) ? actionRes.warnings : []
    });
  } catch (err) {
    throw common.normalizeConflictError(err, '队伍管理失败');
  }
};
