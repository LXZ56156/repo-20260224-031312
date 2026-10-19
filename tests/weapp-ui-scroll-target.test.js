const test = require('node:test');
const assert = require('node:assert/strict');
const { scrollCaseIntoView, cases } = require('../scripts/dev/weapp-ui-screenshot');

function fixture({ top = 582, height = 300, count = 1, origin = 0, documentHeight = 2000,
  nativeTop, nativeHeight = height } = {}) {
  let scroll = origin;
  const calls = [];
  const miniProgram = {
    async pageScrollTo(value) {
      calls.push(value);
      const limit = Number.isFinite(documentHeight) ? Math.max(0, documentHeight - 671) : Infinity;
      scroll = Math.min(value, limit);
    },
    async systemInfo() { return { windowHeight: 671 }; },
    async evaluate() {
      const viewportTop = nativeTop === undefined ? top - scroll : nativeTop;
      return { top: viewportTop, bottom: viewportTop + nativeHeight, height: nativeHeight, scrollTop: scroll };
    },
  };
  const page = {
    async size() { return { width: '390', height: String(documentHeight) }; },
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

test('capture scroll measures document bounds before requesting a reachable target', async () => {
  for (const values of [{ top: 160, height: 520, documentHeight: 740, expected: 69 },
    { top: 100, height: 300, documentHeight: 671, expected: 0 }]) {
    const f = fixture(values);
    const result = await scrollCaseIntoView(f.miniProgram, f.page, '.co-managers-panel', 25);
    assert.deepEqual(f.calls, [0, values.expected]);
    assert.equal(result.targetScrollTop, values.expected);
    assert.equal(result.actualScrollTop, values.expected);
    assert.equal(result.pageHeight, values.documentHeight);
    assert.ok(result.viewportTop >= 0 && result.viewportTop + values.height <= 671);
  }
});

test('an already fully visible settings card does not require artificial top alignment', async () => {
  const f = fixture({ top: 119, height: 504.5, documentHeight: 753 });
  f.miniProgram.pageScrollTo = async (value) => { f.calls.push(value); };
  const result = await scrollCaseIntoView(f.miniProgram, f.page, '.co-managers-panel', 25);
  assert.deepEqual(f.calls, [0, 0]);
  assert.equal(result.targetScrollTop, 0);
  assert.equal(result.viewportTop, 119);
  assert.equal(result.liveViewport.bottom, 623.5);
});

test('live native bounds reject a clipped or changed target even if initial coordinates fit', async () => {
  for (const values of [{ nativeTop: 450 }, { nativeHeight: 700 }]) {
    const f = fixture({ top: 100, documentHeight: 671, ...values });
    await assert.rejects(scrollCaseIntoView(f.miniProgram, f.page, '.co-managers-panel', 15), /target not reached/);
  }
  const broken = fixture({ top: 100, documentHeight: 671 });
  broken.miniProgram.evaluate = async () => { throw new Error('native geometry transport failed'); };
  await assert.rejects(scrollCaseIntoView(broken.miniProgram, broken.page, '.co-managers-panel', 15), /native geometry transport failed/);
});

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
  for (const values of [{ count: 0 }, { count: 2 }, { top: NaN }, { height: 0 }, { height: 800 },
    { documentHeight: NaN }, { documentHeight: 0 }, { documentHeight: 100 }]) {
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
