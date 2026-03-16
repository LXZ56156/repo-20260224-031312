const tournamentSync = require('./tournamentSync');
const syncStatus = require('./syncStatus');
const tournamentVersion = require('./tournamentVersion');

function hasOwn(obj, key) {
  return !!obj && Object.prototype.hasOwnProperty.call(obj, key);
}

function pickDocTimestamp(doc) {
  return syncStatus.pickTournamentTimestamp(doc);
}

function pickDocId(doc) {
  return String((doc && (doc._id || doc.id)) || '').trim();
}

function pickPageTournament(page) {
  if (page && page._latestTournament && typeof page._latestTournament === 'object') {
    return page._latestTournament;
  }
  if (page && page.data && page.data.tournament && typeof page.data.tournament === 'object') {
    return page.data.tournament;
  }
  return null;
}

function pickAppliedDocTimestamp(page) {
  const rememberedTs = Number(page && page._lastAppliedDocTs) || 0;
  const stateTs = Number(page && page.data && page.data.syncLastUpdatedAt) || 0;
  const tournamentTs = pickDocTimestamp(pickPageTournament(page));
  return Math.max(rememberedTs, stateTs, tournamentTs);
}

function rememberAppliedDoc(page, doc, options = {}) {
  if (!page || !doc || typeof doc !== 'object') return;
  page._latestTournament = doc;
  const nextTs = pickDocTimestamp(doc);
  if (nextTs) page._lastAppliedDocTs = Math.max(Number(page._lastAppliedDocTs || 0), nextTs);
  const tournamentId = pickDocId(doc) || String(options.tournamentId || '').trim();
  if (tournamentId) page._lastAppliedTournamentId = tournamentId;
}

function isExpectedTournamentDoc(page, doc, options = {}) {
  const requestTournamentId = String(options.tournamentId || '').trim();
  const currentTournamentId = String((page && page.data && page.data.tournamentId) || '').trim();
  if (requestTournamentId && currentTournamentId && requestTournamentId !== currentTournamentId) return false;
  const expectedTournamentId = currentTournamentId || requestTournamentId;
  const docId = pickDocId(doc);
  if (expectedTournamentId && docId && expectedTournamentId !== docId) return false;
  return true;
}

function shouldApplyIncomingDoc(page, doc, options = {}) {
  if (!page || !doc || typeof doc !== 'object') return false;
  if (!isExpectedTournamentDoc(page, doc, options)) return false;

  const currentTournament = pickPageTournament(page);
  if (currentTournament && !tournamentVersion.shouldAcceptTournamentDoc(currentTournament, doc)) return false;

  const lastAppliedTs = pickAppliedDocTimestamp(page);
  const nextTs = pickDocTimestamp(doc);
  if (nextTs && lastAppliedTs && nextTs < lastAppliedTs) return false;

  if (currentTournament && lastAppliedTs && !nextTs) {
    const nextVersion = tournamentVersion.pickTournamentVersion(doc);
    if (!nextVersion) {
      console.warn(
        'shouldApplyIncomingDoc: incoming doc has no timestamp/version, current doc has ts=%d; accepting but freshness is unverifiable',
        lastAppliedTs
      );
    }
  }

  return true;
}

function composePageSyncPatch(page, patch) {
  const basePatch = patch && typeof patch === 'object' ? { ...patch } : {};
  const state = {
    ...(page && page.data ? page.data : {}),
    ...basePatch
  };
  return {
    ...basePatch,
    ...syncStatus.buildSyncBannerState(state)
  };
}

