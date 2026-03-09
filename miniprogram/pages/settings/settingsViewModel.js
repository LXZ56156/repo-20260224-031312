const perm = require('../../permission/permission');
const flow = require('../../core/uxFlow');

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

function buildPlayersStatusText({ playersReady, playersGap, mode, aCount, bCount, pairTeamCount }) {
  if (playersReady) return '已完成';
  if (playersGap > 0) return `还差 ${playersGap} 人`;
  if (mode === flow.MODE_SQUAD_DOUBLES) return `A队 ${aCount} / B队 ${bCount}（至少各2人）`;
  if (mode === flow.MODE_FIXED_PAIR_RR) return `需至少2支队伍（当前${pairTeamCount}）`;
  return '请补全参赛信息';
}

function buildSettingsViewState(tournament, options = {}) {
  const t = tournament && typeof tournament === 'object' ? tournament : {};
  const openid = String(options.openid || '').trim();
  const sessionMinutes = flow.normalizeSessionMinutes(options.sessionMinutes, flow.DEFAULT_SESSION_MINUTES);
  const slotMinutes = flow.normalizeSlotMinutes(options.slotMinutes, flow.DEFAULT_SLOT_MINUTES);
  const isAdmin = perm.isAdmin(t, openid);
  const isDraft = String(t.status || 'draft') === 'draft';

  const players = Array.isArray(t.players) ? t.players : [];
  const mode = flow.normalizeMode(t.mode || flow.MODE_MULTI_ROTATE);
  const modeLabel = flow.getModeLabel(mode);
  const allowOpenTeam = false;
  const playersCount = players.length;
  const playersGap = playersCount >= 4 ? 0 : (4 - playersCount);
  const aCount = players.filter((item) => String(item && item.squad || '').trim().toUpperCase() === 'A').length;
  const bCount = players.filter((item) => String(item && item.squad || '').trim().toUpperCase() === 'B').length;
  const pairTeams = Array.isArray(t.pairTeams) ? t.pairTeams : [];
  const pairTeamCount = pairTeams.filter((item) => Array.isArray(item && item.playerIds) && item.playerIds.length === 2).length;

  let playersReady = playersGap === 0;
  if (mode === flow.MODE_SQUAD_DOUBLES) {
    playersReady = playersReady && aCount >= 2 && bCount >= 2;
  } else if (mode === flow.MODE_FIXED_PAIR_RR) {
    playersReady = playersReady && pairTeamCount >= 2;
  }

  let maxMatches = flow.calcMaxMatchesByPlayers(playersCount);
  if (mode === flow.MODE_FIXED_PAIR_RR) {
    maxMatches = pairTeamCount >= 2 ? Math.floor((pairTeamCount * (pairTeamCount - 1)) / 2) : 0;
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
  const mandatoryDone = (settingsReady ? 1 : 0) + (playersReady ? 1 : 0);

  const useSimpleMPicker = maxMatches > 0 && maxMatches <= 200;
  const mOptions = useSimpleMPicker ? Array.from({ length: maxMatches }, (_, i) => i + 1) : [];
  const mIndex = useSimpleMPicker && editM >= 1 ? (editM - 1) : 0;
  const digitLen = Math.max(2, String(maxMatches > 0 ? maxMatches : 999).length);

  return {
    loadError: false,
    tournament: t,
    mode,
    modeLabel,
    allowOpenTeam,
    isAdmin,
    isDraft,
    maxMatches,
    suggestedMatches: Number(recommendation.suggestedMatches) || 1,
    capacityMax: Number(recommendation.capacityMax) || 1,
    capacityHintShort: String(recommendation.capacityHintShort || ''),
    capacityReason: String(recommendation.capacityReason || 'time'),
    rosterHint: String(recommendation.rosterHint || ''),
    settingsReady,
    playersReady,
    playersCount,
    playersGap,
    playersStatusText: buildPlayersStatusText({ playersReady, playersGap, mode, aCount, bCount, pairTeamCount }),
    mandatoryDone,
    editM,
    editC,
    useSimpleMPicker,
    mOptions,
    mIndex,
    mDigitRange: buildDigitRange(digitLen),
    mDigitValue: valueToDigitValue(editM, digitLen),
    courtIndex: Math.max(0, Math.min(9, editC - 1))
  };
}

module.exports = {
  buildDigitRange,
  valueToDigitValue,
  digitValueToNumber,
  buildRecommendationState,
  buildSettingsViewState
};
