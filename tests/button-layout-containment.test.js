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
  const primaryRule = getCssRuleBody(appWxss, '.btn-primary');
  const dangerRule = getCssRuleBody(appWxss, '.btn-danger');
  const disabledRule = getCssRuleBody(appWxss, '.btn[disabled]');
  const buttonRowRule = getCssRuleBody(appWxss, '.btn-row');
  const rowButtonRule = getCssRuleBody(appWxss, '.btn-row .btn');
  const inlineRule = getCssRuleBody(appWxss, '.btn-inline');
  const smallRule = getCssRuleBody(appWxss, '.btn-sm');
  const miniRule = getCssRuleBody(appWxss, '.btn-mini');
  const miniPrimaryRule = getCssRuleBody(appWxss, '.btn-mini.primary');
  const chipRule = getCssRuleBody(appWxss, '.chip');
  const inputRule = getCssRuleBody(appWxss, '.input');
  const profileMiniRule = getCssRuleBody(appWxss, '.profile-actions .btn-mini');
  const activeNavRule = getCssRuleBody(appWxss, '.match-primary-nav-item.active');

  assert.match(buttonRule, /max-width:\s*100%/);
  assert.match(buttonRule, /min-width:\s*0/);
  assert.match(buttonRule, /box-sizing:\s*border-box/);
  assert.match(buttonRule, /margin-left:\s*0/);
  assert.match(buttonRule, /margin-right:\s*0/);
  assert.match(buttonRule, /text-overflow:\s*ellipsis/);
  assert.match(buttonRule, /height:\s*44px/);
  assert.match(buttonRule, /min-height:\s*44px/);
  assert.match(buttonRule, /line-height:\s*44px/);
  assert.match(primaryRule, /background:\s*var\(--brand-700\)/);
  assert.match(dangerRule, /background:\s*var\(--danger\)/);
  assert.match(disabledRule, /color:\s*var\(--neutral-700\)\s*!important/);

  assert.match(buttonRowRule, /width:\s*100%/);
  assert.match(buttonRowRule, /min-width:\s*0/);
  assert.match(rowButtonRule, /width:\s*0/);
  assert.match(rowButtonRule, /min-width:\s*0/);
  assert.match(rowButtonRule, /flex:\s*1/);

  assert.match(inlineRule, /max-width:\s*100%/);
  assert.match(inlineRule, /min-width:\s*0/);
  assert.match(inlineRule, /box-sizing:\s*border-box/);
  assert.match(inlineRule, /overflow:\s*hidden/);

  assert.match(smallRule, /min-height:\s*44px/);
  assert.match(smallRule, /line-height:\s*44px/);

  assert.match(miniRule, /max-width:\s*100%/);
  assert.match(miniRule, /min-width:\s*0/);
  assert.match(miniRule, /box-sizing:\s*border-box/);
  assert.match(miniRule, /margin-left:\s*0/);
  assert.match(miniRule, /margin-right:\s*0/);
  assert.match(miniRule, /white-space:\s*nowrap/);
  assert.match(miniRule, /min-height:\s*44px/);
  assert.match(miniPrimaryRule, /background:\s*var\(--brand-700\)/);

  assert.match(chipRule, /max-width:\s*100%/);
  assert.match(chipRule, /min-width:\s*44px/);
  assert.match(chipRule, /box-sizing:\s*border-box/);
  assert.match(chipRule, /overflow:\s*hidden/);
  assert.match(chipRule, /text-overflow:\s*ellipsis/);
  assert.match(chipRule, /white-space:\s*nowrap/);
  assert.match(chipRule, /min-height:\s*44px/);
  assert.match(inputRule, /min-height:\s*44px/);

  assert.match(profileMiniRule, /flex:\s*1/);
  assert.match(profileMiniRule, /min-width:\s*0/);
  assert.match(activeNavRule, /background:\s*var\(--brand-700\)/);
});

