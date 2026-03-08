const cloud = require('../../core/cloud');
const storage = require('../../core/storage');
const perm = require('../../permission/permission');
const normalize = require('../../core/normalize');
const tournamentSync = require('../../core/tournamentSync');
const flow = require('../../core/uxFlow');
const nav = require('../../core/nav');
const profileCore = require('../../core/profile');

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

Page({
  data: {
    tournamentId: '',
    tournament: null,
    statusText: '',
    statusClass: 'tag-draft',

    // 加入（未参赛）
    nickname: '',
    joinAvatar: '',
    joinAvatarDisplay: '/assets/avatar-default.png',

    // 已参赛用户自己的信息（草稿阶段可改）
    showMyProfile: false,
    myNickname: '',
    myAvatar: '',
    myAvatarDisplay: '/assets/avatar-default.png',
    myJoined: false,

    isAdmin: false,

    showJoin: false,
    showAllPlayers: false,
    playersPreview: [],
    displayPlayers: [],

    createdAtText: '',
    // KPI：在“未完成设置”前不显示默认数字，避免误导
    kpiReady: false,
    kpiPlayers: '—',
    kpiMatches: '—',
    kpiCourts: '—',
    matchInfoText: '未设置',
    modeLabel: '多人转',
    mode: flow.MODE_MULTI_ROTATE,
    modeRules: [],
    pointsPerGame: 21,
    genderSummaryText: '',
    loadError: false,
    joinSquadChoice: 'A',
    pairTeams: [],
    pairTeamsUi: [],
    pairTeamCandidates: [],
    pairTeamName: '',
    pairTeamFirstIndex: 0,
    pairTeamSecondIndex: 1,
    pairTeamBusy: false,

    // 管理员开赛前检查
    checkPlayersOk: false,
    playersChecklistHint: '至少 4 人',
    checkSettingsOk: false,
    checkStartReady: false,
    canEditScore: false,
    hasPending: false,

    quickImportText: '',
    importResultText: '',
    importResultDetail: '',
    focusQuickImport: false,
    quickConfigM: 8,
    quickConfigC: 2,
    useSimpleQuickMPicker: true,
    quickConfigMOptions: [],
    quickConfigMIndex: 0,
    quickConfigMDigitRange: [],
    quickConfigMDigitValue: [],
    quickConfigCOptions: Array.from({ length: 10 }, (_, i) => i + 1),
    quickConfigCIndex: 1,
    sessionMinuteOptions: flow.SESSION_MINUTE_OPTIONS,
    slotMinuteOptions: flow.SLOT_MINUTE_OPTIONS,
    sessionMinutes: flow.DEFAULT_SESSION_MINUTES,
    slotMinutes: flow.DEFAULT_SLOT_MINUTES,
    sessionMinuteIndex: 2,
    slotMinuteIndex: Math.max(0, flow.SLOT_MINUTE_OPTIONS.indexOf(flow.DEFAULT_SLOT_MINUTES)),
    quickSuggestedMatches: 1,
    quickCapacityMax: 1,
    quickCapacityHintShort: '',
    quickCapacityReason: 'time',
    quickRosterHint: '',
    maxMatches: 0,
    allowOpenTeam: false,

    nextActionKey: '',
    nextActionText: '',
    showScheduleShortcut: false,
    quickChecklistPending: 0,

    sharePulse: false,
    networkOffline: false,
    canRetryAction: false,
    lastFailedActionText: '',
    profileQuickFillLoading: false,
    profileNicknameFocus: false,
    profileAvatarUploading: false,
    profileSaving: false,
    profileFieldError: ''
  },

  onLoad(options) {
    let tid = options.tournamentId;
    if ((!tid) && options && options.scene) {
      const scene = decodeURIComponent(options.scene);
      const m = /tournamentId=([^&]+)/.exec(scene) || /tid=([^&]+)/.exec(scene);
      if (m) tid = m[1];
    }
    this.setData({ tournamentId: tid });
    this._fromCreate = String((options && options.fromCreate) || '') === '1';
    this._showShareHint = this._fromCreate && String((options && options.shareTip) || '') === '1';
    this._pendingIntentAction = String((options && options.intent) || '').trim();

    const app = getApp();
    this.setData({ networkOffline: !!(app && app.globalData && app.globalData.networkOffline) });
    if (app && typeof app.subscribeNetworkChange === 'function') {
      this._offNetwork = app.subscribeNetworkChange((offline) => {
        this.setData({ networkOffline: !!offline });
      });
    }

    this.openid = (getApp().globalData.openid || storage.get('openid', ''));
    const sessionMinutes = flow.normalizeSessionMinutes(storage.getSessionMinutesPref(), flow.DEFAULT_SESSION_MINUTES);
    const slotMinutes = flow.normalizeSlotMinutes(storage.getSlotMinutesPref(), flow.DEFAULT_SLOT_MINUTES);
    this.setData({
      sessionMinutes,
      slotMinutes,
      sessionMinuteIndex: Math.max(0, flow.SESSION_MINUTE_OPTIONS.indexOf(sessionMinutes)),
      slotMinuteIndex: Math.max(0, flow.SLOT_MINUTE_OPTIONS.indexOf(slotMinutes))
    });

    // 头像临时 URL 缓存（cloud fileID -> temp URL）
    this.avatarCache = {};

    // 若本机已有授权缓存，优先预填昵称/头像
    const up = storage.getUserProfile();
    if (up && typeof up === 'object') {
      let nick = String(up.nickName || up.nickname || '').trim();
      if (nick === '微信用户') nick = '';
      const avatar = String(up.avatarUrl || up.avatar || '').trim();
      if (nick) {
        this.setData({ nickname: nick, myNickname: nick });
      }
      if (avatar) {
        this.setData({ joinAvatar: avatar, myAvatar: avatar });
        this.setJoinAvatarDisplay(avatar);
        this.setMyAvatarDisplay(avatar);
      }
    }

    this.fetchTournament(tid);
    this.startWatch(tid);
  },

  onHide() {
    tournamentSync.closeWatcher(this);
  },

  onUnload() {
    tournamentSync.closeWatcher(this);
    if (this._sharePulseTimer) clearTimeout(this._sharePulseTimer);
    this._sharePulseTimer = null;
    this._pendingIntentAction = '';
    if (typeof this._offNetwork === 'function') this._offNetwork();
    this._offNetwork = null;
  },

  onShow() {
    const currentId = String(this.data.tournamentId || '').trim();
    const intentAction = nav.consumeLobbyIntent(currentId);
    if (intentAction) {
      this._pendingIntentAction = intentAction;
    }
    nav.consumeRefreshFlag(currentId);
    if (this.data.tournamentId) this.fetchTournament(this.data.tournamentId);
    if (this.data.tournamentId && !this.watcher) this.startWatch(this.data.tournamentId);
  },

  onRetry() {
    if (this.data.tournamentId) this.fetchTournament(this.data.tournamentId);
  },

  startWatch(tid) {
    tournamentSync.startWatch(this, tid, (doc) => {
      this.setTournament(doc);
    });
  },

  async fetchTournament(tid) {
    const doc = await tournamentSync.fetchTournament(tid, (doc) => {
      this.setTournament(doc);
    });
    if (!doc) this.setData({ loadError: true });
  },

  setLastFailedAction(text, fn) {
    this._lastFailedAction = typeof fn === 'function' ? fn : null;
    this.setData({
      canRetryAction: !!this._lastFailedAction,
      lastFailedActionText: String(text || '').trim() || '上次操作失败，可重试'
    });
  },

  clearLastFailedAction() {
    this._lastFailedAction = null;
    this.setData({ canRetryAction: false, lastFailedActionText: '' });
  },

  retryLastAction() {
    if (typeof this._lastFailedAction === 'function') this._lastFailedAction();
  },

  pulseShareHint(duration = 1800) {
    if (this._sharePulseTimer) clearTimeout(this._sharePulseTimer);
    this.setData({ sharePulse: true });
    this._sharePulseTimer = setTimeout(() => {
      this._sharePulseTimer = null;
      this.setData({ sharePulse: false });
    }, duration);
  },

  runFlowAction(rawKey) {
    const key = String(rawKey || '').trim();
    if (!key) return;
    const handlers = {
      join: () => this.handleJoin(),
      settings: () => this.focusQuickConfigArea(),
      quickImport: () => this.focusQuickImportArea(),
      start: () => this.handleStart(),
      batch: () => this.goBatchScoring(),
      analytics: () => this.goAnalytics(),
      schedule: () => this.goSchedule(),
      ranking: () => this.goRanking(),
      clone: () => this.cloneCurrentTournament(),
      share: () => this.pulseShareHint()
    };
    const fn = handlers[key];
    if (typeof fn === 'function') return fn();
  },

  parseImportPlayers(text) {
    const raw = String(text || '').trim();
    if (!raw) return [];
    const tokens = raw
      .split(/[\n,，;；\t ]+/)
      .map((s) => String(s || '').trim())
      .filter(Boolean);
    const out = [];
    for (const token of tokens) {
      const m = /^(.+?)[\/|](男|女|m|f)$/i.exec(token)
        || /^(.+?)[\(（](男|女|m|f)[\)）]$/i.exec(token)
        || /^(.+?)-(男|女|m|f)$/i.exec(token);
      if (!m) {
        out.push({ name: token, gender: 'unknown' });
        continue;
      }
      const name = String(m[1] || '').trim();
      const mark = String(m[2] || '').trim().toLowerCase();
      let gender = 'unknown';
      if (mark === '男' || mark === 'm') gender = 'male';
      if (mark === '女' || mark === 'f') gender = 'female';
      out.push({ name, gender });
    }
    return out;
  },

  setTournament(t) {
    if (!t) return;
    t = normalize.normalizeTournament(t);

    const status = t.status || 'draft';
    let statusText = '草稿';
    let statusClass = 'tag-draft';
    if (status === 'running') { statusText = '进行中'; statusClass = 'tag-running'; }
    if (status === 'finished') { statusText = '已结束'; statusClass = 'tag-finished'; }

    const openid = this.openid || (getApp().globalData.openid || storage.get('openid', ''));
    const isAdmin = perm.isAdmin(t, openid);

    const players = Array.isArray(t.players) ? t.players : [];
    const playersCount = players.length;
    const myPlayer = openid ? players.find((p) => p && p.id === openid) : null;
    const myJoined = !!myPlayer;

    const showJoin = (status === 'draft') && !myJoined;
    const showMyProfile = (status === 'draft') && myJoined;

    const showAllPlayers = !!this.data.showAllPlayers;
    const displayPlayers = this.buildDisplayPlayers(showAllPlayers ? players : players.slice(0, 12));

    const createdAtText = (() => {
      try {
        const d = t.createdAt ? new Date(t.createdAt) : null;
        if (!d || Number.isNaN(d.getTime())) return '';
        const pad2 = (n) => (n < 10 ? `0${n}` : String(n));
        return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
      } catch (e) {
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
    const pairTeamModel = this.buildPairTeamModel(pairTeams, players);
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
      sessionMinutes: this.data.sessionMinutes,
      slotMinutes: this.data.slotMinutes
    });
    let quickConfigM = totalMatches >= 1 ? totalMatches : Number(recommendation.suggestedMatches || 8);
    if (maxMatches > 0 && quickConfigM > maxMatches) quickConfigM = maxMatches;
    if (quickConfigC < 1) quickConfigC = 1;
    if (quickConfigC > 10) quickConfigC = 10;
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

    this.setData({
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
      joinSquadChoice: String((myPlayer && myPlayer.squad) || this.data.joinSquadChoice || 'A').toUpperCase() === 'B' ? 'B' : 'A'
    });

    if (this._showShareHint) {
      this._showShareHint = false;
      this.pulseShareHint(2200);
    }

    // 同步我的昵称/头像显示（仅在未手动编辑时跟随云端）
    if (showMyProfile && myPlayer) {
      const name = String(myPlayer.name || '').trim();
      const avatar = String(myPlayer.avatar || myPlayer.avatarUrl || '').trim();
      if (!this._myEditedNick) this.setData({ myNickname: name || this.data.myNickname });
      if (!this._myEditedAvatar) {
        this.setData({ myAvatar: avatar || this.data.myAvatar });
        this.setMyAvatarDisplay(avatar);
      }
    }

    // 异步解析 cloud fileID 头像为临时 URL（用于参赛名单展示）
    this.resolveDisplayPlayersAvatars();

    // 最近访问记录
    storage.addRecentTournamentId(t._id);

    if (this._pendingIntentAction) {
      const action = this._pendingIntentAction;
      this._pendingIntentAction = '';
      setTimeout(() => this.runFlowAction(action), 90);
    }
  },

  // 展开/收起参赛名单
  togglePlayers() {
    const next = !this.data.showAllPlayers;
    const t = this.data.tournament;
    const players = t && Array.isArray(t.players) ? t.players : [];
    this.setData({ showAllPlayers: next, displayPlayers: this.buildDisplayPlayers(next ? players : players.slice(0, 12)) }, () => {
      this.resolveDisplayPlayersAvatars();
    });
  },

  // 名单展示：生成首字母/占位色 + 头像（若有）
  buildDisplayPlayers(list) {
    const players = Array.isArray(list) ? list : [];
    return players.map((p) => {
      const id = String((p && (p.id || p._id)) || '').trim();
      const name = String((p && p.name) || '').trim();
      const raw = String((p && (p.avatar || p.avatarUrl)) || '').trim();
      const g = flow.normalizeGender(p && p.gender);
      const squad = String((p && p.squad) || '').trim().toUpperCase();
      const initial = this.getInitial(name);
      const colorClass = `pcolor-${this.hashString(name || id) % 6}`;
      const genderLabel = g === 'male' ? '男' : (g === 'female' ? '女' : '未设');

      let avatarDisplay = '';
      if (raw) {
        if (raw.startsWith('cloud://')) {
          avatarDisplay = (this.avatarCache && this.avatarCache[raw]) || '';
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
        gender: g,
        genderLabel,
        squad: squad === 'A' || squad === 'B' ? squad : ''
      };
    });
  },

  buildPairTeamModel(pairTeams, players) {
    const teams = Array.isArray(pairTeams) ? pairTeams : [];
    const list = Array.isArray(players) ? players : [];
    const nameMap = {};
    for (const player of list) {
      const id = String((player && player.id) || '').trim();
      if (!id) continue;
      nameMap[id] = String((player && player.name) || '').trim() || id;
    }

    const teamRows = [];
    const assigned = new Set();
    for (let i = 0; i < teams.length; i += 1) {
      const item = teams[i] || {};
      const playerIds = Array.isArray(item.playerIds)
        ? item.playerIds.slice(0, 2).map((id) => String(id || '').trim()).filter(Boolean)
        : [];
      playerIds.forEach((id) => assigned.add(id));
      const name = String(item.name || '').trim() || `第${i + 1}队`;
      teamRows.push({
        id: String(item.id || `pair_${i}`),
        name,
        memberText: playerIds.map((id) => nameMap[id] || id).join(' / ')
      });
    }

    const candidates = list
      .map((player) => ({
        id: String((player && player.id) || '').trim(),
        name: String((player && player.name) || '').trim() || '球员'
      }))
      .filter((player) => !!player.id && !assigned.has(player.id));

    let pairTeamFirstIndex = 0;
    let pairTeamSecondIndex = candidates.length > 1 ? 1 : 0;
    const currentFirst = Number(this.data.pairTeamFirstIndex);
    const currentSecond = Number(this.data.pairTeamSecondIndex);
    if (Number.isFinite(currentFirst) && currentFirst >= 0 && currentFirst < candidates.length) {
      pairTeamFirstIndex = currentFirst;
    }
    if (Number.isFinite(currentSecond) && currentSecond >= 0 && currentSecond < candidates.length) {
      pairTeamSecondIndex = currentSecond;
    }
    if (candidates.length > 1 && pairTeamFirstIndex === pairTeamSecondIndex) {
      pairTeamSecondIndex = (pairTeamFirstIndex + 1) % candidates.length;
    }

    return {
      pairTeamsUi: teamRows,
      pairTeamCandidates: candidates,
      pairTeamFirstIndex,
      pairTeamSecondIndex
    };
  },

  getInitial(name) {
    const s = String(name || '').trim();
    if (!s) return '?';
    // 取首个非空字符（中英文均可）
    return s.slice(0, 1).toUpperCase();
  },

  hashString(s) {
    const str = String(s || '');
    let h = 0;
    for (let i = 0; i < str.length; i++) {
      h = ((h << 5) - h) + str.charCodeAt(i);
      h |= 0;
    }
    return Math.abs(h);
  },

  onProfileNickInput(e) {
    const value = e && e.detail ? e.detail.value : '';
    this.setData({ profileFieldError: '' });
    if (this.data.showJoin) {
      this.setData({ nickname: value });
      return;
    }
    this._myEditedNick = true;
    this.setData({ myNickname: value });
  },

  onProfileNickFocus() {
    this.setData({ profileFieldError: '' });
  },

  onProfileNickBlur() {
    this.setData({ profileNicknameFocus: false });
  },

  focusProfileNickname() {
    this.setData({ profileNicknameFocus: true });
    setTimeout(() => this.setData({ profileNicknameFocus: false }), 220);
  },

  async onQuickFillProfile(e) {
    if (this.data.profileQuickFillLoading || this.data.profileSaving) return;
    this.setData({ profileQuickFillLoading: true, profileFieldError: '' });
    try {
      const currentNick = this.data.showJoin ? this.data.nickname : this.data.myNickname;
      const quick = await profileCore.ensureAuthThenQuickFill({
        avatarTempPath: e && e.detail && e.detail.avatarUrl,
        nickname: currentNick
      });
      if (quick.cancelled) {
        wx.showToast({ title: '可稍后补充头像', icon: 'none' });
        return;
      }
      if (this.data.showJoin) {
        if (!String(this.data.nickname || '').trim() && quick.nicknameFilled) this.setData({ nickname: quick.nickname });
      } else {
        if (!String(this.data.myNickname || '').trim() && quick.nicknameFilled) {
          this._myEditedNick = true;
          this.setData({ myNickname: quick.nickname });
        }
      }
      this.focusProfileNickname();
      await this.applyProfileAvatarTemp(quick.avatarTempPath, { showLoading: false, silentToast: true });
      const latestNick = String((this.data.showJoin ? this.data.nickname : this.data.myNickname) || '').trim();
      if (!latestNick) {
        wx.showToast({ title: '请在昵称框填写微信昵称', icon: 'none' });
      }
    } catch (_) {
      wx.showToast({ title: '快捷填写失败，请重试', icon: 'none' });
    } finally {
      this.setData({ profileQuickFillLoading: false });
    }
  },

  onChooseAvatarForProfile(e) {
    if (this.data.showJoin) return this.onChooseAvatarForJoin(e);
    return this.onChooseAvatarForMe(e);
  },

  submitProfile() {
    if (this.data.showJoin) return this.handleJoin();
    return this.saveMyProfile();
  },

  async onChooseAvatarForJoin(e) {
    const tempPath = e && e.detail && e.detail.avatarUrl;
    if (!tempPath) return;
    await this.applyProfileAvatarTemp(tempPath, { showLoading: true, silentToast: false, target: 'join' });
  },

  async onChooseAvatarForMe(e) {
    const tempPath = e && e.detail && e.detail.avatarUrl;
    if (!tempPath) return;
    await this.applyProfileAvatarTemp(tempPath, { showLoading: true, silentToast: false, target: 'my' });
  },

  async applyProfileAvatarTemp(tempPath, options = {}) {
    const localPath = String(tempPath || '').trim();
    if (!localPath) return false;
    const target = options.target || (this.data.showJoin ? 'join' : 'my');
    this.setData({ profileFieldError: '' });
    if (target === 'join') {
      this.setData({ joinAvatarDisplay: localPath });
    } else {
      this._myEditedAvatar = true;
      this.setData({ myAvatarDisplay: localPath });
    }
    return await this.uploadProfileAvatarTemp(localPath, { ...options, target });
  },

  async uploadProfileAvatarTemp(tempPath, options = {}) {
    const localPath = String(tempPath || '').trim();
    if (!localPath) return false;
    if (this.data.profileAvatarUploading) return false;
    const target = options.target || (this.data.showJoin ? 'join' : 'my');
    const showLoading = options.showLoading === true;
    const silentToast = options.silentToast === true;
    this.setData({ profileAvatarUploading: true, profileFieldError: '' });
    if (showLoading) wx.showLoading({ title: '上传头像...' });
    try {
      const fileID = await profileCore.uploadAvatarFromTemp(localPath);
      if (target === 'join') {
        this.setData({ joinAvatar: fileID });
        await this.setJoinAvatarDisplay(fileID);
      } else {
        this._myEditedAvatar = true;
        this.setData({ myAvatar: fileID });
        await this.setMyAvatarDisplay(fileID);
      }
      const old = storage.getUserProfile() || {};
      storage.setUserProfile({ ...old, avatar: fileID });
      return true;
    } catch (_) {
      this.setData({ profileFieldError: '头像上传失败，可重试' });
      if (!silentToast) wx.showToast({ title: '头像上传失败，可重试', icon: 'none' });
      return false;
    } finally {
      if (showLoading) wx.hideLoading();
      this.setData({ profileAvatarUploading: false });
    }
  },

  async setJoinAvatarDisplay(avatar) {
    const url = await this.resolveAvatarDisplay(avatar);
    this.setData({ joinAvatarDisplay: url });
  },

  async setMyAvatarDisplay(avatar) {
    const url = await this.resolveAvatarDisplay(avatar);
    this.setData({ myAvatarDisplay: url });
  },

  async resolveAvatarDisplay(avatar) {
    const fallback = '/assets/avatar-default.png';
    const a = String(avatar || '').trim();
    if (!a) return fallback;
    if (a.startsWith('cloud://')) {
      if (this.avatarCache && this.avatarCache[a]) return this.avatarCache[a];
      try {
        const res = await wx.cloud.getTempFileURL({ fileList: [a] });
        const url = res && res.fileList && res.fileList[0] && res.fileList[0].tempFileURL;
        if (url) {
          this.avatarCache[a] = url;
          return url;
        }
        return fallback;
      } catch (_) {
        return fallback;
      }
    }
    return a;
  },

  async resolveDisplayPlayersAvatars() {
    try {
      const list = Array.isArray(this.data.displayPlayers) ? this.data.displayPlayers.slice() : [];
      if (!list.length) return;
      const need = [];
      const mapIdx = {};
      for (let i = 0; i < list.length; i++) {
        const p = list[i] || {};
        const raw = String(p.avatarRaw || '').trim();
        if (!raw) {
          list[i].avatarDisplay = '';
          continue;
        }
        if (raw.startsWith('cloud://')) {
          if (this.avatarCache && this.avatarCache[raw]) {
            list[i].avatarDisplay = this.avatarCache[raw];
          } else {
            list[i].avatarDisplay = '';
            need.push(raw);
            mapIdx[raw] = mapIdx[raw] || [];
            mapIdx[raw].push(i);
          }
        } else {
          list[i].avatarDisplay = raw;
        }
      }

      this.setData({ displayPlayers: list });

      if (!need.length) return;
      const res = await wx.cloud.getTempFileURL({ fileList: need });
      const fl = (res && res.fileList) || [];
      for (const it of fl) {
        const fileID = it && it.fileID;
        const url = it && it.tempFileURL;
        if (!fileID || !url) continue;
        this.avatarCache[fileID] = url;
        const idxs = mapIdx[fileID] || [];
        for (const idx of idxs) {
          if (list[idx]) list[idx].avatarDisplay = url;
        }
      }
      this.setData({ displayPlayers: list });
    } catch (e) {
      // ignore
    }
  },

  async handleJoin() {
    if (this.data.profileSaving) return;
    if (this.data.profileAvatarUploading || this.data.profileQuickFillLoading) return;
    this.setData({ profileSaving: true, profileFieldError: '' });
    const gate = await profileCore.ensureProfileForAction(
      'join',
      `/pages/lobby/index?tournamentId=${encodeURIComponent(this.data.tournamentId)}&intent=join`
    );
    if (!gate.ok) {
      if (gate.reason === 'login_failed') {
        this.setData({ profileFieldError: '登录失败，请稍后重试' });
        wx.showToast({ title: '登录失败，请重试', icon: 'none' });
      }
      this.setData({ profileSaving: false });
      return;
    }
    const profile = gate.profile || {};

    const tid = this.data.tournamentId;
    let nickname = String((this.data.nickname || '')).trim() || String(profile.nickName || profile.nickname || '').trim();
    let avatar = String((this.data.joinAvatar || '')).trim() || String(profile.avatar || profile.avatarUrl || '').trim();
    let gender = storage.normalizeGender(profile.gender);

    if (!nickname || !avatar || gender === 'unknown') {
      const up = storage.getUserProfile();
      if (up && typeof up === 'object') {
        if (!nickname) nickname = String(up.nickName || up.nickname || '').trim() || nickname;
        if (!avatar) avatar = String(up.avatarUrl || up.avatar || '').trim() || avatar;
        if (gender === 'unknown') gender = storage.normalizeGender(up.gender);
      }
    }

    // 昵称/头像只要任一字段有值就更新本地缓存
    if (nickname || avatar) {
      const old = storage.getUserProfile() || {};
      storage.setUserProfile({ ...old, nickname, avatar });
    }

    wx.showLoading({ title: '加入中...' });
    try {
      const squadChoice = this.data.mode === flow.MODE_SQUAD_DOUBLES
        ? String(this.data.joinSquadChoice || 'A').trim().toUpperCase()
        : '';
      const res = await cloud.call('joinTournament', {
        tournamentId: tid,
        nickname,
        avatar,
        gender,
        squadChoice
      });
      if (res && res.ok === false) {
        throw new Error(String(res.message || '加入失败'));
      }
      wx.hideLoading();
      this.clearLastFailedAction();
      wx.showToast({ title: '已加入', icon: 'success' });
      nav.markRefreshFlag(tid);
      // 立即刷新一次，避免真机监听未触发导致名单不更新
      this.fetchTournament(tid);
    } catch (e) {
      wx.hideLoading();
      this.setLastFailedAction('加入参赛', () => this.handleJoin());
      this.handleWriteError(e, '加入失败', () => this.fetchTournament(tid));
    } finally {
      this.setData({ profileSaving: false });
    }
  },

  async saveMyProfile() {
    if (this.data.profileSaving) return;
    if (this.data.profileAvatarUploading || this.data.profileQuickFillLoading) return;
    const t = this.data.tournament;
    if (!t || t.status !== 'draft') {
      wx.showToast({ title: '非草稿阶段不可修改', icon: 'none' });
      return;
    }
    const nickname = String(this.data.myNickname || '').trim();
    const avatar = String(this.data.myAvatar || '').trim();
    if (!nickname && !avatar) {
      wx.showToast({ title: '昵称/头像至少填一个', icon: 'none' });
      return;
    }

    this.setData({ profileSaving: true, profileFieldError: '' });
    wx.showLoading({ title: '保存中...' });
    try {
      const res = await cloud.call('joinTournament', {
        tournamentId: this.data.tournamentId,
        nickname,
        avatar,
        gender: storage.normalizeGender((storage.getUserProfile() || {}).gender),
        squadChoice: this.data.mode === flow.MODE_SQUAD_DOUBLES ? String(this.data.joinSquadChoice || 'A').trim().toUpperCase() : ''
      });
      if (res && res.ok === false) {
        throw new Error(String(res.message || '保存失败'));
      }
      wx.hideLoading();
      this.clearLastFailedAction();
      wx.showToast({ title: '已更新', icon: 'success' });
      nav.markRefreshFlag(this.data.tournamentId);

      // 同步本机缓存（可选）
      const old = storage.getUserProfile() || {};
      storage.setUserProfile({ ...old, nickName: nickname || old.nickName || '', avatarUrl: old.avatarUrl || '', avatar: avatar || old.avatar || '' });

      this.fetchTournament(this.data.tournamentId);
    } catch (e) {
      wx.hideLoading();
      this.setLastFailedAction('保存我的信息', () => this.saveMyProfile());
      this.handleWriteError(e, '保存失败', () => this.fetchTournament(this.data.tournamentId));
    } finally {
      this.setData({ profileSaving: false });
    }
  },

  goSchedule() {
    wx.navigateTo({ url: `/pages/schedule/index?tournamentId=${this.data.tournamentId}` });
  },

  goSettings(section = '') {
    const tid = String(this.data.tournamentId || '').trim();
    if (!tid) return;
    const key = String(section || '').trim();
    const suffix = key ? `&section=${encodeURIComponent(key)}` : '';
    wx.navigateTo({ url: `/pages/settings/index?tournamentId=${tid}${suffix}` });
  },

  goRanking() {
    wx.navigateTo({ url: `/pages/ranking/index?tournamentId=${this.data.tournamentId}` });
  },

  goAnalytics() {
    wx.navigateTo({ url: `/pages/analytics/index?tournamentId=${this.data.tournamentId}` });
  },

  focusQuickConfigArea() {
    try {
      wx.pageScrollTo({ selector: '#quick-config', duration: 220 });
    } catch (_) {
      // ignore
    }
  },

  onPickQuickConfigMSimple(e) {
    const idx = Number(e.detail.value);
    const m = (this.data.quickConfigMOptions || [])[idx] || 1;
    this.setData({ quickConfigM: m, quickConfigMIndex: idx });
  },

  onPickQuickConfigMDigit(e) {
    const digitValue = e.detail.value || [];
    let m = digitValueToNumber(digitValue);
    if (m < 1) m = 1;
    const maxMatches = Number(this.data.maxMatches) || 0;
    if (maxMatches > 0 && m > maxMatches) {
      m = maxMatches;
      wx.showToast({ title: `已限制为最大可选 ${maxMatches} 场`, icon: 'none' });
    }
    const len = (this.data.quickConfigMDigitRange || []).length || digitValue.length;
    this.setData({
      quickConfigM: m,
      quickConfigMDigitValue: valueToDigitValue(m, len)
    });
  },

  onPickQuickConfigC(e) {
    const idx = Number(e.detail.value);
    const c = (this.data.quickConfigCOptions || [])[idx] || 1;
    this.setData({ quickConfigC: c, quickConfigCIndex: idx }, () => {
      this.refreshQuickRecommendations();
    });
  },

  onPickSessionMinutes(e) {
    const idx = Number(e.detail.value);
    const options = this.data.sessionMinuteOptions || flow.SESSION_MINUTE_OPTIONS;
    const sessionMinutes = Number(options[idx] || flow.DEFAULT_SESSION_MINUTES);
    storage.setSessionMinutesPref(sessionMinutes);
    this.setData({
      sessionMinutes,
      sessionMinuteIndex: idx
    }, () => this.refreshQuickRecommendations());
  },

  onPickSlotMinutes(e) {
    const idx = Number(e.detail.value);
    const options = this.data.slotMinuteOptions || flow.SLOT_MINUTE_OPTIONS;
    const slotMinutes = Number(options[idx] || flow.DEFAULT_SLOT_MINUTES);
    storage.setSlotMinutesPref(slotMinutes);
    this.setData({
      slotMinutes,
      slotMinuteIndex: idx
    }, () => this.refreshQuickRecommendations());
  },

  refreshQuickRecommendations() {
    const t = this.data.tournament || {};
    const players = Array.isArray(t.players) ? t.players : [];
    const playersCount = players.length;
    const mode = flow.normalizeMode(t.mode || flow.MODE_MULTI_ROTATE);
    const genderCount = flow.countGenderPlayers(players);
    const recommendation = flow.buildMatchCountRecommendations({
      mode,
      maleCount: genderCount.maleCount,
      femaleCount: genderCount.femaleCount,
      unknownCount: genderCount.unknownCount,
      allowOpenTeam: false,
      playersCount,
      courts: this.data.quickConfigC,
      sessionMinutes: this.data.sessionMinutes,
      slotMinutes: this.data.slotMinutes
    });
    this.setData({
      quickSuggestedMatches: Number(recommendation.suggestedMatches) || 1,
      quickCapacityMax: Number(recommendation.capacityMax) || 1,
      quickCapacityHintShort: String(recommendation.capacityHintShort || ''),
      quickCapacityReason: String(recommendation.capacityReason || 'time'),
      quickRosterHint: String(recommendation.rosterHint || '')
    });
  },

  focusQuickImportArea() {
    try {
      wx.pageScrollTo({ selector: '#quick-import', duration: 220 });
    } catch (_) {
      // ignore
    }
    this.setData({ focusQuickImport: true });
    setTimeout(() => this.setData({ focusQuickImport: false }), 220);
  },

  onQuickImportInput(e) {
    this.setData({ quickImportText: e.detail.value, importResultText: '', importResultDetail: '' });
  },

  async saveQuickSettings() {
    if (!this.data.isAdmin) {
      wx.showToast({ title: '仅管理员可保存参数', icon: 'none' });
      return;
    }
    const t = this.data.tournament;
    if (!t || t.status !== 'draft') {
      wx.showToast({ title: '仅草稿阶段可修改', icon: 'none' });
      return;
    }

    const M = flow.parsePositiveInt(this.data.quickConfigM, 1);
    const C = flow.parsePositiveInt(this.data.quickConfigC, 1, 10);
    const maxMatches = Number(this.data.maxMatches) || 0;
    if (maxMatches > 0 && M > maxMatches) {
      wx.showToast({ title: `总场次最多 ${maxMatches} 场`, icon: 'none' });
      return;
    }

    wx.showLoading({ title: '保存中...' });
    try {
      await cloud.call('updateSettings', {
        tournamentId: this.data.tournamentId,
        totalMatches: M,
        courts: C,
        allowOpenTeam: this.data.allowOpenTeam
      });
      wx.hideLoading();
      this.clearLastFailedAction();
      wx.showToast({ title: '参数已保存', icon: 'success' });
      nav.markRefreshFlag(this.data.tournamentId);
      await this.fetchTournament(this.data.tournamentId);
    } catch (e) {
      wx.hideLoading();
      this.setLastFailedAction('保存比赛参数', () => this.saveQuickSettings());
      this.handleWriteError(e, '保存失败', () => this.fetchTournament(this.data.tournamentId));
    }
  },

  async quickImportPlayers() {
    if (!this.data.isAdmin) {
      wx.showToast({ title: '仅管理员可导入', icon: 'none' });
      return;
    }
    const t = this.data.tournament;
    if (!t || t.status !== 'draft') {
      wx.showToast({ title: '仅草稿阶段可导入', icon: 'none' });
      return;
    }
    const players = this.parseImportPlayers(this.data.quickImportText);
    if (players.length === 0) {
      wx.showToast({ title: '请输入参赛者名字', icon: 'none' });
      return;
    }
    if (players.length > 60) {
      wx.showToast({ title: '一次最多添加 60 人', icon: 'none' });
      return;
    }

    wx.showLoading({ title: '导入中...' });
    try {
      const res = await cloud.call('addPlayers', {
        tournamentId: this.data.tournamentId,
        players
      });
      wx.hideLoading();
      this.clearLastFailedAction();
      await this.fetchTournament(this.data.tournamentId);
      this.setData({ quickImportText: '' });
      nav.markRefreshFlag(this.data.tournamentId);
      const added = Number((res && (res.addedCount ?? res.added)) || 0);
      const duplicateCount = Number((res && res.duplicateCount) || 0);
      const invalidCount = Number((res && res.invalidCount) || 0);
      const maleCount = Number((res && res.maleCount) || 0);
      const femaleCount = Number((res && res.femaleCount) || 0);
      const unknownCount = Number((res && res.unknownCount) || 0);
      const parts = [];
      if (added > 0) parts.push(`新增 ${added}`);
      if (duplicateCount > 0) parts.push(`重复 ${duplicateCount}`);
      if (invalidCount > 0) parts.push(`无效 ${invalidCount}`);
      if (added > 0) parts.push(`男 ${maleCount}/女 ${femaleCount}/未设 ${unknownCount}`);
      const importResultText = parts.length ? parts.join(' · ') : '未发生变更';
      const duplicateNames = Array.isArray(res && res.duplicateNames) ? res.duplicateNames : [];
      const invalidNames = Array.isArray(res && res.invalidNames) ? res.invalidNames : [];
      const detailParts = [];
      if (duplicateNames.length) detailParts.push(`重复：${duplicateNames.slice(0, 4).join('、')}${duplicateNames.length > 4 ? '…' : ''}`);
      if (invalidNames.length) {
        const validDisplay = invalidNames.filter(Boolean);
        if (validDisplay.length) detailParts.push(`无效：${validDisplay.slice(0, 4).join('、')}${validDisplay.length > 4 ? '…' : ''}`);
      }
      this.setData({
        importResultText,
        importResultDetail: detailParts.join('；')
      });
      wx.showToast({ title: importResultText, icon: 'none' });
    } catch (e) {
      wx.hideLoading();
      this.setLastFailedAction('快速导入参赛者', () => this.quickImportPlayers());
      this.handleWriteError(e, '导入失败', () => this.fetchTournament(this.data.tournamentId));
    }
  },

  async cloneCurrentTournament() {
    wx.showLoading({ title: '复制中...' });
    try {
      const res = await cloud.call('cloneTournament', { sourceTournamentId: this.data.tournamentId });
      const nextId = String((res && res.tournamentId) || '').trim();
      if (!nextId) throw new Error('复制失败');
      wx.hideLoading();
      this.clearLastFailedAction();
      storage.addRecentTournamentId(nextId);
      wx.showToast({ title: '已生成副本', icon: 'success' });
      wx.navigateTo({ url: `/pages/lobby/index?tournamentId=${nextId}` });
    } catch (err) {
      wx.hideLoading();
      this.setLastFailedAction('再办一场', () => this.cloneCurrentTournament());
      this.handleWriteError(err, '复制失败', () => this.fetchTournament(this.data.tournamentId));
    }
  },

  onChecklistTap(e) {
    const key = String((e.currentTarget && e.currentTarget.dataset && e.currentTarget.dataset.key) || '').trim();
    if (key === 'settings') {
      if (this.data.checkSettingsOk) {
        this.goSettings('params');
      } else {
        this.focusQuickConfigArea();
      }
      return;
    }
    if (key === 'players') {
      this.focusQuickImportArea();
      return;
    }
    if (key === 'start') {
      if (this.data.checkStartReady) {
        this.handleStart();
        return;
      }
      if (!this.data.checkSettingsOk) this.focusQuickConfigArea();
      else this.focusQuickImportArea();
    }
  },

  onPickJoinSquad(e) {
    const squad = String((e.currentTarget && e.currentTarget.dataset && e.currentTarget.dataset.squad) || '').trim().toUpperCase();
    if (squad !== 'A' && squad !== 'B') return;
    this.setData({ joinSquadChoice: squad });
  },

  onPairTeamNameInput(e) {
    const value = String((e && e.detail && e.detail.value) || '').trim();
    this.setData({ pairTeamName: value });
  },

  onPickPairFirst(e) {
    const idx = Number(e && e.detail && e.detail.value);
    if (!Number.isFinite(idx)) return;
    const candidates = this.data.pairTeamCandidates || [];
    let second = Number(this.data.pairTeamSecondIndex) || 0;
    if (candidates.length > 1 && idx === second) {
      second = (idx + 1) % candidates.length;
    }
    this.setData({
      pairTeamFirstIndex: Math.max(0, idx),
      pairTeamSecondIndex: Math.max(0, second)
    });
  },

  onPickPairSecond(e) {
    const idx = Number(e && e.detail && e.detail.value);
    if (!Number.isFinite(idx)) return;
    const candidates = this.data.pairTeamCandidates || [];
    let first = Number(this.data.pairTeamFirstIndex) || 0;
    if (candidates.length > 1 && idx === first) {
      first = (idx + 1) % candidates.length;
    }
    this.setData({
      pairTeamFirstIndex: Math.max(0, first),
      pairTeamSecondIndex: Math.max(0, idx)
    });
  },

  async autoGeneratePairTeams() {
    if (this.data.pairTeamBusy) return;
    if (!this.data.isAdmin || this.data.mode !== flow.MODE_FIXED_PAIR_RR) return;
    this.setData({ pairTeamBusy: true });
    wx.showLoading({ title: '自动组队中...' });
    try {
      const res = await cloud.call('managePairTeams', {
        tournamentId: this.data.tournamentId,
        action: 'auto_generate'
      });
      if (!res || res.ok === false) {
        wx.hideLoading();
        wx.showToast({ title: getPairTeamErrorMessage(res && res.code, res && res.message), icon: 'none' });
        return;
      }
      wx.hideLoading();
      const warnings = Array.isArray(res && res.warnings) ? res.warnings : [];
      if (warnings.length) {
        wx.showToast({ title: String(warnings[0] || '已自动组队'), icon: 'none' });
      } else {
        wx.showToast({ title: '已自动组队', icon: 'success' });
      }
      await this.fetchTournament(this.data.tournamentId);
    } catch (err) {
      wx.hideLoading();
      this.handleWriteError(err, '自动组队失败', () => this.fetchTournament(this.data.tournamentId));
    } finally {
      this.setData({ pairTeamBusy: false });
    }
  },

  async createPairTeam() {
    if (this.data.pairTeamBusy) return;
    if (!this.data.isAdmin || this.data.mode !== flow.MODE_FIXED_PAIR_RR) return;
    const candidates = this.data.pairTeamCandidates || [];
    if (candidates.length < 2) {
      wx.showToast({ title: '可组队成员不足', icon: 'none' });
      return;
    }
    const first = candidates[Number(this.data.pairTeamFirstIndex) || 0];
    const second = candidates[Number(this.data.pairTeamSecondIndex) || 0];
    if (!first || !second || first.id === second.id) {
      wx.showToast({ title: '请选择两名不同成员', icon: 'none' });
      return;
    }
    this.setData({ pairTeamBusy: true });
    wx.showLoading({ title: '创建队伍...' });
    try {
      const res = await cloud.call('managePairTeams', {
        tournamentId: this.data.tournamentId,
        action: 'create',
        name: String(this.data.pairTeamName || '').trim(),
        playerIds: [first.id, second.id]
      });
      if (!res || res.ok === false) {
        wx.hideLoading();
        wx.showToast({ title: getPairTeamErrorMessage(res && res.code, res && res.message), icon: 'none' });
        return;
      }
      wx.hideLoading();
      wx.showToast({ title: '队伍已创建', icon: 'success' });
      this.setData({ pairTeamName: '' });
      await this.fetchTournament(this.data.tournamentId);
    } catch (err) {
      wx.hideLoading();
      this.handleWriteError(err, '创建队伍失败', () => this.fetchTournament(this.data.tournamentId));
    } finally {
      this.setData({ pairTeamBusy: false });
    }
  },

  async deletePairTeam(e) {
    if (!this.data.isAdmin || this.data.mode !== flow.MODE_FIXED_PAIR_RR) return;
    const teamId = String((e.currentTarget && e.currentTarget.dataset && e.currentTarget.dataset.team) || '').trim();
    if (!teamId) return;
    wx.showModal({
      title: '删除队伍？',
      content: '删除后可重新组队。',
      success: async (res) => {
        if (!res.confirm) return;
        this.setData({ pairTeamBusy: true });
        wx.showLoading({ title: '删除中...' });
        try {
          const result = await cloud.call('managePairTeams', {
            tournamentId: this.data.tournamentId,
            action: 'delete',
            teamId
          });
          if (!result || result.ok === false) {
            wx.hideLoading();
            wx.showToast({ title: getPairTeamErrorMessage(result && result.code, result && result.message), icon: 'none' });
            return;
          }
          wx.hideLoading();
          wx.showToast({ title: '已删除', icon: 'success' });
          await this.fetchTournament(this.data.tournamentId);
        } catch (err) {
          wx.hideLoading();
          this.handleWriteError(err, '删除队伍失败', () => this.fetchTournament(this.data.tournamentId));
        } finally {
          this.setData({ pairTeamBusy: false });
        }
      }
    });
  },

  async onTogglePlayerSquad(e) {
    if (!this.data.isAdmin) return;
    if (String((this.data.tournament && this.data.tournament.status) || '') !== 'draft') return;
    if (this.data.mode !== flow.MODE_SQUAD_DOUBLES) return;
    const playerId = String((e.currentTarget && e.currentTarget.dataset && e.currentTarget.dataset.player) || '').trim();
    if (!playerId) return;
    const item = (this.data.displayPlayers || []).find((x) => String(x.id || '') === playerId);
    const current = String(item && item.squad || '').toUpperCase();
    const next = current === 'A' ? 'B' : 'A';
    try {
      await cloud.call('setPlayerSquad', {
        tournamentId: this.data.tournamentId,
        playerId,
        squad: next
      });
      wx.showToast({ title: `已调整到${next}队`, icon: 'none' });
      this.fetchTournament(this.data.tournamentId);
    } catch (err) {
      wx.showToast({ title: cloud.getUnifiedErrorMessage(err, '调整分队失败'), icon: 'none' });
    }
  },

  onNextActionTap() {
    return this.runFlowAction(this.data.nextActionKey);
  },

  goBatchScoring() {
    const t = this.data.tournament;
    if (!t || !this.data.canEditScore) return;
    const next = findFirstPendingPosition(t.rounds);
    if (!next) {
      wx.showToast({ title: '当前没有待录分比赛', icon: 'none' });
      return;
    }
    wx.navigateTo({
      url: `/pages/match/index?tournamentId=${this.data.tournamentId}&roundIndex=${next.roundIndex}&matchIndex=${next.matchIndex}&batch=1`
    });
  },

  handleWriteError(err, fallbackMessage, onRefresh) {
    cloud.presentWriteError({
      err,
      fallbackMessage,
      conflictContent: '数据已被其他人更新，刷新后可继续当前操作。',
      onRefresh
    });
  },

  async handleStart() {
    const t = this.data.tournament;
    if (!t) return;
    if (!this.data.isAdmin) return;
    if (t.status !== 'draft') {
      wx.showToast({ title: '赛事已开赛', icon: 'none' });
      return;
    }
    if (!this.data.checkPlayersOk) {
      wx.showToast({ title: '当前名单暂不可排赛，请补全参赛信息', icon: 'none' });
      return;
    }
    if (!this.data.checkSettingsOk) {
      wx.showToast({ title: '请先保存比赛参数', icon: 'none' });
      return;
    }

    wx.showLoading({ title: '生成赛程...' });
    try {
      const schedulerProfile = storage.getSchedulerProfile();
      await cloud.call('startTournament', {
        tournamentId: this.data.tournamentId,
        schedulerProfile
      });
      wx.hideLoading();
      this.clearLastFailedAction();
      wx.showToast({ title: '已开赛', icon: 'success' });
      nav.markRefreshFlag(this.data.tournamentId);
      setTimeout(() => {
        wx.navigateTo({ url: `/pages/schedule/index?tournamentId=${this.data.tournamentId}` });
      }, 280);
    } catch (e) {
      wx.hideLoading();
      this.setLastFailedAction('开赛并锁定赛程', () => this.handleStart());
      this.handleWriteError(e, '开赛失败', () => this.fetchTournament(this.data.tournamentId));
    }
  },

  async handleReset() {
    wx.showModal({
      title: '确认重置？',
      content: '将清空赛程与比分，回到草稿状态。',
      success: async (res) => {
        if (!res.confirm) return;
        wx.showLoading({ title: '重置中...' });
        try {
          await cloud.call('resetTournament', { tournamentId: this.data.tournamentId });
          wx.hideLoading();
          this.clearLastFailedAction();
          wx.showToast({ title: '已重置', icon: 'success' });
          nav.markRefreshFlag(this.data.tournamentId);
        } catch (e) {
          wx.hideLoading();
          this.setLastFailedAction('重置赛事', () => this.handleReset());
          this.handleWriteError(e, '重置失败', () => this.fetchTournament(this.data.tournamentId));
        }
      }
    });
  },

  onShareAppMessage() {
    const tid = this.data.tournamentId;
    const name = (this.data.tournament && this.data.tournament.name) ? this.data.tournament.name : '羽毛球比赛';
    return {
      title: `${name} · 邀请你参赛`,
      path: `/pages/share-entry/index?tournamentId=${tid}&intent=join`
    };
  }
});
