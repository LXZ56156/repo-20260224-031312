const cloud = require('wx-server-sdk');
const crypto = require('crypto');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;
const common = require('./lib/common');
const modeHelper = require('./lib/mode');
const shareActivity = require('./lib/share-activity');

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
  const normalizedNames = Array.isArray(payloadNames)
    ? payloadNames
    : (typeof payloadNames === 'string'
        ? String(payloadNames || '').split(/[\n,，;；\t ]+/).filter(Boolean)
        : []);
  const source = Array.isArray(payloadPlayers) && payloadPlayers.length
    ? payloadPlayers.map((item) => {
        if (item && typeof item === 'object') {
          return { name: item.name, gender: item.gender };
        }
        return { name: '', gender: 'unknown' };
      })
    : normalizedNames.map((name) => ({ name, gender: 'unknown' }));

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
  return `guest_${Date.now()}_${i}_${crypto.randomBytes(8).toString('hex')}`;
}

exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext();
  const traceId = String((event && event.__traceId) || '').trim();
  const clientRequestId = String((event && event.clientRequestId) || '').trim();
  const tournamentId = String((event && event.tournamentId) || '').trim();
  const normalized = normalizeInputPlayers(event && event.players, event && event.names);
  const entries = normalized.validUnique;
  if (!tournamentId) {
    return common.failResult('TOURNAMENT_ID_REQUIRED', '缺少 tournamentId', {
      traceId,
      state: 'invalid',
      ...(clientRequestId ? { clientRequestId } : {})
    });
  }
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
    return common.failResult('NAMES_REQUIRED', '缺少 names', {
      traceId,
      state: 'invalid',
      ...(clientRequestId ? { clientRequestId } : {})
    });
  }

  let shareUpdateTournament = null;
  try {
    const result = await db.runTransaction(async (transaction) => {
      let t = null;
      try {
        const docRes = await transaction.collection('tournaments').doc(tournamentId).get();
        t = docRes && docRes.data ? docRes.data : null;
      } catch (err) {
        if (common.isDocNotExists(err)) {
          return common.failResult('TOURNAMENT_NOT_FOUND', '赛事不存在', {
            traceId,
            state: 'not_found',
            ...(clientRequestId ? { clientRequestId } : {})
          });
        }
        throw err;
      }
      if (!t) {
        return common.failResult('TOURNAMENT_NOT_FOUND', '赛事不存在', {
          traceId,
          state: 'not_found',
          ...(clientRequestId ? { clientRequestId } : {})
        });
      }
      if (String(t.creatorId || '') !== String(OPENID || '')) {
        return common.failResult('PERMISSION_DENIED', '仅管理员可导入', {
          traceId,
          state: 'forbidden',
          ...(clientRequestId ? { clientRequestId } : {})
        });
      }
      if (String(t.status || '') !== 'draft') {
        return common.failResult('ADD_PLAYERS_DRAFT_ONLY', '仅草稿阶段可导入', {
          traceId,
          state: 'forbidden',
          ...(clientRequestId ? { clientRequestId } : {})
        });
      }
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
      const playerLimit = modeHelper.getRotationPlayerLimit(t);
      if (playerLimit > 0 && players.length + toAdd.length > playerLimit) {
        const remaining = Math.max(0, playerLimit - players.length);
        return common.failResult('PLAYER_LIMIT_EXCEEDED', `该赛制剩余名额 ${remaining} 人，本次导入 ${toAdd.length} 人，未导入`, {
          traceId,
          state: 'invalid',
          ...(clientRequestId ? { clientRequestId } : {}),
          playerLimit,
          playersCount: players.length,
          importCount: toAdd.length,
          remaining
        });
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
      if (!updRes || !updRes.stats || Number(updRes.stats.updated || 0) <= 0) {
        return common.failResult('VERSION_CONFLICT', '写入冲突，请重试', {
          traceId,
          state: 'conflict',
          ...(clientRequestId ? { clientRequestId } : {})
        });
      }
      const maleCount = toAdd.filter((p) => p.gender === 'male').length;
      const femaleCount = toAdd.filter((p) => p.gender === 'female').length;
      const unknownCount = toAdd.length - maleCount - femaleCount;
      shareUpdateTournament = {
        ...t,
        players: nextPlayers,
        playerIds: nextPlayerIds
      };
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
    if (result && result.ok && shareUpdateTournament) {
      await shareActivity.updateDraftMessageBestEffort(cloud, shareUpdateTournament, modeHelper, console, {
        source: 'addPlayers',
        tournamentId,
        traceId
      });
    }
    return result;
  } catch (err) {
    if (common.isDocNotExists(err) || String((err && err.message) || '').includes('赛事不存在')) {
      return common.failResult('TOURNAMENT_NOT_FOUND', '赛事不存在', {
        traceId,
        state: 'not_found',
        ...(clientRequestId ? { clientRequestId } : {})
      });
    }
    if (common.isConflictError(err)) {
      return common.failResult('VERSION_CONFLICT', '写入冲突，请重试', {
        traceId,
        state: 'conflict',
        ...(clientRequestId ? { clientRequestId } : {})
      });
    }
    throw common.normalizeConflictError(err, '添加失败');
  }
};
