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
  const traceId = String((event && event.__traceId) || '').trim();
  const clientRequestId = String((event && event.clientRequestId) || '').trim();
  if (!tournamentId) return common.failResult('TOURNAMENT_ID_REQUIRED', '缺少 tournamentId', { traceId, state: 'invalid', clientRequestId });
  if (!playerId) return common.failResult('PLAYER_ID_REQUIRED', '缺少 playerId', { traceId, state: 'invalid', clientRequestId });
  if (!squad) return common.failResult('SQUAD_INVALID', '队伍必须是 A 或 B', { traceId, state: 'invalid', clientRequestId });

  try {
    const docRes = await db.collection('tournaments').doc(tournamentId).get();
    const t = docRes && docRes.data;
    if (!t) return common.failResult('TOURNAMENT_NOT_FOUND', '赛事不存在', { traceId, state: 'not_found', clientRequestId });
    if (String(t.creatorId || '') !== String(OPENID || '')) {
      return common.failResult('PERMISSION_DENIED', '仅管理员可调整分队', { traceId, state: 'forbidden', clientRequestId });
    }
    if (String(t.status || '') !== 'draft') {
      return common.failResult('SET_PLAYER_SQUAD_DRAFT_ONLY', '仅草稿阶段可调整分队', { traceId, state: 'forbidden', clientRequestId });
    }
    if (modeHelper.normalizeMode(t.mode) !== 'squad_doubles') {
      return common.failResult('MODE_UNSUPPORTED', '仅小队转支持分队调整', { traceId, state: 'invalid', clientRequestId });
    }

    const players = Array.isArray(t.players) ? t.players.slice() : [];
    const idx = players.findIndex((item) => String(item && item.id || '') === playerId);
    if (idx < 0) return common.failResult('PLAYER_NOT_FOUND', '参赛成员不存在', { traceId, state: 'invalid', clientRequestId });
    if (String((players[idx] && players[idx].squad) || '').trim().toUpperCase() === squad) {
      return common.okResult('PLAYER_SQUAD_DEDUPED', '分队已更新', {
        traceId,
        state: 'deduped',
        deduped: true,
        clientRequestId,
        squad
      });
    }
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
      return common.failResult('VERSION_CONFLICT', '写入冲突，请刷新后重试', {
        traceId,
        state: 'conflict',
        clientRequestId
      });
    }
    return common.okResult('PLAYER_SQUAD_UPDATED', '已调整分队', {
      traceId,
      state: 'updated',
      clientRequestId,
      squad
    });
  } catch (err) {
    throw common.normalizeConflictError(err, '调整分队失败');
  }
};
