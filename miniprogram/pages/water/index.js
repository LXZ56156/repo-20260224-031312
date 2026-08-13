const profileCore = require('../../core/profile');
const waterApi = require('../../core/waterSession');
const waterLedger = require('../../core/waterLedger');
const actionGuard = require('../../core/actionGuard');
const clientRequest = require('../../core/clientRequest');
const lobbyImportActions = require('../lobby/lobbyImportActions');

const unitOptions = Array.from({ length: 99 }, (_, index) => String(index + 1));
const MAX_PARTICIPANTS = 24;
const PAGE_SIZE = 20;
const NORMAL_POLL_MS = 8000;
const BURST_POLL_MS = 3000;
const BURST_POLL_COUNT = 5;

function clean(value) {
  return String(value == null ? '' : value).trim();
}

function profileName(profile) {
  return clean(profile && (profile.nickName || profile.nickname));
}

function normalizedPlayerName(value) {
  return clean(value).replace(/\s+/g, ' ').slice(0, 20);
}

function responseData(response) {
  if (!response || typeof response !== 'object') return {};
  if (response.data && typeof response.data === 'object') return response.data;
  if (response.session) return { session: response.session };
  return response;
}

function showError(err, fallback = '操作失败，请重试') {
  if (typeof wx === 'undefined' || typeof wx.showToast !== 'function') return;
  wx.showToast({ title: clean(err && err.message) || fallback, icon: 'none' });
}

function showSuccess(title) {
  if (typeof wx === 'undefined' || typeof wx.showToast !== 'function') return;
  wx.showToast({ title, icon: 'success' });
}

function confirmModal(options) {
  if (typeof wx === 'undefined' || typeof wx.showModal !== 'function') {
    return Promise.resolve({ confirm: true, cancel: false });
  }
  return new Promise((resolve) => wx.showModal({
    ...options,
    success: resolve,
    fail: () => resolve({ confirm: false, cancel: true }),
  }));
}

function relayPreview(text, participants) {
  const parsed = lobbyImportActions.parseImportPlayers(clean(text));
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
    relayNewNames: newNames,
  };
}

function filteredParticipants(participants, query) {
  const keyword = clean(query).toLocaleLowerCase();
  const list = Array.isArray(participants) ? participants : [];
  if (!keyword) return list;
  return list.filter((item) => clean(item && item.name).toLocaleLowerCase().includes(keyword));
}

function stableGameParticipantOrder(participants, currentOrder) {
  const participantIds = (Array.isArray(participants) ? participants : [])
    .map((item) => clean(item && item.id))
    .filter(Boolean);
  const knownIds = new Set(participantIds);
  const seen = new Set();
  const stableOrder = [];
  (Array.isArray(currentOrder) ? currentOrder : []).forEach((value) => {
    const id = clean(value);
    if (!knownIds.has(id) || seen.has(id)) return;
    seen.add(id);
    stableOrder.push(id);
  });
  participantIds.forEach((id) => {
    if (seen.has(id)) return;
    seen.add(id);
    stableOrder.push(id);
  });
  return stableOrder;
}

function buildGameParticipantOrder(participants, currentOrder, activeSide, winnerIds, loserIds) {
  const stableOrder = stableGameParticipantOrder(participants, currentOrder);
  const selectedIds = activeSide === 'loser' ? loserIds : winnerIds;
  const oppositeIds = activeSide === 'loser' ? winnerIds : loserIds;
  const selected = new Set((Array.isArray(selectedIds) ? selectedIds : []).map(clean));
  const opposite = new Set((Array.isArray(oppositeIds) ? oppositeIds : []).map(clean));
  return stableOrder
    .filter((id) => selected.has(id))
    .concat(stableOrder.filter((id) => !selected.has(id) && !opposite.has(id)))
    .concat(stableOrder.filter((id) => !selected.has(id) && opposite.has(id)));
}

function gameParticipantsInOrder(participants, currentOrder) {
  const list = Array.isArray(participants) ? participants : [];
  const byId = new Map(list.map((item) => [clean(item && item.id), item]));
  return stableGameParticipantOrder(list, currentOrder).map((id) => byId.get(id)).filter(Boolean);
}

function summarizeNames(ids, nameById) {
  const names = (Array.isArray(ids) ? ids : []).map((id) => nameById[clean(id)]).filter(Boolean);
  if (!names.length) return '待选';
  if (names.length <= 2) return names.join('、');
  return `${names.slice(0, 2).join('、')}…`;
}

function fullNameSummary(ids, nameById) {
  const names = (Array.isArray(ids) ? ids : []).map((id) => nameById[clean(id)]).filter(Boolean);
  return names.length ? names.join('、') : '待选';
}

function describeGameSelection(winners, losers) {
  const winnerCount = winners.length;
  const loserCount = losers.length;
  if (!winnerCount && !loserCount) return '至少各选 1 人';
  if (!winnerCount) return `还需选择 ${loserCount} 位胜方`;
  if (!loserCount) return `还需选择 ${winnerCount} 位负方`;
  if (winnerCount !== loserCount) return `双方人数需相同：胜 ${winnerCount} / 负 ${loserCount}`;
  return '双方人数相同，可提交';
}

function gameSelectionState(participants, winnerIds, loserIds, query, currentOrder) {
  const list = Array.isArray(participants) ? participants : [];
  const knownIds = new Set(list.map((item) => clean(item && item.id)).filter(Boolean));
  const winners = (Array.isArray(winnerIds) ? winnerIds : []).map(clean).filter((id) => knownIds.has(id));
  const winnerSet = new Set(winners);
  const losers = (Array.isArray(loserIds) ? loserIds : []).map(clean)
    .filter((id) => knownIds.has(id) && !winnerSet.has(id));
  const loserSet = new Set(losers);
  const nameById = {};
  const decorated = list.map((item) => {
    const id = clean(item && item.id);
    const name = clean(item && item.name) || '球友';
    nameById[id] = name;
    const winnerSelected = winnerSet.has(id);
    const loserSelected = loserSet.has(id);
    return {
      ...item,
      id,
      name,
      winnerSelected,
      loserSelected,
      selectionLabel: `${name}，${winnerSelected ? '已选胜方' : loserSelected ? '已选负方' : '未选择'}`,
    };
  });
  const gameParticipantOrder = stableGameParticipantOrder(decorated, currentOrder);
  return {
    participants: decorated,
    gameParticipantOrder,
    gameParticipants: filteredParticipants(gameParticipantsInOrder(decorated, gameParticipantOrder), query),
    winnerIds: winners,
    loserIds: losers,
    winnerSummary: summarizeNames(winners, nameById),
    loserSummary: summarizeNames(losers, nameById),
    winnerFullSummary: fullNameSummary(winners, nameById),
    loserFullSummary: fullNameSummary(losers, nameById),
    gameSelectionValid: winners.length > 0 && winners.length === losers.length,
    gameValidationMessage: describeGameSelection(winners, losers),
    hasLongGameNames: decorated.some((item) => Array.from(item.name).length > 8),
  };
}

function directSelectionState(choices, fromIndex, toIndex, unitIndex) {
  const list = Array.isArray(choices) ? choices : [];
  const from = list[Number(fromIndex) || 0] || {};
  const to = list[Number(toIndex) || 0] || {};
  const fromId = clean(from.id);
  const toId = clean(to.id);
  let directValidationMessage = '双方不同，可以记水';
  if (!fromId && !toId) directValidationMessage = '请选择请水方和赢水方';
  else if (!fromId) directValidationMessage = '请选择请水方';
  else if (!toId) directValidationMessage = '请选择赢水方';
  else if (fromId === toId) directValidationMessage = '请水方和赢水方不能是同一人';
  const directSelectionValid = !!fromId && !!toId && fromId !== toId;
  return {
    directSelectionValid,
    directValidationMessage,
    directPreview: directSelectionValid
      ? `${from.name} 请 ${to.name} · ${Number(unitIndex) + 1} 水`
      : '请水方 → 赢水方',
  };
}

function ledgerNetSizeClass(value) {
  const absolute = Math.abs(Number(value) || 0);
  if (absolute >= 10000) return 'is-net-xl';
  if (absolute >= 1000) return 'is-net-lg';
  return '';
}

function isOlderSession(current, incoming) {
  if (!current || !incoming || clean(current.id) !== clean(incoming.id)) return false;
  const currentVersion = Number(current.version);
  const incomingVersion = Number(incoming.version);
  return Number.isFinite(currentVersion) && Number.isFinite(incomingVersion) && incomingVersion < currentVersion;
}

function projectionVersion(room, round) {
  return [Number(room && room.syncVersion || 0), Number(round && round.revision || 0)];
}

function isOlderProjection(currentRoom, currentRound, incomingRoom, incomingRound) {
  if (!currentRoom || !incomingRoom || clean(currentRoom.id || currentRoom._id) !== clean(incomingRoom.id || incomingRoom._id)) return false;
  const current = projectionVersion(currentRoom, currentRound);
  const incoming = projectionVersion(incomingRoom, incomingRound);
  return incoming[0] < current[0] || incoming[0] === current[0] && incoming[1] < current[1];
}

function mutationFingerprint(roomId, roundId, action, payload) {
  return JSON.stringify([clean(roomId), clean(roundId), clean(action), payload]);
}

function padSeq(value) {
  const seq = Math.max(0, Number(value) || 0);
  return String(seq).padStart(3, '0');
}

function formatRoundSealSeq(value) {
  const seq = Math.max(0, Number(value) || 0);
  return seq > 999 ? '#999+' : `#${padSeq(seq)}`;
}

