const test = require('node:test');
const assert = require('node:assert/strict');
const profileCore = require('../miniprogram/core/profile');
const pagePath = require.resolve('../miniprogram/pages/profile/index');

function loadPage(t) {
  const previousPage = global.Page;
  let definition;
  global.Page = (value) => { definition = value; };
  try { delete require.cache[pagePath]; require(pagePath); }
  finally { global.Page = previousPage; }
  t.after(() => { delete require.cache[pagePath]; });
  const ctx = { ...definition, data: { ...definition.data }, setData(patch) { Object.assign(this.data, patch); } };
  const oldRead = profileCore.readLocalProfile;
  const oldSync = profileCore.syncCloudProfile;
  profileCore.readLocalProfile = () => ({ nickName: '本地球友' });
  profileCore.syncCloudProfile = async () => ({ nickName: '云端球友' });
  ctx.applyProfile = (profile) => { ctx.data.nickname = profile.nickName; };
  t.after(() => { profileCore.readLocalProfile = oldRead; profileCore.syncCloudProfile = oldSync; });
  return ctx;
}

for (const returnUrl of ['%', '%E0%A4%A', '%FF']) {
  test('profile initialization survives malformed return URL ' + returnUrl, async (t) => {
    const ctx = loadPage(t);
    await ctx.onLoad({ returnUrl });
    assert.equal(ctx.data.returnUrl, '');
    assert.equal(ctx.data.nickname, '云端球友');
  });
}

test('profile keeps valid encoded return URLs and tournament IDs unchanged', async (t) => {
  const ctx = loadPage(t);
  const target = '/pages/lobby/index?tournamentId=' + encodeURIComponent('比赛/1');
  await ctx.onLoad({ returnUrl: encodeURIComponent(target) });
  assert.equal(ctx.data.returnUrl, target);
  assert.equal(ctx.parseTournamentIdFromReturnUrl(target), '比赛/1');
});

test('malformed nested tournament IDs do not interrupt the post-save path', (t) => {
  const ctx = loadPage(t);
  assert.equal(ctx.parseTournamentIdFromReturnUrl('/pages/lobby/index?tournamentId=%FF'), '');
});
