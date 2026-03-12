const modeHelper = require('./mode');

const PRESET_OPTIONS = [
  { key: 'relax', label: '轻松', totalMatches: 6, courts: 2 },
  { key: 'standard', label: '标准', totalMatches: 8, courts: 2 },
  { key: 'intense', label: '强度', totalMatches: 12, courts: 2 },
  { key: 'custom', label: '自定义', totalMatches: 8, courts: 2 }
];

const SESSION_MINUTE_OPTIONS = [60, 90, 120, 150, 180];
const SLOT_MINUTE_OPTIONS = [10, 12, 15, 18, 20, 25];
const DEFAULT_SESSION_MINUTES = 120;
const DEFAULT_SLOT_MINUTES = 15;
const DEFAULT_WARMUP_BUFFER = 10;
const DEFAULT_ESTIMATED_PLAYERS = 8;
const RECOMMEND_MODEL_VERSION = 'v2';
const MODE_MULTI_ROTATE = modeHelper.MODE_MULTI_ROTATE;
const MODE_SQUAD_DOUBLES = modeHelper.MODE_SQUAD_DOUBLES;
const MODE_FIXED_PAIR_RR = modeHelper.MODE_FIXED_PAIR_RR;
const MODE_DOUBLES = modeHelper.MODE_DOUBLES;
const MODE_MIXED_FALLBACK = modeHelper.MODE_MIXED_FALLBACK;

const ACTION_TEMPLATES = {
  join: { text: '加入参赛' },
  settings: { text: '去保存参数' },
  quickImport: { text: '去导入名单' },
  start: { text: '开始比赛' },
  batch: { text: '去批量录分' },
  analytics: { text: '查看赛事复盘' },
  schedule: { text: '查看对阵' },
  ranking: { text: '查看排名' }
};

function buildAction(key) {
  const k = String(key || '').trim();
  const tpl = ACTION_TEMPLATES[k] || ACTION_TEMPLATES.schedule;
  return {
    key: ACTION_TEMPLATES[k] ? k : 'schedule',
    text: tpl.text
  };
}

function normalizePresetKey(key) {
  const v = String(key || '').trim().toLowerCase();
  return PRESET_OPTIONS.some((x) => x.key === v) ? v : 'standard';
}

function normalizeMode(mode) {
  return modeHelper.normalizeMode(mode);
}

function getModeLabel(mode) {
  return modeHelper.getModeLabel(mode);
}

function getModeIntro(mode) {
  const v = normalizeMode(mode);
  if (v === MODE_SQUAD_DOUBLES) return '个人报名后选A/B队，固定 A 队对 B 队。';
  if (v === MODE_FIXED_PAIR_RR) return '双打队伍单循环交手，按胜场与净胜分排名。';
  return '个人轮换搭档上场，按个人成绩排名。';
}

function getModeRuleLines(mode) {
  const v = normalizeMode(mode);
  if (v === MODE_SQUAD_DOUBLES) {
    return [
      '报名时选择 A 队或 B 队',
      '每场固定 A 队双打对阵 B 队双打',
      '同轮同人最多上场 1 次',
      '胜队 +1 胜场，按胜场优先排名',
      '结束条件支持总场数/总轮数/目标胜场'
    ];
  }
  if (v === MODE_FIXED_PAIR_RR) {
    return [
      '以双打队伍为单位报名（管理员组队）',
      '每支队伍与其他队伍各交手 1 次',
      '奇数队时每轮有 1 支队伍轮空',
      '本期固定一局定胜',
      '未完场次由管理员判定录入'
    ];
  }
  return [
    '以个人为单位报名',
    '系统轮换搭档进行双打',
    '同轮同人最多上场 1 次',
    '按胜场、净胜分、总得分排名',
    '人数不足时可先配置参数，导入后自动刷新建议'
  ];
}

