'use strict';

const { buildSinglesSchedule } = require('../../cloudfunctions/startTournament/singlesRoundRobinV1');
const { buildSettingsViewState } = require('../../miniprogram/pages/settings/settingsViewModel');
const { buildLobbyViewModel } = require('../../miniprogram/pages/lobby/lobbyViewModel');
const { buildTournamentViewState } = require('../../miniprogram/pages/match/matchViewModel');
const ranking = require('../../miniprogram/core/rankingCore');
const share = require('../../miniprogram/core/shareMeta');

// Display-only synthetic tournaments. These cases never create or mutate cloud data.
function buildTournament(count, courts = 2, cycles = 1) {
  const names = ['阿杰', '小林', 'Chris', '周末限定球友', '小王', '晓雨', '单打练习球友'];
  const players = names.slice(0, count).map((name, index) => ({ id: `singles_ui_${index}`, name, type: 'user' }));
  const map = Object.fromEntries(players.map((p) => [p.id, p]));
  const result = buildSinglesSchedule(players, courts, { cycles });
  const references = (ids) => (ids || []).map((id) => map[id]);
  return { _id: '__ui_singles', name: '周末单打循环', creatorId: players[0].id,
    status: 'running', mode: 'singles_round_robin', courts, settingsConfigured: true,
    totalMatches: count * (count - 1) / 2 * cycles,
    rules: { gamesPerMatch: 1, pointsPerGame: 21, cycles },
    players, playerIds: players.map((p) => p.id),
    rounds: result.rounds.map((round) => ({ ...round,
      byePlayers: references(round.byePlayers), waitingPlayers: references(round.waitingPlayers),
      restingPlayers: references(round.restingPlayers), restPlayers: references(round.restPlayers),
      matches: round.matches.map((match) => ({ ...match, status: 'pending', teamA: references(match.teamA), teamB: references(match.teamB) })) })),
    rankings: ranking.sortRanking(players.map((p) => ({ entityType: 'player', entityId: p.id, playerId: p.id,
      name: p.name, played: 0, wins: 0, losses: 0, pointsFor: 0, pointsAgainst: 0, pointDiff: 0 })), 'singles_round_robin') };
}

