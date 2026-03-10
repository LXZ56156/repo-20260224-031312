const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();
const _ = db.command;
const modeHelper = require('./lib/mode');
const common = require('./lib/common');

function normalizeSquad(squad) {
  const v = String(squad || '').trim().toUpperCase();
  if (v === 'A' || v === 'B') return v;
  return '';
}

exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext();
  const tournamentId = String((event && event.tournamentId) || '').trim();
  const playerId = String((event && event.playerId) || '').trim();
  const squad = normalizeSquad(event && event.squad);
  if (!tournamentId) throw new Error('缺少 tournamentId');
  if (!playerId) throw new Error('缺少 playerId');
  if (!squad) throw new Error('队伍必须是 A 或 B');

  const docRes = await db.collection('tournaments').doc(tournamentId).get();
  const t = docRes && docRes.data;
  if (!t) throw new Error('赛事不存在');
  if (String(t.creatorId || '') !== String(OPENID || '')) throw new Error('仅管理员可调整分队');
  if (String(t.status || '') !== 'draft') throw new Error('仅草稿阶段可调整分队');
  if (modeHelper.normalizeMode(t.mode) !== 'squad_doubles') throw new Error('仅小队转支持分队调整');

  const players = Array.isArray(t.players) ? t.players.slice() : [];
  const idx = players.findIndex((item) => String(item && item.id || '') === playerId);
  if (idx < 0) throw new Error('参赛成员不存在');
  players[idx] = { ...(players[idx] || {}), squad };

  const oldVersion = Number(t.version) || 1;
  const updRes = await db.collection('tournaments').where({ _id: tournamentId, version: oldVersion }).update({
    data: common.assertNoReservedRootKeys({
      players,
      updatedAt: db.serverDate(),
      version: _.inc(1)
    }, ['_id'], '分队调整写入数据')
  });
  if (!updRes || !updRes.stats || Number(updRes.stats.updated || 0) <= 0) {
    throw new Error('写入冲突，请刷新后重试');
  }
  return { ok: true };
};
