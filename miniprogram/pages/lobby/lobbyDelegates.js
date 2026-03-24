const retryAction = require('../../core/retryAction');
const profileActions = require('./lobbyProfileActions');
const draftActions = require('./lobbyDraftActions');
const pairActions = require('./lobbyPairTeamActions');

function createLobbyDelegates(syncController) {
  const retryMethods = retryAction.createRetryMethods();
  const sync = syncController && typeof syncController === 'object' ? syncController : {};

  return Object.assign({}, profileActions, draftActions, pairActions, sync, retryMethods);
}

module.exports = {
  createLobbyDelegates
};
