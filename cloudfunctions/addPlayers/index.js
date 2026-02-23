const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;
const common = require('./lib/common');

function uniqNames(names) {
  const seen = new Set();
  const out = [];
  for (const raw of (names || [])) {
    const n = String(raw || '').trim();
    if (!n) continue;
    const key = n.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(n);
  }
  return out;
}

function makeId(i) {
  return `guest_${Date.now()}_${i}_${Math.floor(Math.random()*1e6)}`;
}

exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext();
  const tournamentId = String((event && event.tournamentId) || '').trim();
  const names = uniqNames(event && event.names);
  if (!tournamentId) throw new Error('缺少 tournamentId');
  if (!Array.isArray(names) || names.length === 0) throw new Error('缺少 names');

  try {
    return await db.runTransaction(async (transaction) => {
      const docRes = await transaction.collection('tournaments').doc(tournamentId).get();
      const t = common.assertTournamentExists(docRes.data);
      common.assertCreator(t, OPENID);
      common.assertDraft(t, '非草稿阶段不可导入');
      const oldVersion = Number(t.version) || 1;

      const players = Array.isArray(t.players) ? t.players.slice() : [];
      const existingNames = new Set(players.map(p => String(p.name || '').trim().toLowerCase()));

      const toAdd = [];
      for (let i = 0; i < names.length; i++) {
        const n = names[i];
        const key = n.toLowerCase();
        if (existingNames.has(key)) continue;
        existingNames.add(key);
        toAdd.push({ id: makeId(i), name: n, type: 'guest' });
      }
      if (toAdd.length === 0) return { ok: true, added: 0 };

      const updRes = await transaction.collection('tournaments').where({ _id: tournamentId, version: oldVersion }).update({
        data: {
          players: players.concat(toAdd),
          updatedAt: db.serverDate(),
          version: _.inc(1)
        }
      });
      common.assertOptimisticUpdate(updRes, '写入冲突，请重试');
      return { ok: true, added: toAdd.length };
    });
  } catch (err) {
    throw common.normalizeConflictError(err, '添加失败');
  }
};
