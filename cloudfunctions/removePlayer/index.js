const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;
const common = require('./lib/common');

exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext();
  const tournamentId = String((event && event.tournamentId) || '').trim();
  const playerId = String((event && event.playerId) || '').trim();
  if (!tournamentId) throw new Error('缺少 tournamentId');
  if (!playerId) throw new Error('缺少 playerId');

  try {
    return await db.runTransaction(async (transaction) => {
      const docRes = await transaction.collection('tournaments').doc(tournamentId).get();
      const t = common.assertTournamentExists(docRes.data);
      common.assertCreator(t, OPENID);
      common.assertDraft(t, '非草稿阶段不可移除');
      const oldVersion = Number(t.version) || 1;
      if (playerId === t.creatorId) throw new Error('不能移除创建者');

      const players = Array.isArray(t.players) ? t.players.filter(p => p.id !== playerId) : [];
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
      return { ok: true };
    });
  } catch (err) {
    throw common.normalizeConflictError(err, '移除失败');
  }
};
