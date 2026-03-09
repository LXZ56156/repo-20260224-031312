const test = require('node:test');
const assert = require('node:assert/strict');

const schedulePagePath = require.resolve('../miniprogram/pages/schedule/index.js');

function loadSchedulePageDefinition() {
  const originalPage = global.Page;
  let definition = null;
  global.Page = (options) => {
    definition = options;
  };
  delete require.cache[schedulePagePath];
  require(schedulePagePath);
  global.Page = originalPage;
  return definition;
}

function createSchedulePageContext(definition) {
  const ctx = {
    data: JSON.parse(JSON.stringify(definition.data)),
    setData(update) {
      this.data = { ...this.data, ...(update || {}) };
    }
  };
  for (const [key, value] of Object.entries(definition || {})) {
    if (typeof value === 'function') ctx[key] = value;
  }
  ctx.openid = 'u_admin';
  return ctx;
}

test('schedule page prefers canonical nickName over legacy nickname alias', () => {
  const originalGetApp = global.getApp;

  try {
    global.getApp = () => ({ globalData: { openid: 'u_admin' } });
    const definition = loadSchedulePageDefinition();
    const ctx = createSchedulePageContext(definition);

    ctx.applyTournament({
      _id: 't_1',
      status: 'running',
      creatorId: 'u_admin',
      players: [
        { id: 'u_admin', nickName: '新昵称A', nickname: '旧昵称A' },
        { id: 'u_2', nickName: '新昵称B', nickname: '旧昵称B' },
        { id: 'u_3', name: '对手C' },
        { id: 'u_4', name: '对手D' }
      ],
      rounds: [{
        roundIndex: 0,
        matches: [{
          matchIndex: 0,
          status: 'pending',
          teamA: [
            { id: 'u_admin', nickName: '新昵称A', nickname: '旧昵称A' },
            { id: 'u_2', nickName: '新昵称B', nickname: '旧昵称B' }
          ],
          teamB: [
            { id: 'u_3', name: '对手C' },
            { id: 'u_4', name: '对手D' }
          ]
        }]
      }]
    });

    assert.equal(ctx.data.roundsUi[0].matchesUi[0].left, '新昵称A / 新昵称B');
  } finally {
    global.getApp = originalGetApp;
    delete require.cache[schedulePagePath];
  }
});
