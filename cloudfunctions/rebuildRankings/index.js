const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;
const common = require('./lib/common');
const rankingCore = require('./lib/rankingCore');

exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext();
  const { tournamentId } = event || {};
  if (!tournamentId) throw new Error('missing tournamentId');

  try {
    const docRes = await db.collection('tournaments').doc(tournamentId).get();
    const tournament = common.assertTournamentExists(docRes.data);
    common.assertCreator(tournament, OPENID, 'no permission');

    const oldVersion = Number(tournament.version) || 1;
    const rankings = rankingCore.computeRankings(tournament);
    const updRes = await db.collection('tournaments')
      .where({ _id: tournamentId, version: oldVersion })
      .update({
        data: {
          rankings,
          updatedAt: db.serverDate(),
          version: _.inc(1)
        }
      });

    common.assertOptimisticUpdate(updRes, '写入冲突：请刷新后重试');
    return { ok: true, rankingsCount: rankings.length };
  } catch (err) {
    throw common.normalizeConflictError(err, '重算排名失败');
  }
};
