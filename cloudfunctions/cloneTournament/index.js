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

exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext();
  const sourceTournamentId = String((event && event.sourceTournamentId) || '').trim();
  const traceId = String((event && event.__traceId) || '').trim();
  const clientRequestId = String((event && event.clientRequestId) || '').trim();
  const renamed = logic.normalizeName(event && event.name);

  if (!sourceTournamentId) throw new Error('缺少 sourceTournamentId');

  try {
    if (clientRequestId) {
      const existing = await db.collection('tournaments').where({
        creatorId: OPENID,
        cloneSourceTournamentId: sourceTournamentId,
        clientRequestId
      }).limit(1).get();
      const existingDoc = Array.isArray(existing && existing.data) ? existing.data[0] : null;
      if (existingDoc && existingDoc._id) {
        return common.okResult('TOURNAMENT_CLONED', '已复制赛事', {
          traceId,
          state: 'deduped',
          deduped: true,
          ...(clientRequestId ? { clientRequestId } : {}),
          tournamentId: existingDoc._id
        });
      }
    }

    const docRes = await db.collection('tournaments').doc(sourceTournamentId).get();
    const source = common.assertTournamentExists(docRes && docRes.data);
    common.assertCreator(source, OPENID, '仅创建者可复制自己的赛事');

    const totalMatches = toPosInt(source.totalMatches, 0);
    const courts = toPosInt(source.courts, 0);
    const settingsConfigured = Boolean(source.settingsConfigured) && totalMatches >= 1 && courts >= 1;
    const nextName = renamed || `${logic.normalizeName(source.name) || '比赛'}（副本）`;
    const rules = source && source.rules && typeof source.rules === 'object'
      ? source.rules
      : { gamesPerMatch: 1, pointsPerGame: 21, endCondition: { type: 'total_matches', target: 1 }, unfinishedPolicy: 'admin_decide' };
    const modeRaw = String(source.mode || '').trim().toLowerCase();
    const mode = modeHelper.normalizeMode(modeRaw);
    const copied = logic.copyPlayers(source.players, OPENID, undefined, {
      preserveSquad: mode === 'squad_doubles'
    });
    const players = copied.players;
    const playerIds = Array.from(new Set(players.map((item) => String(item && item.id || '').trim()).filter(Boolean)));
    const allowOpenTeam = source.allowOpenTeam === true;
    const pairTeams = mode === 'fixed_pair_rr'
      ? logic.copyPairTeams(source.pairTeams, copied.playerIdMap)
      : [];
    const data = common.assertNoReservedRootKeys({
      name: nextName,
      status: 'draft',
      creatorId: OPENID,
      mode,
      allowOpenTeam,
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

    const addRes = await db.collection('tournaments').add({
      data
    });

    return common.okResult('TOURNAMENT_CLONED', '已复制赛事', {
      state: 'created',
      traceId,
      ...(clientRequestId ? { clientRequestId } : {}),
      tournamentId: addRes._id
    });
  } catch (err) {
    throw common.normalizeConflictError(err, '复制赛事失败');
  }
};
