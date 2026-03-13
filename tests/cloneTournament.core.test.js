const test = require('node:test');
const assert = require('node:assert/strict');

const cloneTournamentCore = require('../miniprogram/core/cloneTournament');
const cloud = require('../miniprogram/core/cloud');
const storage = require('../miniprogram/core/storage');

test('cloneTournament core persists the new tournament id into recents', async () => {
  const originalCall = cloud.call;
  const originalAddRecentTournamentId = storage.addRecentTournamentId;
  const recentIds = [];

  cloud.call = async () => ({ tournamentId: 't_new' });
  storage.addRecentTournamentId = (id) => recentIds.push(id);

  try {
    const nextId = await cloneTournamentCore.cloneTournament('t_old');
    assert.equal(nextId, 't_new');
    assert.deepEqual(recentIds, ['t_new']);
  } finally {
    cloud.call = originalCall;
    storage.addRecentTournamentId = originalAddRecentTournamentId;
  }
});
