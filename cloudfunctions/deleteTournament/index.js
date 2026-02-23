const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const common = require('./lib/common');

exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext();
  const tournamentId = String((event && event.tournamentId) || '').trim();
  if (!tournamentId) throw new Error('缺少 tournamentId');

  return await db.runTransaction(async (transaction) => {
    const docRes = await transaction.collection('tournaments').doc(tournamentId).get();
    const t = common.assertTournamentExists(docRes.data);
    common.assertCreator(t, OPENID);

    await transaction.collection('tournaments').doc(tournamentId).remove();
    return { ok: true };
  });
};
