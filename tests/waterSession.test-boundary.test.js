const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const productionTests = [
  'tests/waterSession.ui-copy.test.js',
  'tests/waterSession.v2-page.test.js',
];

test('water production tests do not depend on dev screenshot tooling', () => {
  const devScreenshotPath = ['scripts', 'dev'].join('/');

  productionTests.forEach((file) => {
    const source = fs.readFileSync(path.join(root, file), 'utf8').replaceAll('\\', '/');
    assert.doesNotMatch(source, new RegExp(devScreenshotPath), `${file} must stay production-only`);
  });
});
