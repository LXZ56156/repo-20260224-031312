const tournamentSync = require('./tournamentSync');
const syncStatus = require('./syncStatus');

function hasOwn(obj, key) {
  return !!obj && Object.prototype.hasOwnProperty.call(obj, key);
}

function pickDocTimestamp(doc) {
  return syncStatus.pickTournamentTimestamp(doc);
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

    startWatch(tournamentId) {
      const watchGen = this.nextWatchGen();
      tournamentSync.startWatch(this, tournamentId, (doc, meta = {}) => {
        if (!this.isActiveWatchGen(watchGen)) return;
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
        applyDoc(this, options, doc, { watchGen, source });
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
      });
    },

    async fetchTournament(tournamentId) {
      const requestSeq = this.nextFetchSeq();
      this.setData(composePageSyncPatch(this, {
        loadError: false,
        syncRefreshing: true
      }));
      const result = await tournamentSync.fetchTournament(tournamentId);
      if (!this.isLatestFetchSeq(requestSeq)) return null;

      if (result && result.ok && result.doc) {
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
        applyDoc(this, options, result.doc, { requestSeq, source: result.source || 'remote' });
        return result.doc;
      }

      if (result && result.cachedDoc) {
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
        applyDoc(this, options, result.cachedDoc, { requestSeq, source: 'cache' });
        return result.cachedDoc;
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
  const defaults = syncStatus.getDefaultSyncState();
  page.data = page.data && typeof page.data === 'object' ? page.data : {};
  Object.keys(defaults).forEach((key) => {
    if (!hasOwn(page.data, key)) page.data[key] = defaults[key];
  });
}

function teardownTournamentSync(page) {
  if (!page) return;
  if (typeof page.invalidateFetchSeq === 'function') page.invalidateFetchSeq();
  if (typeof page.invalidateWatchGen === 'function') page.invalidateWatchGen();
  tournamentSync.closeWatcher(page);
}

module.exports = {
  buildTournamentLoadErrorState,
  composePageSyncPatch,
  createTournamentSyncMethods,
  initTournamentSync,
  teardownTournamentSync
};
