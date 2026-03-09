function parseTournamentIdFromOptions(options = {}) {
  let tid = String((options && options.tournamentId) || '').trim();
  if (tid) return tid;

  const rawScene = options && options.scene;
  if (!rawScene) return '';

  let scene = '';
  try {
    scene = decodeURIComponent(rawScene);
  } catch (_) {
    scene = String(rawScene || '').trim();
  }

  const matched = /tournamentId=([^&]+)/.exec(scene) || /tid=([^&]+)/.exec(scene);
  if (matched && matched[1]) return String(matched[1] || '').trim();
  if (scene && !scene.includes('=') && !scene.includes('&')) return scene;
  return '';
}

module.exports = {
  parseTournamentIdFromOptions
};
