const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const pages = [
  'lobby',
  'schedule',
  'ranking',
  'match',
  'analytics',
  'share-entry',
  'settings'
];

function readPageConfig(page) {
  const file = path.join(__dirname, '..', 'miniprogram', 'pages', page, 'index.json');
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

test('tournament secondary pages expose the native home button in page config', () => {
  for (const page of pages) {
    const config = readPageConfig(page);
    assert.equal(config.homeButton, true, `${page} should enable homeButton`);
  }
});
