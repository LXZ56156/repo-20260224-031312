const test = require('node:test');
const assert = require('node:assert/strict');

const tournamentVersion = require('../miniprogram/core/tournamentVersion');

test('pickTournamentVersion returns version for valid positive number', () => {
  assert.equal(tournamentVersion.pickTournamentVersion({ version: 5 }), 5);
});

test('pickTournamentVersion returns 0 for zero', () => {
  assert.equal(tournamentVersion.pickTournamentVersion({ version: 0 }), 0);
});

test('pickTournamentVersion returns 0 for negative', () => {
  assert.equal(tournamentVersion.pickTournamentVersion({ version: -1 }), 0);
});

test('pickTournamentVersion returns 0 for null/undefined doc', () => {
  assert.equal(tournamentVersion.pickTournamentVersion(null), 0);
  assert.equal(tournamentVersion.pickTournamentVersion(undefined), 0);
});

test('pickTournamentVersion returns 0 for missing version field', () => {
  assert.equal(tournamentVersion.pickTournamentVersion({}), 0);
});

test('pickTournamentVersion returns 0 for NaN version', () => {
  assert.equal(tournamentVersion.pickTournamentVersion({ version: 'abc' }), 0);
});

// --- compareTournamentFreshness ---

test('compareTournamentFreshness returns 1 when next has higher version', () => {
  const current = { _id: 't1', version: 2, updatedAtTs: 1000 };
  const next = { _id: 't1', version: 5, updatedAtTs: 1000 };
  assert.equal(tournamentVersion.compareTournamentFreshness(current, next), 1);
});

test('compareTournamentFreshness returns -1 when next has lower version', () => {
  const current = { _id: 't1', version: 5, updatedAtTs: 1000 };
  const next = { _id: 't1', version: 2, updatedAtTs: 1000 };
  assert.equal(tournamentVersion.compareTournamentFreshness(current, next), -1);
});

test('compareTournamentFreshness falls back to timestamp when versions are equal', () => {
  const current = { _id: 't1', version: 3, updatedAtTs: 1000 };
  const next = { _id: 't1', version: 3, updatedAtTs: 2000 };
  assert.equal(tournamentVersion.compareTournamentFreshness(current, next), 1);
});

test('compareTournamentFreshness returns 0 when both version and timestamp are equal', () => {
  const current = { _id: 't1', version: 3, updatedAtTs: 1000 };
  const next = { _id: 't1', version: 3, updatedAtTs: 1000 };
  assert.equal(tournamentVersion.compareTournamentFreshness(current, next), 0);
});

test('compareTournamentFreshness returns 1 when current is null', () => {
  const next = { _id: 't1', version: 1 };
  assert.equal(tournamentVersion.compareTournamentFreshness(null, next), 1);
});

test('compareTournamentFreshness returns -1 when next is null', () => {
  const current = { _id: 't1', version: 1 };
  assert.equal(tournamentVersion.compareTournamentFreshness(current, null), -1);
});

test('compareTournamentFreshness returns 1 when IDs differ', () => {
  const current = { _id: 't1', version: 10, updatedAtTs: 9999 };
  const next = { _id: 't2', version: 1, updatedAtTs: 1 };
  assert.equal(tournamentVersion.compareTournamentFreshness(current, next), 1);
});

test('compareTournamentFreshness uses id field as fallback for _id', () => {
  const current = { id: 't1', version: 2 };
  const next = { id: 't1', version: 5 };
  assert.equal(tournamentVersion.compareTournamentFreshness(current, next), 1);
});

test('compareTournamentFreshness returns 0 when both docs have no version and no timestamp', () => {
  const current = { _id: 't1' };
  const next = { _id: 't1' };
  assert.equal(tournamentVersion.compareTournamentFreshness(current, next), 0);
});

test('compareTournamentFreshness compares timestamps when versions are both 0', () => {
  const current = { _id: 't1', updatedAtTs: 3000 };
  const next = { _id: 't1', updatedAtTs: 5000 };
  assert.equal(tournamentVersion.compareTournamentFreshness(current, next), 1);
});

test('compareTournamentFreshness: next newer timestamp but older version → version wins', () => {
  const current = { _id: 't1', version: 5, updatedAtTs: 1000 };
  const next = { _id: 't1', version: 3, updatedAtTs: 9999 };
  assert.equal(tournamentVersion.compareTournamentFreshness(current, next), -1);
});

// --- shouldAcceptTournamentDoc ---

test('shouldAcceptTournamentDoc returns true when next is fresher', () => {
  assert.equal(tournamentVersion.shouldAcceptTournamentDoc(
    { _id: 't1', version: 1 },
    { _id: 't1', version: 2 }
  ), true);
});

test('shouldAcceptTournamentDoc returns true when equal freshness', () => {
  const doc = { _id: 't1', version: 3, updatedAtTs: 1000 };
  assert.equal(tournamentVersion.shouldAcceptTournamentDoc(doc, { ...doc }), true);
});

test('shouldAcceptTournamentDoc returns false when next is staler', () => {
  assert.equal(tournamentVersion.shouldAcceptTournamentDoc(
    { _id: 't1', version: 5 },
    { _id: 't1', version: 2 }
  ), false);
});

test('shouldAcceptTournamentDoc returns true when current is null', () => {
  assert.equal(tournamentVersion.shouldAcceptTournamentDoc(null, { _id: 't1' }), true);
});
