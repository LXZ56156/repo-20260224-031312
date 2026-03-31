const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const analyticsPagePath = require.resolve('../miniprogram/pages/analytics/index.js');

function loadAnalyticsPageDefinition() {
  const originalPage = global.Page;
  let definition = null;
  global.Page = (options) => {
    definition = options;
  };
  delete require.cache[analyticsPagePath];
  require(analyticsPagePath);
  global.Page = originalPage;
  return definition;
}

function createAnalyticsContext(definition) {
  const ctx = {
    data: JSON.parse(JSON.stringify(definition.data || {})),
    setData(update) {
      this.data = { ...this.data, ...(update || {}) };
    }
  };
  for (const [key, value] of Object.entries(definition || {})) {
    if (typeof value === 'function') ctx[key] = value;
  }
  return ctx;
}

test('analytics page prunes cross-page hero links and keeps clone as the primary CTA', () => {
  const wxml = fs.readFileSync(
    path.join(__dirname, '..', 'miniprogram/pages/analytics/index.wxml'),
    'utf8'
  );

  assert.doesNotMatch(wxml, /bindtap="goMatch"/);
  assert.doesNotMatch(wxml, /bindtap="goRanking"/);
  assert.doesNotMatch(wxml, /bindtap="goSchedule"/);
  assert.doesNotMatch(wxml, /analytics-hero-link/);
  assert.match(wxml, /class="btn btn-primary btn-sm analytics-hero-primary" bindtap="cloneCurrentTournament"/);
  assert.match(wxml, /bindtap="copyBriefReport"/);
  assert.match(wxml, /bindtap="copyBattleReport"/);
  assert.match(wxml, /analytics-copy-actions/);
});

test('analytics copy actions keep using clipboard handlers', () => {
  const definition = loadAnalyticsPageDefinition();
  const ctx = createAnalyticsContext(definition);
  const originalWx = global.wx;
  const clipboardCalls = [];
  const toastCalls = [];

  global.wx = {
    setClipboardData(options) {
      clipboardCalls.push(String(options && options.data || ''));
      if (options && typeof options.success === 'function') options.success();
    },
    showToast(options) {
      toastCalls.push({
        title: String(options && options.title || ''),
        icon: String(options && options.icon || '')
      });
    }
  };

  try {
    ctx.data.reportBriefText = '摘要文本';
    ctx.data.reportShareText = '完整战报';

    ctx.copyBriefReport();
    ctx.copyBattleReport();

    assert.deepEqual(clipboardCalls, ['摘要文本', '完整战报']);
    assert.deepEqual(toastCalls, [
      { title: '摘要已复制', icon: 'success' },
      { title: '战报已复制', icon: 'success' }
    ]);
  } finally {
    global.wx = originalWx;
    delete require.cache[analyticsPagePath];
  }
});
