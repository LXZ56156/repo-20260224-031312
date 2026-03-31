const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const appJsonPath = path.join(__dirname, '..', 'miniprogram', 'app.json');
const assetsRoot = path.join(__dirname, '..', 'miniprogram');

test('tabBar items declare icon assets for normal and active states', () => {
  const appJson = JSON.parse(fs.readFileSync(appJsonPath, 'utf8'));
  const list = (((appJson || {}).tabBar || {}).list) || [];

  assert.equal(list.length, 3);

  list.forEach((item) => {
    assert.match(String(item.iconPath || ''), /^assets\/tab-(home|launch|mine)\.png$/);
    assert.match(String(item.selectedIconPath || ''), /^assets\/tab-(home|launch|mine)-active\.png$/);
    assert.equal(fs.existsSync(path.join(assetsRoot, item.iconPath)), true, `${item.iconPath} should exist`);
    assert.equal(fs.existsSync(path.join(assetsRoot, item.selectedIconPath)), true, `${item.selectedIconPath} should exist`);
  });
});
