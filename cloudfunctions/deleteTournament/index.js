const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const common = require('./lib/common');
const logic = require('./logic');

exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext();
  const tournamentId = String((event && event.tournamentId) || '').trim();
  if (!tournamentId) throw new Error('缺少 tournamentId');

  const docRes = await db.collection('tournaments').doc(tournamentId).get();
  const tournament = common.assertTournamentExists(docRes.data);
  common.assertCreator(tournament, OPENID);
  const result = await db.runTransaction(async (transaction) => {
    const latestRes = await transaction.collection('tournaments').doc(tournamentId).get();
    const t = common.assertTournamentExists(latestRes.data);
    common.assertCreator(t, OPENID);

    await transaction.collection('tournaments').doc(tournamentId).remove();
    return { ok: true };
  });
  await logic.cleanupScoreLocksBestEffort(() => common.cleanupScoreLocks(db, tournamentId), tournamentId, console);
  return result;
};
