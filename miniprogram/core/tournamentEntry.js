function parseQueryString(raw = '') {
  const qs = String(raw || '').trim();
  if (!qs) return {};
  const result = {};
  const pairs = qs.split('&');
  for (const pair of pairs) {
    const idx = pair.indexOf('=');
    if (idx === -1) {
      const key = decodeURIComponent(pair);
      if (key && !result[key]) result[key] = '';
    } else {
      const key = decodeURIComponent(pair.slice(0, idx));
      const value = decodeURIComponent(pair.slice(idx + 1));
      if (key && !(key in result)) result[key] = value;
    }
  }
  return result;
}

function pickFirstString(value) {
  return String(value || '').trim();
}

function extractIdFromQueryObject(query) {
  if (!query || typeof query !== 'object') return '';
  return pickFirstString(query.tournamentId || query.tid || query.id || query.tournament_id || '');
}

function extractIdFromQueryStr(raw) {
  const qs = String(raw || '').trim();
  if (!qs) return '';
  const parsed = parseQueryString(qs);
  return pickFirstString(parsed.tournamentId || parsed.tid || parsed.id || parsed.tournament_id || '');
}

function parseTournamentIdFromOptions(options = {}) {
  const opts = options && typeof options === 'object' ? options : {};

  // 1. 直接属性: tournamentId / tid / id / tournament_id
  let tid = pickFirstString(opts.tournamentId || opts.tid || opts.id || opts.tournament_id || '');
  if (tid) return tid;

  // 2. options.query 对象
  tid = extractIdFromQueryObject(opts.query);
  if (tid) return tid;

  // 3. options.query 字符串
  if (typeof opts.query === 'string') {
    tid = extractIdFromQueryStr(opts.query);
    if (tid) return tid;
  }

  // 4. options.scene
  const rawScene = opts.scene;
  if (!rawScene) return '';

  let scene = '';
  try {
    scene = decodeURIComponent(rawScene);
  } catch (_) {
    scene = String(rawScene || '').trim();
  }

  // scene 作为 query string 解析
  if (scene.includes('=')) {
    tid = extractIdFromQueryStr(scene);
    if (tid) return tid;
  }

  // scene 直接为 id（无 = 无 & 的纯 id）
  if (scene && !scene.includes('=') && !scene.includes('&')) return scene;

  return '';
}

module.exports = {
  parseTournamentIdFromOptions
};
