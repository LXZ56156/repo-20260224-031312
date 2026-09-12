const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const read = (file) => fs.readFileSync(path.join(__dirname, '..', 'miniprogram', file), 'utf8');
function rule(source, selector) {
  return [...source.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}]+)\{([^{}]*)\}/g)]
    .filter(([, selectors]) => selectors.trim() === selector)
    .map(([, , declarations]) => declarations).join('\n');
}

test('profile gender choices retain a 44px touch target on narrow devices', () => {
  assert.match(rule(read('pages/profile/index.wxss'), '.gender-option'), /min-height:\s*44px\s*;/);
});

test('settings match shortcuts have their own wrapping layout and disabled treatment', () => {
  const source = read('pages/settings/index.wxss');
  const group = rule(source, '.quick-match-shortcuts');
  assert.match(group, /display:\s*flex\s*;/);
  assert.match(group, /flex-wrap:\s*wrap\s*;/);
  assert.match(group, /gap:\s*var\(--space-tight\)\s*;/);
  const item = rule(source, '.quick-match-shortcut');
  assert.match(item, /min-width:\s*0\s*;/);
  assert.match(item, /flex:\s*1 1 calc\(/);
  assert.match(rule(source, '.quick-match-shortcut.disabled'), /color:/);
  assert.match(rule(source, '.quick-match-shortcut.disabled:active'), /transform:\s*none\s*;/);
});

test('secondary share actions use the existing styled button variant', () => {
  for (const page of ['analytics', 'ranking', 'schedule']) {
    const source = read(`pages/${page}/index.wxml`);
    assert.doesNotMatch(source, /\bbtn-outline\b/, page);
    const handler = page === 'schedule' ? 'goSharePosterFromFinished' : 'onShareTimelineGuide';
    const action = source.match(new RegExp(`<button[^>]*bindtap="${handler}"[^>]*>`));
    assert.ok(action, page);
    assert.match(action[0], /\bbtn-secondary\b/, page);
  }
});

test('match and settings status pills center labels inside their height', () => {
  for (const [page, selector] of [['match', '.score-badge'], ['settings', '.status-pill']]) {
    const body = rule(read(`pages/${page}/index.wxss`), selector);
    assert.match(body, /display:\s*inline-flex\s*;/);
    assert.match(body, /align-items:\s*center\s*;/);
    assert.match(body, /justify-content:\s*center\s*;/);
  }
});

test('schedule hint colors use defined neutral tokens', () => {
  const source = read('pages/schedule/index.wxss');
  assert.doesNotMatch(source, /var\(--neutral-400\)/);
  assert.match(rule(source, '.selected-player-empty-hint'), /color:\s*var\(--neutral-500\)/);
});

test('ranking records wrap inside the shrinking left column', () => {
  const source = read('pages/ranking/index.wxss');
  assert.match(rule(source, '.ranking-left'), /min-width:\s*0\s*;/);
  const record = rule(source, '.ranking-record-line');
  assert.match(record, /white-space:\s*normal\s*;/);
  assert.match(record, /overflow-wrap:\s*break-word\s*;/);
  assert.match(rule(read('app.wxss'), '.flex-1'), /min-width:\s*0\s*;/);
  assert.match(read('pages/ranking/index.wxml'), /class="flex-1">\s*<view class="player-title ellipsis">/);
});
