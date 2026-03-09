const perm = require('../../permission/permission');
const normalize = require('../../core/normalize');
const shareMeta = require('../../core/shareMeta');
const flow = require('../../core/uxFlow');

function findFirstPendingPosition(rounds) {
  const list = Array.isArray(rounds) ? rounds : [];
  for (const round of list) {
    const rIdx = Number(round && round.roundIndex);
    const matches = Array.isArray(round && round.matches) ? round.matches : [];
    for (const match of matches) {
      const status = String(match && match.status || '').trim();
      if (match && status !== 'finished' && status !== 'canceled') {
        return { roundIndex: rIdx, matchIndex: Number(match.matchIndex) };
      }
    }
  }
  return null;
}

function getPairTeamErrorMessage(code, fallback) {
  const errCode = String(code || '').trim().toUpperCase();
  if (errCode === 'DUPLICATE_PLAYER') return '成员已在其他队伍中';
  if (errCode === 'INVALID_PLAYER') return '请选择有效参赛成员';
  if (errCode === 'TEAM_SIZE_INVALID') return '每队必须且只能选择2人';
  if (errCode === 'TEAM_NOT_FOUND') return '队伍不存在，请刷新后重试';
  return String(fallback || '').trim() || '操作失败';
}

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

function getInitial(name) {
  const s = String(name || '').trim();
  if (!s) return '?';
  return s.slice(0, 1).toUpperCase();
}

function hashString(s) {
  const str = String(s || '');
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) - h) + str.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h);
}

function buildDisplayPlayers(list, avatarCache = {}) {
  const players = Array.isArray(list) ? list : [];
  return players.map((player) => {
    const id = String((player && (player.id || player._id)) || '').trim();
    const name = String((player && player.name) || '').trim();
    const raw = String((player && (player.avatar || player.avatarUrl)) || '').trim();
    const gender = flow.normalizeGender(player && player.gender);
    const squad = String((player && player.squad) || '').trim().toUpperCase();
    const initial = getInitial(name);
    const colorClass = `pcolor-${hashString(name || id) % 6}`;
    const genderLabel = gender === 'male' ? '男' : (gender === 'female' ? '女' : '未设');

    let avatarDisplay = '';
    if (raw) {
      if (raw.startsWith('cloud://')) {
        avatarDisplay = avatarCache[raw] || '';
      } else {
        avatarDisplay = raw;
      }
    }

    return {
      id: id || name,
      name: name || '球员',
      avatarRaw: raw,
      avatarDisplay,
      initial,
      colorClass,
      gender,
      genderLabel,
      squad: squad === 'A' || squad === 'B' ? squad : ''
    };
  });
}

function buildPairTeamModel(pairTeams, players, currentFirstIndex = 0, currentSecondIndex = 1) {
  const teams = Array.isArray(pairTeams) ? pairTeams : [];
  const list = Array.isArray(players) ? players : [];
  const nameMap = {};
  for (const player of list) {
    const id = String((player && player.id) || '').trim();
    if (!id) continue;
    nameMap[id] = String((player && player.name) || '').trim() || id;
  }

  const pairTeamsUi = [];
  const assigned = new Set();
  for (let i = 0; i < teams.length; i += 1) {
    const item = teams[i] || {};
    const playerIds = Array.isArray(item.playerIds)
      ? item.playerIds.slice(0, 2).map((id) => String(id || '').trim()).filter(Boolean)
      : [];
    playerIds.forEach((id) => assigned.add(id));
    pairTeamsUi.push({
      id: String(item.id || `pair_${i}`),
      name: String(item.name || '').trim() || `第${i + 1}队`,
      memberText: playerIds.map((id) => nameMap[id] || id).join(' / ')
    });
  }

  const pairTeamCandidates = list
    .map((player) => ({
      id: String((player && player.id) || '').trim(),
      name: String((player && player.name) || '').trim() || '球员'
    }))
    .filter((player) => !!player.id && !assigned.has(player.id));

  let pairTeamFirstIndex = 0;
  let pairTeamSecondIndex = pairTeamCandidates.length > 1 ? 1 : 0;
  if (Number.isFinite(currentFirstIndex) && currentFirstIndex >= 0 && currentFirstIndex < pairTeamCandidates.length) {
    pairTeamFirstIndex = currentFirstIndex;
  }
  if (Number.isFinite(currentSecondIndex) && currentSecondIndex >= 0 && currentSecondIndex < pairTeamCandidates.length) {
    pairTeamSecondIndex = currentSecondIndex;
  }
  if (pairTeamCandidates.length > 1 && pairTeamFirstIndex === pairTeamSecondIndex) {
    pairTeamSecondIndex = (pairTeamFirstIndex + 1) % pairTeamCandidates.length;
  }

  return {
    pairTeamsUi,
    pairTeamCandidates,
    pairTeamFirstIndex,
    pairTeamSecondIndex
  };
}

