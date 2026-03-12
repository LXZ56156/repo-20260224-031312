const test = require('node:test');
const assert = require('node:assert/strict');

const { buildHomeHeroCardState } = require('../miniprogram/pages/home/heroCardState');

function item(overrides) {
  return {
    _id: 't_1',
    name: '示例比赛',
    status: 'draft',
    updatedAtTs: 1,
    playersCount: 4,
    matchProgressText: '0/6场',
    modeLabel: '多人转',
    ...overrides
  };
}

test('home hero prioritizes running tournaments when present', () => {
  const state = buildHomeHeroCardState([
    item({ _id: 'draft_1', status: 'draft', updatedAtTs: 10 }),
    item({ _id: 'running_1', status: 'running', updatedAtTs: 20, matchProgressText: '2/6场' })
  ]);

  assert.equal(state.title, '继续你的比赛');
  assert.equal(state.actionText, '继续最近比赛');
  assert.equal(state.actionTarget, 'lobby');
  assert.equal(state.actionId, 'running_1');
});

test('home hero falls back to latest draft when nothing is running', () => {
  const state = buildHomeHeroCardState([
    item({ _id: 'draft_1', status: 'draft', updatedAtTs: 10, name: '较早草稿' }),
    item({ _id: 'draft_2', status: 'draft', updatedAtTs: 30, name: '最新草稿' }),
    item({ _id: 'finished_1', status: 'finished', updatedAtTs: 20 })
  ]);

  assert.equal(state.title, '你的比赛');
  assert.equal(state.label, '最近草稿');
  assert.equal(state.name, '最新草稿');
  assert.equal(state.actionText, '继续草稿比赛');
  assert.equal(state.actionTarget, 'lobby');
  assert.equal(state.actionId, 'draft_2');
});

test('home hero falls back to latest result when there is no running or draft', () => {
  const state = buildHomeHeroCardState([
    item({ _id: 'finished_1', status: 'finished', updatedAtTs: 10, name: '较早结果' }),
    item({ _id: 'finished_2', status: 'finished', updatedAtTs: 40, name: '最新结果', matchProgressText: '6/6场' })
  ]);

  assert.equal(state.title, '你的比赛');
  assert.equal(state.label, '最近结果');
  assert.equal(state.name, '最新结果');
  assert.equal(state.actionText, '查看最近结果');
  assert.equal(state.actionTarget, 'ranking');
  assert.equal(state.actionId, 'finished_2');
});

test('home hero switches to create action when there are no visible tournaments', () => {
  const state = buildHomeHeroCardState([]);

  assert.equal(state.title, '你的比赛');
  assert.equal(state.label, '当前还没有比赛');
  assert.equal(state.actionText, '发起比赛');
  assert.equal(state.actionTarget, 'create');
  assert.equal(state.empty, true);
});
