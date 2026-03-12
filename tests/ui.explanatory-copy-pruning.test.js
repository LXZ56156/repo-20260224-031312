const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

function readWxml(relativePath) {
  return fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf8');
}

test('primary pages no longer carry explanatory helper copy blocks', () => {
  const home = readWxml('miniprogram/pages/home/index.wxml');
  const lobby = readWxml('miniprogram/pages/lobby/index.wxml');
  const shareEntry = readWxml('miniprogram/pages/share-entry/index.wxml');
  const settings = readWxml('miniprogram/pages/settings/index.wxml');
  const create = readWxml('miniprogram/pages/create/index.wxml');
  const launch = readWxml('miniprogram/pages/launch/index.wxml');
  const schedule = readWxml('miniprogram/pages/schedule/index.wxml');
  const match = readWxml('miniprogram/pages/match/index.wxml');
  const profile = readWxml('miniprogram/pages/profile/index.wxml');
  const analytics = readWxml('miniprogram/pages/analytics/index.wxml');

  assert.doesNotMatch(home, /先继续正在进行中的，再处理草稿和结果/);
  assert.doesNotMatch(home, /昵称和性别完整后/);
  assert.doesNotMatch(home, /onboarding-tip/);

  assert.doesNotMatch(lobby, /state-panel-detail/);
  assert.doesNotMatch(lobby, /shareCardHint/);
  assert.doesNotMatch(lobby, /shareCardDetailText/);
  assert.doesNotMatch(lobby, /规则说明/);

  assert.doesNotMatch(shareEntry, /share-subtitle/);
  assert.doesNotMatch(shareEntry, /share-note/);
  assert.doesNotMatch(shareEntry, /小队转需要先选 A\/B 队/);

  assert.doesNotMatch(settings, /\{\{pageSubtitle\}\}/);
  assert.doesNotMatch(settings, /\{\{contextBody\}\}/);
  assert.doesNotMatch(settings, /section-tip/);

  assert.doesNotMatch(create, /\{\{modeIntro\}\}/);
  assert.doesNotMatch(create, /create-tip/);

  assert.doesNotMatch(launch, /选择玩法后填写赛事名称和参数即可开始/);

  assert.doesNotMatch(schedule, /这里会出现每一轮对阵和录分状态/);

  assert.doesNotMatch(match, /batch-note/);
  assert.doesNotMatch(match, /滚轮录分/);
  assert.doesNotMatch(match, /左侧得分/);
  assert.doesNotMatch(match, /右侧得分/);

  assert.doesNotMatch(profile, /用于自动加入比赛与生成赛程/);
  assert.doesNotMatch(profile, /quick-fill-tip/);

  assert.doesNotMatch(analytics, /analytics-hero-subline/);
});
