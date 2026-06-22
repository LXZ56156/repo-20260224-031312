const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const homePagePath = require.resolve('../miniprogram/pages/home/index.js');

function loadPageDefinition() {
  const originalPage = global.Page;
  let definition = null;
  global.Page = (options) => {
    definition = options;
  };
  delete require.cache[homePagePath];
  require(homePagePath);
  global.Page = originalPage;
  return definition;
}

function buildItems(count) {
  return Array.from({ length: count }, (_, index) => ({
    _id: `t_${index}`,
    name: `比赛${index}`,
    status: index % 2 ? 'finished' : 'running',
    updatedAtTs: count - index
  }));
}

test('home reveals sort and filter controls only when four tournaments need management', () => {
  const definition = loadPageDefinition();
  const originalGetApp = global.getApp;
  global.getApp = () => ({ globalData: { openid: 'u_1' } });
  const ctx = {
    data: { ...definition.data, items: buildItems(3), filterStatus: 'finished' },
    _rawDocsMap: {},
    setData(update) {
      this.data = { ...this.data, ...(update || {}) };
    },
    refreshVisibleState: definition.refreshVisibleState
  };

  try {
    ctx.refreshVisibleState();
    assert.equal(ctx.data.showListControls, false);
    assert.equal(ctx.data.filterStatus, 'all');
    assert.equal(ctx.data.visibleCount, 3);

    ctx.data.items = buildItems(4);
    ctx.refreshVisibleState();
    assert.equal(ctx.data.showListControls, true);
  } finally {
    global.getApp = originalGetApp;
    delete require.cache[homePagePath];
  }
});

test('home finished cards keep concise ranking and secondary clone actions', () => {
  const wxml = fs.readFileSync(path.join(__dirname, '..', 'miniprogram/pages/home/index.wxml'), 'utf8');

  assert.match(wxml, /wx:if="\{\{showListControls\}\}"/);
  assert.match(wxml, />查看排名<\/text>/);
  assert.match(wxml, />再办一场<\/text>/);
  assert.doesNotMatch(wxml, /最终排名已出炉|可生成战绩卡|复盘已准备好|查看战绩/);
  assert.doesNotMatch(wxml, /三步开赛|新手引导|guide-step/);
});
