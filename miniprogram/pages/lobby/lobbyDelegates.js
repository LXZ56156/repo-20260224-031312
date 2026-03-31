const retryAction = require('../../core/retryAction');
const profileActions = require('./lobbyProfileActions');
const draftActions = require('./lobbyDraftActions');
const quickSettingsActions = require('./lobbyQuickSettingsActions');
const importActions = require('./lobbyImportActions');
const lifecycleActions = require('./lobbyLifecycleActions');
const pairActions = require('./lobbyPairTeamActions');

function createLobbyDelegates(syncController) {
  const retryMethods = retryAction.createRetryMethods();
  const sync = syncController && typeof syncController === 'object' ? syncController : {};

  return Object.assign(
    {},
    profileActions,
    draftActions,
    quickSettingsActions,
    importActions,
    lifecycleActions,
    pairActions,
    sync,
    retryMethods
  );
}

module.exports = {
  createLobbyDelegates
};
