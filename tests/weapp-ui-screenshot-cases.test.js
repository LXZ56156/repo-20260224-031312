const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { validateHorizontalAlignment } = require('../scripts/dev/weapp-screenshot-layout');

const screenshotScript = fs.readFileSync(
  path.join(__dirname, '..', 'scripts/dev/weapp-ui-screenshot.js'),
  'utf8'
);

test('DevTools screenshot workflow includes the launch CTA alignment case', () => {
  assert.match(screenshotScript, /launch:\s*\{[\s\S]*?path:\s*'\/pages\/launch\/index'/);
  assert.match(screenshotScript, /launch:\s*\{[\s\S]*?route:\s*'switchTab'/);
  assert.match(
    screenshotScript,
    /launch:\s*\{[\s\S]*?selectors:\s*\['\.launch-water-card',\s*'\.launch-water-btn',\s*'\.launch-card\.is-default \.launch-btn'\]/
  );
  assert.match(
    screenshotScript,
    /launch:\s*\{[\s\S]*?horizontalAlignment:\s*\{[\s\S]*?selectors:\s*\['\.launch-water-btn',\s*'\.launch-card\.is-default \.launch-btn'\][\s\S]*?tolerance:\s*1/
  );
});

test('horizontal screenshot validator accepts matching CTA geometry', () => {
  const result = validateHorizontalAlignment([
    { selector: '.launch-water-btn', index: 0, size: { width: 184 }, offset: { left: 136.1 } },
    { selector: '.launch-card.is-default .launch-btn', index: 0, size: { width: 184 }, offset: { left: 136.1 } },
  ], {
    selectors: ['.launch-water-btn', '.launch-card.is-default .launch-btn'],
    tolerance: 1,
  });

  assert.equal(result.ok, true);
  assert.equal(result.leftDelta, 0);
  assert.equal(result.widthDelta, 0);
});

test('horizontal screenshot validator rejects drift and missing selectors', () => {
  const selectors = ['.launch-water-btn', '.launch-card.is-default .launch-btn'];
  const drifted = validateHorizontalAlignment([
    { selector: selectors[0], index: 0, size: { width: 184 }, offset: { left: 105.1 } },
    { selector: selectors[1], index: 0, size: { width: 184 }, offset: { left: 136.1 } },
  ], { selectors, tolerance: 1 });
  const missing = validateHorizontalAlignment([
    { selector: selectors[0], index: 0, size: { width: 184 }, offset: { left: 136.1 } },
  ], { selectors, tolerance: 1 });

  assert.equal(drifted.ok, false);
  assert.equal(drifted.leftDelta, 31);
  assert.equal(missing.ok, false);
  assert.match(missing.reason, /exactly one element/);
});
