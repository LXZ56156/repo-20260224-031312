function normalizeGender(gender) {
  const v = String(gender || '').trim().toLowerCase();
  if (v === 'male' || v === 'female') return v;
  return 'unknown';
}

function countGenderPlayers(players) {
  const list = Array.isArray(players) ? players : [];
  let maleCount = 0;
  let femaleCount = 0;
  let unknownCount = 0;
  for (const player of list) {
    const g = normalizeGender(player && player.gender);
    if (g === 'male') maleCount += 1;
    else if (g === 'female') femaleCount += 1;
    else unknownCount += 1;
  }
  return { maleCount, femaleCount, unknownCount };
}

module.exports = {
  normalizeGender,
  countGenderPlayers
};
