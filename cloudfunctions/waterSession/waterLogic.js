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
  normalizeManualNames
};
