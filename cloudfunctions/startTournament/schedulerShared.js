const { stableSortIds } = require('./utils');

function squareCost(count) {
  const value = Number(count) || 0;
  return value * value;
}

function incrementalSquareCost(count) {
  const value = Number(count) || 0;
  return (2 * value) + 1;
}

function normalizeSeed(seed) {
  const n = Number(seed);
  if (!Number.isFinite(n)) return 1;
  const mod = 2147483647;
  const value = Math.floor(Math.abs(n)) % mod;
  return value === 0 ? 1 : value;
}

function hashString(value) {
  const str = String(value || '');
  let hash = 0;
  for (let i = 0; i < str.length; i += 1) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

function countComb(n, k) {
  const total = Math.max(0, Number(n) || 0);
  const choose = Math.max(0, Number(k) || 0);
  if (choose < 0 || choose > total) return 0;
  if (choose === 0 || choose === total) return 1;
  const upper = Math.min(choose, total - choose);
  let acc = 1;
  for (let i = 1; i <= upper; i += 1) {
    acc = Math.floor((acc * (total - upper + i)) / i);
  }
  return acc;
}

function enumerateCombinations(ids, choose, visitor, options = {}) {
  const list = options.stable === false
    ? (Array.isArray(ids) ? ids.slice() : [])
    : stableSortIds(ids);
  const target = Math.max(0, Number(choose) || 0);
  const deadlineAtMs = Number(options.deadlineAtMs) || 0;
  const nowFn = typeof options.nowFn === 'function' ? options.nowFn : Date.now;
  const hasDeadline = deadlineAtMs > 0;
  const isExpired = () => hasDeadline && nowFn() >= deadlineAtMs;
  if (target === 0) return visitor([]) !== false && !isExpired();
  if (target > list.length) return false;

  const picked = [];
  let stopped = false;

  const walk = (start) => {
    if (stopped) return false;
    if (isExpired()) {
      stopped = true;
      return false;
    }
    if (picked.length === target) {
      if (visitor(picked.slice()) === false) {
        stopped = true;
        return false;
      }
      return true;
    }
    const remaining = target - picked.length;
    for (let i = start; i <= list.length - remaining; i += 1) {
      if (isExpired()) {
        stopped = true;
        return false;
      }
      picked.push(list[i]);
      if (walk(i + 1) === false) {
        picked.pop();
        return false;
      }
      picked.pop();
    }
    return true;
  };

  return walk(0);
}

function computeCountSpread(countMap, ids) {
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  for (const id of ids) {
    const value = Number(countMap[id]) || 0;
    if (value < min) min = value;
    if (value > max) max = value;
  }
  if (!Number.isFinite(min) || !Number.isFinite(max)) return 0;
  return max - min;
}

function computeRoundsSinceRest(state, roundIndex, id) {
  const last = Number(state.lastRestRound[id]);
  if (!Number.isFinite(last) || last < 0) return roundIndex + 1;
  return roundIndex - last;
}

function countDoublesMatchups(playersCount) {
  return countComb(playersCount, 4) * 3;
}

module.exports = {
  squareCost,
  incrementalSquareCost,
  normalizeSeed,
  hashString,
  countComb,
  enumerateCombinations,
  computeCountSpread,
  computeRoundsSinceRest,
  countDoublesMatchups
};
