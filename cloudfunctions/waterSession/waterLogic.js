'use strict';

const MAX_UNITS = 99;
const MAX_MANUAL_NAMES = 24;

function cleanText(value, maxLength = 30) {
  return String(value || '').trim().replace(/\s+/g, ' ').slice(0, maxLength);
}

function normalizeUnits(value) {
  const source = value === undefined || value === null || value === '' ? 1 : Number(value);
  const units = Number.isInteger(source) ? source : NaN;
  if (!Number.isInteger(units) || units < 1 || units > MAX_UNITS) {
    throw new Error('水数必须在 1 到 99 之间');
  }
  return units;
}

function playerIds(players) {
  return new Set((Array.isArray(players) ? players : []).map((item) => cleanText(item && item.id, 80)).filter(Boolean));
}

function normalizeIdList(value) {
  const output = [];
  const seen = new Set();
  (Array.isArray(value) ? value : []).forEach((item) => {
    const id = cleanText(item, 80);
    if (id && !seen.has(id)) {
      seen.add(id);
      output.push(id);
    }
  });
  return output;
}

function assertKnownPlayers(ids, players) {
  const known = playerIds(players);
  if (ids.some((id) => !known.has(id))) throw new Error('参与人不存在，请刷新后重试');
}

function normalizeGameEntry(input = {}, players = []) {
  const winnerIds = normalizeIdList(input.winnerIds);
  const loserIds = normalizeIdList(input.loserIds);
  if (!winnerIds.length || !loserIds.length) throw new Error('请选择胜方和负方');
  if (winnerIds.length !== loserIds.length) throw new Error('双方人数要相同');
  if (winnerIds.some((id) => loserIds.includes(id))) throw new Error('同一人不能同时在胜方和负方');
  assertKnownPlayers(winnerIds.concat(loserIds), players);
  return {
    type: 'game',
    winnerIds,
    loserIds,
    unitsPerPlayer: normalizeUnits(input.unitsPerPlayer)
  };
}

function normalizeDirectEntry(input = {}, players = []) {
  const playerId = cleanText(input.playerId, 80);
  const counterpartyId = cleanText(input.counterpartyId, 80);
  const direction = cleanText(input.direction, 10).toLowerCase();
  if (!playerId || !counterpartyId || playerId === counterpartyId) throw new Error('请选择另一位球友');
  if (direction !== 'plus' && direction !== 'minus') throw new Error('加减方向无效');
  assertKnownPlayers([playerId, counterpartyId], players);
  return {
    type: 'transfer',
    fromPlayerId: direction === 'plus' ? counterpartyId : playerId,
    toPlayerId: direction === 'plus' ? playerId : counterpartyId,
    units: normalizeUnits(input.units)
  };
}

function normalizeV2DirectEntry(input = {}, players = []) {
  const fromPlayerId = cleanText(input.fromPlayerId, 80);
  const toPlayerId = cleanText(input.toPlayerId, 80);
  if (!fromPlayerId || !toPlayerId || fromPlayerId === toPlayerId) {
    throw new Error('请选择不同的请水方和赢水方');
  }
  assertKnownPlayers([fromPlayerId, toPlayerId], players);
  return {
    type: 'transfer',
    fromPlayerId,
    toPlayerId,
    units: normalizeUnits(input.units)
  };
}

function mergeEffectRows(rows) {
  const order = [];
  const byId = new Map();
  (Array.isArray(rows) ? rows : []).forEach((row) => {
    const participantId = cleanText(row && row.participantId, 80);
    if (!participantId) return;
    if (!byId.has(participantId)) {
      order.push(participantId);
      byId.set(participantId, {
        participantId,
        wonDelta: 0,
        treatDelta: 0,
        netDelta: 0
      });
    }
    const target = byId.get(participantId);
    target.wonDelta += Number(row.wonDelta || 0);
    target.treatDelta += Number(row.treatDelta || 0);
    target.netDelta += Number(row.netDelta || 0);
  });
  return order.map((id) => byId.get(id)).filter((row) => (
    row.wonDelta !== 0 || row.treatDelta !== 0 || row.netDelta !== 0
  ));
}

function assertConservedEffect(effect) {
  const totals = (Array.isArray(effect) ? effect : []).reduce((output, row) => {
    const wonDelta = Number(row && row.wonDelta);
    const treatDelta = Number(row && row.treatDelta);
    const netDelta = Number(row && row.netDelta);
    if (![wonDelta, treatDelta, netDelta].every(Number.isInteger)) {
      throw new Error('账务变化必须是整数');
    }
    if (netDelta !== wonDelta - treatDelta) {
      throw new Error('账务变化不一致');
    }
    output.won += wonDelta;
    output.treat += treatDelta;
    output.net += netDelta;
    return output;
  }, { won: 0, treat: 0, net: 0 });
  if (totals.won !== totals.treat || totals.net !== 0) {
    throw new Error('账务变化未守恒');
  }
  return effect;
}

