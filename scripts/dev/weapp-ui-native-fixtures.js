'use strict';
const { cases } = require('./weapp-ui-screenshot-cases');
const { buildSettingsViewState } = require('../../miniprogram/pages/settings/settingsViewModel');

function buildNativeFixtures(now = Date.now()) {
  const clone = value => JSON.parse(JSON.stringify(value));
  const account = 'ui-screenshot-user';
  const claim = clone(cases.shareClaimFullNames.data.tournament);
  const documents = { [claim._id]: claim };
  const entries = { shareClaimFullNames: { path: `/pages/share-entry/index?tournamentId=${claim._id}`, id: claim._id } };
  const join = { ...clone(claim), _id: '__ui_join_open_slot', players: clone(claim.players.slice(0, 5)), version: 1 };
  join.playerIds = join.players.map(player => player.id);
  documents[join._id] = join;
  entries.shareJoinOpenSlot = { path: `/pages/share-entry/index?tournamentId=${join._id}`, id: join._id,
    baseCase: 'shareDraft', selectorExpectations: { '.participant-avatar-img': 5 } };
  const settingsIds = [];
  for (const name of ['settingsSchedulerBalanced', 'settingsSchedulerRest', 'settingsSchedulerCoverage']) {
    const source = cases[name];
    const tournament = { ...clone(claim), ...clone(source.data.tournament), creatorId: account,
      players: clone(claim.players), playerIds: [...claim.playerIds], mode: claim.mode, version: 1,
      pointsPerGame: 21, updatedAt: now };
    const view = buildSettingsViewState(tournament, { openid: account });
    if (!view.isDraft || !view.canManageTournament || !view.canConfigureSettings || !view.showSchedulerProfile) throw Error('Invalid interactive settings fixture');
    // Keep the backend fixture canonical under the real preset/court rules.
    // A static screenshot's projected 2 courts is not valid for a 6-player preset.
    tournament.name = view.name; tournament.courts = view.editC; tournament.totalMatches = view.editM;
    documents[tournament._id] = tournament;
    settingsIds.push(tournament._id);
    const shortcutVisible = !!(view.matchShortcutHint || (view.matchShortcutOptions || []).length || view.matchPresetUnavailableHint);
    entries[name] = { path: `/pages/settings/index?tournamentId=${tournament._id}`, id: tournament._id,
      formLabels: ['赛事名称', '总场次', ...(shortcutVisible ? ['快捷设置'] : []), '每轮最多场数', '排程偏好', '每局分制'] };
  }
  return { kind: 'native-acceptance-fixtures-v1', account, profile: { nickName: '截图球友', gender: 'male', avatar: 'cloud://ui-screenshot/avatar.png' },
    documents, settingsIds, claimId: claim._id, joinId: join._id, entries };
}

module.exports = { buildNativeFixtures };
