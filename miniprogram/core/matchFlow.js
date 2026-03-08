function findNextPending(rounds, currentRoundIndex, currentMatchIndex) {
  const all = [];
  const list = Array.isArray(rounds) ? rounds : [];
  for (const round of list) {
    const rIdx = Number(round && round.roundIndex);
    const matches = Array.isArray(round && round.matches) ? round.matches : [];
    for (const match of matches) {
      const status = String(match && match.status || '').trim();
      if (!match || status === 'finished' || status === 'canceled') continue;
      all.push({ roundIndex: rIdx, matchIndex: Number(match.matchIndex) });
    }
  }
  if (!all.length) return null;

  all.sort((a, b) => {
    if (a.roundIndex !== b.roundIndex) return a.roundIndex - b.roundIndex;
    return a.matchIndex - b.matchIndex;
  });

  for (const item of all) {
    if (item.roundIndex > currentRoundIndex) return item;
    if (item.roundIndex === currentRoundIndex && item.matchIndex > currentMatchIndex) return item;
  }
  return all[0] || null;
}

function shouldAutoJump(batchMode, autoNext) {
  return Boolean(batchMode) && Boolean(autoNext);
}

module.exports = {
  findNextPending,
  shouldAutoJump
};
