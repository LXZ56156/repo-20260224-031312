const perm = require('../../permission/permission');
const normalize = require('../../core/normalize');
const matchPrimaryNav = require('../../core/matchPrimaryNav');
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

function buildTournamentDiffKey(tournament) {
  const t = tournament || null;
  if (!t || typeof t !== 'object') return '';
  const id = String(t._id || t.id || '').trim();
  const version = Number(t.version);
  if (Number.isFinite(version) && version > 0) return `version:${id}:${version}`;
  const updatedAt = String(t.updatedAt || '').trim();
  if (updatedAt) return `updated:${id}:${updatedAt}`;
  return `raw:${JSON.stringify(t)}`;
}

function isPlainObject(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function isTournamentLike(value) {
  if (!isPlainObject(value)) return false;
  return Array.isArray(value.players)
    || Array.isArray(value.rounds)
    || Array.isArray(value.rankings)
    || Object.prototype.hasOwnProperty.call(value, 'version');
}

function isPatchValueEqual(left, right) {
  if (left === right) return true;
  if (Array.isArray(left) || Array.isArray(right)) {
    if (!Array.isArray(left) || !Array.isArray(right)) return false;
    if (left.length !== right.length) return false;
    for (let i = 0; i < left.length; i += 1) {
      if (!isPatchValueEqual(left[i], right[i])) return false;
    }
    return true;
  }
  if (isTournamentLike(left) || isTournamentLike(right)) {
    return buildTournamentDiffKey(left) === buildTournamentDiffKey(right);
  }
  if (isPlainObject(left) || isPlainObject(right)) {
    if (!isPlainObject(left) || !isPlainObject(right)) return false;
    const leftKeys = Object.keys(left);
    const rightKeys = Object.keys(right);
    if (leftKeys.length !== rightKeys.length) return false;
    for (const key of leftKeys) {
      if (!Object.prototype.hasOwnProperty.call(right, key)) return false;
      if (!isPatchValueEqual(left[key], right[key])) return false;
    }
    return true;
  }
  return false;
}

function diffLobbyPatch(current = {}, next = {}) {
  const patch = {};
  const source = current && typeof current === 'object' ? current : {};
  const target = next && typeof next === 'object' ? next : {};
  for (const key of Object.keys(target)) {
    if (!isPatchValueEqual(source[key], target[key])) patch[key] = target[key];
  }
  return patch;
}

function buildChecklistItems({ checkSettingsOk, checkPlayersOk, checkStartReady, playersChecklistHint }) {
  return [
    {
      key: 'settings',
      label: '参数',
      title: '1. 修改比赛',
      done: !!checkSettingsOk,
      summary: checkSettingsOk ? '已保存' : '待保存',
      actionText: checkSettingsOk ? '查看' : '去修改'
    },
    {
      key: 'players',
      label: '转发',
      title: '2. 转发比赛',
      done: !!checkPlayersOk,
      summary: String(playersChecklistHint || '').trim() || '优先转发比赛，导入名单作备用',
      actionText: checkPlayersOk ? '查看' : '去转发'
    },
    {
      key: 'start',
      label: '开始比赛',
      title: '3. 开始比赛',
      done: !!checkStartReady,
      summary: checkStartReady ? '可立即开赛' : '完成前两项后可开赛',
      actionText: checkStartReady ? '见上方' : '去完成'
    }
  ];
}

function buildChecklistLayout(checklistItems, nextActionKey) {
  const items = Array.isArray(checklistItems) ? checklistItems : [];
  const featuredKeyMap = {
    settings: 'settings',
    share: 'players',
    start: 'start'
  };
  const featuredKey = featuredKeyMap[String(nextActionKey || '').trim()] || '';
  const featuredIndex = items.findIndex((item) => item && item.key === featuredKey);
  const safeFeaturedIndex = featuredIndex >= 0 ? featuredIndex : 0;

  const decoratedItems = items.map((item, index) => {
    const base = item && typeof item === 'object' ? item : {};
    let state = 'pending';
    if (index === safeFeaturedIndex) state = 'active';
    else if (base.done) state = 'done';

    return {
      ...base,
      state,
      badgeText: state === 'active' ? '当前步骤' : (state === 'done' ? '已完成' : ''),
      cardClass: `prep-card-${state}`,
      indicatorClass: state === 'active'
        ? 'prep-indicator-active'
        : (base.done ? 'prep-indicator-ok' : '')
    };
  });

  return {
    checklistItems: decoratedItems,
    featuredChecklistItem: decoratedItems[safeFeaturedIndex] || null,
    secondaryChecklistItems: decoratedItems.filter((_, index) => index !== safeFeaturedIndex)
  };
}

function buildRoleCard(key, label, summary, actionKey, actionText, active) {
  return {
    key,
    label,
    summary: String(summary || '').trim(),
    actionKey: String(actionKey || '').trim(),
    actionText: String(actionText || '').trim(),
    active: !!active,
    enabled: !!active && !!String(actionKey || '').trim(),
    badgeText: active ? '当前' : '角色'
  };
}

function buildRoleCards(ctx) {
  const {
    status,
    isAdmin,
    myJoined,
    showJoin,
    showMyProfile,
    showViewOnlyJoinPrompt,
    checkSettingsOk,
    checkPlayersOk,
    checkStartReady,
    canEditScore,
    hasPending,
    playersChecklistHint,
    mode
  } = ctx;

  const activeRoleKey = isAdmin
    ? 'admin'
    : (myJoined ? 'joined' : (showJoin ? 'profile_pending' : 'viewer'));

  let adminActionKey = '';
  let adminActionText = '';
  let adminSummary = '管理员可修改比赛、转发比赛并开始比赛。';
  if (status === 'draft' && !checkSettingsOk) {
    adminActionKey = 'settings';
    adminActionText = '修改比赛';
    adminSummary = '先修改比赛信息，再继续转发和开始比赛。';
  } else if (status === 'draft' && !checkPlayersOk) {
    adminActionKey = 'share';
    adminActionText = '转发';
    adminSummary = `当前名单未就绪，${playersChecklistHint || '请先补全参赛信息'}。`;
  } else if (status === 'draft' && checkStartReady) {
    adminActionKey = 'start';
    adminActionText = '开始比赛';
    adminSummary = '前置项已完成，可以直接开始比赛。';
  } else if (status === 'running' && canEditScore && hasPending) {
    adminActionKey = 'batch';
    adminActionText = '继续录分';
    adminSummary = '当前还有待录分比赛，优先完成比分录入。';
  } else if (status === 'finished') {
    adminActionKey = 'analytics';
    adminActionText = '查看结果';
    adminSummary = '比赛已结束，可查看最终排名和赛事数据。';
  }

  let joinedActionKey = '';
  let joinedActionText = '';
  let joinedSummary = '你已在名单中，可继续跟进比赛安排。';
  if (status === 'draft') {
    joinedActionKey = 'profile_save';
    joinedActionText = showMyProfile ? '保存我的信息' : '查看我的资料';
    joinedSummary = '你已加入比赛，草稿阶段仍可补充昵称和头像。';
  } else if (status === 'running' && canEditScore && hasPending) {
    joinedActionKey = 'batch';
    joinedActionText = '继续录分';
    joinedSummary = '你有录分权限，当前还有待完成比赛。';
  } else if (status === 'finished') {
    joinedActionKey = 'analytics';
    joinedActionText = '查看结果';
    joinedSummary = '比赛已结束，可查看最终结果和赛事数据。';
  }

  let viewerActionKey = '';
  let viewerActionText = '';
  let viewerSummary = '当前以观赛身份查看，不会自动加入名单。';
  if (status === 'draft') {
    viewerActionKey = showViewOnlyJoinPrompt ? 'view_only_join' : 'share';
    viewerActionText = showViewOnlyJoinPrompt ? '我要加入' : '继续观赛';
    viewerSummary = '可以先看比赛信息，确定后再显式加入。';
  } else if (status === 'finished') {
    viewerActionKey = 'analytics';
    viewerActionText = '查看结果';
    viewerSummary = '比赛已结束，可以查看最终结果和赛事数据。';
  }

  const pendingNeedsSquad = status === 'draft' && mode === flow.MODE_SQUAD_DOUBLES;
  const pendingSummary = pendingNeedsSquad
    ? '先补资料并选择 A/B 队，再确认加入。'
    : '先补昵称和头像，再确认加入。';

  return {
    activeRoleKey,
    cards: [
      buildRoleCard('admin', '管理员', adminSummary, adminActionKey, adminActionText, activeRoleKey === 'admin'),
      buildRoleCard('joined', '已加入用户', joinedSummary, joinedActionKey, joinedActionText, activeRoleKey === 'joined'),
      buildRoleCard('viewer', '观赛用户', viewerSummary, viewerActionKey, viewerActionText, activeRoleKey === 'viewer'),
      buildRoleCard('profile_pending', '待补资料用户', pendingSummary, 'profile_join', '确认加入', activeRoleKey === 'profile_pending')
    ]
  };
}

function buildStatePanel(ctx) {
  const {
    status,
    isAdmin,
    myJoined,
    showJoin,
    showMyProfile,
    showViewOnlyJoinPrompt,
    checkSettingsOk,
    checkPlayersOk,
    checkStartReady,
    canEditScore,
    hasPending,
    mode,
    currentRoleTitle,
    currentRoleSummary,
    nextActionKey,
    nextActionText
  } = ctx;

  const stageBadgeMap = {
    draft: '开赛前',
    running: '进行中',
    finished: '已结束'
  };

  let title = '当前下一步';
  let summary = String(currentRoleSummary || '').trim() || '先看当前状态，再决定下一步。';

  if (status === 'draft') {
    if (isAdmin) {
      title = '开赛前准备';
      summary = !checkSettingsOk
        ? '先修改比赛信息，再继续转发和开始比赛。'
        : (!checkPlayersOk
          ? '先转发比赛，让名单先准备好。'
          : '前置项已完成，可以直接开始比赛。');
    } else if (showJoin) {
      title = '加入前确认';
      summary = mode === flow.MODE_SQUAD_DOUBLES
        ? '先补资料并选择 A/B 队，再确认加入。'
        : '先补昵称和头像，再确认加入。';
    } else if (showViewOnlyJoinPrompt) {
      title = '先看再决定';
      summary = '当前以只读方式查看比赛，不会自动加入名单。';
    } else if (myJoined) {
      title = '等待开赛';
      summary = '你已在名单中，草稿阶段仍可补充昵称和头像。';
    }
  } else if (status === 'running') {
    if (canEditScore && hasPending) {
      title = '优先完成录分';
      summary = '当前还有待录分比赛，先把比分录完。';
    } else {
      title = '比赛进行中';
      summary = '通过顶部切换查看对阵或排名。';
    }
  } else if (status === 'finished') {
    title = '比赛结果';
    summary = isAdmin
      ? '比赛已结束，可查看排名与赛事复盘。'
      : '比赛已结束，可查看排名与赛事复盘。';
  }

  return {
    stageBadge: stageBadgeMap[status] || '当前',
    statePanelTitle: title,
    statePanelRoleLabel: String(currentRoleTitle || '').trim() || '访客',
    statePanelSummary: summary,
    statePrimaryActionKey: String(nextActionKey || '').trim(),
    statePrimaryActionText: String(nextActionText || '').trim()
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
  const isViewOnlyEntry = status === 'draft'
    && !myJoined
    && !isAdmin
    && String(data.entryMode || '').trim().toLowerCase() === 'view_only'
    && !data.viewOnlyJoinExpanded;
  const showViewOnlyJoinPrompt = isViewOnlyEntry;
  const showJoin = status === 'draft' && !myJoined && !showViewOnlyJoinPrompt;
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
  // 未成队成员
  const assignedPlayerIds = new Set();
  for (const team of pairTeams) {
    const ids = Array.isArray(team && team.playerIds) ? team.playerIds : [];
    ids.forEach((id) => assignedPlayerIds.add(String(id || '').trim()));
  }
  const unpairedPlayers = mode === flow.MODE_FIXED_PAIR_RR && status === 'draft'
    ? players.filter((p) => {
        const pid = String((p && p.id) || '').trim();
        return pid && !assignedPlayerIds.has(pid);
      }).map((p) => String((p && p.name) || '').trim() || '球员')
    : [];
  const unpairedPlayersText = unpairedPlayers.length
    ? `待补位成员：${unpairedPlayers.join('、')}`
    : '';

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

  const isFixedPairMode = mode === flow.MODE_FIXED_PAIR_RR;

  // needsSettingsSync: totalMatches 与实际可排场次不一致时需要先保存
  const needsSettingsSync = isFixedPairMode && maxMatches > 0 && totalMatches !== maxMatches && pairTeams.length >= 2;

  const checkSettingsOk = !!t.settingsConfigured;
  const checkStartReady = checkPlayersOk && checkSettingsOk;
  // 赛制化主任务派生 (draft only)
  let primaryTaskKey = '';
  let primaryTaskTitle = '';
  let primaryTaskSummary = '';
  if (status === 'draft' && isAdmin) {
    if (mode === flow.MODE_FIXED_PAIR_RR) {
      if (playersCount < 4) {
        primaryTaskKey = 'import_players';
        primaryTaskTitle = '导入名单';
        primaryTaskSummary = '至少需要 4 人才能组队开赛';
      } else if (pairTeams.length < 2) {
        primaryTaskKey = 'build_pair_teams';
        primaryTaskTitle = pairTeams.length === 0 ? '开始组队' : '继续组队';
        primaryTaskSummary = `需至少 2 支队伍（当前 ${pairTeams.length}）`;
      } else if (needsSettingsSync) {
        primaryTaskKey = 'sync_settings';
        primaryTaskTitle = '保存并开赛';
        primaryTaskSummary = `已组 ${pairTeams.length} 队，可排 ${maxMatches} 场，需先保存参数`;
      } else if (checkStartReady) {
        primaryTaskKey = 'start';
        primaryTaskTitle = '开始比赛';
        primaryTaskSummary = '前置项已完成，可以直接开始比赛';
      } else if (!checkSettingsOk) {
        primaryTaskKey = 'sync_settings';
        primaryTaskTitle = '保存并开赛';
        primaryTaskSummary = '参数待保存';
      } else {
        primaryTaskKey = 'start';
        primaryTaskTitle = '开始比赛';
        primaryTaskSummary = '可以开始比赛';
      }
    } else if (mode === flow.MODE_SQUAD_DOUBLES) {
      if (playersCount < 4 || aCount < 2 || bCount < 2) {
        primaryTaskKey = 'assign_squads';
        primaryTaskTitle = '分配 A/B 队';
        primaryTaskSummary = checkPlayersOk ? `A队 ${aCount} / B队 ${bCount}` : `A队 ${aCount} / B队 ${bCount}（至少各2人）`;
      } else if (checkStartReady) {
        primaryTaskKey = 'start';
        primaryTaskTitle = '开始比赛';
        primaryTaskSummary = '前置项已完成';
      } else if (!checkSettingsOk) {
        primaryTaskKey = 'settings';
        primaryTaskTitle = '修改比赛';
        primaryTaskSummary = '先修改比赛信息';
      } else {
        primaryTaskKey = 'start';
        primaryTaskTitle = '开始比赛';
        primaryTaskSummary = '可以开始比赛';
      }
    } else {
      // multi_rotate
      if (playersCount < 4) {
        primaryTaskKey = 'import_players';
        primaryTaskTitle = '导入名单';
        primaryTaskSummary = '至少需要 4 人';
      } else if (!checkSettingsOk) {
        primaryTaskKey = 'settings';
        primaryTaskTitle = '修改比赛';
        primaryTaskSummary = '先修改比赛信息';
      } else if (checkStartReady) {
        primaryTaskKey = 'start';
        primaryTaskTitle = '开始比赛';
        primaryTaskSummary = '前置项已完成';
      } else {
        primaryTaskKey = 'share';
        primaryTaskTitle = '转发比赛';
        primaryTaskSummary = '优先转发比赛';
      }
    }
  }

  const quickChecklistPending = (checkPlayersOk ? 0 : 1) + (checkSettingsOk ? 0 : 1);
  const canEditScore = perm.canEditScore(t, openid);
  const hasPending = flow.hasPendingMatch(t.rounds);
  const checklistItems = buildChecklistItems({
    checkSettingsOk,
    checkPlayersOk,
    checkStartReady,
    playersChecklistHint: players.length ? playersChecklistHint : '优先转发比赛，导入名单作备用'
  });
  const roleView = buildRoleCards({
    status,
    isAdmin,
    myJoined,
    showJoin,
    showMyProfile,
    showViewOnlyJoinPrompt,
    checkSettingsOk,
    checkPlayersOk,
    checkStartReady,
    canEditScore,
    hasPending,
    playersChecklistHint: checkPlayersOk ? playersChecklistHint : '当前名单暂不可排赛，请补全参赛信息',
    mode
  });
  const activeRoleCard = roleView.cards.find((item) => item.active) || roleView.cards[0] || {
    key: '',
    label: '',
    summary: '',
    actionKey: '',
    actionText: ''
  };
  const statePanel = buildStatePanel({
    status,
    isAdmin,
    myJoined,
    showJoin,
    showMyProfile,
    showViewOnlyJoinPrompt,
    checkSettingsOk,
    checkPlayersOk,
    checkStartReady,
    canEditScore,
    hasPending,
    mode,
    currentRoleTitle: activeRoleCard.label,
    currentRoleSummary: activeRoleCard.summary,
    nextActionKey: activeRoleCard.actionKey,
    nextActionText: activeRoleCard.actionText
  });
  const checklistLayout = buildChecklistLayout(checklistItems, activeRoleCard.actionKey);
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
      heroGradientClass: status === 'draft' ? 'hero-draft' : (status === 'finished' ? 'hero-finished' : ''),
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
      isFixedPairMode,
      needsSettingsSync,
      unpairedPlayers,
      unpairedPlayersText,
      primaryTaskKey,
      primaryTaskTitle,
      primaryTaskSummary,
      pairTeamsUi: pairTeamModel.pairTeamsUi,
      pairTeamCandidates: pairTeamModel.pairTeamCandidates,
      pairTeamFirstIndex: pairTeamModel.pairTeamFirstIndex,
      pairTeamSecondIndex: pairTeamModel.pairTeamSecondIndex,
      quickChecklistPending,
      checklistItems: checklistLayout.checklistItems,
      featuredChecklistItem: checklistLayout.featuredChecklistItem,
      secondaryChecklistItems: checklistLayout.secondaryChecklistItems,
      checkPlayersOk,
      playersChecklistHint,
      checkSettingsOk,
      checkStartReady,
      canEditScore,
      hasPending,
      roleCards: roleView.cards,
      currentRoleKey: activeRoleCard.key,
      currentRoleTitle: activeRoleCard.label,
      currentRoleSummary: activeRoleCard.summary,
      nextActionKey: activeRoleCard.actionKey,
      nextActionText: activeRoleCard.actionText,
      nextActionDetail: activeRoleCard.summary,
      statePanelTitle: statePanel.statePanelTitle,
      statePanelRoleLabel: statePanel.statePanelRoleLabel,
      statePanelSummary: statePanel.statePanelSummary,
      statePrimaryActionKey: statePanel.statePrimaryActionKey,
      statePrimaryActionText: statePanel.statePrimaryActionText,
      stateStageBadge: statePanel.stageBadge,
      showStateChecklist: isAdmin && status === 'draft' && checklistItems.length > 0,
      showDraftRules: status === 'draft',
      showDraftAdminPanel: isAdmin && status === 'draft',
      showViewOnlyJoinPrompt,
      shareCardTitle: String(shareMessage.panelTitle || '转发比赛'),
      shareCardBadge: String(shareMessage.badgeText || statusText),
      shareButtonText: String(shareMessage.buttonText || '转发'),
      joinSquadChoice: String((myPlayer && myPlayer.squad) || data.joinSquadChoice || 'A').trim().toUpperCase() === 'B' ? 'B' : 'A',
      primaryNavItems: matchPrimaryNav.getPrimaryNavItems('match', t._id, { showAnalytics: status === 'finished' })
    }
  };
}

module.exports = {
  findFirstPendingPosition,
  getPairTeamErrorMessage,
  buildDigitRange,
  valueToDigitValue,
  digitValueToNumber,
  buildTournamentDiffKey,
  diffLobbyPatch,
  buildDisplayPlayers,
  buildPairTeamModel,
  buildLobbyViewModel
};
