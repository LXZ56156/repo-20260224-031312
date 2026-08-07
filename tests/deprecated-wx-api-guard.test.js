const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const script = fs.readFileSync(
  path.resolve(__dirname, '../scripts/check-deprecated-wx-api.sh'),
  'utf8'
);

test('deprecated wx API guard excludes generated third-party miniprogram packages', () => {
  assert.match(script, /-g\s+'!miniprogram\/miniprogram_npm\/\*\*'/);
});
