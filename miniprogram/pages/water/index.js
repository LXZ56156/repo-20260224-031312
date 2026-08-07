const profileCore = require('../../core/profile');
const waterApi = require('../../core/waterSession');
const waterLedger = require('../../core/waterLedger');
const lobbyImportActions = require('../lobby/lobbyImportActions');

const unitOptions = Array.from({ length: 99 }, (_, index) => String(index + 1));
const MAX_PARTICIPANTS = 24;

function sessionFrom(response) {
  return response && (response.session || response.data && response.data.session) || null;
}

function profileName(profile) {
  return String(profile && (profile.nickName || profile.nickname) || '').trim();
}

function showError(err, fallback = '操作失败，请重试') {
  wx.showToast({ title: String(err && err.message || fallback), icon: 'none' });
}

function normalizedPlayerName(value) {
  return String(value || '').trim().replace(/\s+/g, ' ').slice(0, 20);
}

function relayPreview(text, participants) {
  const parsed = lobbyImportActions.parseImportPlayers(String(text || ''));
  const existingNames = new Set((Array.isArray(participants) ? participants : [])
    .map((item) => normalizedPlayerName(item && item.name).toLocaleLowerCase())
    .filter(Boolean));
  const seen = new Set();
  const uniqueNames = [];
  let duplicateCount = 0;

  parsed.forEach((item) => {
    const name = normalizedPlayerName(item && item.name);
    const key = name.toLocaleLowerCase();
    if (!name) return;
    if (seen.has(key)) {
      duplicateCount += 1;
      return;
    }
    seen.add(key);
    uniqueNames.push(name);
  });

  const newCandidates = uniqueNames.filter((name) => {
    const exists = existingNames.has(name.toLocaleLowerCase());
    if (exists) duplicateCount += 1;
    return !exists;
  });
  const remaining = Math.max(0, MAX_PARTICIPANTS - (Array.isArray(participants) ? participants.length : 0));
  const newNames = newCandidates.slice(0, remaining);

  return {
    relayRecognizedCount: uniqueNames.length,
    relayDuplicateCount: duplicateCount,
    relayOverflowCount: Math.max(0, newCandidates.length - newNames.length),
    relayPreviewNames: uniqueNames.slice(0, 8),
    relayNewNames: newNames
  };
}

function filteredGameParticipants(participants, query) {
  const keyword = String(query || '').trim().toLocaleLowerCase();
  const list = Array.isArray(participants) ? participants : [];
  if (!keyword) return list;
  return list.filter((item) => String(item && item.name || '').toLocaleLowerCase().includes(keyword));
}

function gameSelectionState(participants, winnerIds, loserIds, query) {
  const list = Array.isArray(participants) ? participants : [];
  const knownIds = new Set(list.map((item) => String(item && item.id || '')).filter(Boolean));
  const winners = (Array.isArray(winnerIds) ? winnerIds : []).filter((id) => knownIds.has(id));
  const winnerSet = new Set(winners);
  const losers = (Array.isArray(loserIds) ? loserIds : []).filter((id) => knownIds.has(id) && !winnerSet.has(id));
  const loserSet = new Set(losers);
  const nameById = {};
  const decorated = list.map((item) => {
    nameById[item.id] = item.name;
    return {
      ...item,
      winnerSelected: winnerSet.has(item.id),
      loserSelected: loserSet.has(item.id)
    };
  });
  return {
    participants: decorated,
    gameParticipants: filteredGameParticipants(decorated, query),
    winnerIds: winners,
    loserIds: losers,
    winnerSummary: winners.length ? winners.map((id) => nameById[id]).filter(Boolean).join('、') : '待选',
    loserSummary: losers.length ? losers.map((id) => nameById[id]).filter(Boolean).join('、') : '待选'
  };
}

function isOlderSession(current, incoming) {
  if (!current || !incoming || String(current.id || '') !== String(incoming.id || '')) return false;
  const currentVersion = Number(current.version);
  const incomingVersion = Number(incoming.version);
  return Number.isFinite(currentVersion) && Number.isFinite(incomingVersion) && incomingVersion < currentVersion;
}

