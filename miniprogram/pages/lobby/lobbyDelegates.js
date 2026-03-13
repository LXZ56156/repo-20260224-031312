const retryAction = require('../../core/retryAction');
const profileActions = require('./lobbyProfileActions');
const draftActions = require('./lobbyDraftActions');
const pairActions = require('./lobbyPairTeamActions');

function createLobbyDelegates(syncController) {
  const retryMethods = retryAction.createRetryMethods();
  const sync = syncController && typeof syncController === 'object' ? syncController : {};

  return {
    onProfileNickInput(...args) {
      return profileActions.onProfileNickInput.apply(this, args);
    },
    onProfileNickFocus(...args) {
      return profileActions.onProfileNickFocus.apply(this, args);
    },
    onProfileNickBlur(...args) {
      return profileActions.onProfileNickBlur.apply(this, args);
    },
    focusProfileNickname(...args) {
      return profileActions.focusProfileNickname.apply(this, args);
    },
    onQuickFillProfile(...args) {
      return profileActions.onQuickFillProfile.apply(this, args);
    },
    onChooseAvatarForProfile(...args) {
      return profileActions.onChooseAvatarForProfile.apply(this, args);
    },
    submitProfile(...args) {
      return profileActions.submitProfile.apply(this, args);
    },
    onChooseAvatarForJoin(...args) {
      return profileActions.onChooseAvatarForJoin.apply(this, args);
    },
    onChooseAvatarForMe(...args) {
      return profileActions.onChooseAvatarForMe.apply(this, args);
    },
    applyProfileAvatarTemp(...args) {
      return profileActions.applyProfileAvatarTemp.apply(this, args);
    },
    uploadProfileAvatarTemp(...args) {
      return profileActions.uploadProfileAvatarTemp.apply(this, args);
    },
    setJoinAvatarDisplay(...args) {
      return profileActions.setJoinAvatarDisplay.apply(this, args);
    },
    setMyAvatarDisplay(...args) {
      return profileActions.setMyAvatarDisplay.apply(this, args);
    },
    resolveAvatarDisplay(...args) {
      return profileActions.resolveAvatarDisplay.apply(this, args);
    },
    resolveDisplayPlayersAvatars(...args) {
      return profileActions.resolveDisplayPlayersAvatars.apply(this, args);
    },
    handleJoin(...args) {
      return profileActions.handleJoin.apply(this, args);
    },
    saveMyProfile(...args) {
      return profileActions.saveMyProfile.apply(this, args);
    },

    runFlowAction(...args) {
      return draftActions.runFlowAction.apply(this, args);
    },
    onRoleActionTap(...args) {
      return draftActions.onRoleActionTap.apply(this, args);
    },
    onStateSecondaryTap(...args) {
      return draftActions.onStateSecondaryTap.apply(this, args);
    },
    parseImportPlayers(...args) {
      return draftActions.parseImportPlayers.apply(this, args);
    },
    goSettings(...args) {
      return draftActions.goSettings.apply(this, args);
    },
    goEditTournament(...args) {
      return draftActions.goEditTournament.apply(this, args);
    },
    goAnalytics(...args) {
      return draftActions.goAnalytics.apply(this, args);
    },
    focusShareInviteArea(...args) {
      return draftActions.focusShareInviteArea.apply(this, args);
    },
    onPickQuickConfigMSimple(...args) {
      return draftActions.onPickQuickConfigMSimple.apply(this, args);
    },
    onPickQuickConfigMDigit(...args) {
      return draftActions.onPickQuickConfigMDigit.apply(this, args);
    },
    onPickQuickConfigC(...args) {
      return draftActions.onPickQuickConfigC.apply(this, args);
    },
    onPickSessionMinutes(...args) {
      return draftActions.onPickSessionMinutes.apply(this, args);
    },
    onPickSlotMinutes(...args) {
      return draftActions.onPickSlotMinutes.apply(this, args);
    },
    refreshQuickRecommendations(...args) {
      return draftActions.refreshQuickRecommendations.apply(this, args);
    },
    focusQuickImportArea(...args) {
      return draftActions.focusQuickImportArea.apply(this, args);
    },
    onQuickImportInput(...args) {
      return draftActions.onQuickImportInput.apply(this, args);
    },
    saveQuickSettings(...args) {
      return draftActions.saveQuickSettings.apply(this, args);
    },
    quickImportPlayers(...args) {
      return draftActions.quickImportPlayers.apply(this, args);
    },
    cloneCurrentTournament(...args) {
      return draftActions.cloneCurrentTournament.apply(this, args);
    },
    onChecklistTap(...args) {
      return draftActions.onChecklistTap.apply(this, args);
    },
    onPickJoinSquad(...args) {
      return draftActions.onPickJoinSquad.apply(this, args);
    },
    onTogglePlayerSquad(...args) {
      return draftActions.onTogglePlayerSquad.apply(this, args);
    },
    onNextActionTap(...args) {
      return draftActions.onNextActionTap.apply(this, args);
    },
    goBatchScoring(...args) {
      return draftActions.goBatchScoring.apply(this, args);
    },
    handleWriteError(...args) {
      return draftActions.handleWriteError.apply(this, args);
    },
    handleStart(...args) {
      return draftActions.handleStart.apply(this, args);
    },
    cancelTournament(...args) {
      return draftActions.cancelTournament.apply(this, args);
    },

    onPairTeamNameInput(...args) {
      return pairActions.onPairTeamNameInput.apply(this, args);
    },
    onPickPairFirst(...args) {
      return pairActions.onPickPairFirst.apply(this, args);
    },
    onPickPairSecond(...args) {
      return pairActions.onPickPairSecond.apply(this, args);
    },
    autoGeneratePairTeams(...args) {
      return pairActions.autoGeneratePairTeams.apply(this, args);
    },
    createPairTeam(...args) {
      return pairActions.createPairTeam.apply(this, args);
    },
    deletePairTeam(...args) {
      return pairActions.deletePairTeam.apply(this, args);
    },

    nextFetchSeq(...args) {
      return sync.nextFetchSeq.apply(this, args);
    },
    isLatestFetchSeq(...args) {
      return sync.isLatestFetchSeq.apply(this, args);
    },
    invalidateFetchSeq(...args) {
      return sync.invalidateFetchSeq.apply(this, args);
    },
    nextWatchGen(...args) {
      return sync.nextWatchGen.apply(this, args);
    },
    isActiveWatchGen(...args) {
      return sync.isActiveWatchGen.apply(this, args);
    },
    invalidateWatchGen(...args) {
      return sync.invalidateWatchGen.apply(this, args);
    },
    hasActiveWatch(...args) {
      return sync.hasActiveWatch.apply(this, args);
    },
    startWatch(...args) {
      return sync.startWatch.apply(this, args);
    },
    fetchTournament(...args) {
      return sync.fetchTournament.apply(this, args);
    },
    handleNetworkChange(...args) {
      return sync.handleNetworkChange.apply(this, args);
    },
    onRetry(...args) {
      return sync.onRetry.apply(this, args);
    },

    setLastFailedAction(...args) {
      return retryMethods.setLastFailedAction.apply(this, args);
    },
    clearLastFailedAction(...args) {
      return retryMethods.clearLastFailedAction.apply(this, args);
    },
    retryLastAction(...args) {
      return retryMethods.retryLastAction.apply(this, args);
    }
  };
}

module.exports = {
  createLobbyDelegates
};
