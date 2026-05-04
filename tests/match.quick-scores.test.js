const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  buildInitialData,
  buildQuickScoreOptions,
  buildTournamentViewState
} = require('../miniprogram/pages/match/matchViewModel');

const matchPagePath = require.resolve('../miniprogram/pages/match/index.js');

function readPage(relativePath) {
  return fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf8');
}

function getCssRuleBody(source, selector) {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = source.match(new RegExp(`${escapedSelector}\\s*\\{([\\s\\S]*?)\\}`));
  return match ? match[1] : '';
}

function loadMatchPageDefinition() {
  const originalPage = global.Page;
  let definition = null;
  global.Page = (options) => {
    definition = options;
  };
  delete require.cache[matchPagePath];
  require(matchPagePath);
  global.Page = originalPage;
  return definition;
}

function buildTournament(pointsPerGame = 21) {
  return {
    _id: 't_1',
    name: '周末比赛',
    status: 'running',
    version: 1,
    rules: { pointsPerGame },
    players: [
      { id: 'user_1', name: '裁判A' },
      { id: 'u2', name: '球友B' },
      { id: 'u3', name: '球友C' },
      { id: 'u4', name: '球友D' }
    ],
    rounds: [{
      roundIndex: 0,
      matches: [{
        matchIndex: 0,
        status: 'pending',
        teamA: [{ id: 'user_1', name: '裁判A' }, { id: 'u2', name: '球友B' }],
        teamB: [{ id: 'u3', name: '球友C' }, { id: 'u4', name: '球友D' }]
      }]
    }]
  };
}

function createPageContext(definition) {
  const ctx = {
    data: {
      scoreA: 3,
      scoreB: 6,
      scoreAIndex: 3,
      scoreBIndex: 6,
      displayScoreA: '3',
      displayScoreB: '6',
      canEdit: true,
      canUndo: false
    },
    _savedDraft: null,
    _undoStack: [],
    setData(update) {
      this.data = { ...this.data, ...(update || {}) };
    },
    matchDraft: {
      pushUndo(scoreA, scoreB) {
        ctx._undoStack.push({ a: scoreA, b: scoreB });
      },
      saveScoreDraft(scoreA, scoreB) {
        ctx._savedDraft = { scoreA, scoreB };
      },
      undo() {
        return ctx._undoStack.pop() || null;
      },
      getUndoSize() {
        return ctx._undoStack.length;
      }
    },
    scoreLockManager: {}
  };

  for (const [key, value] of Object.entries(definition || {})) {
    if (typeof value === 'function') ctx[key] = value;
  }
  return ctx;
}

test('buildQuickScoreOptions returns balanced presets for supported point systems', () => {
  assert.deepEqual(buildQuickScoreOptions(11), [
    { label: '11:9', a: 11, b: 9 },
    { label: '11:7', a: 11, b: 7 },
    { label: '11:4', a: 11, b: 4 },
    { label: '9:11', a: 9, b: 11 }
  ]);
  assert.deepEqual(buildQuickScoreOptions(15), [
    { label: '15:13', a: 15, b: 13 },
    { label: '15:11', a: 15, b: 11 },
    { label: '15:8', a: 15, b: 8 },
    { label: '13:15', a: 13, b: 15 }
  ]);
  assert.deepEqual(buildQuickScoreOptions(21), [
    { label: '21:19', a: 21, b: 19 },
    { label: '21:17', a: 21, b: 17 },
    { label: '21:15', a: 21, b: 15 },
    { label: '21:10', a: 21, b: 10 },
    { label: '19:21', a: 19, b: 21 }
  ]);
});

test('match quick score presets fall back to 21-point defaults for unsupported values', () => {
  const initialData = buildInitialData();
  assert.deepEqual(initialData.quickScoreOptions, buildQuickScoreOptions(21));

  const unsupportedState = buildTournamentViewState(buildTournament(13), {
    tournamentId: 't_1',
    roundIndex: 0,
    matchIndex: 0,
    openid: 'user_1',
    lockState: 'locked_by_me',
    currentScoreA: 0,
    currentScoreB: 0,
    draft: null,
    undoSize: 0
  });

  assert.equal(unsupportedState.data.pointsPerGame, 21);
  assert.deepEqual(unsupportedState.data.quickScoreOptions, buildQuickScoreOptions(21));
});