test('avatar and ranking labels keep accessible foreground contrast', () => {
  const appWxss = read('miniprogram/app.wxss');

  assert.match(getCssRuleBody(appWxss, '.pcolor-0'), /background:\s*var\(--brand-700\)/);
  assert.match(getCssRuleBody(appWxss, '.pcolor-1'), /background:\s*#0369A1/);
  assert.match(getCssRuleBody(appWxss, '.pcolor-2'), /background:\s*#A16207/);
  assert.match(getCssRuleBody(appWxss, '.pcolor-3'), /background:\s*#6D28D9/);
  assert.match(getCssRuleBody(appWxss, '.pcolor-4'), /background:\s*#B91C1C/);
  assert.match(getCssRuleBody(appWxss, '.pcolor-5'), /background:\s*#0F766E/);
  assert.match(getCssRuleBody(appWxss, '.rank-badge'), /background:\s*var\(--brand-700\)/);
  assert.match(getCssRuleBody(appWxss, '.rank-badge.rank-1'), /color:\s*var\(--neutral-950\)/);
  assert.match(getCssRuleBody(appWxss, '.rank-badge.rank-2'), /color:\s*var\(--neutral-950\)/);
  assert.match(getCssRuleBody(appWxss, '.rank-badge.rank-3'), /color:\s*var\(--neutral-950\)/);
});

test('page-level horizontal action groups give buttons compressible widths', () => {
  const lobbyWxss = read('miniprogram/pages/lobby/index.wxss');
  const scheduleWxss = read('miniprogram/pages/schedule/index.wxss');
  const homeWxss = read('miniprogram/pages/home/index.wxss');

  const adminActionsRule = getCssRuleBody(lobbyWxss, '.admin-manage-actions');
  const adminButtonRule = getCssRuleBody(lobbyWxss, '.admin-manage-actions .btn');
  const adminCancelRule = getCssRuleBody(lobbyWxss, '.admin-manage-actions .admin-cancel-btn');
  const filterActionsRule = getCssRuleBody(scheduleWxss, '.filter-sheet-actions');
  const filterButtonRule = getCssRuleBody(scheduleWxss, '.filter-sheet-actions .btn');
  const profileNudgeRule = getCssRuleBody(homeWxss, '.profile-nudge-actions');
  const profileNudgeButtonRule = getCssRuleBody(homeWxss, '.profile-nudge-actions .btn');
  const profileNudgeLaterRule = getCssRuleBody(homeWxss, '.profile-nudge-later');
  const lobbyLinkRule = getCssRuleBody(lobbyWxss, '.link-btn');
  const adminCollapseRule = getCssRuleBody(lobbyWxss, '.admin-collapse-head');
  const customMatchHeadRule = getCssRuleBody(lobbyWxss, '.quick-custom-match-head');
  const customMatchValueRule = getCssRuleBody(lobbyWxss, '.quick-custom-match-value');
  const quickConfigPickerRule = getCssRuleBody(lobbyWxss, '.quick-config-picker');
  const lobbySheetHandleRule = getCssRuleBody(lobbyWxss, '.sheet-handle');
  const fixedTeamHeadActionRule = getCssRuleBody(lobbyWxss, '.fixed-team-head .btn-mini');
  const fixedTeamDeleteRule = getCssRuleBody(lobbyWxss, '.fixed-team-delete');

  assert.match(adminActionsRule, /min-width:\s*0/);
  assert.match(adminActionsRule, /justify-content:\s*flex-end/);
  assert.match(adminButtonRule, /width:\s*0/);
  assert.match(adminButtonRule, /min-width:\s*0/);
  assert.match(adminCancelRule, /width:\s*auto/);
  assert.match(adminCancelRule, /min-width:\s*44px/);
  assert.match(adminCancelRule, /background:\s*#fff\s*!important/i);
  assert.match(adminCancelRule, /color:\s*var\(--danger\)\s*!important/);

  assert.match(filterActionsRule, /min-width:\s*0/);
  assert.match(filterButtonRule, /width:\s*0/);
  assert.match(filterButtonRule, /min-width:\s*0/);

  assert.match(profileNudgeRule, /min-width:\s*0/);
  assert.match(profileNudgeButtonRule, /width:\s*0/);
  assert.match(profileNudgeButtonRule, /min-width:\s*0/);
  assert.match(profileNudgeLaterRule, /flex:\s*none/);
  assert.match(profileNudgeLaterRule, /min-width:\s*44px/);
  assert.match(lobbyLinkRule, /min-width:\s*44px/);
  assert.match(lobbyLinkRule, /min-height:\s*44px/);
  assert.match(adminCollapseRule, /min-height:\s*44px/);
  assert.match(customMatchHeadRule, /min-height:\s*44px/);
  assert.match(customMatchValueRule, /height:\s*44px/);
  assert.match(customMatchValueRule, /line-height:\s*44px/);
  assert.match(quickConfigPickerRule, /min-height:\s*44px/);
  assert.match(quickConfigPickerRule, /line-height:\s*44px/);
  assert.match(lobbySheetHandleRule, /width:\s*44px/);
  assert.match(lobbySheetHandleRule, /height:\s*44px/);
  assert.match(fixedTeamHeadActionRule, /width:\s*96px\s*!important/);
  assert.match(fixedTeamHeadActionRule, /min-width:\s*44px/);
  assert.match(fixedTeamHeadActionRule, /flex:\s*0\s+0\s+auto/);
  assert.match(fixedTeamDeleteRule, /width:\s*64px\s*!important/);
  assert.match(fixedTeamDeleteRule, /min-width:\s*44px/);
  assert.match(fixedTeamDeleteRule, /flex:\s*0\s+0\s+auto/);
});