function buildTournamentLoadErrorState(result, options = {}) {
  let loadErrorTitle = options.defaultTitle || '加载失败';
  let loadErrorMessage = options.defaultMessage || '请检查网络后重试。';
  let showLoadErrorHome = false;
  if (result && result.errorType === 'not_found') {
    loadErrorTitle = options.notFoundTitle || '比赛不存在或已关闭';
    loadErrorMessage = options.notFoundMessage || '分享链接可能已失效，或比赛已被删除。';
    showLoadErrorHome = true;
  } else if (result && result.errorType === 'param') {
    loadErrorTitle = options.paramTitle || '链接无效';
    loadErrorMessage = options.paramMessage || '请确认比赛链接是否完整。';
    showLoadErrorHome = true;
  }
  return {
    loadError: true,
    showStaleSyncHint: false,
    loadErrorTitle,
    loadErrorMessage,
    showLoadErrorHome
  };
}

function applyDoc(page, options, doc, meta = {}) {
  if (!page || !doc) return;
  rememberAppliedDoc(page, doc, meta);
  if (typeof options.applyDoc === 'function') {
    options.applyDoc.call(page, doc, meta);
    return;
  }
  const methodName = String(options.applyDocMethod || 'applyTournament').trim();
  if (methodName && typeof page[methodName] === 'function') {
    page[methodName](doc, meta);
  }
}

