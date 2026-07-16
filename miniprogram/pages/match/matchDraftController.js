const storage = require('../../core/storage');
const { clampScore } = require('./matchViewModel');
const { normalizeUnitsPerLoser } = require('../../core/waterLedger');

function createMatchDraftController(ctx) {
  function ensureUndoStack() {
    if (!Array.isArray(ctx._undoStack)) ctx._undoStack = [];
    return ctx._undoStack;
  }

  function getScoreDraft() {
    return storage.getScoreDraft(
      ctx.data.tournamentId,
      ctx.data.roundIndex,
      ctx.data.matchIndex
    );
  }

  function saveScoreDraft(scoreA, scoreB, waterUnitsPerLoser = undefined) {
    const inputWaterUnits = waterUnitsPerLoser === undefined
      ? ctx.data.waterUnitsPerLoser
      : waterUnitsPerLoser;
    const normalizedWaterUnits = normalizeUnitsPerLoser(inputWaterUnits);
    const draft = {
      scoreA: clampScore(scoreA),
      scoreB: clampScore(scoreB),
      updatedAt: Date.now()
    };
    if (normalizedWaterUnits !== null) draft.waterUnitsPerLoser = normalizedWaterUnits;
    storage.setScoreDraft(
      ctx.data.tournamentId,
      ctx.data.roundIndex,
      ctx.data.matchIndex,
      draft
    );
  }

  function clearScoreDraft() {
    storage.removeScoreDraft(
      ctx.data.tournamentId,
      ctx.data.roundIndex,
      ctx.data.matchIndex
    );
  }

  function pushUndo(scoreA, scoreB) {
    const stack = ensureUndoStack();
    stack.push({ a: clampScore(scoreA), b: clampScore(scoreB) });
    if (stack.length > 20) stack.shift();
  }

  function undo() {
    const stack = ensureUndoStack();
    return stack.pop() || null;
  }

  function clearUndo() {
    ctx._undoStack = [];
  }

  function getUndoSize() {
    return ensureUndoStack().length;
  }

  function teardown() {
    clearUndo();
  }

  return {
    getScoreDraft,
    saveScoreDraft,
    clearScoreDraft,
    pushUndo,
    undo,
    clearUndo,
    getUndoSize,
    teardown
  };
}

module.exports = {
  createMatchDraftController
};
