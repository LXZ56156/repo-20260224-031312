const test = require('node:test');
const assert = require('node:assert/strict');

const storage = require('../miniprogram/core/storage');
const { createMatchDraftController } = require('../miniprogram/pages/match/matchDraftController');

test('match draft persists water units with score and preserves zero', () => {
  const originalSetScoreDraft = storage.setScoreDraft;
  const writes = [];
  storage.setScoreDraft = (tournamentId, roundIndex, matchIndex, draft) => {
    writes.push({ tournamentId, roundIndex, matchIndex, draft });
  };

  try {
    const ctx = {
      data: {
        tournamentId: 't_1',
        roundIndex: 0,
        matchIndex: 1,
        waterUnitsPerLoser: 2
      }
    };
    const controller = createMatchDraftController(ctx);

    controller.saveScoreDraft(21, 18, 0);
    controller.saveScoreDraft(15, 21);

    assert.equal(writes[0].draft.waterUnitsPerLoser, 0);
    assert.equal(writes[1].draft.waterUnitsPerLoser, 2);
  } finally {
    storage.setScoreDraft = originalSetScoreDraft;
  }
});
