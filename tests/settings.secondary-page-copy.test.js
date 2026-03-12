const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('settings page is framed as a secondary advanced page instead of prep dashboard', () => {
  const wxml = fs.readFileSync(
    path.join(__dirname, '..', 'miniprogram/pages/settings/index.wxml'),
    'utf8'
  );

  assert.match(wxml, /\{\{pageTitle\}\}/);
  assert.match(wxml, /回到大厅继续准备/);
  assert.doesNotMatch(wxml, /开赛准备/);
  assert.doesNotMatch(wxml, /\{\{pageSubtitle\}\}/);
  assert.doesNotMatch(wxml, /\{\{contextBody\}\}/);
});