function buildLobbyViewModel({ tournament, openid, data = {}, avatarCache = {} }) {
  const t = normalize.normalizeTournament(tournament || {});
  const status = t.status || 'draft';
  let statusText = '草稿';
  let statusClass = 'tag-draft';
  if (status === 'running') {
    statusText = '进行中';
    statusClass = 'tag-running';
  }
  if (status === 'finished') {
    statusText = '已结束';
    statusClass = 'tag-finished';
  }

  const players = Array.isArray(t.players) ? t.players : [];
  const playersCount = players.length;
  const isAdmin = perm.isAdmin(t, openid);
  const myPlayer = openid ? players.find((player) => player && player.id === openid) : null;
  const myJoined = !!myPlayer;
  const showJoin = status === 'draft' && !myJoined;
  const showMyProfile = status === 'draft' && myJoined;
  const showAllPlayers = !!data.showAllPlayers;
  const displayPlayers = buildDisplayPlayers(showAllPlayers ? players : players.slice(0, 12), avatarCache);

  const createdAtText = (() => {
    try {
      const date = t.createdAt ? new Date(t.createdAt) : null;
      if (!date || Number.isNaN(date.getTime())) return '';
      const pad2 = (n) => (n < 10 ? `0${n}` : String(n));
      return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())} ${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
    } catch (_) {
      return '';
    }
  })();

  const mode = flow.normalizeMode(t.mode || flow.MODE_MULTI_ROTATE);
  const modeLabel = flow.getModeLabel(mode);
  const modeRules = flow.getModeRuleLines(mode);
  const totalMatches = Number(t.totalMatches) || 0;
  const courts = Number(t.courts) || 0;
  const pointsPerGame = Math.max(1, Number(t.rules && t.rules.pointsPerGame) || 21);
  const pairTeams = Array.isArray(t.pairTeams) ? t.pairTeams : [];
  const pairTeamModel = buildPairTeamModel(
    pairTeams,
    players,
    Number(data.pairTeamFirstIndex),
    Number(data.pairTeamSecondIndex)
  );
  const genderCount = flow.countGenderPlayers(players);
  let maxMatches = flow.calcMaxMatchesByPlayers(playersCount);
  if (mode === flow.MODE_FIXED_PAIR_RR) {
    const teamCount = pairTeams.length;
    maxMatches = teamCount >= 2 ? Math.floor((teamCount * (teamCount - 1)) / 2) : 0;
  }

  let quickConfigC = courts >= 1 ? courts : 2;
  if (quickConfigC < 1) quickConfigC = 1;
  if (quickConfigC > 10) quickConfigC = 10;
  const recommendation = flow.buildMatchCountRecommendations({
    mode,
    maleCount: genderCount.maleCount,
    femaleCount: genderCount.femaleCount,
    unknownCount: genderCount.unknownCount,
    allowOpenTeam: false,
    playersCount,
    courts: quickConfigC,
    sessionMinutes: data.sessionMinutes,
    slotMinutes: data.slotMinutes
  });
  let quickConfigM = totalMatches >= 1 ? totalMatches : Number(recommendation.suggestedMatches || 8);
  if (maxMatches > 0 && quickConfigM > maxMatches) quickConfigM = maxMatches;
  const useSimpleQuickMPicker = maxMatches > 0 && maxMatches <= 200;
  const quickConfigMOptions = useSimpleQuickMPicker ? Array.from({ length: maxMatches }, (_, i) => i + 1) : [];
  const quickConfigMIndex = useSimpleQuickMPicker ? Math.max(0, quickConfigM - 1) : 0;
  const digitLen = Math.max(2, String(maxMatches > 0 ? maxMatches : 999).length);
  const quickConfigMDigitRange = buildDigitRange(digitLen);
  const quickConfigMDigitValue = valueToDigitValue(quickConfigM, digitLen);
  const quickConfigCIndex = Math.max(0, Math.min(9, quickConfigC - 1));

  let kpiReady;
  if (status !== 'draft') {
    kpiReady = true;
  } else if (t.settingsConfigured === true) {
    kpiReady = true;
  } else if (t.settingsConfigured === false) {
    kpiReady = false;
  } else {
    kpiReady = playersCount >= 4 && totalMatches >= 1 && courts >= 1;
  }

  const aCount = players.filter((item) => String(item && item.squad || '').toUpperCase() === 'A').length;
  const bCount = players.filter((item) => String(item && item.squad || '').toUpperCase() === 'B').length;
  let checkPlayersOk = playersCount >= 4;
  let playersChecklistHint = checkPlayersOk ? '人数已达标' : '至少 4 人';
  if (mode === flow.MODE_SQUAD_DOUBLES) {
    checkPlayersOk = playersCount >= 4 && aCount >= 2 && bCount >= 2;
    playersChecklistHint = checkPlayersOk
      ? `A队 ${aCount} / B队 ${bCount}`
      : `A队 ${aCount} / B队 ${bCount}（至少各2人）`;
  } else if (mode === flow.MODE_FIXED_PAIR_RR) {
    checkPlayersOk = playersCount >= 4 && pairTeams.length >= 2;
    playersChecklistHint = checkPlayersOk
      ? `已组 ${pairTeams.length} 支队伍`
      : `需至少2支队伍（当前${pairTeams.length}）`;
  }

  const checkSettingsOk = !!t.settingsConfigured;
  const checkStartReady = checkPlayersOk && checkSettingsOk;
  const quickChecklistPending = (checkPlayersOk ? 0 : 1) + (checkSettingsOk ? 0 : 1);
  const canEditScore = perm.canEditScore(t, openid);
  const hasPending = flow.hasPendingMatch(t.rounds);
  const nextAction = flow.pickNextAction({
    status,
    isAdmin,
    myJoined,
    checkPlayersOk,
    playersChecklistHint: checkPlayersOk ? playersChecklistHint : '当前名单暂不可排赛，请补全参赛信息',
    checkSettingsOk,
    canEditScore,
    hasPending
  });
  const shareMessage = shareMeta.buildShareMessage(t);

  return {
    tournament: t,
    meta: {
      showMyProfile,
      myPlayer
    },
    patch: {
      loadError: false,
      tournament: t,
      statusText,
      statusClass,
      isAdmin,
      showJoin,
      showMyProfile,
      myJoined,
      displayPlayers,
      createdAtText,
      kpiReady,
      kpiPlayers: kpiReady ? String(playersCount) : '—',
      kpiMatches: kpiReady ? String(totalMatches) : '—',
      kpiCourts: kpiReady ? String(courts) : '—',
      mode,
      modeLabel,
      modeRules,
      pointsPerGame,
      genderSummaryText: `男 ${genderCount.maleCount} · 女 ${genderCount.femaleCount} · 未设 ${genderCount.unknownCount}`,
      matchInfoText: kpiReady ? `${modeLabel} · ${pointsPerGame}分制 · 总 ${totalMatches} 场 · 每轮最多 ${courts} 场` : '未设置',
      quickConfigM,
      quickConfigC,
      useSimpleQuickMPicker,
      quickConfigMOptions,
      quickConfigMIndex,
      quickConfigMDigitRange,
      quickConfigMDigitValue,
      quickConfigCIndex,
      quickSuggestedMatches: Number(recommendation.suggestedMatches) || 1,
      quickCapacityMax: Number(recommendation.capacityMax) || 1,
      quickCapacityHintShort: String(recommendation.capacityHintShort || ''),
      quickCapacityReason: String(recommendation.capacityReason || 'time'),
      quickRosterHint: String(recommendation.rosterHint || ''),
      maxMatches,
      allowOpenTeam: false,
      pairTeams,
      pairTeamsUi: pairTeamModel.pairTeamsUi,
      pairTeamCandidates: pairTeamModel.pairTeamCandidates,
      pairTeamFirstIndex: pairTeamModel.pairTeamFirstIndex,
      pairTeamSecondIndex: pairTeamModel.pairTeamSecondIndex,
      showScheduleShortcut: status === 'running' || status === 'finished',
      quickChecklistPending,
      checkPlayersOk,
      playersChecklistHint,
      checkSettingsOk,
      checkStartReady,
      canEditScore,
      hasPending,
      nextActionKey: showJoin ? '' : nextAction.key,
      nextActionText: showJoin ? '' : nextAction.text,
      shareCardTitle: String(shareMessage.panelTitle || '分享比赛'),
      shareCardHint: String(shareMessage.panelHint || ''),
      shareCardBadge: String(shareMessage.badgeText || statusText),
      shareButtonText: String(shareMessage.buttonText || '分享比赛链接'),
      shareCardDetailText: String(shareMessage.detailText || ''),
      joinSquadChoice: String((myPlayer && myPlayer.squad) || data.joinSquadChoice || 'A').trim().toUpperCase() === 'B' ? 'B' : 'A'
    }
  };
}

module.exports = {
  findFirstPendingPosition,
  getPairTeamErrorMessage,
  buildDigitRange,
  valueToDigitValue,
  digitValueToNumber,
  buildDisplayPlayers,
  buildPairTeamModel,
  buildLobbyViewModel
};