function localTime(value) {
  const timestamp = Number(value || 0);
  if (!timestamp) return '';
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return '';
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

function entryIdentity(entry) {
  return clean(entry && (entry.id || entry.entryId));
}

function entryCategory(entry) {
  return clean(entry && (entry.category || entry.type)) === 'game' ? 'game' : 'direct';
}

function entriesForFilter(entries, filter) {
  const list = Array.isArray(entries) ? entries : [];
  return filter && filter !== 'all' ? list.filter((entry) => entryCategory(entry) === filter) : list;
}

function mergeFeedEntries(...groups) {
  const seen = new Set();
  const merged = [];
  groups.forEach((group) => {
    (Array.isArray(group) ? group : []).forEach((entry) => {
      const id = entryIdentity(entry);
      if (!id || seen.has(id)) return;
      seen.add(id);
      merged.push(entry);
    });
  });
  return merged.sort((left, right) => Number(right && right.seq || 0) - Number(left && left.seq || 0));
}

function applyFeedLifecycle(entries, incoming) {
  const lifecycleByTarget = new Map();
  (Array.isArray(incoming) ? incoming : []).forEach((entry) => {
    const eventType = clean(entry && entry.eventType);
    const targetEntryId = clean(entry && entry.targetEntryId);
    if (!targetEntryId || !['entry_corrected', 'entry_reversed'].includes(eventType)) return;
    lifecycleByTarget.set(targetEntryId, {
      status: eventType === 'entry_reversed' ? 'reversed' : 'corrected',
      successorEntryId: entryIdentity(entry),
    });
  });
  if (!lifecycleByTarget.size) return Array.isArray(entries) ? entries : [];
  return (Array.isArray(entries) ? entries : []).map((entry) => {
    const lifecycle = lifecycleByTarget.get(entryIdentity(entry));
    return lifecycle ? { ...entry, ...lifecycle } : entry;
  });
}

function localDateTime(value) {
  const timestamp = Number(value || 0);
  if (!timestamp) return '';
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return '';
  return `${date.getMonth() + 1}月${date.getDate()}日 ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

function decorateRoundSummaries(rounds) {
  return (Array.isArray(rounds) ? rounds : []).map((round) => ({
    ...round,
    id: clean(round && (round.id || round.roundId)),
    participantCount: Number(round && round.participantCount
      || Array.isArray(round && round.participantSnapshot) && round.participantSnapshot.length
      || 0),
    timeText: localDateTime(round && (round.createdAtMs || round.startedAtMs)),
  }));
}

function participantNameMap(participants) {
  const map = {};
  (Array.isArray(participants) ? participants : []).forEach((item) => {
    map[clean(item && item.id)] = clean(item && item.name) || '球友';
  });
  return map;
}

function describeBusinessEntry(entry, names) {
  if (clean(entry && entry.description)) return clean(entry.description);
  const eventType = clean(entry && entry.eventType);
  if (['entry_corrected', 'entry_reversed'].includes(eventType) && typeof waterLedger.describeV2Entry === 'function') {
    const participants = Object.keys(names || {}).map((id) => ({ id, name: names[id] }));
    const description = clean(waterLedger.describeV2Entry(entry, participants));
    if (description) return description;
  }
  const payload = entry && entry.payload || entry || {};
  const category = entryCategory(entry);
  if (category === 'game') {
    const winners = (Array.isArray(payload.winnerIds) ? payload.winnerIds : []).map((id) => names[clean(id)] || '球友').join('、');
    const losers = (Array.isArray(payload.loserIds) ? payload.loserIds : []).map((id) => names[clean(id)] || '球友').join('、');
    return `${winners || '胜方'} 胜 ${losers || '负方'} · 每人 ${Number(payload.unitsPerPlayer || 1)} 水`;
  }
  const from = names[clean(payload.fromPlayerId)] || clean(payload.fromNameSnapshot) || '球友';
  const to = names[clean(payload.toPlayerId)] || clean(payload.toNameSnapshot) || '球友';
  return `${from} 请 ${to} · ${Number(payload.units || 1)} 水`;
}

function formatDisplayDescription(value) {
  return clean(value).replace(/每人\s+(\d+)\s+水/g, '每\u2060人\u00a0$1\u00a0水');
}

function capability(caps, key, fallback) {
  if (caps && Object.prototype.hasOwnProperty.call(caps, key)) return !!caps[key];
  return !!fallback;
}

function correctionBlockedReason(entry, caps) {
  if (!entry) return '';
  const eventType = clean(entry.eventType);
  const status = clean(entry.status);
  if (eventType === 'entry_reversed' || status === 'reversed') {
    return '这条记录已经撤销，不能继续修改';
  }
  if (entry.canEdit === false) return '这条记录已更新，当前版本不能继续修改';
  if (!capability(caps, 'canCorrect', false)) return '修改权限已更新，草稿已保留；请刷新后重试';
  return '';
}

function apiMethod(primary, fallback = '') {
  const method = waterApi && waterApi[primary] || fallback && waterApi && waterApi[fallback];
  if (typeof method !== 'function') {
    throw new Error(`waterSession.${primary} 尚未可用`);
  }
  return method;
}

Page({
  data: {
    loading: true,
    loadError: '',
    invalidRoom: false,
    roomId: '',
    sessionId: '',
    roundId: '',
    room: null,
    round: null,
    session: null,
    viewer: null,
    capabilities: {},
    legacyMode: false,
    canUseV2Features: false,
    activeTab: 'ledger',
    isOwner: false,
    isMember: false,
    isVisitor: true,
    isArchived: false,
    viewerParticipantId: '',
    canWrite: false,
    canManageRoster: false,
    canAddParticipants: false,
    canCreateRound: false,
    canShare: false,
    bottomActionMode: 'join',
    writeDisabled: true,
    participantCount: 0,
    recordCount: 0,
    activeRecordCount: 0,
    eventCount: 0,
    roundSeqText: '#000',
    participants: [],
    rosterParticipants: [],
    rosterSearchQuery: '',
    ledger: [],
    latestReceipt: { visible: false, text: '' },
    syncMessage: '',
    newEventCount: 0,
    feedFilter: 'all',
    feedItems: [],
    feedLatestSeq: 0,
    feedNextBeforeSeq: null,
    feedHasMore: false,
    feedHasLoadedOlder: false,
    feedLoading: false,
    feedLoadingMore: false,
    feedError: '',
    feedExhausted: false,
    unitOptions,
    busy: false,
    busyByAction: {},
    receiptFeedback: null,
    highlightedEntryId: '',
    sheetBlockedReason: '',
    sheetError: '',

    gameSheetOpen: false,
    gameUnitIndex: 0,
    gameSearchQuery: '',
    gameParticipants: [],
    gameParticipantOrder: [],
    gameBodyScrollTop: 0,
    gameActiveSide: 'winner',
    winnerIds: [],
    loserIds: [],
    winnerSummary: '待选',
    loserSummary: '待选',
    winnerFullSummary: '待选',
    loserFullSummary: '待选',
    gameSelectionValid: false,
    gameValidationMessage: '至少各选 1 人',
    gameSummaryExpanded: false,
    hasLongGameNames: false,

    directSheetOpen: false,
    directChoices: [],
    directFromIndex: 0,
    directToIndex: 0,
    directUnitIndex: 0,
    directPreview: '请水方 → 赢水方',
    directSelectionValid: false,
    directValidationMessage: '请选择请水方和赢水方',
    adjustSheetOpen: false,
    adjustTargetId: '',
    adjustTargetName: '',
    adjustDirection: 'plus',
    adjustUnitIndex: 0,
    counterpartyIndex: 0,
    counterparties: [],

    editingEntry: null,
    correctionDraft: null,
    detailSheetOpen: false,
    entryDetail: null,
    entryHistory: [],
    detailLoading: false,
    detailError: '',
    detailRootEntryId: '',

    manualSheetOpen: false,
    addMode: 'manual',
    manualNames: '',
    manualNamesValid: false,
    relayText: '',
    relayRecognizedCount: 0,
    relayDuplicateCount: 0,
    relayOverflowCount: 0,
    relayPreviewNames: [],
    relayNewNames: [],

    joinSheetOpen: false,
    joinIndex: 0,
    joinChoices: [{ id: '', name: '以我的名字加入' }],
    joinNickname: '',
    joinNeedsDistinctName: false,
    joinNameError: '',

    historySheetOpen: false,
    historyLoading: false,
    historyRounds: [],
    historyHasMore: false,
    historyNextBeforeNumber: null,
    historyLoadingMore: false,
    historyError: '',
    historyRound: null,
    historyRoundTargetId: '',
    historyRoundLoading: false,
    historyRoundError: '',
    historyRoundLedger: [],
    historyRoundFeed: [],
    historyRoundFeedNextBeforeSeq: null,
    historyRoundFeedHasMore: false,
    historyRoundFeedLoadingMore: false,
    historyRoundFeedError: '',
  },

  async onLoad(options = {}) {
    this.syncShareMenu(false);
    const roomId = clean(options.id || options.roomId || options.sessionId);
    if (roomId) {
      this.setData({ roomId, sessionId: roomId });
      await this.loadRoom();
      return;
    }
    await this.createOrContinue();
  },

  onShow() {
    this._isVisible = true;
    const shouldCatchUp = !!(this._hasShown && this.data.roomId);
    this._hasShown = true;
    this.ensureRefreshTimer();
    if (shouldCatchUp) this.loadRoom({ silent: true });
  },

  onHide() {
    this._isVisible = false;
    this.clearRefreshTimer();
  },

  onUnload() {
    this._isVisible = false;
    this.clearRefreshTimer();
    this.clearReceiptTimer();
    this.clearHighlightTimer();
    this._detailRequestSeq = Number(this._detailRequestSeq || 0) + 1;
    this._historyRoundRequestSeq = Number(this._historyRoundRequestSeq || 0) + 1;
    this._mutationIntents = {};
    this._feedRawEntries = [];
    this._pendingFeedEntryIds = new Set();
    this._feedAwayFromLatest = false;
  },

  onReachBottom() {
    if (this.data.activeTab === 'feed') this.loadMoreEntries();
  },

  async onPullDownRefresh() {
    await this.loadRoom({ silent: true, force: true });
    if (typeof wx !== 'undefined' && typeof wx.stopPullDownRefresh === 'function') wx.stopPullDownRefresh();
  },

  ensureRefreshTimer() {
    if (!this._isVisible || !this.data.roomId || this._refreshTimer || this._pollInFlight) return;
    const failureCount = Number(this._pollFailureCount || 0);
    const delay = this._burstRemaining > 0
      ? BURST_POLL_MS
      : failureCount <= 0 ? NORMAL_POLL_MS : failureCount === 1 ? 16000 : 30000;
    this._refreshTimer = setInterval(async () => {
      const handle = this._refreshTimer;
      this._refreshTimer = null;
      if (handle) clearInterval(handle);
      this._pollInFlight = true;
      const response = await this.loadRoom({ silent: true });
      this._pollInFlight = false;
      if (response) {
        this._pollFailureCount = 0;
        if (this._burstRemaining > 0) this._burstRemaining -= 1;
      } else {
        this._pollFailureCount = Math.min(2, Number(this._pollFailureCount || 0) + 1);
        this._burstRemaining = 0;
      }
      this.ensureRefreshTimer();
    }, delay);
  },

  beginBurstPolling() {
    this._burstRemaining = BURST_POLL_COUNT;
    this._pollFailureCount = 0;
    this.clearRefreshTimer();
    this.ensureRefreshTimer();
  },

  clearRefreshTimer() {
    if (this._refreshTimer) clearInterval(this._refreshTimer);
    this._refreshTimer = null;
  },

  clearReceiptTimer() {
    if (this._receiptTimer) clearTimeout(this._receiptTimer);
    this._receiptTimer = null;
  },

  clearHighlightTimer() {
    if (this._highlightTimer) clearTimeout(this._highlightTimer);
    this._highlightTimer = null;
  },

  setActionBusy(action, value) {
    const busyByAction = { ...(this.data.busyByAction || {}) };
    if (value) busyByAction[action] = true;
    else delete busyByAction[action];
    this.setData({ busyByAction, busy: Object.keys(busyByAction).length > 0 });
  },

  mutationIntent(action, payload) {
    const fingerprint = mutationFingerprint(this.data.roomId, this.data.roundId, action, payload);
    const intents = this._mutationIntents || {};
    const current = intents[action];
    if (current && current.fingerprint === fingerprint) return current;
    const next = {
      fingerprint,
      clientRequestId: clientRequest.buildClientRequestId(`water_${action}`),
    };
    this._mutationIntents = { ...intents, [action]: next };
    return next;
  },

  clearMutationIntent(action, fingerprint = '') {
    const intents = this._mutationIntents || {};
    const current = intents[action];
    if (!current || fingerprint && current.fingerprint !== fingerprint) return;
    const next = { ...intents };
    delete next[action];
    this._mutationIntents = next;
  },

  async createOrContinue() {
    const guardKey = 'water:v2:create';
    return actionGuard.runCriticalWrite(guardKey, async () => {
      this.setActionBusy('create', true);
      this.setData({ loading: true, loadError: '' });
      try {
        const gate = await profileCore.ensureProfileForAction('generic', '/pages/water/index');
        if (!gate || !gate.ok) {
          const reason = gate && gate.reason;
          this.setData({ loading: false, loadError: reason === 'login_failed' ? '登录失败，请重试' : '' });
          return null;
        }
        const name = profileName(gate.profile);
        const intent = this.mutationIntent('create_v2', [name]);
        const method = apiMethod('createV2', 'create');
        const response = await method(name, { clientRequestId: intent.clientRequestId });
        this.clearMutationIntent('create_v2', intent.fingerprint);
        this.applyApiResponse(response);
        return response;
      } catch (err) {
        this.setData({ loading: false, loadError: clean(err && err.message) || '暂时无法开始打水' });
        return null;
      } finally {
        this.setActionBusy('create', false);
      }
    });
  },

  async loadRoom(options = {}) {
    const requestedRoomId = clean(this.data.roomId || this.data.sessionId);
    if (!requestedRoomId) return null;
    const requestSeq = Number(this._loadRequestSeq || 0) + 1;
    const requestedVersion = Number(this.data.session && this.data.session.version);
    const requestedRoundId = clean(this.data.roundId);
    const requestedFilter = clean(this.data.feedFilter) || 'all';
    const requestedAfterSeq = Number(this.data.feedLatestSeq || 0);
    this._loadRequestSeq = requestSeq;
    if (!options.silent) this.setData({ loading: true, loadError: '', invalidRoom: false });
    try {
      const method = this.data.legacyMode ? apiMethod('get') : apiMethod('getV2', 'get');
      const response = await method(requestedRoomId);
      if (clean(this.data.roomId || this.data.sessionId) !== requestedRoomId || requestSeq < Number(this._latestSuccessfulLoadSeq || 0)) return null;
      const currentFeedScope = `${clean(this.data.roundId)}:${clean(this.data.feedFilter) || 'all'}`;
      const requestedFeedScope = `${requestedRoundId}:${requestedFilter}`;
      const applied = this.applyApiResponse(response, {
        fromRefresh: true,
        ignoreFeedEntries: !!requestedRoundId && currentFeedScope !== requestedFeedScope,
      });
      if (applied) this._latestSuccessfulLoadSeq = requestSeq;
      if (
        applied
        && !this.data.legacyMode
        && clean(this.data.roomId) === requestedRoomId
        && clean(this.data.roundId) === requestedRoundId
        && clean(this.data.feedFilter) === requestedFilter
      ) {
        if (requestedFilter !== 'all') {
          await this.syncFilteredEntries({
            roomId: requestedRoomId,
            roundId: requestedRoundId,
            filter: requestedFilter,
            afterSeq: requestedAfterSeq,
          });
        } else if (this._feedNeedsFullReset) {
          this._feedNeedsFullReset = false;
          await this.loadEntries({ reset: true });
        }
      }
      return response;
    } catch (err) {
      const currentVersion = Number(this.data.session && this.data.session.version);
      const sessionAdvanced = Number.isFinite(requestedVersion)
        && Number.isFinite(currentVersion)
        && currentVersion > requestedVersion;
      if (
        clean(this.data.roomId || this.data.sessionId) !== requestedRoomId
        || requestSeq < Number(this._latestSuccessfulLoadSeq || 0)
        || sessionAdvanced
      ) return null;
      if (clean(err && err.code) === 'WATER_ROOM_NOT_FOUND') {
        this.setData({ loading: false, invalidRoom: true, loadError: '打水房不存在或链接不完整', syncMessage: '' });
      } else if (options.silent && this.data.room) {
        this.setData({ syncMessage: '连接不稳定，正在重试' });
      } else {
        this.setData({ loading: false, loadError: clean(err && err.message) || '打水房加载失败' });
      }
      return null;
    }
  },

  async syncFilteredEntries(scope) {
    if (!this.data.canUseV2Features) return null;
    const roomId = clean(scope && scope.roomId);
    const roundId = clean(scope && scope.roundId);
    const filter = clean(scope && scope.filter);
    const afterSeq = Math.max(0, Number(scope && scope.afterSeq || 0));
    if (!roomId || !roundId || !['game', 'direct'].includes(filter)) return null;
    const requestSeq = Number(this._feedRequestSeq || 0) + 1;
    const scopeKey = `${roomId}:${roundId}:${filter}`;
    this._feedRequestSeq = requestSeq;
    try {
      const response = await apiMethod('listEntries')(roomId, roundId, {
        category: filter,
        afterSeq,
        limit: PAGE_SIZE,
      });
      const currentScopeKey = `${clean(this.data.roomId)}:${clean(this.data.roundId)}:${clean(this.data.feedFilter)}`;
      if (requestSeq !== this._feedRequestSeq || currentScopeKey !== scopeKey) return null;
      const data = responseData(response);
      const incoming = entriesForFilter(data.entries, filter);
      const page = data.page || {};
      if (page.hasMore) {
        return this.loadEntries({ reset: true });
      }
      const existingBase = Array.isArray(this._feedRawEntries) ? this._feedRawEntries : [];
      const existing = applyFeedLifecycle(existingBase, incoming);
      const existingIds = new Set(existing.map(entryIdentity).filter(Boolean));
      const pendingIds = this._pendingFeedEntryIds instanceof Set ? this._pendingFeedEntryIds : new Set();
      const unseen = incoming.filter((entry) => {
        const id = entryIdentity(entry);
        return id && !existingIds.has(id) && !pendingIds.has(id);
      });
      const holdNewEntries = (unseen.length > 0 || pendingIds.size > 0)
        && (this.data.feedHasLoadedOlder || this._feedAwayFromLatest);
      let merged = existing;
      let newEventCount = Number(this.data.newEventCount || 0);
      if (holdNewEntries) {
        unseen.forEach((entry) => pendingIds.add(entryIdentity(entry)));
        newEventCount = Math.max(newEventCount, pendingIds.size);
      } else {
        merged = mergeFeedEntries(incoming, existing);
        pendingIds.clear();
        newEventCount = 0;
      }
      this._pendingFeedEntryIds = pendingIds;
      this._feedRawEntries = merged;
      this.setData({
        feedItems: this.decorateFeedEntries(merged, {
          names: participantNameMap(this.data.participants),
          viewerParticipantId: this.data.viewerParticipantId,
          isOwner: this.data.isOwner,
          isArchived: this.data.isArchived,
          canCorrect: capability(this.data.capabilities, 'canCorrect', false) && this.data.canWrite,
          canReverse: capability(this.data.capabilities, 'canReverse', false) && this.data.canWrite,
        }),
        feedLatestSeq: Math.max(afterSeq, Number(page.latestSeq || 0)),
        newEventCount,
        feedError: '',
      });
      return response;
    } catch (err) {
      const currentScopeKey = `${clean(this.data.roomId)}:${clean(this.data.roundId)}:${clean(this.data.feedFilter)}`;
      if (requestSeq === this._feedRequestSeq && currentScopeKey === scopeKey) {
        this.setData({ syncMessage: clean(err && err.message) || '流水同步失败，正在重试' });
      }
      return null;
    }
  },

  loadSession(options = {}) {
    return this.loadRoom(options);
  },

  applyApiResponse(response, options = {}) {
    const data = responseData(response);
    if (data.session) return this.applySession(data.session);
    if (data.legacySession) {
      this.setData({ legacyMode: true, syncMessage: '账本正在升级，暂时由发起人记水' });
      return this.applySession(data.legacySession, { capabilities: data.capabilities, legacyMode: true });
    }
    if (!data.room || !data.round) return false;
    return this.applyRoomData(data, options);
  },

  applySession(session, options = {}) {
    if (!session || isOlderSession(this.data.session, session)) return false;
    const participants = Array.isArray(session.participants) ? session.participants : [];
    const entries = Array.isArray(session.entries) ? session.entries : [];
    const ledger = waterLedger.deriveLedger(participants, entries).map((item) => ({
      participantId: item.id,
      won: item.won,
      treat: item.treat,
      net: item.net,
    }));
    const viewerParticipantId = clean(session.viewerParticipantId);
    const isOwner = !!session.isOwner;
    const legacyCapabilities = options.capabilities || {
      v2Read: false,
      legacyRead: true,
      legacyOwnerWrite: isOwner,
    };
    const applied = this.applyRoomData({
      room: {
        id: session.id,
        roomVersion: session.version,
        syncVersion: session.version,
        participants,
      },
      round: {
        id: session.id,
        number: 1,
        title: session.title,
        status: session.status === 'finished' ? 'archived' : 'active',
        recordCount: entries.length,
        activeRecordCount: entries.length,
        eventCount: entries.length,
        revision: session.version,
        ledger,
      },
      viewer: {
        participantId: viewerParticipantId,
        role: isOwner ? 'owner' : viewerParticipantId ? 'member' : 'visitor',
      },
      capabilities: legacyCapabilities,
      entries,
      page: { latestSeq: entries.length, nextBeforeSeq: null, hasMore: false },
    }, { legacyMode: true });
    const names = participantNameMap(participants);
    this.setData({
      session,
      legacyMode: options.legacyMode !== false,
      recentEntries: entries.slice(-4).reverse().map((entry) => ({
        ...entry,
        description: waterLedger.describeEntry(entry, names),
      })),
      entryCount: entries.length,
    });
    return applied;
  },

  applyRoomData(input, options = {}) {
    const data = responseData(input);
    const room = data.room || {};
    const round = data.round || {};
    if (isOlderProjection(this.data.room, this.data.round, room, round)) return false;
    const previousRoomId = clean(this.data.roomId || this.data.sessionId);
    const previousRoundId = clean(this.data.roundId);
    const roomId = clean(room.id || room._id || data.roomId || this.data.roomId);
    const roundId = clean(round.id || round._id || data.roundId);
    const sameFeedScope = !!previousRoomId && previousRoomId === roomId && previousRoundId === roundId;
    const feedScopeChanged = !!previousRoundId && !sameFeedScope;
    if (feedScopeChanged) {
      this._feedRequestSeq = Number(this._feedRequestSeq || 0) + 1;
      this._detailRequestSeq = Number(this._detailRequestSeq || 0) + 1;
      this._detailScopeKey = '';
      this._feedRawEntries = [];
      this._pendingFeedEntryIds = new Set();
      this._feedAwayFromLatest = false;
      this._feedNeedsFullReset = false;
      this.clearReceiptTimer();
      this.clearHighlightTimer();
    }
    let detailScopeReset = feedScopeChanged ? {
      detailSheetOpen: false,
      detailLoading: false,
      detailError: '',
      detailRootEntryId: '',
      entryDetail: null,
      entryHistory: [],
    } : {};
    const rawParticipants = Array.isArray(room.participants)
      ? room.participants
      : Array.isArray(round.participantSnapshot) ? round.participantSnapshot : [];
    const viewer = data.viewer && typeof data.viewer === 'object' ? data.viewer : {};
    const capabilities = data.capabilities && typeof data.capabilities === 'object' ? data.capabilities : {};
    const legacyMode = !!options.legacyMode;
    const canUseV2Features = !legacyMode && capabilities.v2Read === true;
    let v2FeatureScopeReset = {};
    if (!canUseV2Features) {
      this._feedRequestSeq = Number(this._feedRequestSeq || 0) + 1;
      this._historyRequestSeq = Number(this._historyRequestSeq || 0) + 1;
      this._historyRoundRequestSeq = Number(this._historyRoundRequestSeq || 0) + 1;
      this._historyRoundScopeKey = '';
      this._historyRoundRawEntries = [];
      this._feedAwayFromLatest = false;
      this._feedNeedsFullReset = false;
      v2FeatureScopeReset = {
        historySheetOpen: false,
        historyLoading: false,
        historyRounds: [],
        historyHasMore: false,
        historyNextBeforeNumber: null,
        historyLoadingMore: false,
        historyError: '',
        historyRound: null,
        historyRoundTargetId: '',
        historyRoundLoading: false,
        historyRoundError: '',
        historyRoundLedger: [],
        historyRoundFeed: [],
        historyRoundFeedNextBeforeSeq: null,
        historyRoundFeedHasMore: false,
        historyRoundFeedLoadingMore: false,
        historyRoundFeedError: '',
      };
    }
    const detailRootEntryId = clean(this.data.detailRootEntryId || this.data.entryDetail && this.data.entryDetail.rootEntryId);
    const detailExpectedEntryId = clean(this.data.entryDetail
      && (this.data.entryDetail.expectedEntryId || this.data.entryDetail.id));
    const detailSuperseded = !feedScopeChanged && !!detailRootEntryId
      && (Array.isArray(data.entries) ? data.entries : []).some((entry) => {
        const eventType = clean(entry && entry.eventType);
        if (!['entry_corrected', 'entry_reversed'].includes(eventType)) return false;
        const incomingId = entryIdentity(entry);
        const incomingRootId = clean(entry && entry.rootEntryId);
        const targetEntryId = clean(entry && entry.targetEntryId);
        return incomingId !== detailExpectedEntryId
          && incomingRootId === detailRootEntryId
          && (!detailExpectedEntryId || targetEntryId === detailExpectedEntryId || targetEntryId === detailRootEntryId);
      });
    if ((!canUseV2Features && this.data.detailSheetOpen) || detailSuperseded) {
      this._detailRequestSeq = Number(this._detailRequestSeq || 0) + 1;
      this._detailScopeKey = '';
      detailScopeReset = {
        detailSheetOpen: false,
        detailLoading: false,
        detailError: '',
        detailRootEntryId: '',
        entryDetail: null,
        entryHistory: [],
      };
    }
    const viewerRole = clean(viewer.role);
    const viewerParticipantId = clean(viewer.participantId || viewer.viewerParticipantId);
    const expectedOwner = viewerRole === 'owner';
    const expectedMember = expectedOwner || viewerRole === 'member';
    const roleKnown = ['owner', 'member', 'visitor'].includes(viewerRole);
    const identityConsistent = expectedMember ? !!viewerParticipantId : !viewerParticipantId;
    const ownerFlagConsistent = !Object.prototype.hasOwnProperty.call(viewer, 'isOwner')
      || viewer.isOwner === expectedOwner;
    const memberFlagConsistent = !Object.prototype.hasOwnProperty.call(viewer, 'isMember')
      || viewer.isMember === expectedMember;
    const viewerValid = roleKnown && identityConsistent && ownerFlagConsistent && memberFlagConsistent;
    const isOwner = viewerValid && expectedOwner;
    const isMember = viewerValid && expectedMember;
    const isVisitor = viewerValid && viewerRole === 'visitor';
    const isArchived = clean(round.status) === 'archived';
    const roleWrite = legacyMode
      ? isOwner && capabilities.legacyOwnerWrite === true
      : canUseV2Features && isOwner
        ? capability(capabilities, 'canOwnerWrite', false)
        : canUseV2Features && capability(capabilities, 'canMemberWrite', false);
    const canWrite = isMember && !isArchived && roleWrite && !capabilities.emergencyReadOnly;
    const canCreateRound = canUseV2Features && isOwner && capability(capabilities, 'canCreateRound', false) && !capabilities.emergencyReadOnly;
    const participants = rawParticipants.map((item) => ({
      ...item,
      id: clean(item && (item.id || item.participantId)),
      name: clean(item && item.name) || '球友',
      claimed: !!(item && item.claimed),
      isSelf: clean(item && (item.id || item.participantId)) === viewerParticipantId,
      joinedText: item && item.claimed ? '已加入' : '待认领',
    }));
    const names = participantNameMap(participants);
    const serverLedger = Array.isArray(round.ledger) ? round.ledger : [];
    const ledger = serverLedger.map((item, index) => {
      const participantId = clean(item && (item.participantId || item.id));
      const net = Number(item && item.net || 0);
      return {
        id: participantId,
        participantId,
        name: names[participantId] || `球友${index + 1}`,
        won: Number(item && item.won || 0),
        treat: Number(item && item.treat || 0),
        net,
        netText: net > 0 ? `+${net}` : String(net),
        netClass: net > 0 ? 'is-positive' : net < 0 ? 'is-negative' : 'is-even',
        netSizeClass: ledgerNetSizeClass(net),
      };
    }).sort((a, b) => b.net - a.net || b.won - a.won || a.name.localeCompare(b.name));
    const unclaimed = participants.filter((item) => !item.claimed);
    const roomFull = participants.length >= MAX_PARTICIPANTS;
    const canManageRoster = isOwner && !isArchived && (legacyMode
      ? capabilities.legacyOwnerWrite === true
      : canUseV2Features && capability(capabilities, 'canManageRoster', false));
    const canAddParticipants = canManageRoster && !roomFull && !capabilities.emergencyReadOnly;
    const joinChoices = [];
    if (!roomFull) joinChoices.push({ id: '', name: '以我的名字加入' });
    unclaimed.forEach((item) => joinChoices.push({ id: item.id, name: `认领「${item.name}」` }));
    if (!joinChoices.length) joinChoices.push({ id: '__full__', name: '球友已满 24 人' });
    const currentJoin = (this.data.joinChoices || [])[Number(this.data.joinIndex || 0)];
    const currentJoinId = clean(currentJoin && currentJoin.id);
    const matchedJoinIndex = joinChoices.findIndex((item) => clean(item.id) === currentJoinId);
    const canShare = isMember
      && (legacyMode ? isOwner && capabilities.legacyOwnerWrite === true : canUseV2Features)
      && !capabilities.emergencyReadOnly
      && (!roomFull || unclaimed.length > 0);
    const writeDisabled = participants.length < 2 || !canWrite;
    let bottomActionMode = 'read-only';
    if (isArchived) bottomActionMode = 'archived';
    else if (capabilities.emergencyReadOnly) bottomActionMode = 'read-only';
    else if (!legacyMode && !canUseV2Features) bottomActionMode = 'read-only';
    else if (legacyMode && !canWrite) bottomActionMode = 'read-only';
    else if (isVisitor && roomFull && !unclaimed.length) bottomActionMode = 'full';
    else if (isVisitor) bottomActionMode = 'join';
    else if (canWrite) bottomActionMode = 'write';

    const page = data.page || {};
    const filter = canUseV2Features && !feedScopeChanged ? this.data.feedFilter : 'all';
    const rawEntries = options.ignoreFeedEntries ? null : Array.isArray(data.entries) ? data.entries : null;
    const filteredIncoming = entriesForFilter(rawEntries, filter);
    const existingFeedBase = sameFeedScope && Array.isArray(this._feedRawEntries) ? this._feedRawEntries : [];
    const existingFeed = applyFeedLifecycle(existingFeedBase, filteredIncoming);
    const incomingLatestSeq = Number(page.latestSeq || round.eventCount || 0);
    const visibleLatestSeq = Number(this.data.feedLatestSeq || 0);
    let feedSource = existingFeed;
    let feedLatestSeq = sameFeedScope ? visibleLatestSeq : incomingLatestSeq;
    let feedNextBeforeSeq = sameFeedScope ? this.data.feedNextBeforeSeq : null;
    let feedHasMore = sameFeedScope ? !!this.data.feedHasMore : false;
    let feedExhausted = sameFeedScope ? !!this.data.feedExhausted : false;
    let feedHasLoadedOlder = sameFeedScope ? !!this.data.feedHasLoadedOlder : false;
    let newEventCount = sameFeedScope ? Number(this.data.newEventCount || 0) : 0;
    const pendingIds = this._pendingFeedEntryIds instanceof Set ? this._pendingFeedEntryIds : new Set();
    if (!canUseV2Features) {
      pendingIds.clear();
      feedHasLoadedOlder = false;
      newEventCount = 0;
    }

    if (rawEntries) {
      if (sameFeedScope && options.fromRefresh) {
        const existingIds = new Set(existingFeed.map(entryIdentity).filter(Boolean));
        const unseen = filteredIncoming.filter((entry) => {
          const id = entryIdentity(entry);
          return id && !existingIds.has(id) && !pendingIds.has(id) && Number(entry && entry.seq || 0) > visibleLatestSeq;
        });
        const latestDelta = filter === 'all' ? Math.max(0, incomingLatestSeq - visibleLatestSeq) : unseen.length;
        const hasSequenceGap = latestDelta > unseen.length;
        if (hasSequenceGap && filter === 'all') this._feedNeedsFullReset = true;
        const holdNewEntries = (unseen.length > 0 || pendingIds.size > 0)
          && (feedHasLoadedOlder || this._feedAwayFromLatest || hasSequenceGap);
        if (holdNewEntries) {
          unseen.forEach((entry) => pendingIds.add(entryIdentity(entry)));
          newEventCount = Math.max(newEventCount, pendingIds.size, latestDelta);
          feedLatestSeq = Math.max(visibleLatestSeq, incomingLatestSeq);
        } else {
          feedSource = mergeFeedEntries(filteredIncoming, existingFeed);
          feedLatestSeq = Math.max(visibleLatestSeq, incomingLatestSeq);
          pendingIds.clear();
          newEventCount = 0;
        }
      } else if (sameFeedScope && (options.fromMutation || options.preserveFeed)) {
        feedSource = mergeFeedEntries(filteredIncoming, existingFeed);
        feedLatestSeq = Math.max(visibleLatestSeq, incomingLatestSeq);
      } else {
        feedSource = mergeFeedEntries(filteredIncoming);
        feedLatestSeq = incomingLatestSeq;
        feedNextBeforeSeq = page.nextBeforeSeq == null ? null : Number(page.nextBeforeSeq);
        feedHasMore = !!page.hasMore;
        feedExhausted = page.hasMore === false;
        feedHasLoadedOlder = false;
        pendingIds.clear();
        newEventCount = 0;
      }
    }
    this._pendingFeedEntryIds = pendingIds;
    this._feedRawEntries = feedSource;
    const feedItems = this.decorateFeedEntries(feedSource, {
      names,
      viewerParticipantId,
      isOwner,
      isArchived,
      canCorrect: canWrite && capability(capabilities, 'canCorrect', false),
      canReverse: canWrite && capability(capabilities, 'canReverse', false),
    });
    const eventCount = Number(round.eventCount || 0);
    const latestServerItems = this.decorateFeedEntries(mergeFeedEntries(rawEntries || []), {
      names,
      viewerParticipantId,
      isOwner,
      isArchived,
      canCorrect: false,
      canReverse: false,
    });
    const latestEntry = latestServerItems[0] || feedItems[0];
    const latestReceipt = latestEntry ? {
      visible: true,
      text: `流水 #${padSeq(eventCount || latestEntry.seq)} · ${latestEntry.actorName || '球友'}${latestEntry.isAuditEvent ? '完成一次' + (latestEntry.kindText === '更正' ? '更正' : '撤销') : '记入一笔'}`,
    } : { visible: false, text: '' };
    const selection = this.data.gameSheetOpen
      ? gameSelectionState(
        participants,
        this.data.winnerIds,
        this.data.loserIds,
        this.data.gameSearchQuery,
        this.data.gameParticipantOrder,
      )
      : { participants, gameParticipants: filteredParticipants(participants, this.data.gameSearchQuery) };
    const relayState = this.data.manualSheetOpen && this.data.addMode === 'relay' && this.data.relayText
      ? relayPreview(this.data.relayText, participants)
      : {};
    const directChoices = [{ id: '', name: '请选择' }].concat(participants.map((item) => ({ id: item.id, name: item.name })));
    const directState = this.data.directSheetOpen
      ? directSelectionState(directChoices, this.data.directFromIndex, this.data.directToIndex, this.data.directUnitIndex)
      : {};
    let receiptFeedback = this.data.receiptFeedback;
    if (feedScopeChanged || !canWrite || isArchived) receiptFeedback = null;
    if (receiptFeedback && rawEntries) {
      const feedbackRootId = clean(receiptFeedback.rootEntryId);
      const feedbackExpectedId = clean(receiptFeedback.expectedEntryId);
      const superseded = rawEntries.some((entry) => clean(entry && entry.rootEntryId) === feedbackRootId
        && entryIdentity(entry) !== feedbackExpectedId
        && ['entry_corrected', 'entry_reversed'].includes(clean(entry && entry.eventType)));
      if (superseded) receiptFeedback = null;
    }
    if (!receiptFeedback) this.clearReceiptTimer();
    const mutationSheetOpen = this.data.gameSheetOpen || this.data.directSheetOpen
      || this.data.manualSheetOpen || this.data.joinSheetOpen;
    let sheetBlockedReason = '';
    if (mutationSheetOpen) {
      const draftRoundId = clean(this._sheetDraftRoundId);
      if (draftRoundId && roundId && draftRoundId !== roundId) {
        sheetBlockedReason = '当前轮已更新，草稿已保留；请重新打开后确认';
      } else if ((this.data.gameSheetOpen || this.data.directSheetOpen) && !canWrite) {
        sheetBlockedReason = capabilities.emergencyReadOnly
          ? '打水账本暂时只读，草稿已保留'
          : '记水权限已更新，草稿已保留；请刷新后重试';
      } else if ((this.data.gameSheetOpen || this.data.directSheetOpen) && this.data.editingEntry) {
        sheetBlockedReason = correctionBlockedReason(this.data.editingEntry, capabilities);
      } else if (this.data.manualSheetOpen && !canAddParticipants) {
        sheetBlockedReason = capabilities.emergencyReadOnly
          ? '打水账本暂时只读，草稿已保留'
          : roomFull ? '球友已满 24 人，草稿已保留' : '名单权限已更新，草稿已保留';
      } else if (this.data.joinSheetOpen && bottomActionMode !== 'join') {
        sheetBlockedReason = capabilities.emergencyReadOnly
          ? '打水账本暂时只读，加入资料已保留'
          : '加入状态已更新，请关闭后重新确认';
      }
    }

    this.setData({
      loading: false,
      loadError: '',
      invalidRoom: false,
      syncMessage: legacyMode ? '账本正在升级，暂时由发起人记水' : '',
      roomId,
      sessionId: roomId,
      roundId,
      room,
      round,
      viewer,
      capabilities,
      legacyMode,
      canUseV2Features,
      isOwner,
      isMember,
      isVisitor,
      isArchived,
      viewerParticipantId,
      canWrite,
      canManageRoster,
      canAddParticipants,
      canCreateRound,
      canShare,
      bottomActionMode,
      writeDisabled,
      ...selection,
      ...relayState,
      participantCount: participants.length,
      recordCount: Number(round.recordCount || 0),
      activeRecordCount: Number(round.activeRecordCount || 0),
      eventCount,
      roundSeqText: formatRoundSealSeq(eventCount),
      rosterParticipants: filteredParticipants(participants, this.data.rosterSearchQuery),
      ledger,
      feedItems,
      feedFilter: filter,
      feedLatestSeq,
      feedNextBeforeSeq,
      feedHasMore,
      feedHasLoadedOlder,
      feedExhausted,
      newEventCount,
      latestReceipt,
      receiptFeedback,
      sheetBlockedReason,
      ...detailScopeReset,
      ...v2FeatureScopeReset,
      joinChoices,
      joinIndex: matchedJoinIndex >= 0 ? matchedJoinIndex : 0,
      directChoices,
      ...directState,
    });
    this.syncShareMenu(canShare);
    this.ensureRefreshTimer();
    return true;
  },

  syncShareMenu(canShare) {
    if (typeof wx === 'undefined') return;
    if (canShare && typeof wx.showShareMenu === 'function') {
      wx.showShareMenu({ menus: ['shareAppMessage'] });
    } else if (!canShare && typeof wx.hideShareMenu === 'function') {
      wx.hideShareMenu({ menus: ['shareAppMessage'] });
    }
  },

  decorateFeedEntries(entries, context = {}) {
    const names = context.names || participantNameMap(this.data.participants);
    return (Array.isArray(entries) ? entries : []).map((entry, index) => {
      const id = entryIdentity(entry) || `entry_${index}`;
      const eventType = clean(entry && entry.eventType);
      const isCorrection = eventType === 'entry_corrected';
      const isReversal = eventType === 'entry_reversed';
      const isAuditEvent = isCorrection || isReversal;
      const category = entryCategory(entry);
      const actorName = clean(entry && entry.actorNameSnapshot) || names[clean(entry && entry.actorParticipantId)] || '球友';
      const status = clean(entry && entry.status);
      const statusText = status === 'reversed' || isReversal ? '已撤销' : status === 'corrected' || isCorrection ? '已更正' : '';
      const kindText = isCorrection ? '更正' : isReversal ? '撤销' : category === 'game' ? '对局' : '单记';
      const description = describeBusinessEntry(entry, names);
      const displayDescription = formatDisplayDescription(description);
      const timeText = localTime(entry && entry.createdAtMs);
      const metaText = `${actorName}${timeText ? ' · ' + timeText : ''}`;
      const rootCreatedBy = clean(entry && entry.rootCreatedByParticipantId);
      const ownRoot = rootCreatedBy && rootCreatedBy === clean(context.viewerParticipantId);
      const active = status !== 'reversed' && status !== 'corrected' && !isReversal;
      const canHandle = !context.isArchived && active && !!rootCreatedBy && (context.isOwner || ownRoot);
      return {
        ...entry,
        id,
        seq: Number(entry && entry.seq || 0),
        rootEntryId: clean(entry && entry.rootEntryId) || id,
        expectedEntryId: clean(entry && (entry.currentEntryId || entry.expectedEntryId)) || id,
        category,
        kindText,
        description,
        displayDescription,
        actorName,
        timeText,
        metaText,
        statusText,
        detailAriaLabel: ['查看记录详情', kindText, description, metaText, statusText].filter(Boolean).join('，'),
        isAuditEvent,
        isMuted: status === 'reversed' || status === 'corrected',
        canEdit: canHandle && !!context.canCorrect,
        canReverse: canHandle && !!context.canReverse,
      };
    });
  },

  applyMutationResponse(response, options = {}) {
    const data = responseData(response);
    if (options.newRound && data.room && data.round) {
      this._feedRequestSeq = Number(this._feedRequestSeq || 0) + 1;
      this._feedRawEntries = [];
      this._pendingFeedEntryIds = new Set();
      this._feedAwayFromLatest = false;
      this._feedNeedsFullReset = false;
      this.clearReceiptTimer();
      this.clearHighlightTimer();
      const applied = this.applyRoomData({
        room: data.room,
        round: data.round,
        viewer: data.viewer || this.data.viewer,
        capabilities: data.capabilities || this.data.capabilities,
        entries: [],
        page: { latestSeq: 0, nextBeforeSeq: null, hasMore: false },
      }, { fromMutation: true });
      this.setData({
        activeTab: 'ledger',
        feedItems: [],
        feedFilter: 'all',
        feedLatestSeq: 0,
        feedNextBeforeSeq: null,
        feedHasMore: false,
        feedHasLoadedOlder: false,
        feedLoading: false,
        feedLoadingMore: false,
        feedError: '',
        feedExhausted: true,
        newEventCount: 0,
        latestReceipt: { visible: false, text: '' },
        receiptFeedback: null,
        highlightedEntryId: '',
      });
      return applied;
    }
    if (data.session || data.legacySession || data.room && data.round && Array.isArray(data.entries)) {
      const applied = this.applyApiResponse(response, { ...options, fromMutation: true });
      return applied;
    }
    const room = data.room || {
      ...(this.data.room || {}),
      syncVersion: Number(data.roomSyncVersion || this.data.room && this.data.room.syncVersion || 0),
    };
    const round = data.round || this.data.round;
    let entries = Array.isArray(this._feedRawEntries) ? this._feedRawEntries.slice() : [];
    if (data.targetEntry) {
      const targetId = entryIdentity(data.targetEntry);
      entries = entries.map((entry) => entryIdentity(entry) === targetId ? data.targetEntry : entry);
    }
    if (data.entry) entries = [data.entry].concat(entries.filter((entry) => entryIdentity(entry) !== entryIdentity(data.entry)));
    const applied = this.applyRoomData({
      room,
      round,
      viewer: data.viewer || this.data.viewer,
      capabilities: data.capabilities || this.data.capabilities,
      entries,
      page: {
        latestSeq: Math.max(Number(this.data.feedLatestSeq || 0), Number(data.entry && data.entry.seq || 0)),
        nextBeforeSeq: this.data.feedNextBeforeSeq,
        hasMore: this.data.feedHasMore,
      },
    });
    return applied;
  },

  async runMutation(action, payload, task, successText, options = {}) {
    if (typeof action === 'function') {
      const legacyOptions = task && typeof task === 'object' ? task : {};
      return this.runMutation(
        clean(legacyOptions.action) || 'compat',
        Array.isArray(legacyOptions.payload) ? legacyOptions.payload : [],
        action,
        typeof payload === 'string' ? payload : '',
        legacyOptions,
      );
    }
    const intentAction = clean(options.intentAction) || action;
    const intent = this.mutationIntent(intentAction, payload);
    const guardKey = `water:v2:${intent.fingerprint}`;
    const sheetGeneration = Number(this._sheetGeneration || 0);
    return actionGuard.runCriticalWrite(guardKey, async () => {
      this.setActionBusy(action, true);
      if (this.data.gameSheetOpen || this.data.directSheetOpen || this.data.manualSheetOpen || this.data.joinSheetOpen) {
        this.setData({ sheetError: '' });
      }
      try {
        const response = await task(intent.clientRequestId);
        const payloadUnchanged = typeof options.currentPayload !== 'function'
          || mutationFingerprint(this.data.roomId, this.data.roundId, intentAction, options.currentPayload()) === intent.fingerprint;
        this.applyMutationResponse(response, options);
        this.clearMutationIntent(intentAction, intent.fingerprint);
        const sameSheet = Number(this._sheetGeneration || 0) === sheetGeneration
          || typeof options.isCurrentSheet === 'function' && options.isCurrentSheet();
        if (options.closeSheet && payloadUnchanged && sameSheet) this.closeSheets();
        if (successText) showSuccess(successText);
        if (typeof options.afterSuccess === 'function') options.afterSuccess(responseData(response), { payloadUnchanged, sameSheet });
        this.beginBurstPolling();
        return response;
      } catch (err) {
        showError(err);
        const isConflict = clean(err && err.state) === 'conflict';
        if (isConflict) await this.loadRoom({ silent: true, force: true });
        const inlineMessage = clean(err && err.message) || '操作失败，请重试';
        if (
          options.sheetFailure
          || this.data.gameSheetOpen
          || this.data.directSheetOpen
          || this.data.manualSheetOpen
          || this.data.joinSheetOpen
        ) {
          this.setData({ sheetError: inlineMessage });
        }
        if (options.inlineFailure) {
          this.setData({ syncMessage: inlineMessage || '记录已更新，请确认最新内容后重试' });
        }
        if (isConflict && typeof options.onConflict === 'function') await options.onConflict(err);
        return null;
      } finally {
        this.setActionBusy(action, false);
      }
    });
  },

  onRetry() {
    if (this.data.roomId) return this.loadRoom();
    return this.createOrContinue();
  },

  returnToLaunch() {
    if (typeof wx !== 'undefined' && typeof wx.switchTab === 'function') {
      wx.switchTab({ url: '/pages/launch/index' });
    }
  },

  onSelectTab(e) {
    const tab = clean(e && e.currentTarget && e.currentTarget.dataset && e.currentTarget.dataset.tab);
    if (!['ledger', 'feed', 'players'].includes(tab)) return;
    this.setData({ activeTab: tab });
  },

  async onSelectFeedFilter(e) {
    if (!this.data.canUseV2Features) return null;
    const filter = clean(e && e.currentTarget && e.currentTarget.dataset && e.currentTarget.dataset.filter);
    if (!['all', 'game', 'direct'].includes(filter) || filter === this.data.feedFilter && this.data.feedItems.length) return;
    this._feedRequestSeq = Number(this._feedRequestSeq || 0) + 1;
    this._pendingFeedEntryIds = new Set();
    this._feedAwayFromLatest = false;
    this._feedNeedsFullReset = false;
    this.setData({ feedFilter: filter, feedItems: [], feedError: '', feedExhausted: false, feedHasLoadedOlder: false, newEventCount: 0 });
    this._feedRawEntries = [];
    return this.loadEntries({ reset: true });
  },

  async loadEntries(options = {}) {
    if (!this.data.canUseV2Features || !this.data.roomId || !this.data.roundId) return null;
    const reset = !!options.reset;
    if (!reset && (!this.data.feedHasMore || this.data.feedLoadingMore)) return null;
    const requestSeq = Number(this._feedRequestSeq || 0) + 1;
    this._feedRequestSeq = requestSeq;
    const filter = this.data.feedFilter;
    const requestKey = `${this.data.roomId}:${this.data.roundId}:${filter}:${reset ? 'first' : this.data.feedNextBeforeSeq}`;
    const query = { limit: PAGE_SIZE };
    if (filter !== 'all') query.category = filter;
    if (!reset && this.data.feedNextBeforeSeq != null) query.beforeSeq = this.data.feedNextBeforeSeq;
    this.setData(reset ? { feedLoading: true, feedError: '' } : { feedLoadingMore: true, feedError: '' });
    try {
      const method = apiMethod('listEntries');
      const response = await method(this.data.roomId, this.data.roundId, query);
      const currentKey = `${this.data.roomId}:${this.data.roundId}:${this.data.feedFilter}:${reset ? 'first' : this.data.feedNextBeforeSeq}`;
      if (requestSeq !== this._feedRequestSeq || requestKey !== currentKey) return null;
      const data = responseData(response);
      const incoming = Array.isArray(data.entries) ? data.entries : [];
      const existing = reset ? [] : Array.isArray(this._feedRawEntries) ? this._feedRawEntries : [];
      const merged = reset ? mergeFeedEntries(incoming) : mergeFeedEntries(existing, incoming);
      this._feedRawEntries = merged;
      const page = data.page || {};
      const context = {
        names: participantNameMap(this.data.participants),
        viewerParticipantId: this.data.viewerParticipantId,
        isOwner: this.data.isOwner,
        isArchived: this.data.isArchived,
        canCorrect: capability(this.data.capabilities, 'canCorrect', false) && this.data.canWrite,
        canReverse: capability(this.data.capabilities, 'canReverse', false) && this.data.canWrite,
      };
      this.setData({
        feedItems: this.decorateFeedEntries(merged, context),
        feedNextBeforeSeq: page.nextBeforeSeq == null ? null : Number(page.nextBeforeSeq),
        feedLatestSeq: reset
          ? Number(page.latestSeq || 0)
          : Math.max(Number(page.latestSeq || 0), Number(this.data.feedLatestSeq || 0)),
        feedHasMore: !!page.hasMore,
        feedHasLoadedOlder: reset ? false : true,
        feedExhausted: page.hasMore === false,
        feedLoading: false,
        feedLoadingMore: false,
        feedError: '',
        newEventCount: reset ? 0 : this.data.newEventCount,
      });
      if (reset) {
        this._pendingFeedEntryIds = new Set();
        this._feedAwayFromLatest = false;
      }
      return response;
    } catch (err) {
      if (requestSeq !== this._feedRequestSeq) return null;
      this.setData({
        feedLoading: false,
        feedLoadingMore: false,
        feedError: clean(err && err.message) || '流水加载失败',
      });
      return null;
    }
  },

  loadMoreEntries() {
    return this.loadEntries({ reset: false });
  },

  returnToLatest() {
    this._pendingFeedEntryIds = new Set();
    this._feedAwayFromLatest = false;
    this.setData({ newEventCount: 0, feedHasLoadedOlder: false });
    return this.loadEntries({ reset: true });
  },

  onPageScroll(e) {
    if (this.data.activeTab !== 'feed') return;
    const scrollTop = Number(e && e.scrollTop || 0);
    if (scrollTop > 120) this._feedAwayFromLatest = true;
    else if (scrollTop < 40) this._feedAwayFromLatest = false;
  },

  touchSheet() {
    this._sheetGeneration = Number(this._sheetGeneration || 0) + 1;
  },

  beginSheet() {
    this.touchSheet();
    this._sheetDraftRoundId = clean(this.data.roundId);
    this.setData({ sheetBlockedReason: '', sheetError: '' });
  },

  ensureMutationSheetWritable(kind) {
    if (kind === 'join' && this.data.legacyMode) return true;
    if (!this.data.room && !this.data.roomId) return true;
    let reason = '';
    const draftRoundId = clean(this._sheetDraftRoundId);
    if (draftRoundId && this.data.roundId && draftRoundId !== clean(this.data.roundId)) {
      reason = '当前轮已更新，草稿已保留；请重新打开后确认';
    } else if (kind === 'record' && !this.data.canWrite) {
      reason = this.data.capabilities.emergencyReadOnly
        ? '打水账本暂时只读，草稿已保留'
        : '记水权限已更新，草稿已保留；请刷新后重试';
    } else if (kind === 'record' && this.data.editingEntry) {
      reason = correctionBlockedReason(this.data.editingEntry, this.data.capabilities);
    } else if (kind === 'roster' && !this.data.canAddParticipants) {
      reason = this.data.capabilities.emergencyReadOnly
        ? '打水账本暂时只读，草稿已保留'
        : this.data.participantCount >= MAX_PARTICIPANTS
          ? '球友已满 24 人，草稿已保留'
          : '名单权限已更新，草稿已保留';
    } else if (kind === 'join' && (this.data.bottomActionMode !== 'join' || !this.data.isVisitor)) {
      reason = this.data.capabilities.emergencyReadOnly
        ? '打水账本暂时只读，加入资料已保留'
        : '加入状态已更新，请关闭后重新确认';
    }
    if (reason) {
      this.setData({ sheetBlockedReason: reason });
      return false;
    }
    if (this.data.sheetBlockedReason) this.setData({ sheetBlockedReason: '' });
    return true;
  },

  closeSheets() {
    this.touchSheet();
    this._detailRequestSeq = Number(this._detailRequestSeq || 0) + 1;
    this._detailScopeKey = '';
    this._correctionRequestSeq = Number(this._correctionRequestSeq || 0) + 1;
    this._sheetDraftRoundId = '';
    this.setData({
      gameSheetOpen: false,
      directSheetOpen: false,
      adjustSheetOpen: false,
      manualSheetOpen: false,
      joinSheetOpen: false,
      detailSheetOpen: false,
      editingEntry: null,
      correctionDraft: null,
      sheetBlockedReason: '',
      sheetError: '',
      gameSummaryExpanded: false,
      gameParticipantOrder: [],
      gameBodyScrollTop: 0,
      directSelectionValid: false,
      directValidationMessage: '请选择请水方和赢水方',
      directPreview: '请水方 → 赢水方',
    });
  },

  openGameSheet() {
    if (this.data.roomId && !this.data.canWrite) return showError(null, '加入后才能一起记水');
    if (this.data.participants.length < 2) return showError(null, '至少需要 2 位球友');
    this.beginSheet();
    const gameParticipantOrder = buildGameParticipantOrder(this.data.participants, [], 'winner', [], []);
    this.setData({
      gameSheetOpen: true,
      editingEntry: null,
      correctionDraft: null,
      gameUnitIndex: 0,
      gameSearchQuery: '',
      gameParticipantOrder,
      gameBodyScrollTop: 0,
      gameActiveSide: 'winner',
      winnerIds: [],
      loserIds: [],
      winnerSummary: '待选',
      loserSummary: '待选',
      winnerFullSummary: '待选',
      loserFullSummary: '待选',
      gameSelectionValid: false,
      gameValidationMessage: '至少各选 1 人',
      gameSummaryExpanded: false,
    });
    this.refreshGameParticipants([], []);
  },

  refreshGameParticipants(winnerIds, loserIds) {
    this.setData(gameSelectionState(
      this.data.participants,
      winnerIds,
      loserIds,
      this.data.gameSearchQuery,
      this.data.gameParticipantOrder,
    ));
  },

  onGameSearchInput(e) {
    const gameSearchQuery = clean(e && e.detail && e.detail.value);
    this.setData({
      gameSearchQuery,
      gameParticipants: filteredParticipants(
        gameParticipantsInOrder(this.data.participants, this.data.gameParticipantOrder),
        gameSearchQuery,
      ),
    });
  },

  clearGameSearch() {
    this.setData({
      gameSearchQuery: '',
      gameParticipants: gameParticipantsInOrder(this.data.participants, this.data.gameParticipantOrder),
    });
  },

  onSelectGameSide(e) {
    const side = clean(e && e.currentTarget && e.currentTarget.dataset && e.currentTarget.dataset.side);
    if ((side !== 'winner' && side !== 'loser') || side === this.data.gameActiveSide) return;
    const gameParticipantOrder = buildGameParticipantOrder(
      this.data.participants,
      this.data.gameParticipantOrder,
      side,
      this.data.winnerIds,
      this.data.loserIds,
    );
    this.setData({
      gameActiveSide: side,
      gameBodyScrollTop: this.data.gameBodyScrollTop === 0 ? 1 : 0,
      ...gameSelectionState(
        this.data.participants,
        this.data.winnerIds,
        this.data.loserIds,
        this.data.gameSearchQuery,
        gameParticipantOrder,
      ),
    });
  },

  toggleGameSummary() {
    this.setData({ gameSummaryExpanded: !this.data.gameSummaryExpanded });
  },

  onToggleGamePlayer(e) {
    const id = clean(e && e.currentTarget && e.currentTarget.dataset && e.currentTarget.dataset.id);
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
    this.setData({ gameUnitIndex: Number(e && e.detail && e.detail.value || 0) });
  },

  async submitGame() {
    if (!this.ensureMutationSheetWritable('record')) return null;
    const winners = this.data.winnerIds.slice();
    const losers = this.data.loserIds.slice();
    if (!winners.length || winners.length !== losers.length) return showError(null, '请选择人数相同的胜方和负方');
    const unitsPerPlayer = Number(this.data.gameUnitIndex) + 1;
    if (this.data.editingEntry) {
      return this.submitCorrection({
        rootEntryId: this.data.editingEntry.rootEntryId,
        expectedEntryId: this.data.editingEntry.expectedEntryId,
        category: 'game',
        replacement: { winnerIds: winners, loserIds: losers, unitsPerPlayer },
      });
    }
    const payload = [winners, losers, unitsPerPlayer];
    return this.runMutation('record_game', payload, (clientRequestId) => {
      if (!this.data.legacyMode && typeof waterApi.recordGameV2 === 'function') {
        return waterApi.recordGameV2(this.data.roomId, this.data.roundId, winners, losers, unitsPerPlayer, { clientRequestId });
      }
      return apiMethod('recordGame')(this.data.roomId, this.data.session && this.data.session.version, winners, losers, unitsPerPlayer, { clientRequestId });
    }, '已记一局', {
      intentAction: 'game',
      currentPayload: () => [this.data.winnerIds.slice(), this.data.loserIds.slice(), Number(this.data.gameUnitIndex) + 1],
      isCurrentSheet: () => this.data.gameSheetOpen,
      closeSheet: true,
      sheetFailure: true,
      afterSuccess: (data) => this.afterRecordSuccess(data),
    });
  },

  openDirectSheet() {
    if (!this.data.canWrite) return showError(null, '加入后才能一起记水');
    if (this.data.participants.length < 2) return showError(null, '再添加或邀请 1 位球友，就能开始记水');
    this.beginSheet();
    this.setData({
      directSheetOpen: true,
      adjustSheetOpen: true,
      editingEntry: null,
      correctionDraft: null,
      directFromIndex: 0,
      directToIndex: 0,
      directUnitIndex: 0,
      adjustUnitIndex: 0,
      ...directSelectionState(this.data.directChoices, 0, 0, 0),
    });
  },

  openAdjustSheet(e) {
    if (!this.data.canWrite) return showError(null, '加入后才能一起记水');
    const targetId = clean(e && e.currentTarget && e.currentTarget.dataset && e.currentTarget.dataset.id);
    const direction = clean(e && e.currentTarget && e.currentTarget.dataset && e.currentTarget.dataset.direction) || 'plus';
    const target = this.data.participants.find((item) => item.id === targetId);
    const counterparties = this.data.participants.filter((item) => item.id !== targetId);
    if (!target || !counterparties.length) return showError(null, '请先添加另一位球友');
    this.beginSheet();
    const targetIndex = this.data.directChoices.findIndex((item) => item.id === targetId);
    this.setData({
      directSheetOpen: true,
      adjustSheetOpen: true,
      editingEntry: null,
      adjustTargetId: targetId,
      adjustTargetName: target.name,
      adjustDirection: direction,
      adjustUnitIndex: 0,
      directUnitIndex: 0,
      directFromIndex: direction === 'minus' ? Math.max(0, targetIndex) : 0,
      directToIndex: direction === 'plus' ? Math.max(0, targetIndex) : 0,
      counterpartyIndex: 0,
      counterparties,
    });
    this.refreshDirectPreview();
  },

  onDirectFromChange(e) {
    this.setData({ directFromIndex: Number(e && e.detail && e.detail.value || 0) });
    this.refreshDirectPreview();
  },

  onDirectToChange(e) {
    this.setData({ directToIndex: Number(e && e.detail && e.detail.value || 0) });
    this.refreshDirectPreview();
  },

  onDirectUnitChange(e) {
    const directUnitIndex = Number(e && e.detail && e.detail.value || 0);
    this.setData({ directUnitIndex, adjustUnitIndex: directUnitIndex });
    this.refreshDirectPreview();
  },

  onAdjustUnitChange(e) {
    this.onDirectUnitChange(e);
  },

  onCounterpartyChange(e) {
    const counterpartyIndex = Number(e && e.detail && e.detail.value || 0);
    const other = this.data.counterparties[counterpartyIndex];
    let directFromIndex = this.data.directFromIndex;
    let directToIndex = this.data.directToIndex;
    const otherIndex = this.data.directChoices.findIndex((item) => item.id === clean(other && other.id));
    if (this.data.adjustDirection === 'plus') directFromIndex = Math.max(0, otherIndex);
    else directToIndex = Math.max(0, otherIndex);
    this.setData({ counterpartyIndex, directFromIndex, directToIndex });
    this.refreshDirectPreview();
  },

  refreshDirectPreview() {
    this.setData(directSelectionState(
      this.data.directChoices,
      this.data.directFromIndex,
      this.data.directToIndex,
      this.data.directUnitIndex,
    ));
  },

  async submitDirect() {
    if (!this.ensureMutationSheetWritable('record')) return null;
    const from = this.data.directChoices[this.data.directFromIndex];
    const to = this.data.directChoices[this.data.directToIndex];
    if (!from || !to || !from.id || !to.id || from.id === to.id) return showError(null, '请选择不同的请水方和赢水方');
    const units = Number(this.data.directUnitIndex) + 1;
    if (this.data.editingEntry) {
      return this.submitCorrection({
        rootEntryId: this.data.editingEntry.rootEntryId,
        expectedEntryId: this.data.editingEntry.expectedEntryId,
        category: 'direct',
        replacement: { fromPlayerId: from.id, toPlayerId: to.id, units },
      });
    }
    const payload = [from.id, to.id, units];
    return this.runMutation('record_direct', payload, (clientRequestId) => {
      if (!this.data.legacyMode && typeof waterApi.recordDirectV2 === 'function') {
        return waterApi.recordDirectV2(this.data.roomId, this.data.roundId, from.id, to.id, units, { clientRequestId });
      }
      const targetId = this.data.adjustTargetId || to.id;
      const otherId = this.data.adjustDirection === 'minus' ? to.id : from.id;
      return apiMethod('recordDirect')(this.data.roomId, this.data.session && this.data.session.version, targetId, otherId, this.data.adjustDirection, units, { clientRequestId });
    }, '已记入流水', {
      currentPayload: () => {
        const currentFrom = this.data.directChoices[this.data.directFromIndex] || {};
        const currentTo = this.data.directChoices[this.data.directToIndex] || {};
        return [currentFrom.id, currentTo.id, Number(this.data.directUnitIndex) + 1];
      },
      isCurrentSheet: () => this.data.directSheetOpen,
      closeSheet: true,
      sheetFailure: true,
      afterSuccess: (data) => this.afterRecordSuccess(data),
    });
  },

  submitAdjust() {
    if (!this.ensureMutationSheetWritable('record')) return null;
    if ((this.data.legacyMode || typeof waterApi.recordDirectV2 !== 'function') && this.data.counterparties.length) {
      const other = this.data.counterparties[this.data.counterpartyIndex];
      if (!other) return showError(null, '请选择算在谁头上');
      const targetId = this.data.adjustTargetId;
      const direction = this.data.adjustDirection;
      const units = Number(this.data.adjustUnitIndex) + 1;
      return this.runMutation('direct', [targetId, other.id, direction, units], (clientRequestId) => apiMethod('recordDirect')(
        this.data.roomId,
        this.data.session && this.data.session.version,
        targetId,
        other.id,
        direction,
        units,
        { clientRequestId },
      ), '已记账', {
        currentPayload: () => {
          const currentOther = this.data.counterparties[this.data.counterpartyIndex] || {};
          return [this.data.adjustTargetId, currentOther.id, this.data.adjustDirection, Number(this.data.adjustUnitIndex) + 1];
        },
        isCurrentSheet: () => this.data.adjustSheetOpen,
        closeSheet: true,
        sheetFailure: true,
      });
    }
    return this.submitDirect();
  },

  afterRecordSuccess(data) {
    const entry = data && data.entry;
    if (!entry) {
      this.setData({ activeTab: 'feed' });
      return;
    }
    const category = entryCategory(entry);
    const filterChanged = this.data.feedFilter !== 'all' && this.data.feedFilter !== category;
    const base = filterChanged ? [] : Array.isArray(this._feedRawEntries) ? this._feedRawEntries : [];
    const merged = mergeFeedEntries([entry], applyFeedLifecycle(base, [entry]));
    this._feedRawEntries = merged;
    if (filterChanged) {
      this._pendingFeedEntryIds = new Set();
      this._feedAwayFromLatest = false;
    }
    const decoratedEntries = this.decorateFeedEntries(merged, {
      names: participantNameMap(this.data.participants),
      viewerParticipantId: this.data.viewerParticipantId,
      isOwner: this.data.isOwner,
      isArchived: false,
      canCorrect: capability(this.data.capabilities, 'canCorrect', false) && this.data.canWrite,
      canReverse: capability(this.data.capabilities, 'canReverse', false) && this.data.canWrite,
    });
    const decorated = decoratedEntries.find((item) => item.id === entryIdentity(entry));
    this.clearReceiptTimer();
    this.clearHighlightTimer();
    this.setData({
      activeTab: 'feed',
      feedFilter: filterChanged ? category : this.data.feedFilter,
      feedItems: decoratedEntries,
      feedLatestSeq: Math.max(Number(this.data.feedLatestSeq || 0), Number(entry && entry.seq || 0)),
      feedNextBeforeSeq: filterChanged ? Number(entry && entry.seq || 0) || null : this.data.feedNextBeforeSeq,
      feedHasMore: filterChanged ? Number(entry && entry.seq || 0) > 1 : this.data.feedHasMore,
      feedHasLoadedOlder: filterChanged ? false : this.data.feedHasLoadedOlder,
      feedExhausted: filterChanged ? false : this.data.feedExhausted,
      feedError: '',
      newEventCount: 0,
      highlightedEntryId: entryIdentity(entry),
      receiptFeedback: decorated ? {
        rootEntryId: decorated.rootEntryId,
        expectedEntryId: decorated.expectedEntryId,
        description: decorated.description,
        text: '已记入流水',
      } : null,
    });
    if (decorated) {
      this._receiptTimer = setTimeout(() => this.setData({ receiptFeedback: null }), 6000);
      this._highlightTimer = setTimeout(() => this.setData({ highlightedEntryId: '' }), 2400);
      if (typeof wx !== 'undefined' && typeof wx.pageScrollTo === 'function') {
        wx.pageScrollTo({ selector: `#water-feed-${decorated.id}`, scrollTop: 0, duration: 0 });
      }
    }
  },

  openManualSheet() {
    if (!this.data.canAddParticipants && this.data.roomId) {
      const message = this.data.participantCount >= MAX_PARTICIPANTS
        ? '球友已满 24 人'
        : this.data.capabilities.emergencyReadOnly ? '打水账本暂时只读' : '只有发起人可以添加球友';
      return showError(null, message);
    }
    this.beginSheet();
    this.setData({
      manualSheetOpen: true,
      addMode: 'manual',
      manualNames: '',
      manualNamesValid: false,
      relayText: '',
      relayRecognizedCount: 0,
      relayDuplicateCount: 0,
      relayOverflowCount: 0,
      relayPreviewNames: [],
      relayNewNames: [],
    });
  },

  onManualInput(e) {
    const manualNames = String(e && e.detail && e.detail.value || '');
    this.setData({ manualNames, manualNamesValid: !!clean(manualNames) });
  },

  onSelectAddMode(e) {
    const mode = clean(e && e.currentTarget && e.currentTarget.dataset && e.currentTarget.dataset.mode);
    if (!['manual', 'relay'].includes(mode) || mode === this.data.addMode) return;
    this.touchSheet();
    this.setData({ addMode: mode });
  },

  onRelayInput(e) {
    const relayText = String(e && e.detail && e.detail.value || '');
    this.setData({ relayText, ...relayPreview(relayText, this.data.participants) });
  },

  submitManual() {
    if (!this.ensureMutationSheetWritable('roster')) return null;
    const names = String(this.data.manualNames || '');
    if (!names.trim()) return showError(null, '请输入球友名字');
    const expectedRoomVersion = Number(this.data.room && this.data.room.roomVersion || this.data.session && this.data.session.version || 0);
    const payload = [expectedRoomVersion, names];
    return this.runMutation('add_manual', payload, (clientRequestId) => {
      if (!this.data.legacyMode && typeof waterApi.addParticipantsV2 === 'function') {
        return waterApi.addParticipantsV2(clean(this.data.roomId || this.data.sessionId), names, {
          expectedRoomVersion,
          clientRequestId,
        });
      }
      return apiMethod('addParticipants')(clean(this.data.roomId || this.data.sessionId), this.data.session && this.data.session.version, names, { clientRequestId });
    }, '已添加', {
      currentPayload: () => [
        Number(this.data.room && this.data.room.roomVersion || this.data.session && this.data.session.version || 0),
        String(this.data.manualNames || ''),
      ],
      isCurrentSheet: () => this.data.manualSheetOpen && this.data.addMode === 'manual',
      closeSheet: true,
      sheetFailure: true,
    });
  },

  submitRelay() {
    if (!this.ensureMutationSheetWritable('roster')) return null;
    if (!this.data.relayRecognizedCount) return showError(null, '没有识别到球友，请检查接龙内容');
    if (!this.data.relayNewNames.length) return showError(null, this.data.relayOverflowCount ? '这次打水最多 24 人' : '没有可添加的新球友');
    const names = this.data.relayNewNames.join('\n');
    const count = this.data.relayNewNames.length;
    const expectedRoomVersion = Number(this.data.room && this.data.room.roomVersion || this.data.session && this.data.session.version || 0);
    return this.runMutation('add_relay', [expectedRoomVersion, names], (clientRequestId) => {
      if (!this.data.legacyMode && typeof waterApi.addParticipantsV2 === 'function') {
        return waterApi.addParticipantsV2(clean(this.data.roomId || this.data.sessionId), names, {
          expectedRoomVersion,
          clientRequestId,
        });
      }
      return apiMethod('addParticipants')(clean(this.data.roomId || this.data.sessionId), this.data.session && this.data.session.version, names, { clientRequestId });
    }, `已添加 ${count} 人`, {
      currentPayload: () => [
        Number(this.data.room && this.data.room.roomVersion || this.data.session && this.data.session.version || 0),
        (this.data.relayNewNames || []).join('\n'),
      ],
      isCurrentSheet: () => this.data.manualSheetOpen && this.data.addMode === 'relay',
      closeSheet: true,
      sheetFailure: true,
    });
  },

  onRosterSearchInput(e) {
    const rosterSearchQuery = clean(e && e.detail && e.detail.value);
    this.setData({ rosterSearchQuery, rosterParticipants: filteredParticipants(this.data.participants, rosterSearchQuery) });
  },

  clearRosterSearch() {
    this.setData({ rosterSearchQuery: '', rosterParticipants: this.data.participants.slice() });
  },

  async openJoinSheet() {
    if (!this.data.canUseV2Features || this.data.bottomActionMode !== 'join' || !this.data.isVisitor) return null;
    const roomId = clean(this.data.roomId || this.data.sessionId);
    this.setActionBusy('join_gate', true);
    try {
      const gate = await profileCore.ensureProfileForAction('generic', `/pages/water/index?id=${roomId}`);
      if (!gate || !gate.ok || clean(this.data.roomId || this.data.sessionId) !== roomId) return null;
      const nickname = normalizedPlayerName(profileName(gate.profile));
      const nicknameKey = nickname.toLocaleLowerCase();
      const exactUnclaimed = this.data.participants.filter((item) => !item.claimed && item.name.toLocaleLowerCase() === nicknameKey);
      const claimedDuplicate = this.data.participants.some((item) => item.claimed && item.name.toLocaleLowerCase() === nicknameKey);
      const recommendedId = exactUnclaimed.length === 1 ? exactUnclaimed[0].id : '';
      const recommendedIndex = recommendedId
        ? this.data.joinChoices.findIndex((item) => item.id === recommendedId)
        : this.data.joinChoices.findIndex((item) => item.id === '');
      const joinIndex = recommendedIndex >= 0 ? recommendedIndex : 0;
      const selected = this.data.joinChoices[joinIndex] || {};
      const joinNeedsDistinctName = !selected.id && claimedDuplicate;
      this._joinProfileReady = true;
      this._joinProfileName = nickname;
      this.beginSheet();
      this.setData({
        joinSheetOpen: true,
        joinIndex,
        joinNickname: nickname,
        joinNeedsDistinctName,
        joinNameError: joinNeedsDistinctName ? '名单中已有这个名字，请换一个本局称呼' : '',
      });
      return gate;
    } finally {
      this.setActionBusy('join_gate', false);
    }
  },

  onJoinChoiceChange(e) {
    const joinIndex = Number(e && e.detail && e.detail.value || 0);
    const choice = this.data.joinChoices[joinIndex] || {};
    const joinNameError = choice.id ? '' : this.validateJoinNickname(this.data.joinNickname);
    this.setData({ joinIndex, joinNeedsDistinctName: !!joinNameError, joinNameError });
  },

  validateJoinNickname(value) {
    const nickname = normalizedPlayerName(value);
    if (!nickname) return '请输入本局称呼';
    const key = nickname.toLocaleLowerCase();
    if (this.data.participants.some((item) => item.name.toLocaleLowerCase() === key)) {
      return '名单中已有这个名字，请认领或换一个本局称呼';
    }
    return '';
  },

  onJoinNicknameInput(e) {
    const joinNickname = String(e && e.detail && e.detail.value || '').slice(0, 20);
    const joinNameError = this.validateJoinNickname(joinNickname);
    this.setData({ joinNickname, joinNeedsDistinctName: !!joinNameError, joinNameError });
  },

  onJoin() {
    if (!this.ensureMutationSheetWritable('join')) return null;
    const roomId = clean(this.data.roomId || this.data.sessionId);
    const choice = this.data.joinChoices[this.data.joinIndex] || { id: '' };
    const claimParticipantId = clean(choice.id);
    const nicknameDraft = String(this.data.joinNickname || '');
    const cachedProfileReady = !!this._joinProfileReady;
    const cachedProfileName = clean(this._joinProfileName);
    if (claimParticipantId === '__full__') return null;
    const guardKey = `water:v2:join-gate:${roomId}`;
    return actionGuard.runCriticalWrite(guardKey, async () => {
      this.setActionBusy('join', true);
      this.setData({ sheetError: '' });
      try {
        const gate = cachedProfileReady
          ? { ok: true, profile: { nickName: cachedProfileName } }
          : await profileCore.ensureProfileForAction('generic', `/pages/water/index?id=${roomId}`);
        if (!gate || !gate.ok || clean(this.data.roomId || this.data.sessionId) !== roomId) return null;
        if (!this.ensureMutationSheetWritable('join')) return null;
        const profileNickname = normalizedPlayerName(profileName(gate.profile));
        const nickname = claimParticipantId ? profileNickname : normalizedPlayerName(nicknameDraft || profileNickname);
        const joinNameError = claimParticipantId ? '' : this.validateJoinNickname(nickname);
        if (joinNameError) {
          this.setData({ joinNickname: nickname, joinNeedsDistinctName: true, joinNameError });
          return null;
        }
        const expectedRoomVersion = Number(this.data.room && this.data.room.roomVersion || this.data.session && this.data.session.version || 0);
        const intent = this.mutationIntent('join_v2', [expectedRoomVersion, nickname, claimParticipantId]);
        let response;
        if (!this.data.legacyMode && typeof waterApi.joinV2 === 'function') {
          response = await waterApi.joinV2(roomId, nickname, {
            claimParticipantId,
            expectedRoomVersion,
            clientRequestId: intent.clientRequestId,
          });
        } else {
          response = await apiMethod('join')(roomId, expectedRoomVersion, nickname, claimParticipantId, { clientRequestId: intent.clientRequestId });
        }
        this.applyMutationResponse(response);
        this.clearMutationIntent('join_v2', intent.fingerprint);
        this._joinProfileReady = false;
        this._joinProfileName = '';
        this.closeSheets();
        showSuccess('已加入');
        return response;
      } catch (err) {
        showError(err);
        this.setData({ sheetError: clean(err && err.message) || '加入失败，请重试' });
        if (clean(err && err.state) === 'conflict') await this.loadRoom({ silent: true, force: true });
        return null;
      } finally {
        this.setActionBusy('join', false);
      }
    });
  },

  async openEntryDetail(e) {
    if (!this.data.canUseV2Features) return null;
    const dataset = e && e.currentTarget && e.currentTarget.dataset || {};
    const rootEntryId = clean(dataset.root || dataset.rootEntryId);
    if (!rootEntryId) return null;
    const roomId = clean(this.data.roomId);
    const roundId = clean(this.data.roundId);
    const requestSeq = Number(this._detailRequestSeq || 0) + 1;
    const scopeKey = `${roomId}:${roundId}:${rootEntryId}`;
    this._detailRequestSeq = requestSeq;
    this._detailScopeKey = scopeKey;
    this.beginSheet();
    this.setData({ detailSheetOpen: true, detailLoading: true, detailError: '', detailRootEntryId: rootEntryId, entryDetail: null, entryHistory: [] });
    try {
      const response = await apiMethod('getEntry')(roomId, roundId, rootEntryId);
      const currentScopeKey = `${clean(this.data.roomId)}:${clean(this.data.roundId)}:${clean(this.data.detailRootEntryId)}`;
      if (
        requestSeq !== this._detailRequestSeq
        || scopeKey !== this._detailScopeKey
        || scopeKey !== currentScopeKey
        || !this.data.detailSheetOpen
      ) return null;
      const data = responseData(response);
      const rawCurrent = data.currentEntry || data.entry || {};
      const currentEntry = this.decorateFeedEntries([rawCurrent], {
        names: participantNameMap(this.data.participants),
        viewerParticipantId: this.data.viewerParticipantId,
        isOwner: this.data.isOwner,
        isArchived: this.data.isArchived,
        canCorrect: capability(this.data.capabilities, 'canCorrect', false) && this.data.canWrite,
        canReverse: capability(this.data.capabilities, 'canReverse', false) && this.data.canWrite,
      })[0] || null;
      const history = this.decorateFeedEntries(data.history || [], {
        names: participantNameMap(this.data.participants),
        viewerParticipantId: this.data.viewerParticipantId,
        isOwner: this.data.isOwner,
        isArchived: true,
      });
      this.setData({ detailLoading: false, detailError: '', entryDetail: currentEntry, entryHistory: history });
      return response;
    } catch (err) {
      const currentScopeKey = `${clean(this.data.roomId)}:${clean(this.data.roundId)}:${clean(this.data.detailRootEntryId)}`;
      if (
        requestSeq !== this._detailRequestSeq
        || scopeKey !== this._detailScopeKey
        || scopeKey !== currentScopeKey
        || !this.data.detailSheetOpen
      ) return null;
      this.setData({ detailLoading: false, detailError: clean(err && err.message) || '记录详情加载失败' });
      return null;
    }
  },

  retryEntryDetail() {
    if (!this.data.detailRootEntryId) return null;
    return this.openEntryDetail({ currentTarget: { dataset: { root: this.data.detailRootEntryId } } });
  },

  async openCorrectEntry(e) {
    const dataset = e && e.currentTarget && e.currentTarget.dataset || {};
    let entry = this.data.feedItems.find((item) => item.rootEntryId === clean(dataset.root) && item.expectedEntryId === clean(dataset.expected));
    if (!entry && this.data.entryDetail) entry = this.data.entryDetail;
    if (!entry || !entry.canEdit) return;
    const raw = entry.payload || {};
    this.closeSheets();
    this.beginSheet();
    this.setData({ editingEntry: entry, correctionDraft: entry });
    if (entry.category === 'game') {
      const winners = Array.isArray(raw.winnerIds) ? raw.winnerIds : [];
      const losers = Array.isArray(raw.loserIds) ? raw.loserIds : [];
      const gameParticipantOrder = buildGameParticipantOrder(this.data.participants, [], 'winner', winners, losers);
      this.setData({
        gameSheetOpen: true,
        gameUnitIndex: Math.max(0, Number(raw.unitsPerPlayer || 1) - 1),
        gameSearchQuery: '',
        gameParticipantOrder,
        gameBodyScrollTop: 0,
        gameActiveSide: 'winner',
        gameSummaryExpanded: false,
      });
      this.refreshGameParticipants(winners, losers);
      return;
    }
    const fromIndex = this.data.directChoices.findIndex((item) => item.id === clean(raw.fromPlayerId));
    const toIndex = this.data.directChoices.findIndex((item) => item.id === clean(raw.toPlayerId));
    this.setData({
      directSheetOpen: true,
      adjustSheetOpen: true,
      directFromIndex: Math.max(0, fromIndex),
      directToIndex: Math.max(0, toIndex),
      directUnitIndex: Math.max(0, Number(raw.units || 1) - 1),
    });
    this.refreshDirectPreview();
  },

  currentCorrectionPayload(draft = this.data.correctionDraft) {
    const editing = this.data.editingEntry || draft || {};
    const category = clean(editing.category || draft && draft.category) === 'game' ? 'game' : 'direct';
    let replacement = draft && draft.replacement || {};
    if (this.data.editingEntry && category === 'game') {
      replacement = {
        winnerIds: this.data.winnerIds.slice(),
        loserIds: this.data.loserIds.slice(),
        unitsPerPlayer: Number(this.data.gameUnitIndex) + 1,
      };
    } else if (this.data.editingEntry && category === 'direct') {
      const from = this.data.directChoices[this.data.directFromIndex] || {};
      const to = this.data.directChoices[this.data.directToIndex] || {};
      replacement = {
        fromPlayerId: clean(from.id),
        toPlayerId: clean(to.id),
        units: Number(this.data.directUnitIndex) + 1,
      };
    }
    return [
      clean(editing.rootEntryId || draft && draft.rootEntryId),
      clean(editing.expectedEntryId || draft && draft.expectedEntryId),
      replacement,
    ];
  },

  async refreshCorrectionEntry(rootEntryId) {
    const roomId = clean(this.data.roomId);
    const roundId = clean(this.data.roundId);
    const rootId = clean(rootEntryId);
    if (!roomId || !roundId || !rootId) return null;
    const requestSeq = Number(this._correctionRequestSeq || 0) + 1;
    const scopeKey = `${roomId}:${roundId}:${rootId}`;
    this._correctionRequestSeq = requestSeq;
    try {
      const response = await apiMethod('getEntry')(roomId, roundId, rootId);
      const editingRootId = clean(this.data.editingEntry && this.data.editingEntry.rootEntryId);
      if (
        requestSeq !== this._correctionRequestSeq
        || `${clean(this.data.roomId)}:${clean(this.data.roundId)}:${editingRootId}` !== scopeKey
        || !(this.data.gameSheetOpen || this.data.directSheetOpen)
      ) return null;
      const data = responseData(response);
      const rawCurrent = data.currentEntry || data.entry || {};
      const current = this.decorateFeedEntries([rawCurrent], {
        names: participantNameMap(this.data.participants),
        viewerParticipantId: this.data.viewerParticipantId,
        isOwner: this.data.isOwner,
        isArchived: this.data.isArchived,
        canCorrect: capability(this.data.capabilities, 'canCorrect', false) && this.data.canWrite,
        canReverse: capability(this.data.capabilities, 'canReverse', false) && this.data.canWrite,
      })[0];
      if (!current) return null;
      const raw = current.payload || {};
      const blockedReason = correctionBlockedReason(current, this.data.capabilities);
      this.setData({
        editingEntry: current,
        correctionDraft: current,
        sheetBlockedReason: blockedReason,
        sheetError: blockedReason || '记录已更新，已载入最新版本，请确认后重试',
      });
      if (blockedReason) return response;
      if (current.category === 'game') {
        this.setData({ gameUnitIndex: Math.max(0, Number(raw.unitsPerPlayer || 1) - 1) });
        this.refreshGameParticipants(raw.winnerIds || [], raw.loserIds || []);
      } else {
        const directFromIndex = this.data.directChoices.findIndex((item) => item.id === clean(raw.fromPlayerId));
        const directToIndex = this.data.directChoices.findIndex((item) => item.id === clean(raw.toPlayerId));
        this.setData({
          directFromIndex: Math.max(0, directFromIndex),
          directToIndex: Math.max(0, directToIndex),
          directUnitIndex: Math.max(0, Number(raw.units || 1) - 1),
        });
        this.refreshDirectPreview();
      }
      return response;
    } catch (err) {
      if (requestSeq === this._correctionRequestSeq) {
        this.setData({ sheetError: clean(err && err.message) || '最新记录加载失败，请重试' });
      }
      return null;
    }
  },

  submitCorrection(draft = this.data.correctionDraft) {
    if (!draft || !this.ensureMutationSheetWritable('record')) return null;
    const payload = this.currentCorrectionPayload(draft);
    const rootEntryId = payload[0];
    const expectedEntryId = payload[1];
    const replacement = payload[2];
    return this.runMutation('correct_entry', payload, (clientRequestId) => apiMethod('correctEntry')(
      this.data.roomId,
      this.data.roundId,
      rootEntryId,
      expectedEntryId,
      replacement,
      { clientRequestId },
    ), '已更正', {
      currentPayload: () => this.currentCorrectionPayload(draft),
      closeSheet: !!this.data.editingEntry,
      isCurrentSheet: () => this.data.gameSheetOpen || this.data.directSheetOpen,
      inlineFailure: true,
      sheetFailure: true,
      onConflict: () => this.refreshCorrectionEntry(rootEntryId),
      afterSuccess: (data, meta) => {
        this.setData({ activeTab: 'feed' });
        if (!meta.payloadUnchanged && data.entry && (this.data.gameSheetOpen || this.data.directSheetOpen)) {
          const nextExpectedEntryId = entryIdentity(data.entry);
          this.setData({
            editingEntry: { ...this.data.editingEntry, expectedEntryId: nextExpectedEntryId },
            correctionDraft: { ...this.data.correctionDraft, expectedEntryId: nextExpectedEntryId },
          });
        }
      },
    });
  },

  async confirmReverseEntry(target) {
    const dataset = target && target.currentTarget && target.currentTarget.dataset || target || {};
    const rootEntryId = clean(dataset.root || dataset.rootEntryId);
    const expectedEntryId = clean(dataset.expected || dataset.expectedEntryId);
    const description = clean(dataset.description) || '这条记录';
    if (!rootEntryId || !expectedEntryId) return null;
    const roomId = clean(this.data.roomId);
    const roundId = clean(this.data.roundId);
    if (!this.data.canWrite || !capability(this.data.capabilities, 'canReverse', false) || this.data.isArchived) {
      this.setData({ syncMessage: '撤销权限已更新，请确认最新流水后重试' });
      return null;
    }
    const modal = await confirmModal({
      title: '撤销这条记录？',
      content: description,
      confirmText: '撤销',
      confirmColor: '#b8443f',
    });
    if (!modal.confirm) return null;
    if (clean(this.data.roomId) !== roomId || clean(this.data.roundId) !== roundId) {
      this.setData({ syncMessage: '当前轮已更新，请在最新流水中重新确认' });
      return null;
    }
    if (!this.data.canWrite || !capability(this.data.capabilities, 'canReverse', false) || this.data.isArchived) {
      this.setData({ syncMessage: '撤销权限已更新，请确认最新流水后重试' });
      return null;
    }
    return this.runMutation('reverse_entry', [rootEntryId, expectedEntryId], (clientRequestId) => apiMethod('reverseEntry')(
      roomId,
      roundId,
      rootEntryId,
      expectedEntryId,
      { clientRequestId },
    ), '已撤销', {
      closeSheet: this.data.detailSheetOpen,
      isCurrentSheet: () => this.data.detailSheetOpen,
      inlineFailure: true,
      afterSuccess: () => {
        this.clearReceiptTimer();
        this.setData({ activeTab: 'feed', receiptFeedback: null });
      },
    });
  },

  onReverseEntry(e) {
    return this.confirmReverseEntry(e);
  },

  reverseReceiptFeedback() {
    if (!this.data.receiptFeedback) return null;
    return this.confirmReverseEntry(this.data.receiptFeedback);
  },

  async openHistorySheet() {
    if (!this.data.canUseV2Features || !this.data.isMember) return null;
    this.beginSheet();
    this._historyRequestSeq = Number(this._historyRequestSeq || 0) + 1;
    this.setData({
      historySheetOpen: true,
      historyLoading: true,
      historyLoadingMore: false,
      historyError: '',
      historyRound: null,
      historyRoundTargetId: '',
      historyRoundLoading: false,
      historyRoundError: '',
      historyRoundLedger: [],
      historyRoundFeed: [],
      historyRoundFeedNextBeforeSeq: null,
      historyRoundFeedHasMore: false,
      historyRoundFeedLoadingMore: false,
      historyRoundFeedError: '',
      historyRounds: [],
      historyNextBeforeNumber: null,
      historyHasMore: false,
    });
    return this.loadHistoryRounds({ reset: true });
  },

  async loadHistoryRounds(options = {}) {
    if (!this.data.canUseV2Features || !this.data.isMember || !this.data.roomId) return null;
    const reset = !!options.reset;
    if (!reset && (!this.data.historyHasMore || this.data.historyLoadingMore)) return null;
    const requestSeq = Number(this._historyRequestSeq || 0) + 1;
    this._historyRequestSeq = requestSeq;
    const beforeNumber = reset ? null : this.data.historyNextBeforeNumber;
    const query = { limit: PAGE_SIZE };
    if (beforeNumber != null) query.beforeNumber = beforeNumber;
    this.setData(reset
      ? { historyLoading: true, historyError: '' }
      : { historyLoadingMore: true, historyError: '' });
    try {
      const response = await apiMethod('listRounds')(this.data.roomId, query);
      if (requestSeq !== this._historyRequestSeq) return null;
      const data = responseData(response);
      const incoming = decorateRoundSummaries(data.rounds);
      const seenRoundIds = new Set();
      const rounds = (reset ? incoming : this.data.historyRounds.concat(incoming))
        .filter((round) => {
          if (!round.id || seenRoundIds.has(round.id)) return false;
          seenRoundIds.add(round.id);
          return true;
        })
        .sort((left, right) => Number(right.number || 0) - Number(left.number || 0));
      const page = data.page || {};
      this.setData({
        historyLoading: false,
        historyLoadingMore: false,
        historyRounds: rounds,
        historyNextBeforeNumber: page.nextBeforeNumber == null ? null : Number(page.nextBeforeNumber),
        historyHasMore: !!page.hasMore,
        historyError: '',
      });
      return response;
    } catch (err) {
      if (requestSeq !== this._historyRequestSeq) return null;
      this.setData({ historyLoading: false, historyLoadingMore: false, historyError: clean(err && err.message) || '往期加载失败' });
      return null;
    }
  },

  loadMoreHistoryRounds() {
    return this.loadHistoryRounds({ reset: false });
  },

  retryHistoryRounds() {
    return this.loadHistoryRounds({ reset: !this.data.historyRounds.length });
  },

  closeHistorySheet() {
    this.touchSheet();
    this._historyRequestSeq = Number(this._historyRequestSeq || 0) + 1;
    this._historyRoundRequestSeq = Number(this._historyRoundRequestSeq || 0) + 1;
    this._historyRoundScopeKey = '';
    this._historyRoundRawEntries = [];
    this.setData({
      historySheetOpen: false,
      historyRound: null,
      historyRoundTargetId: '',
      historyRoundLoading: false,
      historyRoundError: '',
      historyRoundLedger: [],
      historyRoundFeed: [],
      historyRoundFeedNextBeforeSeq: null,
      historyRoundFeedHasMore: false,
      historyRoundFeedLoadingMore: false,
      historyRoundFeedError: '',
    });
  },

  async openHistoryRound(e) {
    if (!this.data.canUseV2Features) return null;
    const roundId = clean(e && e.currentTarget && e.currentTarget.dataset && e.currentTarget.dataset.id);
    if (!roundId) return null;
    const roomId = clean(this.data.roomId);
    const requestSeq = Number(this._historyRoundRequestSeq || 0) + 1;
    const scopeKey = `${roomId}:${roundId}`;
    this._historyRoundRequestSeq = requestSeq;
    this._historyRoundScopeKey = scopeKey;
    this._historyRoundRawEntries = [];
    this.setData({
      historyRound: null,
      historyRoundTargetId: roundId,
      historyRoundLoading: true,
      historyRoundError: '',
      historyRoundLedger: [],
      historyRoundFeed: [],
      historyRoundFeedNextBeforeSeq: null,
      historyRoundFeedHasMore: false,
      historyRoundFeedLoadingMore: false,
      historyRoundFeedError: '',
    });
    try {
      const response = await apiMethod('getRound')(roomId, roundId, { limit: PAGE_SIZE });
      const currentScopeKey = `${clean(this.data.roomId)}:${clean(this.data.historyRoundTargetId)}`;
      if (
        requestSeq !== this._historyRoundRequestSeq
        || scopeKey !== this._historyRoundScopeKey
        || scopeKey !== currentScopeKey
        || !this.data.historySheetOpen
      ) return null;
      const data = responseData(response);
      const round = data.round || {};
      const participants = Array.isArray(round.participantSnapshot)
        ? round.participantSnapshot
        : data.room && Array.isArray(data.room.participants) ? data.room.participants : [];
      const names = participantNameMap(participants);
      const ledger = (round.ledger || []).map((item) => {
        const id = clean(item.participantId || item.id);
        const net = Number(item.net || 0);
        return {
          ...item,
          id,
          name: names[id] || '球友',
          netText: net > 0 ? `+${net}` : String(net),
          netClass: net > 0 ? 'is-positive' : net < 0 ? 'is-negative' : 'is-even',
          netSizeClass: ledgerNetSizeClass(net),
        };
      });
      const rawEntries = mergeFeedEntries(data.entries || []);
      this._historyRoundRawEntries = rawEntries;
      const historyRoundFeed = this.decorateFeedEntries(rawEntries, {
        names,
        viewerParticipantId: this.data.viewerParticipantId,
        isOwner: this.data.isOwner,
        isArchived: true,
        canCorrect: false,
        canReverse: false,
      });
      const page = data.page || {};
      this.setData({
        historyRound: round,
        historyRoundLoading: false,
        historyRoundError: '',
        historyRoundLedger: ledger,
        historyRoundFeed,
        historyRoundFeedNextBeforeSeq: page.nextBeforeSeq == null ? null : Number(page.nextBeforeSeq),
        historyRoundFeedHasMore: !!page.hasMore,
        historyRoundFeedLoadingMore: false,
        historyRoundFeedError: '',
      });
      return response;
    } catch (err) {
      const currentScopeKey = `${clean(this.data.roomId)}:${clean(this.data.historyRoundTargetId)}`;
      if (
        requestSeq !== this._historyRoundRequestSeq
        || scopeKey !== this._historyRoundScopeKey
        || scopeKey !== currentScopeKey
        || !this.data.historySheetOpen
      ) return null;
      this.setData({ historyRoundLoading: false, historyRoundError: clean(err && err.message) || '往期账本加载失败' });
      return null;
    }
  },

  retryOpenHistoryRound() {
    const roundId = clean(this.data.historyRoundTargetId);
    if (!roundId) return null;
    return this.openHistoryRound({ currentTarget: { dataset: { id: roundId } } });
  },

  async loadMoreHistoryRoundEntries() {
    if (!this.data.canUseV2Features) return null;
    const round = this.data.historyRound;
    const roundId = clean(round && (round.id || round._id));
    const roomId = clean(this.data.roomId);
    const beforeSeq = this.data.historyRoundFeedNextBeforeSeq;
    if (!roomId || !roundId || beforeSeq == null || !this.data.historyRoundFeedHasMore || this.data.historyRoundFeedLoadingMore) return null;
    const requestSeq = Number(this._historyRoundRequestSeq || 0) + 1;
    const scopeKey = `${roomId}:${roundId}`;
    this._historyRoundRequestSeq = requestSeq;
    this._historyRoundScopeKey = scopeKey;
    this.setData({ historyRoundFeedLoadingMore: true, historyRoundFeedError: '' });
    try {
      const response = await apiMethod('getRound')(roomId, roundId, { beforeSeq, limit: PAGE_SIZE });
      const currentRoundId = clean(this.data.historyRound && (this.data.historyRound.id || this.data.historyRound._id));
      if (
        requestSeq !== this._historyRoundRequestSeq
        || scopeKey !== this._historyRoundScopeKey
        || currentRoundId !== roundId
        || !this.data.historySheetOpen
      ) return null;
      const data = responseData(response);
      const incoming = Array.isArray(data.entries) ? data.entries : [];
      const merged = mergeFeedEntries(this._historyRoundRawEntries || [], incoming);
      this._historyRoundRawEntries = merged;
      const participants = Array.isArray(round.participantSnapshot) ? round.participantSnapshot : [];
      const page = data.page || {};
      this.setData({
        historyRoundFeed: this.decorateFeedEntries(merged, {
          names: participantNameMap(participants),
          viewerParticipantId: this.data.viewerParticipantId,
          isOwner: this.data.isOwner,
          isArchived: true,
          canCorrect: false,
          canReverse: false,
        }),
        historyRoundFeedNextBeforeSeq: page.nextBeforeSeq == null ? null : Number(page.nextBeforeSeq),
        historyRoundFeedHasMore: !!page.hasMore,
        historyRoundFeedLoadingMore: false,
        historyRoundFeedError: '',
      });
      return response;
    } catch (err) {
      const currentRoundId = clean(this.data.historyRound && (this.data.historyRound.id || this.data.historyRound._id));
      if (requestSeq !== this._historyRoundRequestSeq || scopeKey !== this._historyRoundScopeKey || currentRoundId !== roundId) return null;
      this.setData({
        historyRoundFeedLoadingMore: false,
        historyRoundFeedError: clean(err && err.message) || '归档流水加载失败',
      });
      return null;
    }
  },

  retryHistoryRoundEntries() {
    return this.loadMoreHistoryRoundEntries();
  },

  backToHistoryList() {
    this._historyRoundRequestSeq = Number(this._historyRoundRequestSeq || 0) + 1;
    this._historyRoundScopeKey = '';
    this._historyRoundRawEntries = [];
    this.setData({
      historyRound: null,
      historyRoundTargetId: '',
      historyRoundLoading: false,
      historyRoundError: '',
      historyRoundLedger: [],
      historyRoundFeed: [],
      historyRoundFeedNextBeforeSeq: null,
      historyRoundFeedHasMore: false,
      historyRoundFeedLoadingMore: false,
      historyRoundFeedError: '',
      historyError: '',
    });
  },

  async onCreateRound() {
    if (!this.data.canCreateRound || !this.data.round || Number(this.data.round.recordCount || 0) === 0) return null;
    const expectedRoundId = this.data.roundId;
    const expectedRoomVersion = Number(this.data.room && this.data.room.roomVersion || 0);
    const recordCount = Number(this.data.round.recordCount || 0);
    const eventCount = Number(this.data.round.eventCount || 0);
    const modal = await confirmModal({
      title: '开始新一轮？',
      content: `当前 ${recordCount} 笔账（共 ${eventCount} 条流水）会归档，球友和加入状态会保留，新一轮从 0 开始。`,
      confirmText: '开始新一轮',
      confirmColor: '#103f35',
    });
    if (!modal.confirm) return null;
    if (this.data.roundId !== expectedRoundId || Number(this.data.room && this.data.room.roomVersion || 0) !== expectedRoomVersion) {
      this.setData({ syncMessage: '当前轮已更新，请确认最新账本后再开始新一轮' });
      return null;
    }
    return this.runMutation('create_round', [expectedRoundId, expectedRoomVersion], (clientRequestId) => apiMethod('createRound')(
      this.data.roomId,
      expectedRoundId,
      expectedRoomVersion,
      { clientRequestId },
    ), '已开始新一轮', {
      newRound: true,
      afterSuccess: () => this.closeHistorySheet(),
    });
  },

  async onUndoLast() {
    if (!this.data.entryCount || typeof waterApi.undoLast !== 'function') return null;
    const roomId = clean(this.data.roomId || this.data.sessionId);
    const expectedVersion = this.data.session && this.data.session.version;
    const target = this.data.recentEntries && this.data.recentEntries[0] || {};
    const targetId = clean(target.id || `${target.createdAtMs || ''}:${target.description || ''}`);
    return actionGuard.runCriticalWrite(`water:legacy:undo-gate:${roomId}`, async () => {
      const modal = await confirmModal({ title: '撤销这条记录？', content: clean(target.description), confirmText: '撤销', confirmColor: '#b8443f' });
      if (!modal.confirm || clean(this.data.roomId || this.data.sessionId) !== roomId) return null;
      return this.runMutation('undo', [targetId], (clientRequestId) => waterApi.undoLast(roomId, expectedVersion, { clientRequestId }), '已撤销');
    });
  },

  onShareAppMessage() {
    if (!this.data.canShare) return null;
    const title = this.data.round && this.data.round.title || this.data.session && this.data.session.title || '快速打水';
    return {
      title: `${title}：来一起记水`,
      path: `/pages/water/index?id=${encodeURIComponent(this.data.roomId)}`,
    };
  },
});
