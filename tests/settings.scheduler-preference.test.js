const test=require('node:test');
const assert=require('node:assert/strict');
const view=require('../miniprogram/pages/settings/settingsViewModel');
const actions=require('../miniprogram/pages/settings/settingsActions');
const shareMeta=require('../miniprogram/core/shareMeta');
function tournament(extra={}) {return {_id:'t',creatorId:'admin',status:'draft',mode:'multi_rotate',totalMatches:4,courts:1,
  players:Array.from({length:6},(_,i)=>({id:i===0?'guest_0':'u'+i,name:'球友'+i,type:i===0?'guest':'user'})),rules:{},...extra};}
test('settings defaults to balanced and retains edited preference on incoming draft refresh',()=>{
  const state=view.buildSettingsViewState(tournament(),{openid:'admin'});
  assert.equal(state.schedulerProfile,'balanced');assert.equal(state.schedulerProfileOptions.length,3);
  const edited=view.buildSettingsViewState(tournament({rules:{schedulerProfile:'rest'}}),{openid:'admin',draft:{schedulerProfile:'coverage'}});
  assert.equal(edited.schedulerProfile,'coverage');
  assert.equal(view.buildSettingsViewState(tournament({mode:'fixed_pair_rr'}),{openid:'admin'}).showSchedulerProfile,false);
  const ctx={data:state,setData(p){Object.assign(this.data,p);}};
  actions.onPickSchedulerProfile.call(ctx,{detail:{value:1}});
  assert.equal(ctx.data.schedulerProfile,'rest');
  ctx.data.isDraft=false;
  actions.onPickSchedulerProfile.call(ctx,{detail:{value:2}});
  assert.equal(ctx.data.schedulerProfile,'rest');
});
test('share preview permits explicit claim at full capacity without marking visitor joined',()=>{
  const t=tournament({presetKey:'rotation_6',playerLimit:6});
  const state=shareMeta.buildShareEntryViewModel({tournament:t,openid:'visitor'});
  assert.equal(state.joinAllowed,true);assert.equal(state.joined,false);
  assert.match(state.availabilityText,/认领/);
});

test('historical running matches are not relabeled as newly balanced schedules',()=>{
  const state=view.buildSettingsViewState(tournament({status:'running'}),{openid:'admin'});
  assert.equal(state.schedulerProfileDisplayLabel,'原排程（历史赛事）');
});
