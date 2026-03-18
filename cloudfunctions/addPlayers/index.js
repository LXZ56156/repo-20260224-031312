const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;
const common = require('./lib/common');

function normalizeGender(gender) {
  const v = String(gender || '').trim().toLowerCase();
  if (v === 'male' || v === 'female') return v;
  return 'unknown';
}

function normalizeInputPlayers(payloadPlayers, payloadNames) {
  const seen = new Set();
  const validUnique = [];
  const duplicateNames = [];
  const invalidNames = [];
  const source = Array.isArray(payloadPlayers) && payloadPlayers.length
    ? payloadPlayers.map((item) => {
        if (item && typeof item === 'object') {
          return { name: item.name, gender: item.gender };
        }
        return { name: '', gender: 'unknown' };
      })
    : (payloadNames || []).map((name) => ({ name, gender: 'unknown' }));

  for (const raw of source) {
    const n = String(raw && raw.name || '').trim();
    if (!n) {
      invalidNames.push('');
      continue;
    }
    if (n.length > 20) {
      invalidNames.push(n);
      continue;
    }
    const key = n.toLowerCase();
    if (seen.has(key)) {
      duplicateNames.push(n);
      continue;
    }
    seen.add(key);
    validUnique.push({ name: n, gender: normalizeGender(raw && raw.gender) });
  }

  return { validUnique, duplicateNames, invalidNames };
}

function makeId(i) {
  return `guest_${Date.now()}_${i}_${Math.floor(Math.random()*1e6)}`;
}

exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext();
  const traceId = String((event && event.__traceId) || '').trim();
  const clientRequestId = String((event && event.clientRequestId) || '').trim();
  const tournamentId = String((event && event.tournamentId) || '').trim();
  const normalized = normalizeInputPlayers(event && event.players, event && event.names);
  const entries = normalized.validUnique;
  if (!tournamentId) throw new Error('缺少 tournamentId');
  if (!Array.isArray(entries) || entries.length === 0) {
    if (normalized.invalidNames.length > 0 || normalized.duplicateNames.length > 0) {
      return {
        ok: true,
        added: 0,
        addedCount: 0,
        maleCount: 0,
        femaleCount: 0,
        unknownCount: 0,
        duplicateCount: normalized.duplicateNames.length,
        invalidCount: normalized.invalidNames.length,
        duplicateNames: normalized.duplicateNames,
        invalidNames: normalized.invalidNames
      };
    }
    throw new Error('缺少 names');
  }

  try {
    return await db.runTransaction(async (transaction) => {
      const docRes = await transaction.collection('tournaments').doc(tournamentId).get();
      const t = common.assertTournamentExists(docRes.data);
      common.assertCreator(t, OPENID);
      common.assertDraft(t, '非草稿阶段不可导入');
      if (clientRequestId && String(t.lastClientRequestId || '').trim() === clientRequestId) {
        return {
          ok: true,
          deduped: true,
          ...(clientRequestId ? { clientRequestId } : {}),
          added: 0,
          addedCount: 0,
          maleCount: 0,
          femaleCount: 0,
          unknownCount: 0,
          duplicateCount: 0,
          invalidCount: 0,
          duplicateNames: [],
          invalidNames: []
        };
      }
      const oldVersion = Number(t.version) || 1;

      const players = Array.isArray(t.players) ? t.players.slice() : [];
      const existingNames = new Set(players.map(p => String(p.name || '').trim().toLowerCase()));
      const duplicateNames = normalized.duplicateNames.slice();
      const invalidNames = normalized.invalidNames.slice();

      const toAdd = [];
      for (let i = 0; i < entries.length; i++) {
        const item = entries[i];
        const n = item.name;
        const key = n.toLowerCase();
        if (existingNames.has(key)) {
          duplicateNames.push(n);
          continue;
        }
        existingNames.add(key);
        toAdd.push({ id: makeId(i), name: n, type: 'guest', gender: item.gender || 'unknown', squad: '' });
      }
      if (toAdd.length === 0) {
        return {
          ok: true,
          added: 0,
          addedCount: 0,
          maleCount: 0,
          femaleCount: 0,
          unknownCount: 0,
          duplicateCount: duplicateNames.length,
          invalidCount: invalidNames.length,
          duplicateNames,
          invalidNames
        };
      }
      const nextPlayers = players.concat(toAdd);
      const nextPlayerIds = Array.from(new Set(nextPlayers.map((item) => String(item && item.id || '').trim()).filter(Boolean)));

      const updateData = {
        players: nextPlayers,
        playerIds: nextPlayerIds,
        updatedAt: db.serverDate(),
        version: _.inc(1)
      };
      if (clientRequestId) updateData.lastClientRequestId = clientRequestId;

      const updRes = await transaction.collection('tournaments').where({ _id: tournamentId, version: oldVersion }).update({
        data: common.assertNoReservedRootKeys(updateData, ['_id'], '赛事导入名单写入数据')
      });
      common.assertOptimisticUpdate(updRes, '写入冲突，请重试');
      const maleCount = toAdd.filter((p) => p.gender === 'male').length;
      const femaleCount = toAdd.filter((p) => p.gender === 'female').length;
      const unknownCount = toAdd.length - maleCount - femaleCount;
      return {
        ok: true,
        ...(clientRequestId ? { clientRequestId } : {}),
        added: toAdd.length,
        addedCount: toAdd.length,
        maleCount,
        femaleCount,
        unknownCount,
        duplicateCount: duplicateNames.length,
        invalidCount: invalidNames.length,
        duplicateNames,
        invalidNames
      };
    });
  } catch (err) {
    throw common.normalizeConflictError(err, '添加失败');
  }
};
