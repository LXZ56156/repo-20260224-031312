const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;
const common = require('./lib/common');
const modeHelper = require('./lib/mode');
const playerUtils = require('./lib/player');
const shareActivity = require('./lib/share-activity');

const { generateSchedule, selectSchedulerPolicy, computeEffectiveCourts } = require('./rotation');
const { validateBeforeGenerate } = require('./logic');
const { buildSquadSchedule, buildFixedPairSchedule } = require('./scheduleModes');

function safePlayerName(p) {
  const raw = p && (p.name || p.nickName || p.nickname || p.displayName);
  const name = String(raw || '').trim();
  if (name) {
    const m = name.match(/^成员([0-9a-zA-Z]{1,16})$/);
    return m ? m[1] : name;
  }
  const idRaw = String((p && (p.id || p.playerId || p._id)) || '').trim();
  const alnum = idRaw.replace(/[^0-9a-zA-Z]/g, '');
  const suffix = (alnum.slice(-4) || idRaw.slice(-4) || '').trim();
  return suffix || '匿名';
}

function idToPlayerMap(players) {
  const m = {};
  for (const p of (players || [])) {
    const id = playerUtils.extractPlayerId(p);
    if (!id) continue;
    const g = String(p.gender || '').trim().toLowerCase();
    m[id] = {
      id,
      name: safePlayerName(p),
      type: p.type || 'user',
      gender: (g === 'male' || g === 'female') ? g : 'unknown'
    };
  }
  return m;
}

function countRoundMatches(rounds = []) {
  return (Array.isArray(rounds) ? rounds : []).reduce((sum, round) => {
    return sum + ((Array.isArray(round && round.matches) ? round.matches : []).length);
  }, 0);
}

function hasMaterializedStartedTournament(tournament) {
  return !!(
    tournament &&
    String(tournament.status || '').trim() === 'running' &&
    countRoundMatches(tournament.rounds) > 0
  );
}

function assertScheduleIntegrity(schedule) {
  const rounds = Array.isArray(schedule && schedule.rounds) ? schedule.rounds : [];
  for (const round of rounds) {
    const matches = Array.isArray(round && round.matches) ? round.matches : [];
    for (const match of matches) {
      const ids = []
        .concat(Array.isArray(match && match.teamA) ? match.teamA : [])
        .concat(Array.isArray(match && match.teamB) ? match.teamB : [])
        .map((id) => String(id || '').trim());
      if (ids.some((id) => !id)) {
        throw new Error('生成的对阵中有成员缺少唯一标识，请重试');
      }
      if (ids.length !== 4) {
        throw new Error('生成的对阵人数异常，请重试');
      }
      if ((new Set(ids)).size !== ids.length) {
        throw new Error('生成的对阵中有重复成员，请调整名单后重试');
      }
    }
  }
}

exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext();
  const traceId = String((event && event.__traceId) || '').trim();
  const clientRequestId = String((event && event.clientRequestId) || '').trim();
  const tournamentId = String((event && event.tournamentId) || '').trim();
  const startedAtMs = Date.now();
  console.info('[startTournament]', traceId || '-', tournamentId || '-');
  if (!tournamentId) {
    return common.failResult('TOURNAMENT_ID_REQUIRED', '缺少 tournamentId', { traceId, state: 'invalid' });
  }

  if (clientRequestId) {
    await common.ensureCollection(db, common.CLIENT_REQUEST_LOG_COLLECTION);
  }
  const requestLogOptions = {
    scope: 'start_tournament',
    subjectKey: `tournament:${tournamentId}`,
    operatorOpenId: OPENID,
    clientRequestId
  };

  let shareStartTournament = null;
  try {
    const result = await common.runTransactionCompat(db, async (transaction) => {
      const tournaments = transaction.collection('tournaments');
      const docRes = await tournaments.doc(tournamentId).get();
      const t = common.assertTournamentExists(docRes.data);
      common.assertCreator(t, OPENID);
      if (clientRequestId) {
        const requestLog = await common.getClientRequestLog(transaction, requestLogOptions);
        if (common.isSuccessfulClientRequestLog(requestLog) && hasMaterializedStartedTournament(t)) {
          return common.okResult('TOURNAMENT_STARTED', '已开赛', {
            traceId,
            state: 'deduped',
            deduped: true,
            clientRequestId,
            version: Number(t.version) || 1
          });
        }
      }
      common.assertDraft(t, '赛事已开赛/已结束');
      if (t.settingsConfigured === false) throw new Error('请先在“赛事设置”中保存比赛参数');

      const checked = validateBeforeGenerate(t);
      const players = checked.players;
      const M = checked.totalMatches;
      const C = checked.courts;
      const mode = checked.mode || 'multi_rotate';
      const rules = checked.rules || {};
      const endCondition = rules.endCondition || { type: 'total_matches', target: M };
      const pairTeams = Array.isArray(checked.pairTeams) ? checked.pairTeams : [];
      const effectiveCourts = computeEffectiveCourts(players.length, C);

      const oldVersion = Number(t.version) || 1;
      const policy = selectSchedulerPolicy(players.length, effectiveCourts, M);
      const schedulerProfileRaw = String((event && event.schedulerProfile) || '').trim().toLowerCase();
      const schedulerProfile = ['rest', 'balanced', 'repeat'].includes(schedulerProfileRaw) ? schedulerProfileRaw : 'rest';
      const profileWeights = {
        rest: { delta: 2.0, epsilon: policy.selectedEpsilon + 0.2, beta: 3.0, gamma: 1.5 },
        balanced: { delta: 2.0, epsilon: policy.selectedEpsilon, beta: 3.0, gamma: 1.5 },
        repeat: { delta: 1.8, epsilon: Math.max(1.0, policy.selectedEpsilon - 0.1), beta: 3.4, gamma: 1.9 }
      }[schedulerProfile];
      const scheduleStartedAtMs = Date.now();
      let schedule;
      if (mode === 'squad_doubles') {
        schedule = buildSquadSchedule(players, M, C, { endCondition });
        if (schedule && schedule.schedulerMeta) {
          schedule.schedulerMeta.schedulerProfile = schedulerProfile;
        }
      } else if (mode === 'fixed_pair_rr') {
        schedule = buildFixedPairSchedule(players, C, pairTeams, { totalMatches: M });
        if (schedule && schedule.schedulerMeta) {
          schedule.schedulerMeta.schedulerProfile = schedulerProfile;
        }
      } else {
        const schedulerOptions = {
          mode: 'doubles',
          policy,
          searchSeeds: policy.selectedSearchSeeds,
          seedStep: 7919,
          epsilon: profileWeights.epsilon,
          delta: profileWeights.delta,
          beta: profileWeights.beta,
          gamma: profileWeights.gamma
        };
        schedule = generateSchedule(players, M, C, schedulerOptions);
        if (schedule && schedule.schedulerMeta) {
          schedule.schedulerMeta.schedulerProfile = schedulerProfile;
        }
      }
      assertScheduleIntegrity(schedule);
      const scheduleMs = Date.now() - scheduleStartedAtMs;
      const scheduleMeta = schedule && schedule.schedulerMeta && typeof schedule.schedulerMeta === 'object'
        ? schedule.schedulerMeta
        : {};
      console.info('[startTournament:timing]', JSON.stringify({
        traceId,
        tournamentId,
        phase: 'schedule',
        scheduleMs,
        engine: String(scheduleMeta.engine || ''),
        executionProfile: String(scheduleMeta.executionProfile || ''),
        templateKey: String(scheduleMeta.templateKey || ''),
        requestedCourts: C,
        effectiveCourts: Number(scheduleMeta.effectiveCourts) || effectiveCourts,
        playersCount: players.length,
        courts: C,
        totalMatches: M
      }));
      const map = idToPlayerMap(players);

      const materializeStartedAtMs = Date.now();
      const rounds = (schedule.rounds || []).map(r => ({
        roundIndex: r.roundIndex,
        matches: (r.matches || []).map(m => ({
          matchIndex: m.matchIndex,
          matchType: m.matchType || '',
          logicalRound: Number(m.logicalRound) || 0,
          unitAId: String(m.unitAId || ''),
          unitBId: String(m.unitBId || ''),
          unitAName: String(m.unitAName || ''),
          unitBName: String(m.unitBName || ''),
          teamA: (m.teamA || []).map(id => map[id]).filter(Boolean),
          teamB: (m.teamB || []).map(id => map[id]).filter(Boolean),
          status: 'pending',
          // Avoid nested-object updates (DB SDK may dot-flatten), store flat fields.
          scoreA: null,
          scoreB: null,
          teamAScore: null,
          teamBScore: null
        })),
        restPlayers: (r.restPlayers || []).map(id => map[id]).filter(Boolean)
      }));

      const rankings = modeHelper.buildInitialRankings(mode, players, pairTeams);
      const scheduledMatches = countRoundMatches(rounds);

      const updateNow = db.serverDate();
      const updateData = {
        status: 'running',
        rounds,
        scheduledMatches,
        rankings,
        scheduleSeed: schedule.seed,
        mode,
        pairTeams,
        fairnessScore: schedule.fairnessScore,
        // Store diagnostic details as JSON strings to avoid dot-path conflicts when existing fields are null.
        fairnessJson: JSON.stringify(schedule.fairness || {}),
        playerStatsJson: JSON.stringify(schedule.playerStats || {}),
        schedulerMetaJson: JSON.stringify(schedule.schedulerMeta || {}),
        // Clean legacy fields if they exist.
        fairness: _.remove(),
        playerStats: _.remove(),
        updatedAt: updateNow,
        version: _.inc(1)
      };
      if (shareActivity.getActivity(t, { allowedStates: [0] })) {
        Object.assign(updateData, shareActivity.buildStatePatch(1, updateNow));
        shareStartTournament = t;
      }
      const materializeMs = Date.now() - materializeStartedAtMs;
      console.info('[startTournament:timing]', JSON.stringify({
        traceId,
        tournamentId,
        phase: 'materialize',
        scheduleMs,
        materializeMs,
        engine: String(scheduleMeta.engine || ''),
        executionProfile: String(scheduleMeta.executionProfile || ''),
        templateKey: String(scheduleMeta.templateKey || ''),
        requestedCourts: C,
        effectiveCourts: Number(scheduleMeta.effectiveCourts) || effectiveCourts,
        playersCount: players.length,
        courts: C,
        totalMatches: M
      }));

      const writeStartedAtMs = Date.now();
      const updRes = await tournaments.where({ _id: tournamentId, version: oldVersion }).update({
        data: common.assertNoReservedRootKeys(updateData, ['_id'], '赛事开赛写入数据')
      });

      common.assertOptimisticUpdate(updRes, '写入冲突，请刷新赛事后重试');
      if (clientRequestId) {
        await common.upsertClientRequestLog(transaction, db, {
          ...requestLogOptions,
          status: 'succeeded',
          resourceType: 'tournament',
          resourceId: tournamentId,
          responseCode: 'TOURNAMENT_STARTED',
          responseState: 'started'
        });
      }
      const writeMs = Date.now() - writeStartedAtMs;
      const totalMs = Date.now() - startedAtMs;
      console.info('[startTournament:timing]', JSON.stringify({
        traceId,
        tournamentId,
        phase: 'done',
        scheduleMs,
        materializeMs,
        writeMs,
        totalMs,
        engine: String(scheduleMeta.engine || ''),
        executionProfile: String(scheduleMeta.executionProfile || ''),
        templateKey: String(scheduleMeta.templateKey || ''),
        requestedCourts: C,
        effectiveCourts: Number(scheduleMeta.effectiveCourts) || effectiveCourts,
        playersCount: players.length,
        courts: C,
        totalMatches: M
      }));
      return common.okResult('TOURNAMENT_STARTED', '已开赛', {
        traceId,
        state: 'started',
        ...(clientRequestId ? { clientRequestId } : {}),
        version: oldVersion + 1
      });
    });
    if (result && result.ok && shareStartTournament) {
      await shareActivity.updateStartedMessageBestEffort(cloud, tournamentId, shareStartTournament, console, {
        db,
        source: 'startTournament',
        tournamentId,
        traceId
      });
    }
    return result;
  } catch (err) {
    if (clientRequestId) {
      const requestLog = await common.getClientRequestLog(db, requestLogOptions);
      if (common.isSuccessfulClientRequestLog(requestLog)) {
        try {
          const currentDocRes = await db.collection('tournaments').doc(tournamentId).get();
          const currentTournament = currentDocRes && currentDocRes.data ? currentDocRes.data : null;
          if (hasMaterializedStartedTournament(currentTournament)) {
            return common.okResult('TOURNAMENT_STARTED', '已开赛', {
              traceId,
              state: 'deduped',
              deduped: true,
              clientRequestId,
              version: Number(currentTournament.version) || 1
            });
          }
        } catch (_) {
          // ignore; fall through to structured failure mapping
        }
      }
    }
    if (common.isCollectionNotExists(err)) {
      throw new Error('数据库集合 tournaments 不存在：请在云开发控制台（数据库 -> 创建集合）创建 tournaments 后再试。');
    }
    const mapped = mapStartTournamentFailure(err, traceId);
    if (mapped) return mapped;
    throw common.normalizeConflictError(err, '开赛失败');
  }
};

