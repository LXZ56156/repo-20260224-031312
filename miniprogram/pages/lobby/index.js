const cloud = require('../../core/cloud');
const storage = require('../../core/storage');
const perm = require('../../permission/permission');
const normalize = require('../../core/normalize');
const tournamentSync = require('../../core/tournamentSync');
const flow = require('../../core/uxFlow');

function findFirstPendingPosition(rounds) {
  const list = Array.isArray(rounds) ? rounds : [];
  for (const round of list) {
    const rIdx = Number(round && round.roundIndex);
    const matches = Array.isArray(round && round.matches) ? round.matches : [];
    for (const match of matches) {
      if (match && String(match.status || '') !== 'finished') {
        return { roundIndex: rIdx, matchIndex: Number(match.matchIndex) };
      }
    }
  }
  return null;
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
    focusJoinNick: false,

    // 已参赛用户自己的信息（草稿阶段可改）
    showMyProfile: false,
    myNickname: '',
    myAvatar: '',
    myAvatarDisplay: '/assets/avatar-default.png',
    focusMyNick: false,
    myJoined: false,

    isAdmin: false,
    isReferee: false,
    refereeId: '',
    refereeName: '未设置',

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
    loadError: false,

    // 管理员开赛前检查
    checkPlayersOk: false,
    checkSettingsOk: false,
    canEditScore: false,
    hasPending: false,

    quickImportText: '',
    focusQuickImport: false,

    nextActionKey: '',
    nextActionText: '',
    nextSecondaryKey: '',
    nextSecondaryText: '',

    sharePulse: false,
    networkOffline: false,
    canRetryAction: false,
    lastFailedActionText: ''
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

    const app = getApp();
    this.setData({ networkOffline: !!(app && app.globalData && app.globalData.networkOffline) });
    if (app && typeof app.subscribeNetworkChange === 'function') {
      this._offNetwork = app.subscribeNetworkChange((offline) => {
        this.setData({ networkOffline: !!offline });
      });
    }

    this.openid = (getApp().globalData.openid || storage.get('openid', ''));

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
    if (typeof this._offNetwork === 'function') this._offNetwork();
    this._offNetwork = null;
  },

  onShow() {
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

  parseNamesText(text) {
    const raw = String(text || '').trim();
    if (!raw) return [];
    const names = raw
      .split(/[\n,，;；\t ]+/)
      .map((s) => String(s || '').trim())
      .filter(Boolean);
    const seen = {};
    const uniq = [];
    for (const name of names) {
      const key = name.toLowerCase();
      if (seen[key]) continue;
      seen[key] = true;
      uniq.push(name);
    }
    return uniq;
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

    // 裁判展示
    let refereeName = '未设置';
    let isReferee = false;
    const refereeId = String(t.refereeId || '').trim();
    if (refereeId) {
      const ref = players.find((p) => p && p.id === refereeId);
      refereeName = (ref && ref.name) ? ref.name : '已设置';
      isReferee = !!(openid && refereeId === openid);
    }

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

    const totalMatches = Number(t.totalMatches) || 0;
    const courts = Number(t.courts) || 0;

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

    const checkPlayersOk = playersCount >= 4;
    const checkSettingsOk = !!t.settingsConfigured;
    const canEditScore = perm.canEditScore(t, openid);
    const hasPending = flow.hasPendingMatch(t.rounds);
    const nextAction = flow.pickNextAction({
      status,
      isAdmin,
      myJoined,
      checkPlayersOk,
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
      isReferee,
      refereeId,
      refereeName,

      showJoin,
      showMyProfile,
      myJoined,

      displayPlayers,
      createdAtText,

      kpiReady,
      kpiPlayers: kpiReady ? String(playersCount) : '—',
      kpiMatches: kpiReady ? String(totalMatches) : '—',
      kpiCourts: kpiReady ? String(courts) : '—',
      matchInfoText: kpiReady ? `总 ${totalMatches} 场 · 每轮最多 ${courts} 场` : '未设置',

      checkPlayersOk,
      checkSettingsOk,
      startDisabled: !(checkPlayersOk && checkSettingsOk),
      canEditScore,
      hasPending,
      nextActionKey: nextAction.key,
      nextActionText: nextAction.text,
      nextSecondaryKey: nextAction.secondaryKey || '',
      nextSecondaryText: nextAction.secondaryText || ''
    });

    if (this._showShareHint) {
      this._showShareHint = false;
      this.setData({ sharePulse: true });
      wx.showToast({ title: '赛事已创建，可直接分享到群', icon: 'none' });
      setTimeout(() => this.setData({ sharePulse: false }), 2200);
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
      const initial = this.getInitial(name);
      const colorClass = `pcolor-${this.hashString(name || id) % 6}`;

      let avatarDisplay = '';
      if (raw) {
        if (raw.startsWith('cloud://')) {
          avatarDisplay = (this.avatarCache && this.avatarCache[raw]) || '';
        } else {
          avatarDisplay = raw;
        }
      }
      return { id: id || name, name: name || '球员', avatarRaw: raw, avatarDisplay, initial, colorClass };
    });
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

  onTapPlayerName(e) {
    const name = String(e.currentTarget.dataset.name || '').trim();
    if (!name) return;
    wx.showModal({ title: '参赛者', content: name, showCancel: false });
  },

  onNick(e) {
    this.setData({ nickname: e.detail.value });
  },

  onMyNick(e) {
    this._myEditedNick = true;
    this.setData({ myNickname: e.detail.value });
  },

  // 微信已逐步回收通过接口直接获取真实昵称/头像的能力；
  // 这里使用“昵称填写能力”(input type="nickname") + chooseAvatar 让用户主动选择。
  focusJoinNickInput() {
    this.setData({ focusJoinNick: true });
    wx.showToast({ title: '点昵称输入框，键盘上方可一键填入微信昵称', icon: 'none' });
    setTimeout(() => this.setData({ focusJoinNick: false }), 200);
  },

  focusMyNickInput() {
    this.setData({ focusMyNick: true });
    wx.showToast({ title: '点昵称输入框，键盘上方可一键填入微信昵称', icon: 'none' });
    setTimeout(() => this.setData({ focusMyNick: false }), 200);
  },

  async onChooseAvatarForJoin(e) {
    try {
      const tempPath = e && e.detail && e.detail.avatarUrl;
      if (!tempPath) return;
      const openid = (getApp().globalData.openid || storage.get('openid', ''));
      wx.showLoading({ title: '上传头像...' });
      const up = await wx.cloud.uploadFile({
        cloudPath: `avatars/${openid || 'user'}_${Date.now()}.png`,
        filePath: tempPath
      });
      wx.hideLoading();
      const fileID = up && up.fileID;
      if (fileID) {
        this.setData({ joinAvatar: fileID });
        await this.setJoinAvatarDisplay(fileID);
        const old = storage.getUserProfile() || {};
        storage.setUserProfile({ ...old, avatar: fileID });
      }
    } catch (e2) {
      wx.hideLoading();
      wx.showToast({ title: '头像上传失败', icon: 'none' });
    }
  },

  async onChooseAvatarForMe(e) {
    try {
      const tempPath = e && e.detail && e.detail.avatarUrl;
      if (!tempPath) return;
      const openid = (getApp().globalData.openid || storage.get('openid', ''));
      wx.showLoading({ title: '上传头像...' });
      const up = await wx.cloud.uploadFile({
        cloudPath: `avatars/${openid || 'user'}_${Date.now()}.png`,
        filePath: tempPath
      });
      wx.hideLoading();
      const fileID = up && up.fileID;
      if (fileID) {
        this._myEditedAvatar = true;
        this.setData({ myAvatar: fileID });
        await this.setMyAvatarDisplay(fileID);
        const old = storage.getUserProfile() || {};
        storage.setUserProfile({ ...old, avatar: fileID });
      }
    } catch (e2) {
      wx.hideLoading();
      wx.showToast({ title: '头像上传失败', icon: 'none' });
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
    const tid = this.data.tournamentId;
    let nickname = String((this.data.nickname || '')).trim();
    let avatar = String((this.data.joinAvatar || '')).trim();

    if (!nickname || !avatar) {
      const up = storage.getUserProfile();
      if (up && typeof up === 'object') {
        if (!nickname) nickname = String(up.nickName || up.nickname || '').trim() || nickname;
        if (!avatar) avatar = String(up.avatarUrl || up.avatar || '').trim() || avatar;
      }
    }

    // 昵称/头像只要任一字段有值就更新本地缓存
    if (nickname || avatar) {
      const old = storage.getUserProfile() || {};
      storage.setUserProfile({ ...old, nickname, avatar });
    }

    wx.showLoading({ title: '加入中...' });
    try {
      const res = await cloud.call('joinTournament', {
        tournamentId: tid,
        nickname,
        avatar
      });
      if (res && res.ok === false) {
        throw new Error(String(res.message || '加入失败'));
      }
      wx.hideLoading();
      this.clearLastFailedAction();
      wx.showToast({ title: '已加入', icon: 'success' });
      // 立即刷新一次，避免真机监听未触发导致名单不更新
      this.fetchTournament(tid);
    } catch (e) {
      wx.hideLoading();
      this.setLastFailedAction('加入参赛', () => this.handleJoin());
      this.handleWriteError(e, '加入失败', () => this.fetchTournament(tid));
    }
  },

  async saveMyProfile() {
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

    wx.showLoading({ title: '保存中...' });
    try {
      const res = await cloud.call('joinTournament', {
        tournamentId: this.data.tournamentId,
        nickname,
        avatar
      });
      if (res && res.ok === false) {
        throw new Error(String(res.message || '保存失败'));
      }
      wx.hideLoading();
      this.clearLastFailedAction();
      wx.showToast({ title: '已更新', icon: 'success' });

      // 同步本机缓存（可选）
      const old = storage.getUserProfile() || {};
      storage.setUserProfile({ ...old, nickName: nickname || old.nickName || '', avatarUrl: old.avatarUrl || '', avatar: avatar || old.avatar || '' });

      this.fetchTournament(this.data.tournamentId);
    } catch (e) {
      wx.hideLoading();
      this.setLastFailedAction('保存我的信息', () => this.saveMyProfile());
      this.handleWriteError(e, '保存失败', () => this.fetchTournament(this.data.tournamentId));
    }
  },

  goSchedule() {
    wx.navigateTo({ url: `/pages/schedule/index?tournamentId=${this.data.tournamentId}` });
  },

  goRanking() {
    wx.navigateTo({ url: `/pages/ranking/index?tournamentId=${this.data.tournamentId}` });
  },

  goSettings() {
    wx.navigateTo({ url: `/pages/settings/index?tournamentId=${this.data.tournamentId}` });
  },

  goAnalytics() {
    wx.navigateTo({ url: `/pages/analytics/index?tournamentId=${this.data.tournamentId}` });
  },

  focusQuickImportArea() {
    this.setData({ focusQuickImport: true });
    setTimeout(() => this.setData({ focusQuickImport: false }), 220);
  },

  onQuickImportInput(e) {
    this.setData({ quickImportText: e.detail.value });
  },

  onQuickImportClear() {
    this.setData({ quickImportText: '' });
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
    const names = this.parseNamesText(this.data.quickImportText);
    if (names.length === 0) {
      wx.showToast({ title: '请输入参赛者名字', icon: 'none' });
      return;
    }
    if (names.length > 60) {
      wx.showToast({ title: '一次最多添加 60 人', icon: 'none' });
      return;
    }

    wx.showLoading({ title: '导入中...' });
    try {
      const res = await cloud.call('addPlayers', {
        tournamentId: this.data.tournamentId,
        names
      });
      wx.hideLoading();
      this.clearLastFailedAction();
      await this.fetchTournament(this.data.tournamentId);
      const added = (res && res.added) || 0;
      wx.showToast({ title: added > 0 ? `已添加 ${added} 人` : '没有新增（可能重复）', icon: 'none' });
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
      this.goSettings();
      return;
    }
    if (key === 'players') {
      this.focusQuickImportArea();
    }
  },

  onNextActionTap() {
    const key = String(this.data.nextActionKey || '').trim();
    if (key === 'join') return this.handleJoin();
    if (key === 'settings') return this.goSettings();
    if (key === 'start') return this.handleStart();
    if (key === 'batch') return this.goBatchScoring();
    if (key === 'analytics') return this.goAnalytics();
    if (key === 'schedule') return this.goSchedule();
    if (key === 'ranking') return this.goRanking();
  },

  onNextSecondaryTap() {
    const key = String(this.data.nextSecondaryKey || '').trim();
    if (key === 'share') {
      wx.showToast({ title: '请点击“分享到群”完成分享', icon: 'none' });
      this.setData({ sharePulse: true });
      setTimeout(() => this.setData({ sharePulse: false }), 1800);
      return;
    }
    if (key === 'clone') return this.cloneCurrentTournament();
    if (key === 'quickImport') return this.focusQuickImportArea();
    if (key === 'schedule') return this.goSchedule();
    if (key === 'ranking') return this.goRanking();
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
    const parsed = cloud.parseCloudError(err, fallbackMessage);
    if (parsed.isConflict) {
      wx.showModal({
        title: '写入冲突',
        content: '数据已被其他人更新，是否立即刷新当前赛事？',
        confirmText: '刷新',
        success: (res) => {
          if (res.confirm && typeof onRefresh === 'function') onRefresh();
        }
      });
      return;
    }
    wx.showToast({ title: parsed.userMessage || fallbackMessage, icon: 'none' });
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
      wx.showToast({ title: '至少需要 4 名参赛者', icon: 'none' });
      return;
    }
    if (!this.data.checkSettingsOk) {
      wx.showToast({ title: '请先在“赛事设置”中保存比赛参数', icon: 'none' });
      return;
    }

    wx.showLoading({ title: '生成赛程...' });
    try {
      await cloud.call('startTournament', {
        tournamentId: this.data.tournamentId
      });
      wx.hideLoading();
      this.clearLastFailedAction();
      wx.showToast({ title: '已开赛', icon: 'success' });
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
    const name = (this.data.tournament && this.data.tournament.name) ? this.data.tournament.name : '羽毛球轮转赛';
    return {
      title: `${name}｜观赛入口`,
      path: `/pages/lobby/index?tournamentId=${tid}`
    };
  }
});
