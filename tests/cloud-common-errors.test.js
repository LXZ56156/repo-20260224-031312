const test = require('node:test');
const assert = require('node:assert/strict');
const common = require('../scripts/cloud-common.template');

test('document read errors require explicit missing-document evidence', () => {
  assert.equal(common.isDocNotExists(new Error('document.get:fail requested document does not exist')), true);
  assert.equal(common.isDocNotExists({ errMsg: 'document.get:fail document not found' }), true);
  for (const message of ['document.get:fail request timeout', 'document.get:fail permission denied', 'document.get:fail network error']) {
    assert.equal(common.isDocNotExists(new Error(message)), false, message);
  }
});