function registerCases(cases) {
  const six = buildTournament(6);
  const draft = { ...six, status: 'draft', rounds: [] };
  cases.singlesSettings6 = {
    ...cases.settings, path: '/pages/settings/index?tournamentId=__ui_singles',
    data: { ...cases.settings.data, ...buildSettingsViewState(draft, { openid: draft.creatorId }), tournamentId: draft._id }
  };
  cases.singlesLobby6 = {
    path: '/pages/lobby/index?id=__ui_singles', scrollToSelector: '#quick-settings',
    selectors: ['.lobby-page', '#quick-settings', '.quick-config-picker', '.quick-settings-save'],
    data: { ...buildLobbyViewModel({ tournament: draft, openid: draft.creatorId }).patch,
      tournamentId: draft._id, adminPanelExpanded: true, showGrowthOnboardingGuide: false, showJoinSheet: false,
      syncStatusVisible: false, loadError: false }
  };
  const seven = buildTournament(7);
  const teamUi = (players) => ({ text: players.map((p) => p.name).join(' / '), avatarItems: [] });
  // The view fixture explicitly exposes two court batches of the same logical round.
  cases.singlesSchedule7 = {
    ...cases.schedule, path: '/pages/schedule/index?id=__ui_singles',
    selectors: ['.schedule-page', '.round-title', '.match-card', '.rest'],
    selectorExpectations: { '.schedule-page': 1, '.round-card': 2, '.round-title': 2, '.match-card': 3, '.rest': 2, '.count-pill-active': 1 },
    data: { ...cases.schedule.data, tournament: seven, tournamentId: seven._id, modeLabel: '单打循环',
      statusText: '进行中', statusClass: 'hero-status-running', heroSummaryText: '单打循环 · 共21场 · 每人6场',
      heroMatchText: '0 / 21 场', heroPendingText: '7逻辑轮、14批', heroProgressPercent: 0,
      showFinishedShareActions: false, canFinishTournament: false, nextActionKey: '', nextActionText: '',
      roundsUi: seven.rounds.slice(0, 2).map((round) => ({ roundIndex: round.roundIndex, isCurrentRound: round.roundIndex === 0,
        roundTitle: `第${round.cycleIndex}循环 · 第${round.logicalRound}轮 · 第${round.batchIndex}/${round.batchCount}批`,
        restText: [round.byePlayers.length ? `轮空：${round.byePlayers.map((p) => p.name).join(' / ')}` : '',
          round.waitingPlayers.length ? `等待下一批：${round.waitingPlayers.map((p) => p.name).join(' / ')}` : '',
          round.restingPlayers.length ? `本批暂休：${round.restingPlayers.map((p) => p.name).join(' / ')}` : ''].filter(Boolean).join('；'),
        matchesUi: round.matches.map((match) => ({ key: `${round.roundIndex}-${match.matchIndex}`,
          roundIndex: round.roundIndex, matchIndex: match.matchIndex, title: `第${match.matchIndex + 1}场`,
          status: 'pending', statusText: '待录分', statusClass: 'pill-pending', showScore: false,
          leftTeam: teamUi(match.teamA), rightTeam: teamUi(match.teamB) })) })) }
  };
  const state = buildTournamentViewState(six, { openid: six.creatorId, roundIndex: 0, matchIndex: 0, lockState: 'locked_by_me' });
  cases.singlesMatch21 = {
    ...cases.matchEditing, path: '/pages/match/index?tournamentId=__ui_singles&roundIndex=0&matchIndex=0',
    data: { ...cases.matchEditing.data, ...state.data, tournament: state.tournament, tournamentId: six._id,
      lockState: 'locked_by_me', lockHintText: '你正在录入比分', scoreA: 22, scoreB: 20,
      scoreAIndex: 22, scoreBIndex: 20, displayScoreA: '22', displayScoreB: '20' }
  };
  const tied = { ...buildTournament(4), status: 'finished' };
  const winnerByPair = { '0|1': 0, '0|2': 0, '0|3': 3, '1|2': 1, '1|3': 1, '2|3': 2 };
  tied.rounds.forEach((round) => round.matches.forEach((match) => {
    const a = Number(match.teamA[0].id.slice(-1));
    const b = Number(match.teamB[0].id.slice(-1));
    const winner = winnerByPair[[a, b].sort().join('|')];
    match.status = 'finished';
    match.score = { teamA: a === winner ? 21 : 19, teamB: b === winner ? 21 : 19 };
  }));
  tied.rankings = ranking.computeRankings(tied);
  cases.singlesRankingTied = {
    ...cases.ranking, path: '/pages/ranking/index?id=__ui_singles',
    selectorExpectations: { '.ranking-card': 4, '.ranking-card-1st': 2, '.ranking-card-3rd': 2 },
    data: { ...cases.ranking.data, tournament: tied, tournamentId: tied._id,
      rankingSortHint: '排序：胜场 → 净胜分 → 总得分；三项相同并列',
      rankings: ranking.normalizeCurrentRankings(tied).map((row) => ({ ...row, displayName: row.name,
        avatarItems: [], showTrend: false, topShareText: '分享' })) }
  };
  cases.singlesShareTied = {
    ...cases.shareFinished, path: '/pages/share-entry/index?code=__ui_singles',
    selectorExpectations: { '.ranking-preview': 1, '.ranking-preview-row': 3 },
    data: { ...cases.shareFinished.data, tournament: tied, tournamentId: tied._id,
      preview: share.buildShareEntryViewModel({ tournament: tied, openid: tied.creatorId }) }
  };
}

module.exports = { registerCases };
