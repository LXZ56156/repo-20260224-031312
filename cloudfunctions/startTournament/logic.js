function calcMaxMatches(n) {
  const nn = Number(n) || 0;
  if (nn < 4) return 0;
  const comb4 = (nn * (nn - 1) * (nn - 2) * (nn - 3)) / 24;
  return Math.floor(comb4 * 3);
}

function validateBeforeGenerate(tournament) {
  const t = tournament || {};
  const players = Array.isArray(t.players) ? t.players : [];
  if (players.length < 4) throw new Error('参赛人数不足 4 人');

  const totalMatches = Number(t.totalMatches) || 1;
  const courts = Math.max(1, Math.min(10, Number(t.courts) || 1));
  if (totalMatches < 1) throw new Error('M 必须 >= 1');
  if (courts < 1) throw new Error('C 必须 >= 1');

  const maxMatches = calcMaxMatches(players.length);
  if (maxMatches > 0 && totalMatches > maxMatches) {
    throw new Error(`总场次不能超过最大可选 ${maxMatches} 场`);
  }
  return { players, totalMatches, courts, maxMatches };
}

module.exports = {
  calcMaxMatches,
  validateBeforeGenerate
};
