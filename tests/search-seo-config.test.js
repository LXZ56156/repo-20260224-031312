const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(root, relativePath), 'utf8'));
}

test('search SEO static navigation titles match the approved map', () => {
  const app = readJson('miniprogram/app.json');
  assert.equal(app.window.navigationBarTitleText, '羽球轮转助手');

  const titleMap = {
    'miniprogram/pages/home/index.json': '羽球轮转助手',
    'miniprogram/pages/launch/index.json': '发起羽毛球比赛',
    'miniprogram/pages/create/index.json': '创建羽毛球比赛',
    'miniprogram/pages/lobby/index.json': '羽毛球赛事大厅',
    'miniprogram/pages/schedule/index.json': '羽毛球赛程对阵',
    'miniprogram/pages/ranking/index.json': '羽毛球赛事排名',
    'miniprogram/pages/match/index.json': '录入羽毛球比分',
    'miniprogram/pages/analytics/index.json': '羽毛球赛事排名',
    'miniprogram/pages/share-entry/index.json': '加入羽毛球比赛',
    'miniprogram/pages/settings/index.json': '比赛设置',
    'miniprogram/pages/preferences/index.json': '偏好设置',
    'miniprogram/pages/mine/index.json': '我的',
    'miniprogram/pages/profile/index.json': '个人资料',
    'miniprogram/pages/feedback/index.json': '意见反馈'
  };

  for (const [file, expectedTitle] of Object.entries(titleMap)) {
    assert.equal(readJson(file).navigationBarTitleText, expectedTitle, file);
  }
});

test('search SEO sitemap only allows high-value searchable pages', () => {
  const sitemap = readJson('miniprogram/sitemap.json');
  const rules = Array.isArray(sitemap.rules) ? sitemap.rules : [];
  const byPage = new Map(rules.map((rule) => [rule.page, rule]));

  for (const page of ['pages/home/index', 'pages/launch/index', 'pages/create/index']) {
    assert.equal(byPage.get(page).action, 'allow', page);
    assert.equal(byPage.get(page).params, undefined, page);
  }

  for (const page of ['pages/lobby/index', 'pages/schedule/index', 'pages/ranking/index', 'pages/share-entry/index', 'pages/analytics/index']) {
    assert.equal(byPage.get(page).action, 'allow', page);
    assert.deepEqual(byPage.get(page).params, ['tournamentId'], page);
    assert.equal(byPage.get(page).matching, 'inclusive', page);
  }

  assert.deepEqual(byPage.get('pages/match/index').params, ['tournamentId', 'matchIndex']);
  for (const page of ['pages/mine/index', 'pages/profile/index', 'pages/preferences/index', 'pages/settings/index', 'pages/feedback/index', '*']) {
    assert.equal(byPage.get(page).action, 'disallow', page);
  }
});
