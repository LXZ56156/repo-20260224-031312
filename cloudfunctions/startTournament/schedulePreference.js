const { normalizeSeed } = require('./schedulerShared');
const PROFILES = ['balanced', 'rest', 'coverage'];
function normalizeProfile(value) {
  const v = String(value || '').trim();
  return PROFILES.includes(v) ? v : (v === 'repeat' ? 'coverage' : 'balanced');
}
const pairKey = (a,b) => [a,b].sort().join('|');
function measure(rounds, players) {
  const ids=players.map(p=>p.id);
  const playCount=Object.fromEntries(ids.map(id=>[id,0]));
  const streak={}; const rest={}; const maxRestStreak={};
  const partners={}; const opponents={}; const exact={};
  let maxConsecutivePlay=0; let maxWait=0;
  for(const round of rounds) {
    const active=new Set();
    for(const m of round.matches) {
      const a=m.teamA; const b=m.teamB;
      for(const id of a.concat(b)) { playCount[id]++; active.add(id); }
      for(const side of [a,b]) { const k=pairKey(...side); partners[k]=(partners[k]||0)+1; }
      for(const x of a) for(const y of b) { const k=pairKey(x,y); opponents[k]=(opponents[k]||0)+1; }
      const k=[a.slice().sort().join('&'),b.slice().sort().join('&')].sort().join(' vs ');
      exact[k]=(exact[k]||0)+1;
    }
    for(const id of ids) {
      streak[id]=active.has(id)?(streak[id]||0)+1:0;
      rest[id]=active.has(id)?0:(rest[id]||0)+1;
      maxConsecutivePlay=Math.max(maxConsecutivePlay,streak[id]);
      maxRestStreak[id]=Math.max(maxRestStreak[id]||0,rest[id]);
      maxWait=Math.max(maxWait,rest[id]);
    }
  }
  const groups=players.some(p=>p.squad==='A'||p.squad==='B')
    ? ['A','B'].map(s=>players.filter(p=>p.squad===s).map(p=>playCount[p.id])) : [Object.values(playCount)];
  const spreads=groups.filter(g=>g.length).map(g=>Math.max(...g)-Math.min(...g));
  const repeat=counts=>Object.values(counts).reduce((s,n)=>s+Math.max(0,n-1),0);
  return { playCount,maxRestStreak,maxConsecutivePlay,maxWait,playSpread:Math.max(0,...spreads),
    playImbalance:groups.reduce((s,g)=>s+g.reduce((n,x)=>n+x*x,0),0),
    partnerCoverageCount:Object.keys(partners).length,opponentCoverageCount:Object.keys(opponents).length,
    partnerRepeats:repeat(partners),opponentRepeats:repeat(opponents),uniqueMatchupCount:Object.keys(exact).length,
    partnerPenalty:Object.values(partners).reduce((s,n)=>s+n*n,0),opponentPenalty:Object.values(opponents).reduce((s,n)=>s+n*n,0) };
}
function vector(m, profile, limits) {
  const violation=Math.max(0,m.maxConsecutivePlay-limits.maxConsecutivePlay)+Math.max(0,m.maxWait-limits.maxWait);
  const balance=[m.playSpread,m.playImbalance,violation];
  const coverage=[-m.uniqueMatchupCount,-m.partnerCoverageCount,-m.opponentCoverageCount,m.partnerPenalty,m.opponentPenalty];
  return profile==='rest' ? [...balance,m.maxConsecutivePlay,m.maxWait,...coverage]
    : [...balance,...coverage,m.maxConsecutivePlay,m.maxWait];
}
function better(a,b,profile,limits) {
  const x=vector(a,profile,limits),y=vector(b,profile,limits);
  for(let i=0;i<x.length;i++) { if(x[i]!==y[i]) return x[i]<y[i]; }
  return false;
}
function optimizeSchedule(schedule, players, options={}) {
  if(!schedule || !Array.isArray(schedule.rounds)) return schedule;
  const startedAt=Date.now();
  const profile=normalizeProfile(options.profile);
  const rounds=schedule.rounds.map(r=>({...r,matches:r.matches.map(m=>({...m,teamA:m.teamA.slice(),teamB:m.teamB.slice()}))}));
  const before=measure(rounds,players);
  // A feasible baseline is the certificate: balanced permits one extra consecutive
  // batch, coverage two. All modes retain a finite waiting ceiling. This adapts
  // to crowded courts instead of imposing an impossible global two-batch cap.
  const limits={ maxConsecutivePlay:before.maxConsecutivePlay+(profile==='rest'?0:profile==='balanced'?1:2), maxWait:before.maxWait+(profile==='rest'?0:1) };
  const deadline=Math.min(Number(options.deadlineAtMs)||Infinity, Date.now()+150);
  const positions=[];
  rounds.forEach((r,ri)=>r.matches.forEach((m,mi)=>['teamA','teamB'].forEach(side=>m[side].forEach((id,pi)=>positions.push({ri,mi,side,pi})))));
  const squads=Object.fromEntries(players.map(p=>[p.id,p.squad||'']));
  const at=p=>rounds[p.ri].matches[p.mi][p.side];
  const valid=ri=>{const ids=rounds[ri].matches.flatMap(m=>m.teamA.concat(m.teamB));return new Set(ids).size===ids.length;};
  let current=before, accepted=0, attempts=0;
  let seed=normalizeSeed(options.seed||schedule.seed||1);
  const random=n=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed%n;};
  const maxAttempts=6000;
  while(positions.length && attempts<maxAttempts && Date.now()<deadline) {
    attempts++;
    const a=positions[random(positions.length)];
    const aid=at(a)[a.pi];
    let b=null, bid;
    // D: replace an overplayed participant with an underplayed teammate. The
    // remaining proposals swap occurrences, preserving every player's totals.
    if(attempts%4===0) {
      const eligible=players.filter(p=>squads[p.id]===squads[aid] && current.playCount[aid]-current.playCount[p.id]>1);
      if(!eligible.length) continue;
      bid=eligible[random(eligible.length)].id;
    } else {
      b=positions[random(positions.length)];
      bid=at(b)[b.pi];
      if(a.ri===b.ri || aid===bid || squads[aid]!==squads[bid]) continue;
    }
    at(a)[a.pi]=bid;
    if(b) at(b)[b.pi]=aid;
    if(valid(a.ri) && (!b || valid(b.ri))) {
      const candidate=measure(rounds,players);
      if(candidate.maxConsecutivePlay<=limits.maxConsecutivePlay && candidate.maxWait<=limits.maxWait
        && candidate.uniqueMatchupCount>=current.uniqueMatchupCount && better(candidate,current,profile,limits)) {
        current=candidate; accepted++; continue;
      }
    }
    at(a)[a.pi]=aid;
    if(b) at(b)[b.pi]=bid;
  }
  const ids=players.map(p=>p.id);
  for(const r of rounds) {const active=new Set(r.matches.flatMap(m=>m.teamA.concat(m.teamB)));r.restPlayers=ids.filter(id=>!active.has(id));}
  const { playCount,maxRestStreak,...metrics }=current;
  const fairness={ ...schedule.fairness,...metrics,preference:profile };
  // Old restPriorityTotal and engine-specific objective are not measurements of
  // the modified schedule. Keep source diagnostics separate, never stale scores.
  delete fairness.restPriorityTotal;
  const schedulerMeta={...schedule.schedulerMeta,schedulerProfile:profile,fairnessVersion:'preference-v1',
    ...metrics,uniqueExactMatchupCount:current.uniqueMatchupCount,objective:metrics,preferenceLimits:limits,
    postProcessor:'bounded-preference-v1',searchElapsedMs:(Number(schedule.schedulerMeta && schedule.schedulerMeta.searchElapsedMs)||0)+Date.now()-startedAt,preferenceSearch:{attempts,accepted,
      stoppedByDeadline:Date.now()>=deadline,before:{playSpread:before.playSpread,partnerCoverageCount:before.partnerCoverageCount,opponentCoverageCount:before.opponentCoverageCount}}};
  return {...schedule,rounds,fairness,schedulerMeta,
    fairnessScore:Math.max(1,Math.round(1000000/(1+current.playSpread*50000+current.partnerPenalty*120+current.opponentPenalty*10))),
    playerStats:{...schedule.playerStats,playCount,maxRestStreak,partnerRepeats:current.partnerRepeats,
      opponentRepeats:current.opponentRepeats,uniqueMatchupCount:current.uniqueMatchupCount}};
}
module.exports={normalizeProfile,measure,optimizeSchedule};