function createTournamentSyncMethods(options = {}) {
  const loadErrorMessages = options.loadErrorMessages || {};
  return {
    nextFetchSeq() {
      this._fetchSeq = Number(this._fetchSeq || 0) + 1;
      return this._fetchSeq;
    },

    isLatestFetchSeq(requestSeq) {
      return Number(requestSeq) === Number(this._fetchSeq || 0);
    },

    invalidateFetchSeq() {
      this._fetchSeq = Number(this._fetchSeq || 0) + 1;
    },

    nextWatchGen() {
      this._watchGen = Number(this._watchGen || 0) + 1;
      return this._watchGen;
    },

    isActiveWatchGen(watchGen) {
      return Number(watchGen) === Number(this._watchGen || 0);
    },

    invalidateWatchGen() {
      this._watchGen = Number(this._watchGen || 0) + 1;
    },

    hasActiveWatch() {
      const watcher = this && this.watcher;
      if (!watcher) return false;
      const targetTournamentId = String(arguments[0] || '').trim();
      if (targetTournamentId) {
        const watchTournamentId = String(this._watchTournamentId || '').trim();
        if (watchTournamentId && watchTournamentId !== targetTournamentId) return false;
      }
      if (typeof watcher.isActive === 'function') return watcher.isActive() === true;
      return typeof watcher.close === 'function';
    },

    startWatch(tournamentId, startOptions = {}) {
      const targetTournamentId = String(tournamentId || '').trim();
      if (!targetTournamentId) return;
      const forceRestart = !!(startOptions && startOptions.forceRestart);
      const currentWatchTournamentId = String(this._watchTournamentId || '').trim();
      if (currentWatchTournamentId && currentWatchTournamentId !== targetTournamentId) {
        this.invalidateWatchGen();
        tournamentSync.closeWatcher(this);
      }
      if (forceRestart && this.hasActiveWatch(targetTournamentId)) {
        this.invalidateWatchGen();
        tournamentSync.closeWatcher(this);
      }
      if (this.hasActiveWatch(targetTournamentId)) return;
      const watchGen = this.nextWatchGen();
      this._watchTournamentId = targetTournamentId;
      const currentDoc = pickPageTournament(this);
      tournamentSync.startWatch(this, targetTournamentId, (doc, meta = {}) => {
        if (!this.isActiveWatchGen(watchGen)) return;
        if (!shouldApplyIncomingDoc(this, doc, { tournamentId: targetTournamentId })) return;
        const source = String((meta && meta.source) || 'watch').trim() || 'watch';
        const patch = typeof options.buildWatchState === 'function'
          ? options.buildWatchState.call(this, doc, { watchGen, source })
          : { showStaleSyncHint: false, loadError: false };
        const nextPatch = composePageSyncPatch(this, {
          ...(patch && typeof patch === 'object' ? patch : {}),
          loadError: false,
          showStaleSyncHint: false,
          syncRefreshing: false,
          syncUsingCache: false,
          syncLastUpdatedAt: pickDocTimestamp(doc) || Number(this.data.syncLastUpdatedAt || 0) || 0,
          syncPollingFallback: source === 'polling'
            ? true
            : ((source === 'realtime' || source === 'realtime_recovered') ? false : !!this.data.syncPollingFallback)
        });
        this.setData(nextPatch);
        applyDoc(this, options, doc, { watchGen, source, tournamentId: targetTournamentId });
      }, (err) => {
        if (!this.isActiveWatchGen(watchGen)) return;
        const patch = typeof options.buildWatchErrorState === 'function'
          ? options.buildWatchErrorState.call(this, err, {
            watchGen,
            source: String((err && err.__watchSource) || '').trim(),
            errorType: String((err && err.__watchType) || '').trim(),
            pollingFallback: !!(err && err.__watchFallback)
          })
          : {};
        const nextPatch = composePageSyncPatch(this, {
          ...(patch && typeof patch === 'object' ? patch : {}),
          syncRefreshing: false,
          syncPollingFallback: !!(this.data.syncPollingFallback || (err && err.__watchFallback))
        });
        this.setData(nextPatch);
      }, { initialDoc: currentDoc || null });
    },

    async fetchTournament(tournamentId) {
      const requestTournamentId = String(tournamentId || '').trim();
      if (
        requestTournamentId &&
        this._fetchInflightPromise &&
        String(this._fetchInflightTournamentId || '').trim() === requestTournamentId
      ) {
        return this._fetchInflightPromise;
      }

      const requestSeq = this.nextFetchSeq();
      this.setData(composePageSyncPatch(this, {
        loadError: false,
        syncRefreshing: true
      }));
      const inflightPromise = (async () => {
        const result = await tournamentSync.fetchTournament(requestTournamentId);
        if (!this.isLatestFetchSeq(requestSeq)) return null;
        if (requestTournamentId && String((this.data && this.data.tournamentId) || '').trim() !== requestTournamentId) return null;

        if (result && result.ok && result.doc) {
          if (!shouldApplyIncomingDoc(this, result.doc, { tournamentId: requestTournamentId })) {
            this.setData(composePageSyncPatch(this, { syncRefreshing: false }));
            return pickPageTournament(this);
          }
          const patch = typeof options.buildRemoteState === 'function'
            ? options.buildRemoteState.call(this, result, { requestSeq, source: result.source || 'remote' })
            : { showStaleSyncHint: false, loadError: false };
          this.setData(composePageSyncPatch(this, {
            ...(patch && typeof patch === 'object' ? patch : {}),
            loadError: false,
            showStaleSyncHint: false,
            syncRefreshing: false,
            syncUsingCache: false,
            syncCachedAt: 0,
            syncLastUpdatedAt: pickDocTimestamp(result.doc) || Number(this.data.syncLastUpdatedAt || 0) || 0
          }));
          applyDoc(this, options, result.doc, {
            requestSeq,
            source: result.source || 'remote',
            tournamentId: requestTournamentId
          });
          return result.doc;
        }

        if (result && result.cachedDoc) {
          if (!shouldApplyIncomingDoc(this, result.cachedDoc, { tournamentId: requestTournamentId })) {
            this.setData(composePageSyncPatch(this, { syncRefreshing: false }));
            return pickPageTournament(this);
          }
          const patch = typeof options.buildCachedState === 'function'
            ? options.buildCachedState.call(this, result, { requestSeq, source: 'cache' })
            : { showStaleSyncHint: true, loadError: false };
          this.setData(composePageSyncPatch(this, {
            ...(patch && typeof patch === 'object' ? patch : {}),
            loadError: false,
            showStaleSyncHint: true,
            syncRefreshing: false,
            syncUsingCache: true,
            syncCachedAt: Number(result.cachedAt || 0) || 0,
            syncLastUpdatedAt: pickDocTimestamp(result.cachedDoc) || Number(this.data.syncLastUpdatedAt || 0) || 0
          }));
          applyDoc(this, options, result.cachedDoc, {
            requestSeq,
            source: 'cache',
            tournamentId: requestTournamentId
          });
          return result.cachedDoc;
        }

        const fallbackTournament = pickPageTournament(this);
        if (fallbackTournament && result && result.errorType !== 'not_found' && result.errorType !== 'param') {
          this.setData(composePageSyncPatch(this, {
            loadError: false,
            showStaleSyncHint: true,
            syncRefreshing: false,
            syncUsingCache: false,
            syncCachedAt: 0,
            syncLastUpdatedAt: pickAppliedDocTimestamp(this)
          }));
          return fallbackTournament;
        }

        const patch = typeof options.buildLoadErrorState === 'function'
          ? options.buildLoadErrorState.call(this, result, { requestSeq, source: 'error' })
          : buildTournamentLoadErrorState(result, loadErrorMessages);
        this.setData(composePageSyncPatch(this, {
          ...(patch && typeof patch === 'object' ? patch : {}),
          syncRefreshing: false,
          syncUsingCache: false,
          syncCachedAt: 0
        }));
        return null;
      })();

      this._fetchInflightPromise = inflightPromise;
      this._fetchInflightTournamentId = requestTournamentId;

      try {
        return await inflightPromise;
      } finally {
        if (this._fetchInflightPromise === inflightPromise) {
          this._fetchInflightPromise = null;
          this._fetchInflightTournamentId = '';
        }
      }
    },

    handleNetworkChange(offline, options = {}) {
      const nextOffline = !!offline;
      const wasOffline = !!(this.data && this.data.networkOffline);
      const tournamentId = String((options.tournamentId || (this.data && this.data.tournamentId)) || '').trim();
      this.setData(composePageSyncPatch(this, { networkOffline: nextOffline }));
      if (!nextOffline && wasOffline) {
        if (tournamentId && typeof this.fetchTournament === 'function') this.fetchTournament(tournamentId);
        const needsWatchRestart = tournamentId && typeof this.startWatch === 'function' && (
          !this.hasActiveWatch(tournamentId) ||
          !!(this.data && this.data.syncPollingFallback)
        );
        if (needsWatchRestart) {
          this.startWatch(tournamentId, {
            forceRestart: !!(this.data && this.data.syncPollingFallback)
          });
        }
        if (typeof options.onReconnect === 'function') options.onReconnect.call(this, tournamentId);
      }
    },

    onRetry() {
      if (this.data && this.data.tournamentId) this.fetchTournament(this.data.tournamentId);
    }
  };
}

