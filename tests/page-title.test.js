const test = require('node:test');
const assert = require('node:assert/strict');

const pageTitle = require('../miniprogram/core/pageTitle');

test('pageTitle builds feature title with truncated tournament name', () => {
  const title = pageTitle.buildTournamentPageTitle('赛程对阵', {
    name: '超长周末羽毛球友谊轮转赛',
    status: 'running',
    mode: 'multi_rotate'
  });

  assert.equal(title, '赛程对阵·超长周末羽毛球友谊轮');
});

test('pageTitle falls back to brand title when tournament name is empty', () => {
  const title = pageTitle.buildTournamentPageTitle('赛事大厅', {
    name: '',
    status: 'draft',
    mode: 'multi_rotate'
  });

  assert.equal(title, '赛事大厅·羽球轮转助手');
});

test('pageTitle preserves synchronized fixed rotation display name', () => {
  const title = pageTitle.buildTournamentPageTitle('赛事排名', {
    name: '自定义名称',
    status: 'running',
    mode: 'multi_rotate',
    presetKey: 'rotation_8'
  });

  assert.equal(title, '赛事排名·8人转');
});

test('pageTitle deduplicates setNavigationBarTitle calls per page context', () => {
  const originalWx = global.wx;
  const calls = [];
  global.wx = {
    setNavigationBarTitle(payload) {
      calls.push(payload);
    }
  };

  try {
    const ctx = {};
    const tournament = {
      name: '周末友谊赛',
      status: 'running',
      mode: 'multi_rotate'
    };

    pageTitle.setTournamentPageTitle(ctx, '赛程对阵', tournament);
    pageTitle.setTournamentPageTitle(ctx, '赛程对阵', tournament);
    pageTitle.setTournamentPageTitle(ctx, '赛事排名', tournament);

    assert.deepEqual(calls, [
      { title: '赛程对阵·周末友谊赛' },
      { title: '赛事排名·周末友谊赛' }
    ]);
  } finally {
    global.wx = originalWx;
  }
});
