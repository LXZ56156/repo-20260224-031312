const perm = require('../../permission/permission');
const draftStartReadiness = require('../../core/draftStartReadiness');
const flow = require('../../core/uxFlow');
const fixedPair = require('../../core/fixedPair');
const multiRotateMatchOptions = require('../../core/ux/multiRotateMatchOptions');

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
  pairTeams
}) {
  const genderCount = flow.countGenderPlayers(players);
  const recommendation = flow.buildMatchCountRecommendations({
    mode,
    maleCount: genderCount.maleCount,
    femaleCount: genderCount.femaleCount,
    unknownCount: genderCount.unknownCount,
    players,
    pairTeams,
    playersCount,
    courts
  });
  return {
    recommendation,
    genderCount
  };
}

function buildMultiRotatePresetOptions(optionCase, maxMatches) {
  const caseData = optionCase && typeof optionCase === 'object' ? optionCase : null;
  if (!caseData) return [];
  const cap = Math.max(0, Math.floor(Number(maxMatches) || 0));
  return (Array.isArray(caseData.presetMatches) ? caseData.presetMatches : [])
    .map((value) => Math.floor(Number(value) || 0))
    .filter((value) => value >= 1 && (cap <= 0 || value <= cap))
    .filter((value, index, list) => list.indexOf(value) === index)
    .sort((left, right) => left - right)
    .map((value) => ({
      key: `preset_${value}`,
      value,
      label: `${value}场`,
      disabled: false
    }));
}

function buildMatchSelectionUiState({
  mode,
  playersCount,
  maxMatches,
  currentMatches,
  courts,
  context = 'settings'
}) {
  const normalizedMode = flow.normalizeMode(mode);
  const current = Math.max(1, Math.floor(Number(currentMatches) || 1));
  if (normalizedMode === flow.MODE_FIXED_PAIR_RR) {
    return {
      matchShortcutOptions: [],
      matchShortcutHint: fixedPair.buildFixedPairShortcutHint(),
      useMatchPresetOptions: false,
      showAdvancedMatchEntry: false,
      currentCustomMatchLabel: '',
      matchPresetUnavailableHint: '',
      currentMatchIsPreset: false,
      coveragePriorityNote: ''
    };
  }
  if (normalizedMode !== flow.MODE_MULTI_ROTATE) {
    return {
      matchShortcutOptions: [],
      matchShortcutHint: '',
      useMatchPresetOptions: false,
      showAdvancedMatchEntry: false,
      currentCustomMatchLabel: '',
      matchPresetUnavailableHint: '',
      currentMatchIsPreset: false,
      coveragePriorityNote: ''
    };
  }

  const optionCase = multiRotateMatchOptions.resolveMultiRotateMatchOptions(playersCount, courts);
  const shortcutOptions = buildMultiRotatePresetOptions(optionCase, maxMatches);
  if (!optionCase || !shortcutOptions.length) {
    return {
      matchShortcutOptions: [],
      matchShortcutHint: '',
      useMatchPresetOptions: false,
      showAdvancedMatchEntry: false,
      currentCustomMatchLabel: '',
      matchPresetUnavailableHint: playersCount >= 4
        ? (context === 'lobby'
          ? '该人数暂不提供固定公平档位，请到“修改比赛”里自定义总场数'
          : '该人数暂不提供固定公平档位')
        : '',
      currentMatchIsPreset: false,
      coveragePriorityNote: ''
    };
  }

  const presetValues = shortcutOptions.map((item) => item.value);
  const currentMatchIsPreset = presetValues.includes(current);
  return {
    matchShortcutOptions: shortcutOptions,
    matchShortcutHint: '',
    useMatchPresetOptions: true,
    showAdvancedMatchEntry: context === 'settings' && optionCase.supportsAdvancedCustom !== false,
    currentCustomMatchLabel: currentMatchIsPreset ? '' : `当前自定义 ${current} 场`,
    matchPresetUnavailableHint: '',
    currentMatchIsPreset,
    balancedMatch: Number(optionCase.balancedMatch) || 0,
    coveragePriorityNote: String(optionCase.coveragePriorityNote || '')
  };
}

function buildMatchShortcutOptions({
  mode,
  players,
  playersCount,
  pairTeams,
  maxMatches,
  currentMatches,
  courts
}) {
  if (mode === flow.MODE_FIXED_PAIR_RR) {
    return fixedPair.buildFixedPairCycleShortcutOptions(pairTeams, players, maxMatches);
  }
  return buildMatchSelectionUiState({
    mode,
    playersCount,
    maxMatches,
    currentMatches,
    courts
  }).matchShortcutOptions;
}

function buildMatchShortcutHint(mode) {
  if (mode === flow.MODE_FIXED_PAIR_RR) {
    return fixedPair.buildFixedPairShortcutHint();
  }
  return '';
}

