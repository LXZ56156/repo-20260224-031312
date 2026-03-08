const test = require('node:test');
const assert = require('node:assert/strict');

const actionGuard = require('../miniprogram/core/actionGuard');

test('actionGuard.run deduplicates concurrent actions with the same key', async () => {
  actionGuard.clear('test:dedupe');
  let callCount = 0;
  let release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });

  const first = actionGuard.run('test:dedupe', async () => {
    callCount += 1;
    await gate;
    return 'done';
  });
  const second = actionGuard.run('test:dedupe', async () => {
    callCount += 1;
    return 'unexpected';
  });

  assert.equal(actionGuard.isBusy('test:dedupe'), true);
  assert.equal(callCount, 1);

  release();
  const results = await Promise.all([first, second]);

  assert.deepEqual(results, ['done', 'done']);
  assert.equal(callCount, 1);
  assert.equal(actionGuard.isBusy('test:dedupe'), false);
});

test('actionGuard.runWithPageBusy syncs page busy field during action lifecycle', async () => {
  actionGuard.clear('test:page-busy');
  const states = [];
  const ctx = {
    setData(patch) {
      states.push(patch.busy);
    }
  };

  await actionGuard.runWithPageBusy(ctx, 'busy', 'test:page-busy', async () => {
    assert.equal(actionGuard.isBusy('test:page-busy'), true);
  });

  assert.deepEqual(states, [true, false]);
});
