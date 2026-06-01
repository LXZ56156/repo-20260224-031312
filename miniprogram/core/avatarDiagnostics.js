const avatarDisplay = require('./avatarDisplay');
const avatarPolicy = require('./avatarPolicy');

function createReport(tournament = {}) {
  return {
    tournamentId: String(tournament && (tournament._id || tournament.id) || '').trim(),
    version: Number(tournament && tournament.version) || 0,
    emptyAvatars: [],
    temporaryAvatars: [],
    unsupportedAvatars: [],
    cloudAvatars: [],
    cloudResolveFailed: []
  };
}

function recordAvatar(report, node, location) {
  if (!node || typeof node !== 'object' || Array.isArray(node)) return;
  const avatar = String(node.avatar || node.avatarUrl || '').trim();
  const item = { location, avatar };
  const kind = avatarPolicy.classifyAvatar(avatar);
  if (kind === 'empty') report.emptyAvatars.push(item);
  if (kind === 'temporary') report.temporaryAvatars.push(item);
  if (kind === 'unsupported') report.unsupportedAvatars.push(item);
  if (kind === 'cloud') report.cloudAvatars.push(item);
}

function scanTournamentAvatarIssues(tournament = {}) {
  const source = tournament && typeof tournament === 'object' ? tournament : {};
  const report = createReport(source);
  const players = Array.isArray(source.players) ? source.players : [];
  players.forEach((player, index) => recordAvatar(report, player, `players[${index}]`));

  const rounds = Array.isArray(source.rounds) ? source.rounds : [];
  rounds.forEach((round, roundIndex) => {
    const matches = Array.isArray(round && round.matches) ? round.matches : [];
    matches.forEach((match, matchIndex) => {
      const teamA = Array.isArray(match && match.teamA) ? match.teamA : [];
      const teamB = Array.isArray(match && match.teamB) ? match.teamB : [];
      teamA.forEach((player, index) => recordAvatar(report, player, `rounds[${roundIndex}].matches[${matchIndex}].teamA[${index}]`));
      teamB.forEach((player, index) => recordAvatar(report, player, `rounds[${roundIndex}].matches[${matchIndex}].teamB[${index}]`));
    });
    const restPlayers = Array.isArray(round && round.restPlayers) ? round.restPlayers : [];
    restPlayers.forEach((player, index) => recordAvatar(report, player, `rounds[${roundIndex}].restPlayers[${index}]`));
  });

  const rankings = Array.isArray(source.rankings) ? source.rankings : [];
  rankings.forEach((row, index) => recordAvatar(report, row, `rankings[${index}]`));
  return report;
}

function summarizeReport(report = {}) {
  return {
    empty: Array.isArray(report.emptyAvatars) ? report.emptyAvatars.length : 0,
    temporary: Array.isArray(report.temporaryAvatars) ? report.temporaryAvatars.length : 0,
    unsupported: Array.isArray(report.unsupportedAvatars) ? report.unsupportedAvatars.length : 0,
    cloud: Array.isArray(report.cloudAvatars) ? report.cloudAvatars.length : 0,
    cloudResolveFailed: Array.isArray(report.cloudResolveFailed) ? report.cloudResolveFailed.length : 0
  };
}

async function diagnoseTournamentAvatars(tournament = {}) {
  const report = scanTournamentAvatarIssues(tournament);
  const cloudFileIds = Array.from(new Set(report.cloudAvatars.map((item) => item.avatar).filter(Boolean)));
  if (cloudFileIds.length) {
    const resolved = await avatarDisplay.resolveCloudAvatarFileIds(cloudFileIds, {});
    report.cloudResolveFailed = Array.from(new Set((resolved.failed || []).map((item) => String(item || '').trim()).filter(Boolean)));
  }
  report.summary = summarizeReport(report);
  const hasWarnings = report.summary.empty || report.summary.temporary || report.summary.unsupported || report.summary.cloudResolveFailed;
  const level = hasWarnings ? 'warn' : 'info';
  try {
    if (typeof console !== 'undefined' && typeof console[level] === 'function') {
      console[level]('[avatar] tournament diagnostic', report);
    }
  } catch (_) {
    // diagnostics must not break lobby rendering
  }
  return report;
}

function buildTournamentDiagnosticKey(tournament = {}) {
  return [
    String(tournament && (tournament._id || tournament.id) || '').trim(),
    String(Number(tournament && tournament.version) || 0)
  ].join('|');
}

module.exports = {
  scanTournamentAvatarIssues,
  diagnoseTournamentAvatars,
  summarizeReport,
  buildTournamentDiagnosticKey
};
