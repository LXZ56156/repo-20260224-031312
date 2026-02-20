const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

function parsePosInt(v, maxV) {
  if (v === undefined || v === null || v === '') return null;
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  const nn = Math.max(1, Math.floor(n));
  return Number.isFinite(maxV) ? Math.min(nn, maxV) : nn;
}

function calcMaxMatches(n) {
  const nn = Number(n) || 0;
  if (nn < 4) return 0;
  const comb4 = (nn * (nn - 1) * (nn - 2) * (nn - 3)) / 24;
  return Math.floor(comb4 * 3);
}

exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext();
  const tournamentId = String((event && event.tournamentId) || '').trim();
  const totalMatches = parsePosInt(event && event.totalMatches);
  // 并行场地（每轮最多场数）上限 10
  const courts = parsePosInt(event && event.courts, 10);
  if (!tournamentId) throw new Error('缺少 tournamentId');

  return await db.runTransaction(async (transaction) => {
    const docRes = await transaction.collection('tournaments').doc(tournamentId).get();
    const t = docRes.data;
    if (!t) throw new Error('赛事不存在');
    if (t.creatorId !== OPENID) throw new Error('无权限');
    if (t.status !== 'draft') throw new Error('非草稿阶段不可修改');

    // 参数上限校验：总场次不得超过 MaxMatches=C(n,4)*3
    const players = Array.isArray(t.players) ? t.players : [];
    const maxMatches = calcMaxMatches(players.length);
    if (totalMatches !== null) {
      if (maxMatches <= 0) throw new Error('请先添加至少 4 名参赛者再设置总场次');
      if (totalMatches > maxMatches) throw new Error(`总场次不能超过最大可选 ${maxMatches} 场`);
    }
    const oldVersion = Number(t.version) || 1;

    const data = { updatedAt: db.serverDate(), version: _.inc(1) };
    if (totalMatches !== null) data.totalMatches = totalMatches;
    if (courts !== null) data.courts = courts;
    // 首次保存参数后视为已配置
    if (totalMatches !== null && courts !== null) data.settingsConfigured = true;

    const updRes = await transaction.collection('tournaments').where({ _id: tournamentId, version: oldVersion }).update({ data });
    if (!updRes || !updRes.stats || updRes.stats.updated === 0) {
      throw new Error('写入冲突，请重试');
    }
    return { ok: true };
  });
};
