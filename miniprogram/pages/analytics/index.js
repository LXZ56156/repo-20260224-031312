const nav = require('../../core/nav');
const tournamentEntry = require('../../core/tournamentEntry');

Page({
  data: {
    redirecting: true
  },

  onLoad(options = {}) {
    const tournamentId = tournamentEntry.parseTournamentIdFromPageOptions(options);
    if (!tournamentId) {
      nav.goHome();
      return;
    }

    const query = {};
    if (String(options.autoPoster || '') === '1') query.autoPoster = 1;
    if (String(options.shareIntent || '').trim() === 'poster') query.shareIntent = 'poster';
    nav.redirectOrNavigate(nav.buildTournamentUrl('/pages/ranking/index', tournamentId, query));
  }
});
