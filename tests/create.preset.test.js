const test = require('node:test');
const assert = require('node:assert/strict');

const flow = require('../miniprogram/core/uxFlow');

test('normalizePresetKey falls back to standard on invalid input', () => {
  assert.equal(flow.normalizePresetKey('foo'), 'standard');
  assert.equal(flow.normalizePresetKey('STANDARD'), 'standard');
  assert.equal(flow.normalizePresetKey('intense'), 'intense');
});

test('resolveCreateSettings uses standard defaults', () => {
  const out = flow.resolveCreateSettings({ presetKey: 'standard' });
  assert.equal(out.presetKey, 'standard');
  assert.equal(out.totalMatches, 8);
  assert.equal(out.courts, 2);
  assert.equal(out.settingsConfigured, true);
});

test('resolveCreateSettings accepts custom numeric values and clamps courts', () => {
  const out = flow.resolveCreateSettings({
    presetKey: 'custom',
    totalMatches: '17.8',
    courts: '23'
  });
  assert.equal(out.totalMatches, 17);
  assert.equal(out.courts, 10);
  assert.equal(out.settingsConfigured, true);
});

test('parsePositiveInt returns fallback for invalid values', () => {
  assert.equal(flow.parsePositiveInt('', 3), 3);
  assert.equal(flow.parsePositiveInt('0', 4), 4);
  assert.equal(flow.parsePositiveInt('-2', 5), 5);
  assert.equal(flow.parsePositiveInt('7.9', 1), 7);
});
