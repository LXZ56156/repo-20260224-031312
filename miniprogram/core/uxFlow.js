const modeHelper = require('./mode');
const capacity = require('./ux/capacity');
const gender = require('./ux/gender');
const presets = require('./ux/presets');

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

function getModeLabel(mode) {
  return modeHelper.getModeLabel(mode);
}

function getModeIntro(mode) {
  const value = normalizeMode(mode);
  if (value === MODE_SQUAD_DOUBLES) return '个人报名后选A/B队，固定 A 队对 B 队。';
  if (value === MODE_FIXED_PAIR_RR) return '双打队伍单循环交手，按胜场与净胜分排名。';
  return '个人轮换搭档上场，按个人成绩排名。';
}

function getModeRuleLines(mode) {
  const value = normalizeMode(mode);
  if (value === MODE_SQUAD_DOUBLES) {
    return [
      '报名时选择 A 队或 B 队',
      '每场固定 A 队双打对阵 B 队双打',
      '同轮同人最多上场 1 次',
      '胜队 +1 胜场，按胜场优先排名',
      '结束条件支持总场数/总轮数/目标胜场'
    ];
  }
  if (value === MODE_FIXED_PAIR_RR) {
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

function resolveCreateSettings(input) {
  const raw = input || {};
  const presetKey = presets.normalizePresetKey(raw.presetKey);
  const mode = normalizeMode(raw.mode);
  const preset = presets.getPresetOption(presetKey);

  let totalMatches = capacity.parsePositiveInt(raw.totalMatches, preset.totalMatches);
  let courts = capacity.parsePositiveInt(raw.courts, preset.courts, 10);
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
  const state = ctx || {};
  const status = String(state.status || 'draft');
  const isAdmin = !!state.isAdmin;
  const myJoined = !!state.myJoined;
  const checkPlayersOk = !!state.checkPlayersOk;
  const checkSettingsOk = !!state.checkSettingsOk;
  const canEditScore = !!state.canEditScore;
  const hasPending = !!state.hasPending;

  if (status === 'draft' && !myJoined) return buildAction('join');
  if (status === 'draft' && isAdmin && !checkSettingsOk) return buildAction('settings');
  if (status === 'draft' && isAdmin && !checkPlayersOk) return buildAction('quickImport');
  if (status === 'draft' && isAdmin && checkPlayersOk && checkSettingsOk) return buildAction('start');
  if (status === 'running' && canEditScore && hasPending) return buildAction('batch');
  if (status === 'finished') return buildAction('analytics');
  if (status === 'running') return buildAction('schedule');
  return buildAction('schedule');
}

module.exports = {
  ...capacity,
  ...gender,
  ...presets,
  normalizeMode,
  getModeLabel,
  getModeIntro,
  getModeRuleLines,
  getLaunchModes,
  MODE_MULTI_ROTATE,
  MODE_SQUAD_DOUBLES,
  MODE_FIXED_PAIR_RR,
  MODE_DOUBLES,
  MODE_MIXED_FALLBACK,
  resolveCreateSettings,
  hasPendingMatch,
  pickNextAction
};
