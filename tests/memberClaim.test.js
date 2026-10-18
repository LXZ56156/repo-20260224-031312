const test = require('node:test');
const assert = require('node:assert/strict');
const { chooseMemberClaim, getClaimCandidates } = require('../miniprogram/core/memberClaim');
const tournament = { status: 'draft', version: 4, players: [
  { id: 'guest_a', name: '小明', type: 'guest', squad: 'B' },
  { id: 'guest_b', name: '小明', type: 'guest', squad: 'A' }
] };
test('claim picker requires specific selection and separate consent', async () => {
  global.wx = { getStorageSync: () => '', showActionSheet: o => o.success({ tapIndex: 1 }),
    showModal: o => { assert.match(o.content, /A队/); o.success({ confirm: true }); } };
  assert.deepEqual(await chooseMemberClaim(tournament), { action: 'claim_guest', claimGuestId: 'guest_b', claimConfirmed: true, expectedVersion: 4 });
  wx.showModal = o => o.success({ confirm: false });
  assert.equal(await chooseMemberClaim(tournament), null);
  wx.showActionSheet = o => o.fail({ errMsg: 'cancel' });
  assert.equal(await chooseMemberClaim(tournament), null);
});
test('claim picker keeps ordinary join explicit and excludes existing members/non-drafts', async () => {
  global.wx = { getStorageSync: () => '', showActionSheet: o => o.success({ tapIndex: 2 }) };
  assert.deepEqual(await chooseMemberClaim(tournament), { action: 'join' });
  assert.deepEqual(getClaimCandidates({ ...tournament, status: 'running' }, ''), []);
  assert.deepEqual(getClaimCandidates({ ...tournament, players: [...tournament.players, { id: 'self' }] }, 'self'), []);
});
test('claim picker paginates without exceeding six native choices', async () => {
  const t = { ...tournament, players: Array.from({ length: 10 }, (_, i) => ({ id: `guest_${i}`, name: `成员${i}` })) };
  let pages = 0;
  global.wx = { getStorageSync: () => '', showActionSheet: o => {
    assert.ok(o.itemList.length <= 6);
    o.success({ tapIndex: pages++ < 2 ? 4 : 1 });
  }, showModal: o => o.success({ confirm: true }) };
  assert.equal((await chooseMemberClaim(t)).claimGuestId, 'guest_9');
});

test('full roster cannot use the claim picker to add a new member', async () => {
  const t = { ...tournament, mode:'multi_rotate', presetKey:'rotation_6', playerLimit:6,
    players: Array.from({length:6},(_,i)=>({id:'guest_'+i,name:'球友'+i,type:'guest'})) };
  global.wx={getStorageSync:()=>'',showActionSheet:o=>{
    assert.equal(o.itemList.at(-1),'取消认领');o.success({tapIndex:o.itemList.length-1});
  }};
  assert.equal(await chooseMemberClaim(t),null);
});