function buildSettingsFormState(tournament, options = {}) {
  const t = tournament && typeof tournament === 'object' ? tournament : {};
  const openid = String(options.openid || '').trim();
  const isAdmin = perm.isAdmin(t, openid);
  const isDraft = String(t.status || 'draft') === 'draft';
  const readiness = draftStartReadiness.buildDraftStartReadiness(t);

  const players = Array.isArray(t.players) ? t.players : [];
  const playersCount = readiness.playersCount;
  const canConfigureSettings = playersCount >= 4;
  const mode = readiness.mode;
  const modeLabel = flow.getModeLabel(mode);
  const pairTeamValidation = fixedPair.validateFixedPairTeams(t.pairTeams, players);

  let maxMatches = flow.calcMaxMatchesByPlayers(playersCount);
  if (mode === flow.MODE_FIXED_PAIR_RR) {
    maxMatches = fixedPair.calcFixedPairMaxMatches(pairTeamValidation.validTeamsCount);
  }

  const courtsForRecommendation = Math.max(1, Math.min(10, Number(t.courts) || 1));
  const { recommendation } = buildRecommendationState({
    mode,
    players,
    playersCount,
    courts: courtsForRecommendation,
    pairTeams: pairTeamValidation.teams
  });

  const hasSavedTotalMatches = Number(t.totalMatches) > 0;
  let editM = Number(t.totalMatches) || 0;
  if (editM < 1) editM = Number(recommendation.suggestedMatches || 8);
  if (editM < 1) editM = 1;
  const shouldClampSavedMatches = mode !== flow.MODE_MULTI_ROTATE || !hasSavedTotalMatches;
  if (maxMatches > 0 && editM > maxMatches && shouldClampSavedMatches) editM = maxMatches;

  let matchSelectionState = buildMatchSelectionUiState({
    mode,
    playersCount,
    maxMatches,
    currentMatches: editM,
    courts: courtsForRecommendation,
    context: 'settings'
  });
  if (
    mode === flow.MODE_MULTI_ROTATE
    && !hasSavedTotalMatches
    && matchSelectionState.useMatchPresetOptions
    && !matchSelectionState.currentMatchIsPreset
    && Number(matchSelectionState.balancedMatch) > 0
  ) {
    editM = Number(matchSelectionState.balancedMatch) || editM;
    if (maxMatches > 0 && editM > maxMatches) editM = maxMatches;
    matchSelectionState = buildMatchSelectionUiState({
      mode,
      playersCount,
      maxMatches,
      currentMatches: editM,
      courts: courtsForRecommendation,
      context: 'settings'
    });
  }
  const matchShortcutOptions = mode === flow.MODE_FIXED_PAIR_RR
    ? buildMatchShortcutOptions({
      mode,
      players,
      playersCount,
      pairTeams: pairTeamValidation.teams,
      maxMatches
    })
    : matchSelectionState.matchShortcutOptions;
  const matchShortcutHint = mode === flow.MODE_FIXED_PAIR_RR
    ? buildMatchShortcutHint(mode)
    : matchSelectionState.matchShortcutHint;

  const editC = courtsForRecommendation;
  const settingsReady = t.settingsConfigured === true;
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
    mode,
    modeLabel,
    isAdmin,
    isDraft,
    playersCount,
    canConfigureSettings,
    settingsGateHint: canConfigureSettings ? '' : `满 4 人后可设置参数（当前 ${playersCount} 人）`,
    name: safeName,
    maxMatches,
    suggestedMatches: Number(recommendation.suggestedMatches) || 1,
    capacityMax: Number(recommendation.capacityMax) || 1,
    capacityHintShort: String(recommendation.capacityHintShort || ''),
    capacityReason: String(recommendation.capacityReason || 'roster'),
    rosterHint: String(recommendation.rosterHint || ''),
    settingsReady,
    checkPlayersOk: readiness.checkPlayersOk,
    checkSettingsOk: readiness.checkSettingsOk,
    checkStartReady: readiness.checkStartReady,
    mandatoryDone: settingsReady ? 1 : 0,
    mandatoryTotal: 1,
    editM,
    editC,
    matchShortcutOptions,
    matchShortcutHint,
    useMatchPresetOptions: matchSelectionState.useMatchPresetOptions,
    showAdvancedMatchEntry: matchSelectionState.showAdvancedMatchEntry,
    showAdvancedMatchPicker: false,
    currentCustomMatchLabel: matchSelectionState.currentCustomMatchLabel,
    matchPresetUnavailableHint: matchSelectionState.matchPresetUnavailableHint,
    coveragePriorityNote: matchSelectionState.coveragePriorityNote,
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

function buildSettingsViewState(tournament, options = {}) {
  const t = tournament && typeof tournament === 'object' ? tournament : {};
  const formState = buildSettingsFormState(t, options);
  return {
    loadError: false,
    tournament: t,
    pageTitle: formState.isDraft ? '修改比赛' : '比赛信息',
    contextTitle: formState.isDraft ? '仅草稿阶段可修改比赛信息' : '当前仅查看比赛信息',
    ...formState
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
  buildMatchSelectionUiState,
  buildMatchShortcutOptions,
  buildMatchShortcutHint,
  buildSettingsFormState,
  buildSettingsViewState
};
