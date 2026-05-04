const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

function read(relPath) {
  return fs.readFileSync(path.join(__dirname, '..', relPath), 'utf8');
}

function getCssRuleBody(source, selector) {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = source.match(new RegExp(`${escapedSelector}\\s*\\{([\\s\\S]*?)\\}`));
  return match ? match[1] : '';
}

test('global button primitives stay inside flex and card containers', () => {
  const appWxss = read('miniprogram/app.wxss');
  const buttonRule = getCssRuleBody(appWxss, '.btn');
  const buttonRowRule = getCssRuleBody(appWxss, '.btn-row');
  const rowButtonRule = getCssRuleBody(appWxss, '.btn-row .btn');
  const inlineRule = getCssRuleBody(appWxss, '.btn-inline');
  const miniRule = getCssRuleBody(appWxss, '.btn-mini');
  const profileMiniRule = getCssRuleBody(appWxss, '.profile-actions .btn-mini');

  assert.match(buttonRule, /max-width:\s*100%/);
  assert.match(buttonRule, /min-width:\s*0/);
  assert.match(buttonRule, /box-sizing:\s*border-box/);
  assert.match(buttonRule, /margin-left:\s*0/);
  assert.match(buttonRule, /margin-right:\s*0/);
  assert.match(buttonRule, /text-overflow:\s*ellipsis/);

  assert.match(buttonRowRule, /width:\s*100%/);
  assert.match(buttonRowRule, /min-width:\s*0/);
  assert.match(rowButtonRule, /width:\s*0/);
  assert.match(rowButtonRule, /min-width:\s*0/);
  assert.match(rowButtonRule, /flex:\s*1/);

  assert.match(inlineRule, /max-width:\s*100%/);
  assert.match(inlineRule, /min-width:\s*0/);
  assert.match(inlineRule, /box-sizing:\s*border-box/);
  assert.match(inlineRule, /overflow:\s*hidden/);

  assert.match(miniRule, /max-width:\s*100%/);
  assert.match(miniRule, /min-width:\s*0/);
  assert.match(miniRule, /box-sizing:\s*border-box/);
  assert.match(miniRule, /margin-left:\s*0/);
  assert.match(miniRule, /margin-right:\s*0/);
  assert.match(miniRule, /white-space:\s*nowrap/);

  assert.match(profileMiniRule, /flex:\s*1/);
  assert.match(profileMiniRule, /min-width:\s*0/);
});

test('page-level horizontal action groups give buttons compressible widths', () => {
  const lobbyWxss = read('miniprogram/pages/lobby/index.wxss');
  const scheduleWxss = read('miniprogram/pages/schedule/index.wxss');
  const homeWxss = read('miniprogram/pages/home/index.wxss');

  const adminActionsRule = getCssRuleBody(lobbyWxss, '.admin-manage-actions');
  const adminButtonRule = getCssRuleBody(lobbyWxss, '.admin-manage-actions .btn');
  const filterActionsRule = getCssRuleBody(scheduleWxss, '.filter-sheet-actions');
  const filterButtonRule = getCssRuleBody(scheduleWxss, '.filter-sheet-actions .btn');
  const profileNudgeRule = getCssRuleBody(homeWxss, '.profile-nudge-actions');
  const profileNudgeButtonRule = getCssRuleBody(homeWxss, '.profile-nudge-actions .btn');
  const profileNudgeLaterRule = getCssRuleBody(homeWxss, '.profile-nudge-later');

  assert.match(adminActionsRule, /min-width:\s*0/);
  assert.match(adminButtonRule, /width:\s*0/);
  assert.match(adminButtonRule, /min-width:\s*0/);

  assert.match(filterActionsRule, /min-width:\s*0/);
  assert.match(filterButtonRule, /width:\s*0/);
  assert.match(filterButtonRule, /min-width:\s*0/);

  assert.match(profileNudgeRule, /min-width:\s*0/);
  assert.match(profileNudgeButtonRule, /width:\s*0/);
  assert.match(profileNudgeButtonRule, /min-width:\s*0/);
  assert.match(profileNudgeLaterRule, /flex:\s*none/);
});