Page({
  data: {
    loading: true,
    loadError: '',
    sessionId: '',
    session: null,
    isOwner: false,
    viewerParticipantId: '',
    participants: [],
    ledger: [],
    recentEntries: [],
    participantCount: 0,
    entryCount: 0,
    totalNet: 0,
    unitOptions,
    manualSheetOpen: false,
    addMode: 'manual',
    manualNames: '',
    relayText: '',
    relayRecognizedCount: 0,
    relayDuplicateCount: 0,
    relayOverflowCount: 0,
    relayPreviewNames: [],
    relayNewNames: [],
    gameSheetOpen: false,
    gameUnitIndex: 0,
    gameSearchQuery: '',
    gameParticipants: [],
    gameActiveSide: 'winner',
    winnerIds: [],
    loserIds: [],
    winnerSummary: '待选',
    loserSummary: '待选',
    adjustSheetOpen: false,
    adjustTargetId: '',
    adjustTargetName: '',
    adjustDirection: 'plus',
    adjustUnitIndex: 0,
    counterpartyIndex: 0,
    counterparties: [],
    joinIndex: 0,
    joinChoices: [],
    busy: false
  },

  async onLoad(options = {}) {
    const sessionId = String(options.id || options.sessionId || '').trim();
    if (sessionId) {
      this.setData({ sessionId });
      await this.loadSession();
      return;
    }
    await this.createOrContinue();
  },

  onShow() {
    this._isVisible = true;
    const shouldCatchUp = !!(this._hasShown && this.data.sessionId);
    this._hasShown = true;
    this.ensureRefreshTimer();
    if (shouldCatchUp) this.loadSession({ silent: true });
  },

  onHide() {
    this._isVisible = false;
    this.clearRefreshTimer();
  },

  onUnload() {
    this._isVisible = false;
    this.clearRefreshTimer();
  },

  ensureRefreshTimer() {
    if (!this._isVisible || !this.data.sessionId || this._refreshTimer) return;
    this._refreshTimer = setInterval(() => this.loadSession({ silent: true }), 8000);
  },

  clearRefreshTimer() {
    if (this._refreshTimer) clearInterval(this._refreshTimer);
    this._refreshTimer = null;
  },

  async onPullDownRefresh() {
    await this.loadSession({ silent: true });
    wx.stopPullDownRefresh();
  },

  async createOrContinue() {
    this.setData({ loading: true, loadError: '' });
    const gate = await profileCore.ensureProfileForAction('generic', '/pages/water/index');
    if (!gate.ok) {
      this.setData({ loading: false, loadError: gate.reason === 'login_failed' ? '登录失败，请重试' : '' });
      return;
    }
    try {
      const response = await waterApi.create(profileName(gate.profile));
      this.applySession(sessionFrom(response));
    } catch (err) {
      this.setData({ loading: false, loadError: String(err && err.message || '暂时无法开始打水') });
    }
  },

  async loadSession(options = {}) {
    if (!this.data.sessionId || this.data.busy && !options.force) return;
    const requestedSessionId = this.data.sessionId;
    const requestSeq = Number(this._loadRequestSeq || 0) + 1;
    const requestedVersion = Number(this.data.session && this.data.session.version);
    this._loadRequestSeq = requestSeq;
    if (!options.silent) this.setData({ loading: true, loadError: '' });
    try {
      const response = await waterApi.get(requestedSessionId);
      if (this.data.sessionId !== requestedSessionId) return;
      if (this.applySession(sessionFrom(response))) {
        this._latestSuccessfulLoadSeq = Math.max(Number(this._latestSuccessfulLoadSeq || 0), requestSeq);
      }
    } catch (err) {
      const currentVersion = Number(this.data.session && this.data.session.version);
      const sessionAdvanced = Number.isFinite(requestedVersion)
        && Number.isFinite(currentVersion)
        && currentVersion > requestedVersion;
      if (
        this.data.sessionId !== requestedSessionId
        || requestSeq < Number(this._latestSuccessfulLoadSeq || 0)
        || sessionAdvanced
      ) return;
      if (!options.silent) this.setData({ loading: false, loadError: String(err && err.message || '账本加载失败') });
    }
  },

  applySession(session) {
    if (!session || isOlderSession(this.data.session, session)) return false;
    const participants = Array.isArray(session.participants) ? session.participants : [];
    const entries = Array.isArray(session.entries) ? session.entries : [];
    const nameMap = {};
    participants.forEach((item) => { nameMap[item.id] = item.name; });
    const ledger = waterLedger.deriveLedger(participants, entries);
    const recentEntries = entries.slice(-4).reverse().map((entry) => ({
      ...entry,
      description: waterLedger.describeEntry(entry, nameMap)
    }));
    const joinChoices = [{ id: '', name: '以我的名字加入' }].concat(
      participants.filter((item) => !item.claimed).map((item) => ({ id: item.id, name: `认领「${item.name}」` }))
    );
    const currentJoinChoice = (this.data.joinChoices || [])[Number(this.data.joinIndex || 0)];
    const currentJoinId = String(currentJoinChoice && currentJoinChoice.id || '');
    const matchedJoinIndex = joinChoices.findIndex((item) => String(item.id || '') === currentJoinId);
    const selectionState = this.data.gameSheetOpen
      ? gameSelectionState(participants, this.data.winnerIds, this.data.loserIds, this.data.gameSearchQuery)
      : {
          participants,
          gameParticipants: filteredGameParticipants(participants, this.data.gameSearchQuery)
        };
    const relayState = this.data.manualSheetOpen && this.data.addMode === 'relay' && this.data.relayText
      ? relayPreview(this.data.relayText, participants)
      : {};
    this.setData({
      loading: false,
      loadError: '',
      sessionId: session.id,
      session,
      isOwner: !!session.isOwner,
      viewerParticipantId: String(session.viewerParticipantId || ''),
      ...selectionState,
      ...relayState,
      ledger,
      recentEntries,
      participantCount: participants.length,
      entryCount: entries.length,
      totalNet: ledger.reduce((sum, item) => sum + item.net, 0),
      joinChoices,
      joinIndex: matchedJoinIndex >= 0 ? matchedJoinIndex : 0
    });
    this.ensureRefreshTimer();
    return true;
  },

  onRetry() {
    if (this.data.sessionId) this.loadSession();
    else this.createOrContinue();
  },

  openManualSheet() {
    this.setData({
      manualSheetOpen: true,
      addMode: 'manual',
      manualNames: '',
      relayText: '',
      relayRecognizedCount: 0,
      relayDuplicateCount: 0,
      relayOverflowCount: 0,
      relayPreviewNames: [],
      relayNewNames: []
    });
  },

  closeSheets() {
    this.setData({ manualSheetOpen: false, gameSheetOpen: false, adjustSheetOpen: false });
  },

  stopSheetTap() {},

  onManualInput(e) {
    this.setData({ manualNames: e.detail.value });
  },

  onSelectAddMode(e) {
    const mode = String(e.currentTarget.dataset.mode || '');
    if (mode !== 'manual' && mode !== 'relay') return;
    this.setData({ addMode: mode });
  },

  onRelayInput(e) {
    const relayText = String(e.detail.value || '');
    this.setData({
      relayText,
      ...relayPreview(relayText, this.data.participants)
    });
  },

  async submitManual() {
    if (!String(this.data.manualNames || '').trim()) return showError(null, '请输入球友名字');
    await this.runMutation(
      () => waterApi.addParticipants(this.data.sessionId, this.data.session.version, this.data.manualNames),
      '已添加'
    );
  },

  async submitRelay() {
    if (!this.data.relayRecognizedCount) return showError(null, '没有识别到球友，请检查接龙内容');
    if (!this.data.relayNewNames.length) {
      return showError(null, this.data.relayOverflowCount ? '这次打水最多 24 人' : '没有可添加的新球友');
    }
    const count = this.data.relayNewNames.length;
    await this.runMutation(
      () => waterApi.addParticipants(this.data.sessionId, this.data.session.version, this.data.relayNewNames.join('\n')),
      `已添加 ${count} 人`
    );
  },

  openGameSheet() {
    if (this.data.participants.length < 2) return showError(null, '至少添加 2 人才能记一局');
    this.setData({
      gameSheetOpen: true,
      gameUnitIndex: 0,
      gameSearchQuery: '',
      gameActiveSide: 'winner',
      winnerIds: [],
      loserIds: [],
      winnerSummary: '待选',
      loserSummary: '待选'
    });
    this.refreshGameParticipants([], []);
  },

  refreshGameParticipants(winnerIds, loserIds) {
    this.setData(gameSelectionState(
      this.data.participants,
      winnerIds,
      loserIds,
      this.data.gameSearchQuery
    ));
  },

  onGameSearchInput(e) {
    const gameSearchQuery = String(e.detail.value || '');
    this.setData({
      gameSearchQuery,
      gameParticipants: filteredGameParticipants(this.data.participants, gameSearchQuery)
    });
  },

  clearGameSearch() {
    this.setData({
      gameSearchQuery: '',
      gameParticipants: filteredGameParticipants(this.data.participants, '')
    });
  },

  onSelectGameSide(e) {
    const side = String(e.currentTarget.dataset.side || '');
    if (side !== 'winner' && side !== 'loser') return;
    this.setData({ gameActiveSide: side });
  },

  onToggleGamePlayer(e) {
    const id = String(e.currentTarget.dataset.id || '');
    if (!id) return;
    const side = this.data.gameActiveSide === 'loser' ? 'loser' : 'winner';
    let winners = this.data.winnerIds.slice();
    let losers = this.data.loserIds.slice();
    if (side === 'winner') {
      winners = winners.includes(id) ? winners.filter((item) => item !== id) : winners.concat(id);
      losers = losers.filter((item) => item !== id);
    } else {
      losers = losers.includes(id) ? losers.filter((item) => item !== id) : losers.concat(id);
      winners = winners.filter((item) => item !== id);
    }
    this.refreshGameParticipants(winners, losers);
  },

  onGameUnitChange(e) {
    this.setData({ gameUnitIndex: Number(e.detail.value || 0) });
  },

  async submitGame() {
    const winners = this.data.winnerIds;
    const losers = this.data.loserIds;
    if (!winners.length || winners.length !== losers.length) return showError(null, '请选择人数相同的胜方和负方');
    await this.runMutation(
      () => waterApi.recordGame(this.data.sessionId, this.data.session.version, winners, losers, Number(this.data.gameUnitIndex) + 1),
      '已记一局'
    );
  },

  openAdjustSheet(e) {
    const targetId = String(e.currentTarget.dataset.id || '');
    const target = this.data.participants.find((item) => item.id === targetId);
    const counterparties = this.data.participants.filter((item) => item.id !== targetId);
    if (!target || !counterparties.length) return showError(null, '请先添加另一位球友');
    this.setData({
      adjustSheetOpen: true,
      adjustTargetId: targetId,
      adjustTargetName: target.name,
      adjustDirection: String(e.currentTarget.dataset.direction || 'plus'),
      adjustUnitIndex: 0,
      counterpartyIndex: 0,
      counterparties
    });
  },

  onAdjustUnitChange(e) {
    this.setData({ adjustUnitIndex: Number(e.detail.value || 0) });
  },

  onCounterpartyChange(e) {
    this.setData({ counterpartyIndex: Number(e.detail.value || 0) });
  },

  async submitAdjust() {
    const other = this.data.counterparties[this.data.counterpartyIndex];
    if (!other) return showError(null, '请选择算在谁头上');
    await this.runMutation(
      () => waterApi.recordDirect(
        this.data.sessionId,
        this.data.session.version,
        this.data.adjustTargetId,
        other.id,
        this.data.adjustDirection,
        Number(this.data.adjustUnitIndex) + 1
      ),
      '已记账'
    );
  },

  onJoinChoiceChange(e) {
    this.setData({ joinIndex: Number(e.detail.value || 0) });
  },

  async onJoin() {
    const choice = this.data.joinChoices[this.data.joinIndex] || { id: '' };
    const claimParticipantId = String(choice.id || '');
    const gate = await profileCore.ensureProfileForAction('generic', `/pages/water/index?id=${this.data.sessionId}`);
    if (!gate.ok) return;
    await this.runMutation(
      () => waterApi.join(this.data.sessionId, this.data.session.version, profileName(gate.profile), claimParticipantId),
      '已加入'
    );
  },

  async onUndoLast() {
    if (!this.data.entryCount) return;
    const modal = await new Promise((resolve) => wx.showModal({
      title: '撤销上一条？',
      content: this.data.recentEntries[0] ? this.data.recentEntries[0].description : '',
      confirmText: '撤销',
      confirmColor: '#DC2626',
      success: resolve,
      fail: () => resolve({ confirm: false })
    }));
    if (!modal.confirm) return;
    await this.runMutation(
      () => waterApi.undoLast(this.data.sessionId, this.data.session.version),
      '已撤销'
    );
  },

  async runMutation(task, successText) {
    if (this.data.busy) return;
    this.setData({ busy: true });
    try {
      const response = await task();
      this.applySession(sessionFrom(response));
      this.closeSheets();
      wx.showToast({ title: successText, icon: 'success' });
    } catch (err) {
      showError(err);
      if (String(err && err.state || '') === 'conflict') await this.loadSession({ silent: true, force: true });
    } finally {
      this.setData({ busy: false });
    }
  },

  onShareAppMessage() {
    return {
      title: `${this.data.session && this.data.session.title || '快速打水'}：来一起记水`,
      path: `/pages/water/index?id=${encodeURIComponent(this.data.sessionId)}`
    };
  }
});
