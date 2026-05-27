const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;
const common = require('./lib/common');
const modeHelper = require('./lib/mode');
const shareActivity = require('./lib/share-activity');

exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext();
  const tournamentId = String((event && event.tournamentId) || '').trim();
  const playerId = String((event && event.playerId) || '').trim();
  const traceId = String((event && event.__traceId) || '').trim();
  const clientRequestId = String((event && event.clientRequestId) || '').trim();
  if (!tournamentId) {
    return common.failResult('TOURNAMENT_ID_REQUIRED', '缺少 tournamentId', { traceId, state: 'invalid', clientRequestId });
  }
  if (!playerId) {
    return common.failResult('PLAYER_ID_REQUIRED', '缺少 playerId', { traceId, state: 'invalid', clientRequestId });
  }

  let shareUpdateTournament = null;
  try {
    const result = await db.runTransaction(async (transaction) => {
      const docRes = await transaction.collection('tournaments').doc(tournamentId).get();
      const t = common.assertTournamentExists(docRes.data);
      common.assertDraft(t, '非草稿阶段不可移除');
      const oldVersion = Number(t.version) || 1;
      const isCreator = String(t.creatorId || '') === String(OPENID || '');
      const isSelfRemove = String(playerId || '') === String(OPENID || '');
      if (!isCreator && !isSelfRemove) {
        return common.failResult('PERMISSION_DENIED', '无权限', {
          traceId,
          state: 'forbidden',
          clientRequestId
        });
      }

      const existingPlayers = Array.isArray(t.players) ? t.players : [];
      const playerExists = existingPlayers.some((item) => String(item && item.id || '').trim() === playerId);
      if (!playerExists) {
        return common.okResult('PLAYER_REMOVED_DEDUPED', '参赛成员已移除', {
          traceId,
          state: 'deduped',
          deduped: true,
          clientRequestId,
          playerId
        });
      }

      const players = existingPlayers.filter(p => String(p && p.id || '').trim() !== playerId);
      const playerIds = Array.from(new Set(players.map((item) => String(item && item.id || '').trim()).filter(Boolean)));
      const refereeId = (t.refereeId === playerId) ? '' : (t.refereeId || '');
      const pairTeamsRaw = Array.isArray(t.pairTeams) ? t.pairTeams : [];
      const pairTeams = pairTeamsRaw
        .map((team) => {
          const playerIds = Array.isArray(team && team.playerIds) ? team.playerIds.filter((id) => String(id) !== playerId) : [];
          return { ...team, playerIds };
        })
        .filter((team) => Array.isArray(team.playerIds) && team.playerIds.length === 2);

      const updRes = await transaction.collection('tournaments').where({ _id: tournamentId, version: oldVersion }).update({
        data: common.assertNoReservedRootKeys({
          players,
          playerIds,
          refereeId,
          pairTeams,
          updatedAt: db.serverDate(),
          version: _.inc(1)
        }, ['_id'], '移除参赛成员写入数据')
      });
      common.assertOptimisticUpdate(updRes, '写入冲突，请重试');
      shareUpdateTournament = {
        ...t,
        players,
        playerIds,
        refereeId,
        pairTeams
      };
      return common.okResult('PLAYER_REMOVED', '已移除参赛成员', {
        traceId,
        state: 'removed',
        clientRequestId,
        playerId
      });
    });
    if (result && result.ok && shareUpdateTournament) {
      await shareActivity.updateDraftMessageBestEffort(cloud, shareUpdateTournament, modeHelper, console, {
        db,
        source: 'removePlayer',
        tournamentId,
        traceId
      });
    }
    return result;
  } catch (err) {
    const message = common.errMsg(err);
    if (message.includes('赛事不存在')) {
      return common.failResult('TOURNAMENT_NOT_FOUND', message, { traceId, state: 'not_found', clientRequestId });
    }
    if (message.includes('无权限')) {
      return common.failResult('PERMISSION_DENIED', message, { traceId, state: 'forbidden', clientRequestId });
    }
    if (message.includes('草稿阶段')) {
      return common.failResult('REMOVE_DRAFT_ONLY', message, { traceId, state: 'forbidden', clientRequestId });
    }
    if (common.isConflictError(err)) {
      return common.failResult('VERSION_CONFLICT', '写入冲突，请刷新赛事后重试', {
        traceId,
        state: 'conflict',
        clientRequestId
      });
    }
    throw common.normalizeConflictError(err, '移除失败');
  }
};
