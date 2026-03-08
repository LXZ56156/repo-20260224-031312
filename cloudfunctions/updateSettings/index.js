const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;
const common = require('./lib/common');
const { parsePosInt, validateSettings, normalizeGender } = require('./logic');

exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext();
  const tournamentId = String((event && event.tournamentId) || '').trim();
  const totalMatches = parsePosInt(event && event.totalMatches);
  // 并行场地（每轮最多场数）上限 10
  const courts = parsePosInt(event && event.courts, 10);
  const allowOpenTeamInput = event && Object.prototype.hasOwnProperty.call(event, 'allowOpenTeam')
    ? event.allowOpenTeam === true
    : null;
  const playerGenderPatch = (event && typeof event.playerGenderPatch === 'object' && event.playerGenderPatch)
    ? event.playerGenderPatch
    : null;
  if (!tournamentId) throw new Error('缺少 tournamentId');

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

      const data = { updatedAt: db.serverDate(), version: _.inc(1) };
      Object.assign(data, checked.patch);
      if (allowOpenTeamInput !== null) {
        data.allowOpenTeam = allowOpenTeamInput;
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

      const updRes = await transaction.collection('tournaments').where({ _id: tournamentId, version: oldVersion }).update({ data });
      common.assertOptimisticUpdate(updRes, '写入冲突，请重试');
      return { ok: true };
    });
  } catch (err) {
    throw common.normalizeConflictError(err, '保存失败');
  }
};