function effectForEntry(entry = {}) {
  const rows = [];
  if (entry.type === 'game') {
    const units = normalizeUnits(entry.unitsPerPlayer);
    normalizeIdList(entry.winnerIds).forEach((participantId) => {
      rows.push({ participantId, wonDelta: units, treatDelta: 0, netDelta: units });
    });
    normalizeIdList(entry.loserIds).forEach((participantId) => {
      rows.push({ participantId, wonDelta: 0, treatDelta: units, netDelta: -units });
    });
  } else if (entry.type === 'transfer') {
    const units = normalizeUnits(entry.units);
    const fromPlayerId = cleanText(entry.fromPlayerId, 80);
    const toPlayerId = cleanText(entry.toPlayerId, 80);
    if (!fromPlayerId || !toPlayerId || fromPlayerId === toPlayerId) {
      throw new Error('请选择不同的请水方和赢水方');
    }
    rows.push({ participantId: fromPlayerId, wonDelta: 0, treatDelta: units, netDelta: -units });
    rows.push({ participantId: toPlayerId, wonDelta: units, treatDelta: 0, netDelta: units });
  } else {
    throw new Error('记录类型无效');
  }
  return assertConservedEffect(mergeEffectRows(rows));
}

function negateEffect(effect) {
  return assertConservedEffect(mergeEffectRows((Array.isArray(effect) ? effect : []).map((row) => ({
    participantId: row.participantId,
    wonDelta: -Number(row.wonDelta || 0),
    treatDelta: -Number(row.treatDelta || 0),
    netDelta: -Number(row.netDelta || 0)
  }))));
}

function diffEffects(nextEffect, previousEffect) {
  return assertConservedEffect(mergeEffectRows([
    ...(Array.isArray(nextEffect) ? nextEffect : []),
    ...negateEffect(previousEffect)
  ]));
}

function createLedger(players) {
  return (Array.isArray(players) ? players : []).map((player) => ({
    participantId: cleanText(player && player.id, 80),
    won: 0,
    treat: 0,
    net: 0
  })).filter((row) => row.participantId);
}

function applyLedgerDelta(ledger, delta) {
  assertConservedEffect(delta);
  const rows = (Array.isArray(ledger) ? ledger : []).map((row) => ({
    participantId: cleanText(row && row.participantId, 80),
    won: Number(row && row.won || 0),
    treat: Number(row && row.treat || 0),
    net: Number(row && row.net || 0)
  }));
  const byId = new Map(rows.map((row) => [row.participantId, row]));
  (Array.isArray(delta) ? delta : []).forEach((change) => {
    const target = byId.get(cleanText(change && change.participantId, 80));
    if (!target) throw new Error('参与人不存在，请刷新后重试');
    target.won += Number(change.wonDelta || 0);
    target.treat += Number(change.treatDelta || 0);
    target.net += Number(change.netDelta || 0);
    if (![target.won, target.treat, target.net].every(Number.isInteger)
        || target.won < 0 || target.treat < 0 || target.net !== target.won - target.treat) {
      throw new Error('账务聚合不一致');
    }
  });
  const totals = rows.reduce((output, row) => {
    output.won += row.won;
    output.treat += row.treat;
    output.net += row.net;
    return output;
  }, { won: 0, treat: 0, net: 0 });
  if (totals.won !== totals.treat || totals.net !== 0) throw new Error('账务聚合未守恒');
  return rows;
}

function normalizeManualNames(input) {
  const seen = new Set();
  const output = [];
  String(input || '').split(/[\n,，、;；]+/).forEach((part) => {
    const name = cleanText(part, 20);
    const key = name.toLocaleLowerCase();
    if (name && !seen.has(key) && output.length < MAX_MANUAL_NAMES) {
      seen.add(key);
      output.push(name);
    }
  });
  return output;
}

module.exports = {
  MAX_UNITS,
  MAX_MANUAL_NAMES,
  cleanText,
  normalizeUnits,
  normalizeGameEntry,
  normalizeDirectEntry,
  normalizeV2DirectEntry,
  effectForEntry,
  negateEffect,
  diffEffects,
  createLedger,
  applyLedgerDelta,
  assertConservedEffect,
  normalizeManualNames
};
