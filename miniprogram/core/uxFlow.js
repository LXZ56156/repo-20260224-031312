const modeHelper = require('./mode');
const capacity = require('./ux/capacity');
const gender = require('./ux/gender');

const MODE_MULTI_ROTATE = modeHelper.MODE_MULTI_ROTATE;
const MODE_SQUAD_DOUBLES = modeHelper.MODE_SQUAD_DOUBLES;
const MODE_FIXED_PAIR_RR = modeHelper.MODE_FIXED_PAIR_RR;
const MODE_DOUBLES = modeHelper.MODE_DOUBLES;

const ACTION_TEMPLATES = {
  join: { text: '加入参赛' },
  settings: { text: '去修改比赛' },
  quickImport: { text: '去导入名单' },
  start: { text: '开始比赛' },
  batch: { text: '去批量录分' },
  analytics: { text: '查看结果' },
  schedule: { text: '查看对阵' },
  ranking: { text: '查看排名' }
};

function buildAction(key) {
  const normalized = String(key || '').trim();
  const template = ACTION_TEMPLATES[normalized] || ACTION_TEMPLATES.schedule;
  return {
    key: ACTION_TEMPLATES[normalized] ? normalized : 'schedule',
    text: template.text
  };
}

function normalizeMode(mode) {
  return modeHelper.normalizeMode(mode);
}

function normalizePresetKey(presetKey) {
  return modeHelper.normalizePresetKey(presetKey);
}

function resolveRotationPreset(presetKey) {
  return modeHelper.resolveRotationPreset(presetKey);
}

function getModeDisplayLabel(mode, presetKey) {
  return modeHelper.getModeDisplayLabel(mode, presetKey);
}

function getModeLabel(mode, presetKey) {
  return modeHelper.getModeLabel(mode, presetKey);
}

function getSynchronizedTournamentName(name, mode, presetKey) {
  return modeHelper.getSynchronizedTournamentName(name, mode, presetKey);
}

function getTournamentDisplayName(tournament, fallback) {
  return modeHelper.getTournamentDisplayName(tournament, fallback);
}

function canEditTournamentName(mode, presetKey) {
  return modeHelper.canEditTournamentName(mode, presetKey);
}

function getRotationPlayerLimit(tournament) {
  return modeHelper.getRotationPlayerLimit(tournament);
}

function getModeIntro(mode, presetKey) {
  const value = normalizeMode(mode);
  const preset = value === MODE_MULTI_ROTATE ? resolveRotationPreset(presetKey) : null;
  if (preset) return `${preset.label}固定 ${preset.playerLimit} 人，默认 ${preset.defaultTotalMatches} 场。`;
  if (value === MODE_SQUAD_DOUBLES) return '个人报名后选A/B队，固定 A 队对 B 队。';
  if (value === MODE_FIXED_PAIR_RR) return '双打队伍单循环交手，按胜场与净胜分排名。';
  return '个人轮换搭档上场，按个人成绩排名。';
}

function getModeRuleLines(mode, presetKey) {
  const value = normalizeMode(mode);
  const preset = value === MODE_MULTI_ROTATE ? resolveRotationPreset(presetKey) : null;
  if (preset) {
    return [
      `固定 ${preset.playerLimit} 人参赛，满员后开赛`,
      '系统自动轮换搭档，每人轮流与不同队友组队双打',
      '按个人胜场、净胜分、总得分排名'
    ];
  }
  if (value === MODE_SQUAD_DOUBLES) {
    return [
      '报名时选择 A 队或 B 队，每场固定 A 队 vs B 队双打',
      '同轮每人最多上场 1 次',
      '按队伍胜场排名，支持总场数/总轮数/目标胜场结束条件'
    ];
  }
  if (value === MODE_FIXED_PAIR_RR) {
    return [
      '以双打队伍为单位报名（管理员组队）',
      '每队与其他队伍各交手 1 次，奇数队时每轮 1 队轮空',
      '按胜场、净胜分排名',
      '未完场次由管理员判定录入'
    ];
  }
  return [
    '以个人为单位报名，系统自动轮换搭档双打',
    '同轮每人最多上场 1 次',
    '按胜场、净胜分、总得分排名',
    '满 4 人后可配置参数开赛'
  ];
}

function getLaunchModes() {
  return [
    {
      key: 'rotation_6',
      mode: MODE_MULTI_ROTATE,
      presetKey: 'rotation_6',
      name: '6人转',
      summary: '默认 9 场 · 满 6 人开赛',
      badge: ''
    },
    {
      key: 'rotation_7',
      mode: MODE_MULTI_ROTATE,
      presetKey: 'rotation_7',
      name: '7人转',
      summary: '默认 14 场 · 满 7 人开赛',
      badge: ''
    },
    {
      key: 'rotation_8',
      mode: MODE_MULTI_ROTATE,
      presetKey: 'rotation_8',
      name: '8人转',
      summary: '默认 14 场 · 可选 1/2 场地',
      badge: ''
    },
    {
      key: 'multi',
      mode: MODE_MULTI_ROTATE,
      presetKey: 'custom',
      name: '多人转',
      summary: '个人轮换搭档上场，按个人成绩排名，4~30 人可用。',
      badge: ''
    },
    {
      key: 'squad',
      mode: MODE_SQUAD_DOUBLES,
      presetKey: 'custom',
      name: '小队转',
      summary: '个人报名先选 A/B 队，每场 A 队双打对阵 B 队双打，按队伍胜场累计。',
      badge: ''
    },
    {
      key: 'fixed',
      mode: MODE_FIXED_PAIR_RR,
      presetKey: 'custom',
      name: '固搭循环赛',
      summary: '以双打队伍报名，单循环依次交手，按胜场与净胜分排名。',
      badge: ''
    }
  ];
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
  const state = ctx || {};
  const status = String(state.status || 'draft');
  const isAdmin = !!state.isAdmin;
  const myJoined = !!state.myJoined;
  const checkPlayersOk = !!state.checkPlayersOk;
  const checkSettingsOk = !!state.checkSettingsOk;
  const canEditScore = !!state.canEditScore;
  const hasPending = !!state.hasPending;

  if (status === 'draft' && !myJoined) return buildAction('join');
  if (status === 'draft' && isAdmin && !checkPlayersOk) return buildAction('quickImport');
  if (status === 'draft' && isAdmin && !checkSettingsOk) return buildAction('settings');
  if (status === 'draft' && isAdmin && checkPlayersOk && checkSettingsOk) return buildAction('start');
  if (status === 'running' && canEditScore && hasPending) return buildAction('batch');
  if (status === 'finished') return buildAction('analytics');
  if (status === 'running') return buildAction('schedule');
  return buildAction('schedule');
}

module.exports = {
  ...capacity,
  ...gender,
  normalizeMode,
  normalizePresetKey,
  resolveRotationPreset,
  getModeDisplayLabel,
  getSynchronizedTournamentName,
  getTournamentDisplayName,
  canEditTournamentName,
  getRotationPlayerLimit,
  getModeLabel,
  getModeIntro,
  getModeRuleLines,
  getLaunchModes,
  MODE_MULTI_ROTATE,
  MODE_SQUAD_DOUBLES,
  MODE_FIXED_PAIR_RR,
  MODE_DOUBLES,
  hasPendingMatch,
  pickNextAction
};
