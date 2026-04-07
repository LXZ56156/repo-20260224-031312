const test = require('node:test');
const assert = require('node:assert/strict');

const fixedPair = require('../cloudfunctions/startTournament/lib/fixed-pair');
const { buildFixedPairSchedule } = require('../cloudfunctions/startTournament/scheduleModes');

function makePairs(count) {
  const players = [];
  const pairTeams = [];
  for (let i = 0; i < count; i += 1) {
    const a = `P${i * 2 + 1}`;
    const b = `P${i * 2 + 2}`;
    players.push({ id: a, name: a });
    players.push({ id: b, name: b });
    pairTeams.push({ id: `team${i + 1}`, name: `第${i + 1}队`, playerIds: [a, b] });
  }
  return { players, pairTeams };
}

test('fixed_pair 2队请求超出共享10循环上限时抛出明确错误', () => {
  // 2队只有1个唯一对阵，10循环 = 最多10场
  // 请求11场 → 超出上限，应抛出错误而非静默截断
  const { players, pairTeams } = makePairs(2);
  assert.throws(
    () => buildFixedPairSchedule(players, 1, pairTeams, { totalMatches: 11 }),
    (err) => {
      assert.ok(err instanceof Error, 'should be an Error');
      assert.ok(err.message.includes('循环') || err.message.includes('上限'), `message should mention cycle limit: ${err.message}`);
      assert.ok(err.message.includes('10'), `message should mention shared cycle cap: ${err.message}`);
      return true;
    }
  );
});

test('fixed_pair 2队请求10场（恰好共享上限）正常生成', () => {
  // 10场 = 10循环，刚好在限制内
  const { players, pairTeams } = makePairs(2);
  const out = buildFixedPairSchedule(players, 1, pairTeams, { totalMatches: 10 });
  const matches = (out.rounds || []).flatMap((r) => r.matches || []);
  assert.equal(matches.length, 10);
});

test('fixed_pair 调度层复用共享最大场次口径', () => {
  // 3队 C(3,2)=3 个唯一对阵，共享上限应为 3 × 10 = 30 场
  const { players, pairTeams } = makePairs(3);
  const maxMatches = fixedPair.calcFixedPairMaxMatches(pairTeams.length);
  assert.equal(maxMatches, 30);

  const out = buildFixedPairSchedule(players, 1, pairTeams, { totalMatches: maxMatches });
  const matches = (out.rounds || []).flatMap((r) => r.matches || []);
  assert.equal(matches.length, maxMatches);

  assert.throws(
    () => buildFixedPairSchedule(players, 1, pairTeams, { totalMatches: maxMatches + 1 }),
    (err) => {
      assert.ok(err instanceof Error);
      assert.ok(err.message.includes(String(maxMatches)));
      return true;
    }
  );
});