function initTournamentSync(page) {
  if (!page) return;
  page._fetchSeq = 0;
  page._watchGen = 0;
  page._watchTournamentId = '';
  page._fetchInflightPromise = null;
  page._fetchInflightTournamentId = '';
  page._lastAppliedDocTs = Math.max(
    Number(page._lastAppliedDocTs || 0),
    Number(page.data && page.data.syncLastUpdatedAt) || 0,
    pickDocTimestamp(page.data && page.data.tournament)
  );
  if (page.data && page.data.tournament && !page._latestTournament) {
    page._latestTournament = page.data.tournament;
  }
  const defaults = syncStatus.getDefaultSyncState();
  page.data = page.data && typeof page.data === 'object' ? page.data : {};
  Object.keys(defaults).forEach((key) => {
    if (!hasOwn(page.data, key)) page.data[key] = defaults[key];
  });
}

function pauseTournamentSync(page) {
  if (!page) return;
  if (typeof page.invalidateWatchGen === 'function') page.invalidateWatchGen();
  tournamentSync.closeWatcher(page);
}

function teardownTournamentSync(page) {
  if (!page) return;
  pauseTournamentSync(page);
  if (typeof page.invalidateFetchSeq === 'function') page.invalidateFetchSeq();
}

module.exports = {
  buildTournamentLoadErrorState,
  composePageSyncPatch,
  createTournamentSyncMethods,
  initTournamentSync,
  pauseTournamentSync,
  teardownTournamentSync
};
