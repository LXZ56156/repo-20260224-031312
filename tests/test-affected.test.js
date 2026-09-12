const test = require('node:test');
const assert = require('node:assert/strict');
const { selectChecks } = require('../scripts/test-affected');
test('affected checks leave docs cheap and expand shared code and cloud templates', () => {
  const tests = ['tests/weapp-ui-screenshot-tool.test.js', 'tests/cloud.test.js', 'tests/home.test.js'];
  assert.deepEqual(selectChecks(['docs/tasks/current.md'], tests).tests, []);
  assert.deepEqual(selectChecks(['scripts/dev/weapp-ui-screenshot.js'], tests).tests, [tests[0]]);
  assert.equal(selectChecks(['scripts/cloud-common.template.js'], tests).cloudCommon, true);
  assert.equal(selectChecks(['miniprogram/core/cloud.js'], tests).full, true);
});

test('unknown areas cannot borrow generic smoke or sync coverage', () => {
  const tests = ['tests/home.test.js', 'tests/smoke.score.test.js', 'tests/page-sync.contract.test.js'];
  const plan = selectChecks(['miniprogram/pages/uncovered/index.js'], tests);
  assert.equal(plan.full, true);
  assert.deepEqual(plan.uncoveredAreas, ['uncovered']);
  assert.deepEqual(plan.tests, tests);
});

test('known page styles select direct coverage without unrelated behavioral neighbors', () => {
  const tests = ['tests/home.test.js', 'tests/smoke.score.test.js', 'tests/page-sync.contract.test.js'];
  assert.deepEqual(selectChecks(['miniprogram/pages/home/index.wxss'], tests).tests, [tests[0]]);
  assert.equal(selectChecks(['miniprogram/pages/home/index.js'], tests).tests.length, 3);
});