test('match quick score presets follow tournament pointsPerGame order including reverse result', () => {
  const viewState = buildTournamentViewState(buildTournament(15), {
    tournamentId: 't_1',
    roundIndex: 0,
    matchIndex: 0,
    openid: 'user_1',
    lockState: 'locked_by_me',
    currentScoreA: 0,
    currentScoreB: 0,
    draft: null,
    undoSize: 0
  });

  assert.equal(viewState.data.pointsPerGame, 15);
  assert.deepEqual(viewState.data.quickScoreOptions, [
    { label: '15:13', a: 15, b: 13 },
    { label: '15:11', a: 15, b: 11 },
    { label: '15:8', a: 15, b: 8 },
    { label: '13:15', a: 13, b: 15 }
  ]);
});

test('match page renders dynamic quick score options instead of hardcoded score chips', () => {
  const wxml = readPage('miniprogram/pages/match/index.wxml');

  assert.match(wxml, /wx:for=\"\{\{quickScoreOptions\}\}\"/);
  assert.match(wxml, /data-a=\"\{\{item\.a\}\}\"/);
  assert.match(wxml, /data-b=\"\{\{item\.b\}\}\"/);
  assert.match(wxml, /class=\"score-edit-status\" wx:if=\"\{\{canEdit\}\}\"/);
  assert.match(wxml, /bindtap=\"onClearScores\"/);
  assert.match(wxml, /bindtap=\"onSwapScores\"/);
  assert.match(wxml, /bindtap=\"onUndoStep\"/);
  assert.doesNotMatch(wxml, /data-a=\"21\" data-b=\"19\"/);
  assert.doesNotMatch(wxml, /class=\"lock-panel\"/);
  assert.doesNotMatch(wxml, /请先点击/);
  assert.doesNotMatch(wxml, /刷新状态/);
  assert.doesNotMatch(wxml, /接管录分/);
});

test('match score edit tools stay contained within the score panel', () => {
  const wxss = readPage('miniprogram/pages/match/index.wxss');
  const toolbarRule = getCssRuleBody(wxss, '.score-toolbar');
  const toolsRule = getCssRuleBody(wxss, '.score-tools');
  const toolRule = getCssRuleBody(wxss, '.score-tool');

  assert.match(toolbarRule, /flex-direction:\s*column/);
  assert.match(toolbarRule, /align-items:\s*stretch/);
  assert.match(toolsRule, /width:\s*100%/);
  assert.match(toolsRule, /display:\s*flex/);
  assert.match(toolRule, /flex:\s*1/);
  assert.match(toolRule, /width:\s*0/);
  assert.match(toolRule, /min-width:\s*0/);
  assert.match(toolRule, /box-sizing:\s*border-box/);
});

test('onQuickScore still overwrites scores and records undo plus draft from dynamic dataset', () => {
  const definition = loadMatchPageDefinition();
  const ctx = createPageContext(definition);

  ctx.onQuickScore({
    currentTarget: {
      dataset: {
        a: 15,
        b: 13
      }
    }
  });

  assert.equal(ctx.data.scoreA, 15);
  assert.equal(ctx.data.scoreB, 13);
  assert.equal(ctx.data.scoreAIndex, 15);
  assert.equal(ctx.data.scoreBIndex, 13);
  assert.equal(ctx.data.displayScoreA, '15');
  assert.equal(ctx.data.displayScoreB, '13');
  assert.equal(ctx.data.canUndo, true);
  assert.deepEqual(ctx._undoStack, [{ a: 3, b: 6 }]);
  assert.deepEqual(ctx._savedDraft, { scoreA: 15, scoreB: 13 });

  delete require.cache[matchPagePath];
});

test('score edit tools clear swap and undo through shared draft history', () => {
  const definition = loadMatchPageDefinition();
  const ctx = createPageContext(definition);

  ctx.onSwapScores();
  assert.equal(ctx.data.scoreA, 6);
  assert.equal(ctx.data.scoreB, 3);
  assert.deepEqual(ctx._undoStack, [{ a: 3, b: 6 }]);
  assert.deepEqual(ctx._savedDraft, { scoreA: 6, scoreB: 3 });

  ctx.onClearScores();
  assert.equal(ctx.data.scoreA, 0);
  assert.equal(ctx.data.scoreB, 0);
  assert.deepEqual(ctx._undoStack, [{ a: 3, b: 6 }, { a: 6, b: 3 }]);
  assert.deepEqual(ctx._savedDraft, { scoreA: 0, scoreB: 0 });

  ctx.onUndoStep();
  assert.equal(ctx.data.scoreA, 6);
  assert.equal(ctx.data.scoreB, 3);
  assert.equal(ctx.data.canUndo, true);
  assert.deepEqual(ctx._savedDraft, { scoreA: 6, scoreB: 3 });

  delete require.cache[matchPagePath];
});
