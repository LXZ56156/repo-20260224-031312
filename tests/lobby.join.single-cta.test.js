const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('lobby showJoin path keeps only one join CTA trigger', () => {
  const wxml = fs.readFileSync(
    path.join(__dirname, '..', 'miniprogram/pages/lobby/index.wxml'),
    'utf8'
  );
  const legacyMatches = wxml.match(/bindtap="handleJoin"/g) || [];
  const submitProfileMatches = wxml.match(/bindtap="submitProfile"/g) || [];
  assert.equal(legacyMatches.length, 0);
  assert.equal(submitProfileMatches.length, 1);
});
