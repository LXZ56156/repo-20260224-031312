const test = require('node:test');
const assert = require('node:assert/strict');
const cloud = require('../miniprogram/core/cloud');
const pagePath = require.resolve('../miniprogram/pages/schedule/index.js');

function loadPage(openid = 'owner') {
  let definition;
  const previous = global.Page;
  global.Page = (value) => { definition = value; };
  try { delete require.cache[pagePath]; require(pagePath); }
  finally { global.Page = previous; }
  const page = { ...definition, data: globalThis.structuredClone(definition.data), openid,
    setData(data) { Object.assign(this.data, data); },
    fetchTournament: async () => {}, refreshAvatarDisplays: async () => {} };
  page.data.tournamentId = 't1';
  return page;
}

function fixture() {
  return { _id: 't1', creatorId: 'owner', status: 'running', mode: 'multi_rotate', version: 5,
    players: ['owner', 'b', 'c', 'd'].map((id) => ({ id, name: id })),
    rounds: [{ roundIndex: 0, matches: [
      { matchIndex: 0, status: 'finished', score: { teamA: 21, teamB: 17 }, teamA: ['owner', 'b'], teamB: ['c', 'd'] },
      { matchIndex: 1, status: 'pending', teamA: ['owner', 'b'], teamB: ['c', 'd'] }
    ] }] };
}

test('manual finish entrance requires running creator and one valid result regardless of visible filter', () => {
  const t = fixture();
  const page = loadPage();
  page.data.selectedPlayerIds = ['nobody'];
  page.applyTournament(t);
  assert.equal(page.data.canFinishTournament, true);
  assert.equal(page.data.finishCompletedMatches, 1);
  assert.equal(page.data.finishRemainingMatches, 1);
  assert.equal(page.data.roundsUi.length, 0);
  page.openid = 'b'; page.applyTournament(t);
  assert.equal(page.data.canFinishTournament, false);
  page.openid = 'owner'; page.applyTournament({ ...t, status: 'draft' });
  assert.equal(page.data.canFinishTournament, false);
  t.rounds[0].matches[0].score = { teamA: 0, teamB: 0 };
  page.applyTournament(t);
  assert.equal(page.data.canFinishTournament, false);
});

test('manual finished hero describes completed and canceled matches and preserves ranking/share entrances', () => {
  const page = loadPage();
  const t = fixture();
  t.status = 'finished'; t.finishMeta = { type: 'manual' };
  Object.assign(t.rounds[0].matches[1], { status: 'canceled', cancelReason: 'manual_finish' });
  page.applyTournament(t);
  assert.equal(page.data.statusText, '已提前结束');
  assert.equal(page.data.heroPendingText, '已完成 1 场，取消 1 场');
  assert.equal(page.data.canFinishTournament, false);
  assert.equal(page.data.showFinishedShareActions, true);
  assert.equal(page.data.nextActionText, '');
});

test('confirmation cancellation writes nothing, timeout retry reuses request, success refreshes', async () => {
  const previousWx = global.wx;
  const previousCall = cloud.call;
  const calls = [];
  let confirm = false;
  let refreshes = 0;
  let failOnce = true;
  const page = loadPage(); page.applyTournament(fixture());
  page.fetchTournament = async () => { refreshes += 1; };
  global.wx = {
    showModal(options) {
      assert.match(options.content, /已完成1场，剩余1场将取消/);
      options.success({ confirm, cancel: !confirm });
    },
    showToast() {}
  };
  cloud.call = async (name, data) => {
    calls.push({ name, data });
    if (failOnce) { failOnce = false; throw { code: 'TIMEOUT', state: 'timeout', message: '请求超时' }; }
    return { ok: true, code: 'TOURNAMENT_FINISHED_MANUALLY', state: 'finished' };
  };
  try {
    await page.onFinishTournament();
    assert.equal(calls.length, 0);
    confirm = true;
    await page.onFinishTournament();
    await page.onFinishTournament();
    assert.equal(calls.length, 2);
    assert.equal(calls[0].name, 'finishTournament');
    assert.equal(calls[0].data.clientRequestId, calls[1].data.clientRequestId);
    assert.equal(calls[1].data.tournamentId, 't1');
    assert.equal(page.data.manualFinishBusy, false);
    assert.equal(refreshes, 1);
  } finally { global.wx = previousWx; cloud.call = previousCall; }
});

test('confirmation rejects changed ownership and simultaneous taps issue only one request', async () => {
  const previousWx = global.wx;
  const previousCall = cloud.call;
  const page = loadPage(); page.applyTournament(fixture());
  let resolveModal;
  let calls = 0;
  global.wx = { showModal(options) { resolveModal = options.success; }, showToast() {} };
  cloud.call = async () => { calls += 1; return { ok: true }; };
  try {
    const first = page.onFinishTournament();
    await page.onFinishTournament();
    page.openid = 'b';
    resolveModal({ confirm: true });
    await first;
    assert.equal(calls, 0);
    page.openid = 'owner';
    const next = page.onFinishTournament();
    await page.onFinishTournament();
    resolveModal({ confirm: true });
    await next;
    assert.equal(calls, 1);
  } finally { global.wx = previousWx; cloud.call = previousCall; }
});
