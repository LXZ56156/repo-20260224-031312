const PRESET_OPTIONS = [
  { key: 'relax', label: '轻松', totalMatches: 6, courts: 2 },
  { key: 'standard', label: '标准', totalMatches: 8, courts: 2 },
  { key: 'intense', label: '强度', totalMatches: 12, courts: 2 },
  { key: 'custom', label: '自定义', totalMatches: 8, courts: 2 }
];

function normalizePresetKey(key) {
  const v = String(key || '').trim().toLowerCase();
  return PRESET_OPTIONS.some((x) => x.key === v) ? v : 'standard';
}

function parsePositiveInt(value, fallback = 0, maxValue = null) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 1) return fallback;
  const nn = Math.floor(n);
  if (Number.isFinite(maxValue)) return Math.min(nn, maxValue);
  return nn;
}

function getPresetOption(key) {
  const k = normalizePresetKey(key);
  return PRESET_OPTIONS.find((x) => x.key === k) || PRESET_OPTIONS[1];
}

function getPresetOptions() {
  return PRESET_OPTIONS.slice();
}

function resolveCreateSettings(input) {
  const raw = input || {};
  const presetKey = normalizePresetKey(raw.presetKey);
  const preset = getPresetOption(presetKey);

  let totalMatches = parsePositiveInt(raw.totalMatches, preset.totalMatches);
  let courts = parsePositiveInt(raw.courts, preset.courts, 10);
  if (courts < 1) courts = 1;

  return {
    presetKey,
    totalMatches,
    courts,
    settingsConfigured: totalMatches >= 1 && courts >= 1
  };
}

function hasPendingMatch(rounds) {
  const list = Array.isArray(rounds) ? rounds : [];
  for (const round of list) {
    const matches = Array.isArray(round && round.matches) ? round.matches : [];
    for (const match of matches) {
      if (match && String(match.status || '') !== 'finished') return true;
    }
  }
  return false;
}

function pickNextAction(ctx) {
  const c = ctx || {};
  const status = String(c.status || 'draft');
  const isAdmin = !!c.isAdmin;
  const myJoined = !!c.myJoined;
  const checkPlayersOk = !!c.checkPlayersOk;
  const checkSettingsOk = !!c.checkSettingsOk;
  const canEditScore = !!c.canEditScore;
  const hasPending = !!c.hasPending;

  if (status === 'draft' && !myJoined) {
    return { key: 'join', text: '加入参赛', secondaryKey: 'schedule', secondaryText: '先看赛程说明' };
  }
  if (status === 'draft' && isAdmin && !checkSettingsOk) {
    return { key: 'settings', text: '去保存参数', secondaryKey: 'quickImport', secondaryText: '快速导入名单' };
  }
  if (status === 'draft' && isAdmin && checkPlayersOk && checkSettingsOk) {
    return { key: 'start', text: '开赛并锁定赛程', secondaryKey: 'share', secondaryText: '分享到群' };
  }
  if (status === 'running' && canEditScore && hasPending) {
    return { key: 'batch', text: '去批量录分', secondaryKey: 'schedule', secondaryText: '查看全部赛程' };
  }
  if (status === 'finished') {
    return { key: 'analytics', text: '查看赛事复盘', secondaryKey: 'clone', secondaryText: '再办一场' };
  }
  if (status === 'running') {
    return { key: 'schedule', text: '查看赛程', secondaryKey: 'ranking', secondaryText: '查看排名' };
  }
  return { key: 'schedule', text: '查看赛程', secondaryKey: 'ranking', secondaryText: '查看排名' };
}

module.exports = {
  getPresetOptions,
  getPresetOption,
  normalizePresetKey,
  parsePositiveInt,
  resolveCreateSettings,
  hasPendingMatch,
  pickNextAction
};
