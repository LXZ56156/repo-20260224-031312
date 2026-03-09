const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();
const _ = db.command;
const logic = require('./logic');
const modeHelper = require('./lib/mode');

exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext();
  const tournamentId = String((event && event.tournamentId) || '').trim();
  const action = logic.normalizeAction(event && event.action);
  if (!tournamentId) throw new Error('缺少 tournamentId');
  if (!action) throw new Error('action 不支持');

  const docRes = await db.collection('tournaments').doc(tournamentId).get();
  const t = docRes && docRes.data;
  if (!t) throw new Error('赛事不存在');
  if (String(t.creatorId || '') !== String(OPENID || '')) throw new Error('仅管理员可管理队伍');
  if (String(t.status || '') !== 'draft') throw new Error('仅草稿阶段可管理队伍');
  if (modeHelper.normalizeMode(t.mode) !== 'fixed_pair_rr') throw new Error('仅固搭循环赛支持队伍管理');

  const players = Array.isArray(t.players) ? t.players : [];
  const validPlayerIds = logic.buildValidPlayerIds(players);
  const teamsRaw = Array.isArray(t.pairTeams) ? t.pairTeams.slice() : [];
  const teams = logic.sanitizeExistingTeams(teamsRaw, validPlayerIds);
  const actionRes = logic.applyAction({
    action,
    teams,
    players,
    validPlayerIds,
    event
  });
  if (!actionRes.ok) {
    return actionRes;
  }

  const nextTeams = Array.isArray(actionRes.pairTeams) ? actionRes.pairTeams : teams;
  const oldVersion = Number(t.version) || 1;
  const updRes = await db.collection('tournaments').where({ _id: tournamentId, version: oldVersion }).update({
    data: {
      pairTeams: nextTeams,
      updatedAt: db.serverDate(),
      version: _.inc(1)
    }
  });
  if (!updRes || !updRes.stats || Number(updRes.stats.updated || 0) <= 0) {
    throw new Error('写入冲突，请刷新后重试');
  }

  return {
    ok: true,
    pairTeams: nextTeams,
    warnings: Array.isArray(actionRes.warnings) ? actionRes.warnings : []
  };
};
