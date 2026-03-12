const perm = require('../../permission/permission');
const flow = require('../../core/uxFlow');

const POINT_OPTIONS = [11, 15, 21];
const END_CONDITION_OPTIONS = [
  { key: 'total_matches', label: '打满总场数' },
  { key: 'total_rounds', label: '打满总轮数' },
  { key: 'target_wins', label: '先到目标胜场' }
];

function buildDigitRange(len) {
  const digits = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];
  return Array.from({ length: len }, () => digits);
}

function valueToDigitValue(value, len) {
  const v = Math.max(0, Math.floor(Number(value) || 0));
  const s = String(v).padStart(len, '0');
  return s.split('').map((ch) => Number(ch));
}

function digitValueToNumber(digitValue) {
  const s = (digitValue || []).map((i) => String(i)).join('');
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

function normalizeEndConditionType(type) {
  const value = String(type || '').trim().toLowerCase();
  if (value === 'total_matches' || value === 'total_rounds' || value === 'target_wins') return value;
  return 'total_matches';
}

function clampTarget(target, options) {
  const list = Array.isArray(options) ? options : [];
  const min = list.length ? Number(list[0] || 1) : 1;
  const max = list.length ? Number(list[list.length - 1] || 1) : 1;
  const n = Math.floor(Number(target) || 1);
  return Math.max(min, Math.min(max, n));
}

function suggestEndConditionTarget(type, totalMatches, courts) {
  const normalized = normalizeEndConditionType(type);
  const M = Math.max(1, Math.floor(Number(totalMatches) || 1));
  const C = Math.max(1, Math.floor(Number(courts) || 1));
  if (normalized === 'total_matches') return M;
  if (normalized === 'total_rounds') return Math.max(1, Math.ceil(M / C));
  return Math.max(1, Math.ceil(M / 2));
}

function buildEndConditionUi(type, target) {
  const normalized = normalizeEndConditionType(type);
  const t = Math.max(1, Math.floor(Number(target) || 1));
  if (normalized === 'total_matches') {
    return {
      targetLabel: '总场数（自动）',
      targetUnit: '场',
      targetHint: `比赛累计打满 ${t} 场后结束。`,
      showTargetPicker: false
    };
  }
  if (normalized === 'total_rounds') {
    return {
      targetLabel: '总轮数',
      targetUnit: '轮',
      targetHint: `比赛进行到第 ${t} 轮后结束。`,
      showTargetPicker: true
    };
  }
  return {
    targetLabel: '目标胜场',
    targetUnit: '胜',
    targetHint: `任一队先拿到 ${t} 胜即结束。`,
    showTargetPicker: true
  };
}

function buildRecommendationState({
  mode,
  players,
  playersCount,
  courts,
  sessionMinutes,
  slotMinutes,
  allowOpenTeam = false
}) {
  const genderCount = flow.countGenderPlayers(players);
  const recommendation = flow.buildMatchCountRecommendations({
    mode,
    maleCount: genderCount.maleCount,
    femaleCount: genderCount.femaleCount,
    unknownCount: genderCount.unknownCount,
    allowOpenTeam,
    playersCount,
    courts,
    sessionMinutes,
    slotMinutes
  });
  return {
    recommendation,
    genderCount
  };
}

function buildSettingsViewState(tournament, options = {}) {
  const t = tournament && typeof tournament === 'object' ? tournament : {};
  const openid = String(options.openid || '').trim();
  const sessionMinutes = flow.normalizeSessionMinutes(options.sessionMinutes, flow.DEFAULT_SESSION_MINUTES);
  const slotMinutes = flow.normalizeSlotMinutes(options.slotMinutes, flow.DEFAULT_SLOT_MINUTES);
  const isAdmin = perm.isAdmin(t, openid);
  const isDraft = String(t.status || 'draft') === 'draft';

  const players = Array.isArray(t.players) ? t.players : [];
  const playersCount = players.length;
  const mode = flow.normalizeMode(t.mode || flow.MODE_MULTI_ROTATE);
  const modeLabel = flow.getModeLabel(mode);
  const allowOpenTeam = false;

  let maxMatches = flow.calcMaxMatchesByPlayers(playersCount);
  if (mode === flow.MODE_FIXED_PAIR_RR) {
    const pairTeams = Array.isArray(t.pairTeams) ? t.pairTeams.filter((item) => Array.isArray(item && item.playerIds) && item.playerIds.length === 2) : [];
    maxMatches = pairTeams.length >= 2 ? Math.floor((pairTeams.length * (pairTeams.length - 1)) / 2) : 0;
  }

  const { recommendation } = buildRecommendationState({
    mode,
    players,
    playersCount,
    courts: Number(t.courts) || 1,
    sessionMinutes,
    slotMinutes,
    allowOpenTeam
  });

  let editM = Number(t.totalMatches) || 0;
  if (editM < 1) editM = Number(recommendation.suggestedMatches || 8);
  if (editM < 1) editM = 1;
  if (maxMatches > 0 && editM > maxMatches) editM = maxMatches;

  const editC = Math.max(1, Math.min(10, Number(t.courts) || 1));
  const settingsReady = t.settingsConfigured === true || (editM >= 1 && editC >= 1);
  const useSimpleMPicker = maxMatches > 0 && maxMatches <= 200;
  const mOptions = useSimpleMPicker ? Array.from({ length: maxMatches }, (_, i) => i + 1) : [];
  const mIndex = useSimpleMPicker && editM >= 1 ? (editM - 1) : 0;
  const digitLen = Math.max(2, String(maxMatches > 0 ? maxMatches : 999).length);

  const rules = t.rules && typeof t.rules === 'object' ? t.rules : {};
  const pointsPerGame = POINT_OPTIONS.includes(Number(rules.pointsPerGame)) ? Number(rules.pointsPerGame) : 21;
  const pointsIndex = Math.max(0, POINT_OPTIONS.indexOf(pointsPerGame));
  const rawEndCondition = rules.endCondition && typeof rules.endCondition === 'object' ? rules.endCondition : {};
  const showSquadEndCondition = mode === flow.MODE_SQUAD_DOUBLES;
  const endConditionType = showSquadEndCondition
    ? normalizeEndConditionType(rawEndCondition.type || 'total_matches')
    : 'total_matches';
  const endConditionOptions = END_CONDITION_OPTIONS;
  const endConditionIndex = Math.max(0, endConditionOptions.findIndex((item) => item.key === endConditionType));
  const endConditionTargetOptions = Array.from({ length: 200 }, (_, i) => i + 1);
  const fallbackTarget = suggestEndConditionTarget(endConditionType, editM, editC);
  const endConditionTarget = clampTarget(rawEndCondition.target || fallbackTarget, endConditionTargetOptions);
  const endConditionUi = buildEndConditionUi(endConditionType, endConditionTarget);
  const safeName = String(t.name || '').trim() || modeLabel;

  return {
    loadError: false,
    tournament: t,
    pageTitle: isDraft ? '修改比赛' : '比赛信息',
    contextTitle: isDraft ? '仅草稿阶段可修改比赛信息' : '当前仅查看比赛信息',
    mode,
    modeLabel,
    allowOpenTeam,
    isAdmin,
    isDraft,
    name: safeName,
    maxMatches,
    suggestedMatches: Number(recommendation.suggestedMatches) || 1,
    capacityMax: Number(recommendation.capacityMax) || 1,
    capacityHintShort: String(recommendation.capacityHintShort || ''),
    capacityReason: String(recommendation.capacityReason || 'time'),
    rosterHint: String(recommendation.rosterHint || ''),
    settingsReady,
    mandatoryDone: settingsReady ? 1 : 0,
    mandatoryTotal: 1,
    editM,
    editC,
    useSimpleMPicker,
    mOptions,
    mIndex,
    mDigitRange: buildDigitRange(digitLen),
    mDigitValue: valueToDigitValue(editM, digitLen),
    courtIndex: Math.max(0, Math.min(9, editC - 1)),
    pointsOptions: POINT_OPTIONS,
    pointsPerGame,
    pointsIndex,
    endConditionOptions,
    endConditionType,
    endConditionIndex: endConditionIndex >= 0 ? endConditionIndex : 0,
    endConditionTargetOptions,
    endConditionTarget,
    endConditionTargetIndex: Math.max(0, endConditionTarget - 1),
    endConditionTargetLabel: endConditionUi.targetLabel,
    endConditionTargetUnit: endConditionUi.targetUnit,
    endConditionTargetHint: endConditionUi.targetHint,
    showEndConditionTargetPicker: endConditionUi.showTargetPicker,
    showSquadEndCondition
  };
}

module.exports = {
  POINT_OPTIONS,
  END_CONDITION_OPTIONS,
  buildDigitRange,
  valueToDigitValue,
  digitValueToNumber,
  normalizeEndConditionType,
  clampTarget,
  suggestEndConditionTarget,
  buildEndConditionUi,
  buildRecommendationState,
  buildSettingsViewState
};
