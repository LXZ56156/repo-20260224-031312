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

function validateSettings(players, totalMatches, courts) {
  const list = Array.isArray(players) ? players : [];
  const maxMatches = calcMaxMatches(list.length);

  if (totalMatches !== null) {
    // 允许在人数不足 4 时先做预配置；开赛前由 startTournament 做最终校验。
    if (maxMatches > 0 && totalMatches > maxMatches) {
      throw new Error(`总场次不能超过最大可选 ${maxMatches} 场`);
    }
  }

  const patch = {};
  if (totalMatches !== null) patch.totalMatches = totalMatches;
  if (courts !== null) patch.courts = courts;
  if (totalMatches !== null && courts !== null) patch.settingsConfigured = true;

  return { maxMatches, patch };
}

module.exports = {
  parsePosInt,
  calcMaxMatches,
  validateSettings
};
