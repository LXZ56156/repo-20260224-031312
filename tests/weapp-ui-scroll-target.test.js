const test = require('node:test');
const assert = require('node:assert/strict');
const { scrollCaseIntoView, cases } = require('../scripts/dev/weapp-ui-screenshot');

function fixture({ top = 582, height = 300, count = 1, origin = 0 } = {}) {
  let scroll = origin;
  const calls = [];
  const miniProgram = {
    async pageScrollTo(value) { calls.push(value); scroll = value; },
    async systemInfo() { return { windowHeight: 671 }; },
  };
  const page = {
    async scrollTop() { return scroll; },
    async $$(selector) {
      assert.equal(selector, '.co-managers-panel');
      return Array.from({ length: count }, () => ({
        async offset() { return { top }; }, async size() { return { height }; },
      }));
    },
  };
  return { miniProgram, page, calls };
}

test('capture scroll shows the actual target card without invoking business actions', async () => {
  const f = fixture({ origin: 100 });
  const result = await scrollCaseIntoView(f.miniProgram, f.page, '.co-managers-panel');
  assert.deepEqual(f.calls, [0, 570]);
  assert.equal(result.actualScrollTop, 570);
  assert.equal(result.viewportTop, 12);
  assert.equal(result.ok, true);
  assert.equal(cases.lobbyCoManagerOwner.scrollToSelector, '.co-managers-panel');
  assert.equal(cases.lobbyCoManagerOwnerBusy.scrollToSelector, '.co-managers-panel');
  assert.equal(cases.lobbyCoManagerMember.scrollToSelector, '.co-managers-panel');
});

test('capture scroll fails closed for absent or ambiguous targets and invalid viewport geometry', async () => {
  for (const values of [{ count: 0 }, { count: 2 }, { top: NaN }, { height: 0 }, { height: 800 }]) {
    const f = fixture(values);
    await assert.rejects(scrollCaseIntoView(f.miniProgram, f.page, '.co-managers-panel'), /scroll selector|target geometry/);
    assert.deepEqual(f.calls, [0]);
  }
});

test('capture scroll rejects a failed transport or a target that never reaches its position', async () => {
  const f = fixture();
  f.miniProgram.pageScrollTo = async () => { throw new Error('scroll transport failed'); };
  await assert.rejects(scrollCaseIntoView(f.miniProgram, f.page, '.co-managers-panel'), /scroll transport failed/);
  const stuck = fixture();
  stuck.miniProgram.pageScrollTo = async () => {};
  await assert.rejects(scrollCaseIntoView(stuck.miniProgram, stuck.page, '.co-managers-panel', 15), /target not reached/);
  const invalidOrigin = fixture();
  invalidOrigin.page.scrollTop = async () => NaN;
  await assert.rejects(scrollCaseIntoView(invalidOrigin.miniProgram, invalidOrigin.page, '.co-managers-panel'), /origin not reached/);
});