function getLaunchModes() {
  return [
    {
      key: 'multi',
      mode: MODE_MULTI_ROTATE,
      name: '多人转',
      summary: '个人轮换搭档上场，按个人成绩排名，4~30 人可用。',
      badge: ''
    },
    {
      key: 'squad',
      mode: MODE_SQUAD_DOUBLES,
      name: '小队转',
      summary: '个人报名先选 A/B 队，每场 A 队双打对阵 B 队双打，按队伍胜场累计。',
      badge: ''
    },
    {
      key: 'fixed',
      mode: MODE_FIXED_PAIR_RR,
      name: '固搭循环赛',
      summary: '以双打队伍报名，单循环依次交手，按胜场与净胜分排名。',
      badge: ''
    }
  ];
}

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

function parsePositiveInt(value, fallback = 0, maxValue = null) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 1) return fallback;
  const nn = Math.floor(n);
  if (Number.isFinite(maxValue)) return Math.min(nn, maxValue);
  return nn;
}

function normalizeSessionMinutes(value, fallback = DEFAULT_SESSION_MINUTES) {
  const v = parsePositiveInt(value, fallback);
  if (SESSION_MINUTE_OPTIONS.includes(v)) return v;
  return DEFAULT_SESSION_MINUTES;
}

function normalizeSlotMinutes(value, fallback = DEFAULT_SLOT_MINUTES) {
  const v = parsePositiveInt(value, fallback);
  if (SLOT_MINUTE_OPTIONS.includes(v)) return v;
  return DEFAULT_SLOT_MINUTES;
}

function calcMaxMatchesByPlayers(playersCount) {
  const n = Number(playersCount) || 0;
  if (n < 4) return 0;
  const comb4 = (n * (n - 1) * (n - 2) * (n - 3)) / 24;
  return Math.floor(comb4 * 3);
}

function comb(n, k) {
  const nn = Math.floor(Number(n) || 0);
  const kk = Math.floor(Number(k) || 0);
  if (kk < 0 || nn < 0 || kk > nn) return 0;
  if (kk === 0 || kk === nn) return 1;
  const m = Math.min(kk, nn - kk);
  let numerator = 1;
  let denominator = 1;
  for (let i = 1; i <= m; i += 1) {
    numerator *= (nn - m + i);
    denominator *= i;
  }
  return Math.floor(numerator / denominator);
}

function calcMaxMatchesByMixedGender(maleCount, femaleCount, unknownCount, allowOpen = false) {
  const male = Math.max(0, Number(maleCount) || 0);
  const female = Math.max(0, Number(femaleCount) || 0);
  const unknown = Math.max(0, Number(unknownCount) || 0);
  const total = male + female + unknown;
  if (total < 4) return 0;

  const mxMatches = comb(male, 2) * comb(female, 2);
  const mmMatches = comb(male, 4);
  const ffMatches = comb(female, 4);
  const openMatches = allowOpen ? comb(total, 4) : 0;
  const totalMatches = mxMatches + mmMatches + ffMatches + openMatches;
  return Math.floor(totalMatches * 3);
}

function calcTimeBasedCapacity(courts, sessionMinutes, slotMinutes, warmupBuffer = DEFAULT_WARMUP_BUFFER) {
  const c = Math.max(1, parsePositiveInt(courts, 1, 10));
  const session = Math.max(30, parsePositiveInt(sessionMinutes, DEFAULT_SESSION_MINUTES));
  const slot = Math.max(8, parsePositiveInt(slotMinutes, DEFAULT_SLOT_MINUTES));
  const effectiveMinutes = Math.max(15, session - Math.max(0, Number(warmupBuffer) || 0));
  const cap = Math.floor((c * effectiveMinutes) / slot);
  return {
    effectiveMinutes,
    maxByTime: Math.max(1, cap)
  };
}

function pickTargetGamesPerPlayer(sessionMinutes) {
  const m = Math.max(30, parsePositiveInt(sessionMinutes, DEFAULT_SESSION_MINUTES));
  if (m <= 90) return 2.2;
  if (m <= 120) return 3.0;
  if (m <= 150) return 3.8;
  if (m <= 180) return 4.6;
  return 5.2;
}

