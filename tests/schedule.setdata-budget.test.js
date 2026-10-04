'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const benchmark = require('../scripts/benchmark-tournament-views');
const auth = require('../miniprogram/core/auth');
const shareMeta = require('../miniprogram/core/shareMeta');
const tournamentSync = require('../miniprogram/core/tournamentSync');
const LIMIT = 1024 * 1024;
const copy = (value) => JSON.parse(JSON.stringify(value));

function context(t, doc, { deferCallbacks = false } = {}) {
  const runtime = benchmark.createRuntime();
  t.after(() => runtime.restore());
  global.getApp = () => ({ globalData: { openid: doc.creatorId, _avatarCache: {} } });
  const patches = [];
  const callbacks = [];
  const page = { ...runtime.pages.schedule, data: copy(runtime.pages.schedule.data), openid: doc.creatorId,
    setData(patch, callback) {
      patches.push(copy(patch));
      for (const [key, value] of Object.entries(patch)) {
        const match = /^roundsUi\[(\d+)\]$/.exec(key);
        if (match) this.data.roundsUi[Number(match[1])] = value;
        else this.data[key] = value;
      }
      if (callback) {
        if (deferCallbacks) callbacks.push(callback);
        else callback.call(this);
      }
    }
  };
  page.data.tournamentId = doc._id;
  return { page, patches, callbacks };
}

function largeDoc(longNames = false) {
  const doc = benchmark.buildFixtures()[2].tournament;
  if (longNames) {
    doc.players.forEach((player, index) => { player.name = '球'.repeat(19) + String.fromCharCode(0x4e00 + index); });
    doc.rounds.forEach((round) => round.matches.forEach((match) => {
      if (match.scorerName) match.scorerName = doc.players[0].name;
    }));
    assert.ok(doc.players.every((player) => player.name.length === 20));
  }
  return doc;
}

test('schedule legal 24-player 660-match views including 20-character imported names stay under each setData limit', (t) => {
  const { page, patches } = context(t, largeDoc());
  for (const longNames of [false, true]) {
    const doc = largeDoc(longNames);
    patches.length = 0;
    page.applyTournament(doc);
    for (const patch of patches) {
      assert.ok(Buffer.byteLength(JSON.stringify(patch), 'utf8') < LIMIT,
        `setData exceeds 1024kB (${longNames ? '20-char names' : 'baseline'})`);
    }
    assert.equal(page.data.roundsUi.flatMap((round) => round.matchesUi).length, 660);
    assert.equal(page._latestTournament.rounds.flatMap((round) => round.matches).length, 660);
    assert.deepEqual(page.data.tournament, { name: doc.name });
    assert.equal(page.data.canEditScore, true);
  }
});

test('schedule batched refresh clears an old longer array and only latest render callback focuses', (t) => {
  const doc = largeDoc(true);
  const { page, patches, callbacks } = context(t, doc, { deferCallbacks: true });
  const focus = [];
  const avatars = [];
  page.scheduleCurrentRoundFocus = (_firstPending, rounds) => focus.push(rounds);
  page.refreshAvatarDisplays = () => avatars.push(page._latestTournament);
  page.applyTournament(doc);
  assert.ok(patches.some((patch) => Object.keys(patch).some((key) => key.startsWith('roundsUi['))));
  assert.equal(focus.length, 0);
  const short = { ...copy(doc), version: 2, rounds: doc.rounds.slice(0, 2), totalMatches: 12, scheduledMatches: 12 };
  page.applyTournament(short);
  callbacks.splice(0).forEach((callback) => callback.call(page));
  assert.equal(page.data.roundsUi.length, 2);
  assert.equal(page.data.roundsUi.flatMap((round) => round.matchesUi).length, 12);
  assert.equal(focus.length, 1);
  assert.equal(avatars.length, 1);
  assert.equal(avatars[0].version, 2);
  page.data.selectedPlayerIds = [doc.players[0].id];
  page.reapplyTournament();
  callbacks.splice(0).forEach((callback) => callback.call(page));
  assert.ok(page.data.roundsUi.flatMap((round) => round.matchesUi).every((match) => match.playerIds.includes(doc.players[0].id)));
  assert.equal(page._latestTournament.rounds.length, 2);
  assert.ok(patches.every((patch) => Buffer.byteLength(JSON.stringify(patch), 'utf8') < LIMIT));
});

test('schedule identity, avatar reapply and sharing retain the full authoritative document', async (t) => {
  const doc = largeDoc();
  const { page } = context(t, doc);
  page.openid = '';
  page.applyTournament(doc);
  assert.equal(page.data.canEditScore, false);
  t.mock.method(auth, 'login', async () => doc.creatorId);
  await page.primeViewerIdentity();
  assert.equal(page.data.canEditScore, true);
  const refreshed = { ...copy(doc), version: 2, name: '刷新后的匿名比赛', updatedAt: '2026-10-03T00:00:00.000Z' };
  t.mock.method(tournamentSync, 'fetchTournament', async () => ({ ok: true, doc: refreshed }));
  await page.fetchTournament(doc._id);
  assert.equal(page._latestTournament.version, 2);
  assert.deepEqual(page.data.tournament, { name: refreshed.name });
  let shared;
  const realShare = shareMeta.buildShareMessage;
  t.mock.method(shareMeta, 'buildShareMessage', (value) => { shared = value; return realShare(value); });
  const message = page.onShareAppMessage();
  assert.equal(shared.rounds.length, 110);
  assert.equal(shared.players.length, 24);
  assert.equal(shared.version, 2);
  assert.equal(message.path, realShare(doc).path);
  page.onAvatarImageError({ currentTarget: { dataset: { avatarRaw: 'cloud://fixture-avatar' } } });
  assert.equal(page.data.roundsUi.flatMap((round) => round.matchesUi).length, 660);
});

test('schedule missing or hidden page cannot finish an old render callback or revive its source', async (t) => {
  const doc = largeDoc(true);
  const { page, callbacks, patches } = context(t, doc, { deferCallbacks: true });
  let focus = 0;
  page.scheduleCurrentRoundFocus = () => { focus += 1; };
  page.applyTournament(doc);
  t.mock.method(tournamentSync, 'fetchTournament', async () => ({ ok: false, errorType: 'not_found' }));
  await page.fetchTournament(doc._id);
  assert.equal(page._latestTournament, null);
  assert.equal(page.data.tournament, null);
  callbacks.splice(0).forEach((callback) => callback.call(page));
  const count = patches.length;
  page.reapplyTournament();
  assert.equal(patches.length, count);
  assert.equal(focus, 0);
  page.applyTournament(doc);
  page.onHide();
  callbacks.splice(0).forEach((callback) => callback.call(page));
  assert.equal(focus, 0);
});
