'use strict';

const crypto = require('node:crypto');
const cloud = require('wx-server-sdk');
const common = require('./lib/common');
const logic = require('./waterLogic');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const COLLECTION = 'waterSessions';
const MAX_PARTICIPANTS = 24;
const MAX_ENTRIES = 200;

function codeError(code, message, state = 'invalid') {
  const err = new Error(message);
  err.code = code;
  err.state = state;
  return err;
}

function stableId(prefix, value) {
  return `${prefix}_${crypto.createHash('sha1').update(String(value || '')).digest('hex').slice(0, 20)}`;
}

function traceIdOf(event) {
  return String(event && event.__traceId || '').trim();
}

function clientRequestIdOf(event) {
  return String(event && event.clientRequestId || '').trim().slice(0, 100);
}

function sessionIdOf(event) {
  return String(event && (event.sessionId || event.id) || '').trim();
}

function result(code, message, state, session, traceId, extra = {}) {
  const safeExtra = { ...extra };
  const openid = String(safeExtra.openid || '');
  delete safeExtra.openid;
  return common.okResult(code, message, {
    state,
    traceId,
    session: sanitizeSession(session, openid),
    ...safeExtra
  });
}

function sanitizeSession(session, openid) {
  if (!session) return null;
  const participants = (Array.isArray(session.participants) ? session.participants : []).map((item) => ({
    id: String(item.id || ''),
    name: String(item.name || ''),
    source: String(item.source || 'manual'),
    claimed: !!item.openid,
    isViewer: !!openid && String(item.openid || '') === String(openid)
  }));
  const viewer = participants.find((item) => item.isViewer);
  return {
    id: String(session._id || session.id || ''),
    title: String(session.title || '快速打水'),
    status: String(session.status || 'active'),
    version: Number(session.version || 0),
    participants,
    entries: Array.isArray(session.entries) ? session.entries : [],
    isOwner: !!openid && String(session.ownerOpenid || '') === String(openid),
    viewerParticipantId: viewer ? viewer.id : '',
    updatedAtMs: Number(session.updatedAtMs || 0)
  };
}

function assertOwner(session, openid) {
  if (!session || String(session.ownerOpenid || '') !== String(openid || '')) {
    throw codeError('WATER_SESSION_FORBIDDEN', '只有发起人可以记水', 'forbidden');
  }
}

function assertActive(session) {
  if (String(session && session.status || '') !== 'active') {
    throw codeError('WATER_SESSION_FINISHED', '这次打水已经结束', 'finished');
  }
}

function assertExpectedVersion(session, event) {
  const expected = Number(event && event.expectedVersion);
  if (!Number.isInteger(expected) || expected !== Number(session.version || 0)) {
    throw codeError('VERSION_CONFLICT', '账本已更新，请刷新后重试', 'conflict');
  }
}

function buildParticipant(name, source, openid = '') {
  const salt = `${Date.now()}_${Math.random()}_${name}`;
  return {
    id: stableId('wp', openid || salt),
    name: logic.cleanText(name, 20),
    source,
    openid: String(openid || ''),
    createdAtMs: Date.now()
  };
}

async function getSession(reader, sessionId) {
  if (!sessionId) throw codeError('WATER_SESSION_ID_REQUIRED', '缺少打水局编号');
  try {
    const res = await reader.collection(COLLECTION).doc(sessionId).get();
    if (!res || !res.data) throw new Error('not found');
    return res.data;
  } catch (err) {
    if (common.isDocNotExists(err) || String(err && err.message || '').includes('not found')) {
      throw codeError('WATER_SESSION_NOT_FOUND', '打水局不存在', 'not_found');
    }
    throw err;
  }
}

function requireMutationRequest(event) {
  const requestId = clientRequestIdOf(event);
  if (!requestId) throw codeError('CLIENT_REQUEST_ID_REQUIRED', '缺少请求编号');
  return requestId;
}

async function mutate(event, openid, handler) {
  const sessionId = sessionIdOf(event);
  const requestId = requireMutationRequest(event);
  return common.runTransactionCompat(db, async (tx) => {
    const session = await getSession(tx, sessionId);
    assertActive(session);
    const applied = Array.isArray(session.recentRequestIds) ? session.recentRequestIds : [];
    if (applied.includes(requestId)) {
      return { session, deduped: true };
    }
    assertExpectedVersion(session, event);
    const next = await handler({ ...session }, tx);
    next.version = Number(session.version || 0) + 1;
    next.updatedAt = db.serverDate();
    next.updatedAtMs = Date.now();
    next.recentRequestIds = applied.concat(requestId).slice(-20);
    const writeData = { ...next };
    delete writeData._id;
    const update = await tx.collection(COLLECTION).doc(sessionId).update({ data: writeData });
    common.assertOptimisticUpdate(update, '账本写入失败，请刷新后重试');
    return { session: { ...next, _id: sessionId }, deduped: false };
  });
}