function buildTierMatches(cap, balancedRaw) {
  const limit = Math.max(1, Number(cap) || 1);
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, Math.floor(v)));

  let balanced = 1;
  let relax = 1;
  let intense = 1;

  if (limit >= 3) {
    balanced = clamp(balancedRaw, 1, limit - 1);
    relax = clamp(Math.floor(balanced * 0.82), 1, Math.max(1, balanced - 1));
    intense = clamp(Math.ceil(balanced * 1.18), Math.min(limit, balanced + 1), limit);
  } else {
    balanced = clamp(balancedRaw, 1, limit);
    relax = Math.max(1, Math.min(balanced, Math.floor(balanced * 0.82)));
    intense = Math.max(balanced, Math.min(limit, Math.ceil(balanced * 1.18)));
  }

  return [
    { key: 'relax', label: '保守', m: relax },
    { key: 'balanced', label: '均衡', m: balanced },
    { key: 'intense', label: '饱和', m: intense }
  ];
}

function buildMatchCountRecommendations(input) {
  const raw = input || {};
  const mode = normalizeMode(raw.mode);
  // Compatibility-only field: keep legacy calculations readable, but do not treat
  // `allowOpenTeam` as an actively expanding product capability.
  const allowOpenTeam = raw.allowOpenTeam === true;
  const playersCount = Math.max(0, Number(raw.playersCount) || 0);
  const maleCount = Math.max(0, Number(raw.maleCount) || 0);
  const femaleCount = Math.max(0, Number(raw.femaleCount) || 0);
  const unknownCount = Math.max(0, Number(raw.unknownCount) || 0);
  const courts = Math.max(1, parsePositiveInt(raw.courts, 2, 10));
  const sessionMinutes = normalizeSessionMinutes(raw.sessionMinutes, DEFAULT_SESSION_MINUTES);
  const slotMinutes = normalizeSlotMinutes(raw.slotMinutes, DEFAULT_SLOT_MINUTES);
  const warmupBuffer = Math.max(0, Number(raw.warmupBuffer) || DEFAULT_WARMUP_BUFFER);

  const { effectiveMinutes, maxByTime: maxByTimeRaw } = calcTimeBasedCapacity(courts, sessionMinutes, slotMinutes, warmupBuffer);
  const maxByTime = maxByTimeRaw;

  let maxByCombinatoricsRaw = calcMaxMatchesByPlayers(playersCount);
  if (mode === MODE_FIXED_PAIR_RR) {
    const teamCount = Math.floor(playersCount / 2);
    maxByCombinatoricsRaw = teamCount >= 2 ? comb(teamCount, 2) : 0;
  }
  const maxByCombinatorics = maxByCombinatoricsRaw > 0 ? maxByCombinatoricsRaw : Number.POSITIVE_INFINITY;
  const cap = Math.max(1, Math.min(maxByTime, maxByCombinatorics));
  const estimatedMode = playersCount < 4;
  const estimatedPlayers = estimatedMode ? Math.max(6, Math.min(10, courts * 4)) : playersCount;
  const targetGamesPerPlayer = pickTargetGamesPerPlayer(sessionMinutes);
  let balancedRaw = Math.round((estimatedPlayers * targetGamesPerPlayer) / 4);
  if (estimatedMode) balancedRaw = Math.floor(balancedRaw * 0.82);
  balancedRaw = Math.max(1, balancedRaw);
  const recommendedMatches = buildTierMatches(cap, balancedRaw);
  const suggestedMatches = Number((recommendedMatches[1] && recommendedMatches[1].m) || (recommendedMatches[0] && recommendedMatches[0].m) || 1);

  let capReason = 'time';
  if (mode === MODE_FIXED_PAIR_RR) {
    capReason = 'round_robin';
  } else if (estimatedMode) {
    capReason = 'estimated';
  } else if (maxByCombinatoricsRaw > 0 && maxByCombinatoricsRaw < maxByTime) {
    capReason = 'combinatorics';
  }

  let recommendationHint = '';
  if (capReason === 'round_robin') {
    recommendationHint = `最多可安排：${cap} 场（按已组队伍单循环计算）`;
  } else if (capReason === 'combinatorics') {
    recommendationHint = `受参赛信息限制，当前最多 ${maxByCombinatoricsRaw} 场。`;
  } else if (capReason === 'estimated') {
    recommendationHint = `按人数与时长自动安排场次（上限 ${maxByTime} 场），导入完整名单后会自动调整。`;
  } else {
    recommendationHint = `按人数与时长自动安排场次（上限 ${maxByTime} 场）。`;
  }

  let capacityHintShort = `最多可安排：${cap} 场（按场地与时长估算）`;
  if (capReason === 'combinatorics') {
    capacityHintShort = `最多可安排：${cap} 场（受参赛规模限制）`;
  } else if (capReason === 'round_robin') {
    capacityHintShort = `最多可安排：${cap} 场（按已组队伍单循环计算）`;
  }
  const rosterHint = estimatedMode ? '导入完整名单后会自动重算' : '';

  return {
    recommendedModelVersion: RECOMMEND_MODEL_VERSION,
    mode,
    allowOpenTeam,
    playersCount,
    maleCount,
    femaleCount,
    unknownCount,
    courts,
    sessionMinutes,
    slotMinutes,
    warmupBuffer,
    effectiveMinutes,
    estimatedPlayers,
    estimatedMode,
    targetGamesPerPlayer,
    maxByTime,
    maxByCombinatorics: maxByCombinatoricsRaw,
    balancedRaw,
    capReason,
    recommendedCap: cap,
    recommendedMatches,
    recommendationHint,
    suggestedMatches,
    capacityMax: cap,
    capacityReason: capReason,
    capacityHintShort,
    rosterHint
  };
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
  const mode = normalizeMode(raw.mode);
  const preset = getPresetOption(presetKey);

  let totalMatches = parsePositiveInt(raw.totalMatches, preset.totalMatches);
  let courts = parsePositiveInt(raw.courts, preset.courts, 10);
  if (courts < 1) courts = 1;

  return {
    mode,
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
      if (!match) continue;
      const status = String(match.status || '').trim();
      if (status !== 'finished' && status !== 'canceled') return true;
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
    return buildAction('join');
  }
  if (status === 'draft' && isAdmin && !checkSettingsOk) {
    return buildAction('settings');
  }
  if (status === 'draft' && isAdmin && !checkPlayersOk) {
    return buildAction('quickImport');
  }
  if (status === 'draft' && isAdmin && checkPlayersOk && checkSettingsOk) {
    return buildAction('start');
  }
  if (status === 'running' && canEditScore && hasPending) {
    return buildAction('batch');
  }
  if (status === 'finished') {
    return buildAction('analytics');
  }
  if (status === 'running') {
    return buildAction('schedule');
  }
  return buildAction('schedule');
}

module.exports = {
  getPresetOptions,
  getPresetOption,
  normalizePresetKey,
  parsePositiveInt,
  normalizeMode,
  getModeLabel,
  getModeIntro,
  getModeRuleLines,
  getLaunchModes,
  normalizeGender,
  countGenderPlayers,
  normalizeSessionMinutes,
  normalizeSlotMinutes,
  calcMaxMatchesByPlayers,
  calcMaxMatchesByMixedGender,
  calcTimeBasedCapacity,
  buildMatchCountRecommendations,
  SESSION_MINUTE_OPTIONS,
  SLOT_MINUTE_OPTIONS,
  DEFAULT_SESSION_MINUTES,
  DEFAULT_SLOT_MINUTES,
  DEFAULT_WARMUP_BUFFER,
  DEFAULT_ESTIMATED_PLAYERS,
  RECOMMEND_MODEL_VERSION,
  MODE_MULTI_ROTATE,
  MODE_SQUAD_DOUBLES,
  MODE_FIXED_PAIR_RR,
  MODE_DOUBLES,
  MODE_MIXED_FALLBACK,
  resolveCreateSettings,
  hasPendingMatch,
  pickNextAction
};
