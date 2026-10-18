const test = require('node:test');
const assert = require('node:assert/strict');
const { optimizeSchedule, measure, normalizeProfile } = require('../cloudfunctions/startTournament/schedulePreference');
const { generateSchedule } = require('../cloudfunctions/startTournament/rotation');
const { buildSquadSchedule } = require('../cloudfunctions/startTournament/scheduleModes');
const roster=n=>Array.from({length:n},(_,i)=>({id:'p'+i}));
function legal(out, players) {
  const ids=new Set(players.map(p=>p.id));
  for(const r of out.rounds) {
    const all=r.matches.flatMap(m=>m.teamA.concat(m.teamB));
    assert.equal(new Set(all).size,all.length);
    assert.ok(all.every(id=>ids.has(id)));
    assert.deepEqual(new Set(r.restPlayers),new Set([...ids].filter(id=>!all.includes(id))));
  }
}
test('profiles normalize to balanced by default, retaining repeat alias compatibility',()=>{
  assert.equal(normalizeProfile(''), 'balanced');
  assert.equal(normalizeProfile('repeat'),'coverage');
});
test('three preferences preserve legal counts and report actual metrics across seeds',()=>{
  const players=roster(8);
  const base=generateSchedule(players,17,1,{seed:11});
  const original=JSON.stringify(base);
  const initial=measure(base.rounds,players);
  for(const profile of ['rest','balanced','coverage']) for(const seed of [1,17,83]) {
    const out=optimizeSchedule(base,players,{profile,seed});
    legal(out,players);
    const m=measure(out.rounds,players);
    assert.deepEqual(m.playCount,initial.playCount);
    assert.ok(m.maxConsecutivePlay<=out.schedulerMeta.preferenceLimits.maxConsecutivePlay);
    assert.ok(m.maxWait<=out.schedulerMeta.preferenceLimits.maxWait);
    assert.ok(m.uniqueMatchupCount>=initial.uniqueMatchupCount);
    assert.equal(m.partnerCoverageCount,out.fairness.partnerCoverageCount);
    assert.equal(m.opponentRepeats,out.playerStats.opponentRepeats);
    if(profile==='rest') assert.ok(m.maxConsecutivePlay<=initial.maxConsecutivePlay);
  }
  assert.equal(JSON.stringify(base),original);
});
test('bounded D improves forced squad fallback without cross-team swaps or extra matches',()=>{
  const players=Array.from({length:22},(_,i)=>({id:'p'+i,squad:i<12?'A':'B'}));
  const base=buildSquadSchedule(players,24,5,{_debugForceFallback:true});
  const before=measure(base.rounds,players);
  const out=optimizeSchedule(base,players,{profile:'balanced',seed:17});
  legal(out,players);
  const after=measure(out.rounds,players);
  assert.equal(out.rounds.reduce((s,r)=>s+r.matches.length,0),24);
  const team=Object.fromEntries(players.map(p=>[p.id,p.squad]));
  for(const r of out.rounds) for(const m of r.matches) {
    assert.ok(m.teamA.every(id=>team[id]==='A'));assert.ok(m.teamB.every(id=>team[id]==='B'));
  }
  assert.ok(after.playSpread<=before.playSpread);
  assert.ok(out.schedulerMeta.preferenceSearch.attempts<=6000);
});
test('expired budget returns a legal schedule without search or changing its rounds',()=>{
  const players=roster(8);const base=generateSchedule(players,17,1,{seed:1});
  const out=optimizeSchedule(base,players,{deadlineAtMs:Date.now()-1});
  assert.equal(out.schedulerMeta.preferenceSearch.attempts,0);
  assert.deepEqual(out.rounds,base.rounds);
});

test('balanced and coverage break the alternating 8v8 template while keeping equal appearances',()=>{
  const players=Array.from({length:16},(_,i)=>({id:'p'+i,squad:i<8?'A':'B'}));
  const base=buildSquadSchedule(players,16,2);
  const before=measure(base.rounds,players);
  for(const profile of ['balanced','coverage']) {
    const out=optimizeSchedule(base,players,{profile,seed:17});
    const after=measure(out.rounds,players);legal(out,players);
    assert.deepEqual(after.playCount,before.playCount);
    assert.ok(after.partnerCoverageCount>before.partnerCoverageCount);
    assert.ok(after.opponentCoverageCount>before.opponentCoverageCount);
  }
});