function mapStartTournamentFailure(err, traceId = '') {
  const message = String((err && err.message) || '').trim();
  if (!message) return null;
  if (message.startsWith('START_PAIR_TEAMS_INVALID:')) {
    return common.failResult('START_PAIR_TEAMS_INVALID', message.slice('START_PAIR_TEAMS_INVALID:'.length).trim() || '固搭队伍数据无效', {
      traceId,
      state: 'invalid'
    });
  }
  if (common.isConflictError(err)) {
    return common.failResult('VERSION_CONFLICT', '写入冲突，请刷新赛事后重试', { traceId, state: 'conflict' });
  }
  if (message.includes('赛事不存在')) {
    return common.failResult('TOURNAMENT_NOT_FOUND', message, { traceId, state: 'not_found' });
  }
  if (message.includes('无权限')) {
    return common.failResult('PERMISSION_DENIED', message, { traceId, state: 'forbidden' });
  }
  if (message.includes('赛事已开赛/已结束')) {
    return common.failResult('START_DRAFT_ONLY', message, { traceId, state: 'forbidden' });
  }
  if (message.includes('请先在“赛事设置”中保存比赛参数')) {
    return common.failResult('SETTINGS_REQUIRED', message, { traceId, state: 'invalid' });
  }
  if (
    message.includes('参赛人数不足') ||
    message.includes('人参赛') ||
    message.includes('正好') ||
    message.includes('总场次不能超过') ||
    message.includes('至少') ||
    message.includes('场地') ||
    message.includes('结束条件') ||
    message.includes('名单') ||
    message.includes('成员') ||
    message.includes('对阵') ||
    message.includes('队伍')
  ) {
    return common.failResult('START_VALIDATION_FAILED', message, { traceId, state: 'invalid' });
  }
  return null;
}