async function createSession(event, openid, traceId) {
  const sessionId = stableId('water', openid);
  try {
    const existing = await getSession(db, sessionId);
    if (existing && existing.status === 'active') {
      return result('WATER_SESSION_READY', '继续上次打水', 'existing', existing, traceId, { openid });
    }
  } catch (err) {
    if (err.code !== 'WATER_SESSION_NOT_FOUND') throw err;
  }
  const ownerName = logic.cleanText(event && event.ownerName, 20) || '我';
  const participant = buildParticipant(ownerName, 'owner', openid);
  const now = new Date();
  const title = `${now.getMonth() + 1}月${now.getDate()}日打水局`;
  const session = {
    ownerOpenid: openid,
    title,
    status: 'active',
    version: 1,
    participants: [participant],
    entries: [],
    recentRequestIds: clientRequestIdOf(event) ? [clientRequestIdOf(event)] : [],
    createdAt: db.serverDate(),
    updatedAt: db.serverDate(),
    updatedAtMs: Date.now()
  };
  await common.ensureCollection(db, COLLECTION);
  await db.collection(COLLECTION).doc(sessionId).set({ data: session });
  return result('WATER_SESSION_CREATED', '打水局已创建', 'created', { ...session, _id: sessionId }, traceId, { openid });
}

async function handleMutation(action, event, openid, traceId) {
  const outcome = await mutate(event, openid, async (session) => {
    if (action === 'join') {
      const existing = (session.participants || []).find((item) => String(item.openid || '') === openid);
      if (existing) return session;
      const nickname = logic.cleanText(event.nickname, 20);
      if (!nickname) throw codeError('PROFILE_MINIMUM_REQUIRED', '请先完善昵称');
      const claimId = String(event.claimParticipantId || '').trim();
      const participants = Array.isArray(session.participants) ? session.participants.slice() : [];
      const claimIndex = claimId ? participants.findIndex((item) => item.id === claimId && !item.openid) : -1;
      if (claimId && claimIndex < 0) throw codeError('WATER_PARTICIPANT_INVALID', '这个名字已被认领，请刷新');
      if (!claimId && participants.length >= MAX_PARTICIPANTS) throw codeError('PLAYER_LIMIT_REACHED', '这次打水最多 24 人');
      if (claimIndex >= 0) {
        participants[claimIndex] = { ...participants[claimIndex], openid, source: 'invite' };
      } else {
        participants.push(buildParticipant(nickname, 'invite', openid));
      }
      session.participants = participants;
      return session;
    }

    assertOwner(session, openid);
    if (action === 'addParticipants') {
      const names = logic.normalizeManualNames(event.names);
      if (!names.length) throw codeError('WATER_PARTICIPANT_INVALID', '请输入至少一个名字');
      const participants = Array.isArray(session.participants) ? session.participants.slice() : [];
      const existingNames = new Set(participants.map((item) => String(item.name || '').toLocaleLowerCase()));
      names.forEach((name) => {
        if (participants.length < MAX_PARTICIPANTS && !existingNames.has(name.toLocaleLowerCase())) {
          participants.push(buildParticipant(name, 'manual'));
          existingNames.add(name.toLocaleLowerCase());
        }
      });
      session.participants = participants;
      return session;
    }
    if (action === 'recordGame' || action === 'recordDirect') {
      const entries = Array.isArray(session.entries) ? session.entries.slice() : [];
      if (entries.length >= MAX_ENTRIES) throw codeError('WATER_ENTRY_LIMIT_REACHED', '本次记录已达 200 条，请另开一局');
      const base = action === 'recordGame'
        ? logic.normalizeGameEntry(event, session.participants)
        : logic.normalizeDirectEntry(event, session.participants);
      entries.push({ ...base, id: stableId('we', `${Date.now()}_${Math.random()}`), createdAtMs: Date.now() });
      session.entries = entries;
      return session;
    }
    if (action === 'undoLast') {
      const entries = Array.isArray(session.entries) ? session.entries.slice() : [];
      if (!entries.length) throw codeError('WATER_ENTRY_INVALID', '还没有可撤销的记录');
      entries.pop();
      session.entries = entries;
      return session;
    }
    if (action === 'finish') {
      session.status = 'finished';
      return session;
    }
    throw codeError('WATER_ACTION_INVALID', '不支持的打水操作');
  });
  return result(
    outcome.deduped ? 'WATER_WRITE_DEDUPED' : 'WATER_SESSION_UPDATED',
    outcome.deduped ? '记录已处理' : '账本已更新',
    outcome.deduped ? 'deduped' : 'updated',
    outcome.session,
    traceId,
    { openid, deduped: outcome.deduped }
  );
}

exports.main = async (event = {}) => {
  const traceId = traceIdOf(event);
  const openid = String(cloud.getWXContext().OPENID || '').trim();
  const action = String(event.action || '').trim();
  try {
    if (!openid) throw codeError('PERMISSION_DENIED', '登录状态失效', 'forbidden');
    if (action === 'create') return createSession(event, openid, traceId);
    if (action === 'get' || action === 'getMineActive') {
      const id = action === 'getMineActive' ? stableId('water', openid) : sessionIdOf(event);
      const session = await getSession(db, id);
      return result('WATER_SESSION_LOADED', '账本已加载', 'loaded', session, traceId, { openid });
    }
    return await handleMutation(action, event, openid, traceId);
  } catch (err) {
    return common.failResult(err.code || 'WATER_SESSION_FAILED', err.message || '打水操作失败', {
      state: err.state || (common.isConflictError(err) ? 'conflict' : 'error'),
      traceId
    });
  }
};
