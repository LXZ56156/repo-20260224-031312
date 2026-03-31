const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');

const lobbyDelegatesPath = require.resolve('../miniprogram/pages/lobby/lobbyDelegates.js');

function loadCreateLobbyDelegates(stubs) {
  const originalLoad = Module._load;
  delete require.cache[lobbyDelegatesPath];

  Module._load = function patchedLoad(request, parent, isMain) {
    if (parent && parent.filename === lobbyDelegatesPath) {
      if (request === '../../core/retryAction') return stubs.retryAction;
      if (request === './lobbyProfileActions') return stubs.profileActions;
      if (request === './lobbyDraftActions') return stubs.draftActions;
      if (request === './lobbyQuickSettingsActions') return stubs.quickSettingsActions;
      if (request === './lobbyImportActions') return stubs.importActions;
      if (request === './lobbyLifecycleActions') return stubs.lifecycleActions;
      if (request === './lobbyPairTeamActions') return stubs.pairActions;
    }
    return originalLoad.call(this, request, parent, isMain);
  };

  try {
    return require(lobbyDelegatesPath).createLobbyDelegates;
  } finally {
    Module._load = originalLoad;
  }
}

test('createLobbyDelegates mixes source methods directly into the page delegates', () => {
  const profileActions = {
    onProfileNickInput() {},
    submitProfile() {}
  };
  const draftActions = {
    goBatchScoring() {}
  };
  const quickSettingsActions = {
    saveQuickSettings() {}
  };
  const importActions = {
    quickImportPlayers() {}
  };
  const lifecycleActions = {
    handleStart() {},
    saveAndStart() {}
  };
  const pairActions = {
    createPairTeam() {},
    deletePairTeam() {}
  };
  const retryMethods = {
    setLastFailedAction() {},
    retryLastAction() {}
  };
  const retryAction = {
    createRetryMethods() {
      return retryMethods;
    }
  };
  const createLobbyDelegates = loadCreateLobbyDelegates({
    retryAction,
    profileActions,
    draftActions,
    quickSettingsActions,
    importActions,
    lifecycleActions,
    pairActions
  });

  const syncController = {
    fetchTournament() {},
    onRetry() {}
  };
  const delegates = createLobbyDelegates(syncController);

  assert.equal(delegates.onProfileNickInput, profileActions.onProfileNickInput);
  assert.equal(delegates.submitProfile, profileActions.submitProfile);
  assert.equal(delegates.goBatchScoring, draftActions.goBatchScoring);
  assert.equal(delegates.saveQuickSettings, quickSettingsActions.saveQuickSettings);
  assert.equal(delegates.quickImportPlayers, importActions.quickImportPlayers);
  assert.equal(delegates.handleStart, lifecycleActions.handleStart);
  assert.equal(delegates.saveAndStart, lifecycleActions.saveAndStart);
  assert.equal(delegates.createPairTeam, pairActions.createPairTeam);
  assert.equal(delegates.deletePairTeam, pairActions.deletePairTeam);
  assert.equal(delegates.fetchTournament, syncController.fetchTournament);
  assert.equal(delegates.onRetry, syncController.onRetry);
  assert.equal(delegates.setLastFailedAction, retryMethods.setLastFailedAction);
  assert.equal(delegates.retryLastAction, retryMethods.retryLastAction);
});
