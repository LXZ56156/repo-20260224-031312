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
    pairActions
  });

  const syncController = {
    fetchTournament() {},
    onRetry() {}
  };
  const delegates = createLobbyDelegates(syncController);

  assert.equal(delegates.onProfileNickInput, profileActions.onProfileNickInput);
  assert.equal(delegates.submitProfile, profileActions.submitProfile);
  assert.equal(delegates.handleStart, draftActions.handleStart);
  assert.equal(delegates.saveAndStart, draftActions.saveAndStart);
  assert.equal(delegates.createPairTeam, pairActions.createPairTeam);
  assert.equal(delegates.deletePairTeam, pairActions.deletePairTeam);
  assert.equal(delegates.fetchTournament, syncController.fetchTournament);
  assert.equal(delegates.onRetry, syncController.onRetry);
  assert.equal(delegates.setLastFailedAction, retryMethods.setLastFailedAction);
  assert.equal(delegates.retryLastAction, retryMethods.retryLastAction);
});
