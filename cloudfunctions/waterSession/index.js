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
const V2_ROOMS = 'waterRooms';
const V2_MEMBERS = 'waterRoomMembers';
const V2_ROUNDS = 'waterRounds';
const V2_ENTRIES = 'waterEntries';
const V2_REQUEST_LOGS = 'client_request_logs';
const V2_MIGRATIONS = 'waterMigrations';
const V2_FEATURE_FLAGS = 'water_feature_flags';
const V2_FEATURE_FLAGS_ID = 'collaborative_v2';
const V2_PAGE_SIZE = 20;
const V2_COLLECTION_NAMES = [V2_ROOMS, V2_MEMBERS, V2_ROUNDS, V2_ENTRIES, V2_REQUEST_LOGS];

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

function publicV1Entry(entry) {
  const commonFields = {
    id: String(entry && entry.id || ''),
    createdAtMs: Number(entry && entry.createdAtMs || 0)
  };
  if (String(entry && entry.type || '') === 'game') {
    return {
      ...commonFields,
      type: 'game',
      winnerIds: normalizedIdList(entry.winnerIds),
      loserIds: normalizedIdList(entry.loserIds),
      unitsPerPlayer: Number(entry.unitsPerPlayer || 0)
    };
  }
  if (String(entry && entry.type || '') === 'transfer') {
    return {
      ...commonFields,
      type: 'transfer',
      fromPlayerId: logic.cleanText(entry.fromPlayerId, 80),
      toPlayerId: logic.cleanText(entry.toPlayerId, 80),
      units: Number(entry.units || 0)
    };
  }
  return null;
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
    entries: (Array.isArray(session.entries) ? session.entries : []).map(publicV1Entry).filter(Boolean),
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
    const applied = Array.isArray(session.recentRequestIds) ? session.recentRequestIds : [];
    if (applied.includes(requestId)) {
      return { session, deduped: true };
    }
    assertActive(session);
    const config = await readFeatureConfig(tx);
    assertV1WritesEnabled(config);
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
  const config = await readFeatureConfig(db);
  assertV1WritesEnabled(config);
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

function v2RoomIdOf(event) {
  return String(event && event.roomId || '').trim();
}

function v2RoundIdOf(event) {
  return String(event && event.roundId || '').trim();
}

function withoutDocumentId(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return data;
  const output = { ...data };
  delete output._id;
  delete output.id;
  return common.assertNoReservedRootKeys(output, ['_id'], 'V2 写入数据');
}

async function getOptionalDocument(reader, collectionName, documentId) {
  if (!reader || !documentId) return null;
  try {
    const response = await reader.collection(collectionName).doc(documentId).get();
    if (!response || !response.data) return null;
    return { ...response.data, _id: String(response.data._id || documentId) };
  } catch (err) {
    if (common.isDocNotExists(err) || common.isCollectionNotExists(err)) return null;
    throw err;
  }
}

async function setDocument(writer, collectionName, documentId, data) {
  await writer.collection(collectionName).doc(documentId).set({ data: withoutDocumentId(data) });
}

async function updateDocument(writer, collectionName, documentId, data) {
  const response = await writer.collection(collectionName).doc(documentId).update({
    data: withoutDocumentId(data)
  });
  common.assertOptimisticUpdate(response, '账本写入失败，请重试');
}

function v2Ok(code, message, state, data, traceId) {
  return common.okResult(code, message, { state, traceId, data });
}

function memberDocumentId(roomId, openid) {
  return stableId('wm', `${roomId}\n${openid}`);
}

function roundDocumentId(roomId, number) {
  return stableId('wr', `${roomId}\n${number}`);
}

function entryDocumentId(roundId, openid, action, requestId) {
  return stableId('wve', `${roundId}\n${memberDocumentId(roundId, openid)}\n${action}\n${requestId}`);
}

function participantDocumentId(roomId, source) {
  return stableId('wp', `${roomId}\n${source}`);
}

function requestLogDocumentId(action, roomId, openid, requestId) {
  return common.buildClientRequestLogId({
    scope: `water_v2_${action}`,
    subjectKey: `room:${roomId}`,
    operatorOpenId: openid,
    clientRequestId: requestId
  });
}

function normalizedIdList(value) {
  const output = [];
  const seen = new Set();
  (Array.isArray(value) ? value : []).forEach((item) => {
    const id = logic.cleanText(item, 80);
    if (id && !seen.has(id)) {
      seen.add(id);
      output.push(id);
    }
  });
  return output;
}

function normalizedInteger(value) {
  const number = Number(value);
  return Number.isInteger(number) ? number : null;
}

function canonicalReplacement(value = {}) {
  return {
    winnerIds: normalizedIdList(value.winnerIds),
    loserIds: normalizedIdList(value.loserIds),
    unitsPerPlayer: normalizedInteger(value.unitsPerPlayer),
    fromPlayerId: logic.cleanText(value.fromPlayerId, 80),
    toPlayerId: logic.cleanText(value.toPlayerId, 80),
    units: normalizedInteger(value.units)
  };
}

function canonicalMutationPayload(action, event = {}) {
  if (action === 'create') {
    return { ownerName: logic.cleanText(event.ownerName, 20) };
  }
  if (action === 'join') {
    return {
      nickname: logic.cleanText(event.nickname, 20),
      claimParticipantId: logic.cleanText(event.claimParticipantId, 80),
      expectedRoomVersion: normalizedInteger(event.expectedRoomVersion)
    };
  }
  if (action === 'addParticipants') {
    return {
      names: logic.normalizeManualNames(Array.isArray(event.names) ? event.names.join('\n') : event.names),
      expectedRoomVersion: normalizedInteger(event.expectedRoomVersion)
    };
  }
  if (action === 'recordGame') {
    return {
      roundId: v2RoundIdOf(event),
      winnerIds: normalizedIdList(event.winnerIds),
      loserIds: normalizedIdList(event.loserIds),
      unitsPerPlayer: normalizedInteger(event.unitsPerPlayer)
    };
  }
  if (action === 'recordDirect') {
    return {
      roundId: v2RoundIdOf(event),
      fromPlayerId: logic.cleanText(event.fromPlayerId, 80),
      toPlayerId: logic.cleanText(event.toPlayerId, 80),
      units: normalizedInteger(event.units)
    };
  }
  if (action === 'correctEntry') {
    return {
      roundId: v2RoundIdOf(event),
      rootEntryId: logic.cleanText(event.rootEntryId, 100),
      expectedEntryId: logic.cleanText(event.expectedEntryId, 100),
      replacement: canonicalReplacement(event.replacement)
    };
  }
  if (action === 'reverseEntry') {
    return {
      roundId: v2RoundIdOf(event),
      rootEntryId: logic.cleanText(event.rootEntryId, 100),
      expectedEntryId: logic.cleanText(event.expectedEntryId, 100)
    };
  }
  if (action === 'createRound') {
    return {
      expectedActiveRoundId: logic.cleanText(event.expectedActiveRoundId, 100),
      expectedRoomVersion: normalizedInteger(event.expectedRoomVersion)
    };
  }
  return {};
}

function payloadHashOf(payload) {
  return crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}

async function getRequestLog(reader, action, roomId, openid, requestId) {
  return getOptionalDocument(
    reader,
    V2_REQUEST_LOGS,
    requestLogDocumentId(action, roomId, openid, requestId)
  );
}

async function getSuccessfulRequestLog(reader, options) {
  const log = await getRequestLog(
    reader,
    options.action,
    options.roomId,
    options.openid,
    options.requestId
  );
  if (!log || String(log.status || '') !== 'succeeded') return null;
  if (String(log.payloadHash || '') !== String(options.payloadHash || '')) {
    throw codeError('CLIENT_REQUEST_ID_REUSED', '请求内容已变化，请重新操作');
  }
  return log;
}

async function writeRequestLog(writer, options) {
  const logId = requestLogDocumentId(options.action, options.roomId, options.openid, options.requestId);
  await setDocument(writer, V2_REQUEST_LOGS, logId, {
    scope: `water_v2_${options.action}`,
    subjectKey: `room:${options.roomId}`,
    operatorOpenId: options.openid,
    clientRequestId: options.requestId,
    payloadHash: options.payloadHash,
    status: 'succeeded',
    resourceType: options.resourceType,
    resourceId: options.resourceId,
    roundId: options.roundId || '',
    targetEntryId: options.targetEntryId || '',
    archivedRoundId: options.archivedRoundId || '',
    responseCode: options.responseCode,
    responseState: options.responseState,
    createdAt: db.serverDate(),
    updatedAt: db.serverDate()
  });
  return logId;
}

function requireV2Request(event) {
  const requestId = clientRequestIdOf(event);
  if (!requestId) throw codeError('CLIENT_REQUEST_ID_REQUIRED', '缺少请求编号');
  return requestId;
}

async function readFeatureConfig(reader) {
  try {
    const raw = await getOptionalDocument(reader, V2_FEATURE_FLAGS, V2_FEATURE_FLAGS_ID);
    const booleanKeys = [
      'emergencyReadOnly',
      'v2Read',
      'rosterWrite',
      'ownerWrite',
      'memberWrite',
      'correctWrite',
      'reverseWrite',
      'createRoundWrite'
    ];
    const validAllowlist = (value) => Array.isArray(value)
      && value.every((item) => typeof item === 'string' && item.trim().length > 0);
    if (!raw || booleanKeys.some((key) => typeof raw[key] !== 'boolean')
        || !validAllowlist(raw.canaryRoomIds) || !validAllowlist(raw.canaryOpenids)
        || typeof raw.revision !== 'number' || !Number.isInteger(raw.revision) || raw.revision < 0) {
      return { valid: false, emergencyReadOnly: true, revision: 0 };
    }
    return {
      valid: true,
      ...Object.fromEntries(booleanKeys.map((key) => [key, raw[key]])),
      canaryRoomIds: raw.canaryRoomIds.map((item) => String(item || '').trim()).filter(Boolean),
      canaryOpenids: raw.canaryOpenids.map((item) => String(item || '').trim()).filter(Boolean),
      revision: raw.revision
    };
  } catch (_) {
    return { valid: false, emergencyReadOnly: true, revision: 0 };
  }
}

function isEligible(config, roomId, openid) {
  if (!config || !config.valid) return false;
  const hasRoomList = config.canaryRoomIds.length > 0;
  const hasOpenidList = config.canaryOpenids.length > 0;
  if (!hasRoomList && !hasOpenidList) return true;
  return config.canaryRoomIds.includes(roomId) || config.canaryOpenids.includes(openid);
}

function validMemberForRoom(room, member) {
  if (!room || !member || String(member.status || '') !== 'active') return null;
  const roomId = String(room._id || room.id || '');
  const participantId = String(member.participantId || '');
  const role = String(member.role || '');
  if (!roomId || String(member.roomId || '') !== roomId
      || !participantId || !['owner', 'member'].includes(role)) return null;
  const participant = participantById(room, participantId);
  if (!participant || !participant.claimed) return null;
  const ownerParticipantId = String(room.ownerParticipantId || '');
  if ((role === 'owner') !== (participantId === ownerParticipantId)) return null;
  return member;
}

function capabilitiesFor(config, room, openid, member) {
  const roomId = String(room && (room._id || room.id) || '');
  const eligible = isEligible(config, roomId, openid);
  const v2Read = !!(config && config.valid && eligible && config.v2Read);
  const safeMember = validMemberForRoom(room, member);
  const role = String(safeMember && safeMember.role || 'visitor');
  const isOwner = role === 'owner';
  const isMember = role === 'member';
  const writable = v2Read && !config.emergencyReadOnly;
  const baseWrite = isOwner ? !!config.ownerWrite : (isMember ? !!config.memberWrite : false);
  return {
    v2Read,
    canManageRoster: writable && isOwner && !!config.rosterWrite,
    canOwnerWrite: writable && isOwner && !!config.ownerWrite,
    canMemberWrite: writable && isMember && !!config.memberWrite,
    canCorrect: writable && baseWrite && !!config.correctWrite,
    canReverse: writable && baseWrite && !!config.reverseWrite,
    canCreateRound: writable && isOwner && !!config.createRoundWrite,
    emergencyReadOnly: !!(config && config.emergencyReadOnly),
    revision: Number(config && config.revision || 0)
  };
}

function assertV2Read(config, roomId, openid) {
  if (!isEligible(config, roomId, openid) || !config.valid || !config.v2Read) {
    throw codeError('WATER_FEATURE_NOT_ENABLED', '此功能暂未开放', 'forbidden');
  }
}

function assertV2WriteBase(config, roomId, openid) {
  if (!config || !config.valid || config.emergencyReadOnly) {
    throw codeError('WATER_WRITES_DISABLED', '打水账本暂时只读', 'forbidden');
  }
  assertV2Read(config, roomId, openid);
}

function assertFeatureFlag(enabled) {
  if (!enabled) throw codeError('WATER_FEATURE_NOT_ENABLED', '此功能暂未开放', 'forbidden');
}

function assertRoomOwner(member, room) {
  const safeMember = validMemberForRoom(room, member);
  if (!safeMember || String(safeMember.role || '') !== 'owner') {
    throw codeError('WATER_ROOM_FORBIDDEN', '只有发起人可以进行此操作', 'forbidden');
  }
}

function assertJoinedMember(member, room) {
  if (!validMemberForRoom(room, member)) {
    throw codeError('WATER_JOIN_REQUIRED', '加入后才能一起记水', 'forbidden');
  }
}

function assertRoomVersion(room, expectedVersion) {
  if (!Number.isInteger(Number(expectedVersion))
      || Number(expectedVersion) !== Number(room && room.roomVersion || 0)) {
    throw codeError('VERSION_CONFLICT', '账本刚刚有更新，请确认后重试', 'conflict');
  }
}

function publicParticipant(participant) {
  return {
    id: String(participant && participant.id || ''),
    name: String(participant && participant.name || ''),
    source: String(participant && participant.source || 'manual'),
    claimed: !!(participant && participant.claimed),
    createdAtMs: Number(participant && participant.createdAtMs || 0)
  };
}

function publicRoom(room) {
  if (!room) return null;
  return {
    id: String(room._id || room.id || ''),
    schemaVersion: 2,
    ownerParticipantId: String(room.ownerParticipantId || ''),
    activeRoundId: String(room.activeRoundId || ''),
    lastRoundId: String(room.lastRoundId || ''),
    roundCount: Number(room.roundCount || 0),
    participants: (Array.isArray(room.participants) ? room.participants : []).map(publicParticipant),
    roomVersion: Number(room.roomVersion || 0),
    syncVersion: Number(room.syncVersion || 0),
    updatedAtMs: Number(room.updatedAtMs || 0)
  };
}

function publicRound(round) {
  if (!round) return null;
  return {
    id: String(round._id || round.id || ''),
    roomId: String(round.roomId || ''),
    number: Number(round.number || 0),
    title: String(round.title || ''),
    status: String(round.status || ''),
    participantIds: Array.isArray(round.participantIds) ? round.participantIds.slice() : [],
    participantSnapshot: (Array.isArray(round.participantSnapshot) ? round.participantSnapshot : [])
      .map((item) => ({ id: String(item.id || ''), name: String(item.name || '') })),
    ledger: (Array.isArray(round.ledger) ? round.ledger : []).map((item) => ({
      participantId: String(item.participantId || ''),
      won: Number(item.won || 0),
      treat: Number(item.treat || 0),
      net: Number(item.net || 0)
    })),
    recordCount: Number(round.recordCount || 0),
    activeRecordCount: Number(round.activeRecordCount || 0),
    eventCount: Number(round.eventCount || 0),
    nextSeq: Number(round.nextSeq || 1),
    revision: Number(round.revision || 0),
    previousRoundId: String(round.previousRoundId || ''),
    nextRoundId: String(round.nextRoundId || ''),
    createdAtMs: Number(round.createdAtMs || 0),
    archivedAtMs: Number(round.archivedAtMs || 0),
    updatedAtMs: Number(round.updatedAtMs || 0)
  };
}

function publicEffectRows(rows) {
  return (Array.isArray(rows) ? rows : []).map((item) => ({
    participantId: String(item && item.participantId || ''),
    wonDelta: Number(item && item.wonDelta || 0),
    treatDelta: Number(item && item.treatDelta || 0),
    netDelta: Number(item && item.netDelta || 0)
  }));
}

function publicEntryPayload(entry) {
  const payload = entry && entry.payload && typeof entry.payload === 'object' ? entry.payload : null;
  if (!payload) return null;
  if (String(entry.category || '') === 'game') {
    return {
      winnerIds: normalizedIdList(payload.winnerIds),
      loserIds: normalizedIdList(payload.loserIds),
      unitsPerPlayer: Number(payload.unitsPerPlayer || 0)
    };
  }
  if (String(entry.category || '') === 'direct') {
    return {
      fromPlayerId: logic.cleanText(payload.fromPlayerId, 80),
      toPlayerId: logic.cleanText(payload.toPlayerId, 80),
      units: Number(payload.units || 0)
    };
  }
  return null;
}

function publicEntry(entry) {
  if (!entry) return null;
  return {
    id: String(entry._id || entry.id || ''),
    roomId: String(entry.roomId || ''),
    roundId: String(entry.roundId || ''),
    seq: Number(entry.seq || 0),
    eventType: String(entry.eventType || ''),
    category: String(entry.category || ''),
    status: String(entry.status || ''),
    payload: publicEntryPayload(entry),
    effectSnapshot: publicEffectRows(entry.effectSnapshot),
    ledgerDelta: publicEffectRows(entry.ledgerDelta),
    actorParticipantId: String(entry.actorParticipantId || ''),
    actorNameSnapshot: String(entry.actorNameSnapshot || ''),
    rootCreatedByParticipantId: String(entry.rootCreatedByParticipantId || ''),
    rootEntryId: String(entry.rootEntryId || ''),
    targetEntryId: String(entry.targetEntryId || ''),
    targetEffectSnapshot: publicEffectRows(entry.targetEffectSnapshot),
    previousEntryId: String(entry.previousEntryId || ''),
    successorEntryId: String(entry.successorEntryId || ''),
    createdAtMs: Number(entry.createdAtMs || 0)
  };
}

function publicViewer(member, room) {
  const safeMember = validMemberForRoom(room, member);
  const role = String(safeMember && safeMember.role || 'visitor');
  return {
    role,
    participantId: String(safeMember && safeMember.participantId || ''),
    isMember: role === 'owner' || role === 'member',
    isOwner: role === 'owner'
  };
}

async function getMember(reader, roomId, openid) {
  return getOptionalDocument(reader, V2_MEMBERS, memberDocumentId(roomId, openid));
}

async function getV2Room(reader, roomId) {
  if (!roomId) throw codeError('WATER_ROOM_NOT_FOUND', '打水房不存在', 'not_found');
  const room = await getOptionalDocument(reader, V2_ROOMS, roomId);
  if (!room) return null;
  if (Number(room.schemaVersion) !== 2 || String(room.migrationStatus || '') !== 'active') {
    throw codeError('WATER_ROOM_MIGRATION_REQUIRED', '账本升级尚未完成，请稍后重试', 'conflict');
  }
  return room;
}

async function requireV2Room(reader, roomId) {
  const room = await getV2Room(reader, roomId);
  if (room) return room;
  const legacy = await getOptionalDocument(reader, COLLECTION, roomId);
  if (legacy) {
    throw codeError('WATER_ROOM_MIGRATION_REQUIRED', '账本升级尚未完成，请稍后重试', 'conflict');
  }
  throw codeError('WATER_ROOM_NOT_FOUND', '打水房不存在', 'not_found');
}

async function requireRound(reader, roundId, expectedRoomId = '') {
  const round = await getOptionalDocument(reader, V2_ROUNDS, roundId);
  if (!round || (expectedRoomId && String(round.roomId || '') !== String(expectedRoomId))) {
    throw codeError('WATER_ROUND_NOT_FOUND', '当前轮不存在，请重试或联系发起人', 'not_found');
  }
  return round;
}

function roundTitleAt(nowMs) {
  const chinaTime = new Date(Number(nowMs) + 8 * 60 * 60 * 1000);
  return `${chinaTime.getUTCMonth() + 1}月${chinaTime.getUTCDate()}日打水局`;
}

function buildRound(roomId, number, participants, creatorParticipantId, previousRoundId = '') {
  const nowMs = Date.now();
  const roundId = roundDocumentId(roomId, number);
  return {
    _id: roundId,
    roomId,
    number,
    title: roundTitleAt(nowMs),
    status: 'active',
    participantIds: participants.map((item) => item.id),
    participantSnapshot: participants.map((item) => ({ id: item.id, name: item.name })),
    ledger: logic.createLedger(participants),
    recordCount: 0,
    activeRecordCount: 0,
    eventCount: 0,
    nextSeq: 1,
    revision: 1,
    previousRoundId,
    nextRoundId: '',
    createdByParticipantId: creatorParticipantId,
    createdAt: db.serverDate(),
    createdAtMs: nowMs,
    archivedAt: null,
    archivedAtMs: 0,
    updatedAt: db.serverDate(),
    updatedAtMs: nowMs
  };
}

function pageLimitOf(event) {
  const requested = Number(event && event.limit);
  if (!Number.isInteger(requested) || requested < 1) return V2_PAGE_SIZE;
  return Math.min(requested, V2_PAGE_SIZE);
}

function entryFilterOf(event) {
  const category = String(event && event.category || 'all').trim().toLowerCase();
  if (!['all', 'game', 'direct'].includes(category)) {
    throw codeError('WATER_ENTRY_INVALID', '流水类型无效');
  }
  return category;
}

async function queryEntries(reader, round, event = {}) {
  const beforeSeq = event.beforeSeq === undefined || event.beforeSeq === null || event.beforeSeq === ''
    ? null : Number(event.beforeSeq);
  const afterSeq = event.afterSeq === undefined || event.afterSeq === null || event.afterSeq === ''
    ? null : Number(event.afterSeq);
  if (beforeSeq !== null && afterSeq !== null) {
    throw codeError('WATER_ENTRY_INVALID', '分页方向不能同时指定');
  }
  if ((beforeSeq !== null && (!Number.isInteger(beforeSeq) || beforeSeq < 1))
      || (afterSeq !== null && (!Number.isInteger(afterSeq) || afterSeq < 0))) {
    throw codeError('WATER_ENTRY_INVALID', '流水游标无效');
  }
  const category = entryFilterOf(event);
  const roundId = String(round._id || round.id || '');
  const filter = category === 'all'
    ? { roomId: round.roomId, roundId }
    : { roundId, category };
  if (beforeSeq !== null) filter.seq = db.command.lt(beforeSeq);
  if (afterSeq !== null) filter.seq = db.command.gt(afterSeq);
  const limit = pageLimitOf(event);
  const response = await reader.collection(V2_ENTRIES)
    .where(filter)
    .orderBy('seq', afterSeq !== null ? 'asc' : 'desc')
    .limit(limit + 1)
    .get();
  const source = Array.isArray(response && response.data) ? response.data : [];
  const hasMore = source.length > limit;
  const selected = source.slice(0, limit);
  const entries = afterSeq !== null ? selected.reverse() : selected;
  return {
    entries,
    page: {
      nextBeforeSeq: entries.length ? Number(entries[entries.length - 1].seq) : null,
      latestSeq: Math.max(0, Number(round.nextSeq || 1) - 1),
      hasMore
    }
  };
}

async function queryEntryHistory(reader, roomId, roundId, rootEntryId) {
  const history = [];
  const batchSize = 100;
  let afterSeq = 0;
  for (;;) {
    const filter = { rootEntryId };
    if (afterSeq > 0) filter.seq = db.command.gt(afterSeq);
    const response = await reader.collection(V2_ENTRIES)
      .where(filter)
      .orderBy('seq', 'asc')
      .limit(batchSize)
      .get();
    const batch = Array.isArray(response && response.data) ? response.data : [];
    const polluted = batch.some((entry) => (
      String(entry && entry.roomId || '') !== roomId
      || String(entry && entry.roundId || '') !== roundId
      || String(entry && entry.rootEntryId || '') !== rootEntryId
    ));
    if (polluted) {
      throw codeError('WATER_ENTRY_INVALID', '流水记录归属异常，请重试');
    }
    history.push(...batch);
    if (batch.length < batchSize) break;
    const nextSeq = Math.max(...batch.map((entry) => Number(entry.seq || 0)));
    if (!Number.isInteger(nextSeq) || nextSeq <= afterSeq) {
      throw codeError('WATER_ENTRY_INVALID', '流水顺序异常，请升级后重试');
    }
    afterSeq = nextSeq;
  }
  return history;
}

function canReadArchivedRound(member, round) {
  if (!member) return false;
  if (String(member.role || '') === 'owner') return true;
  return (Array.isArray(round.participantIds) ? round.participantIds : [])
    .includes(String(member.participantId || ''));
}

function assertRoundReadAccess(room, round, member) {
  const isCurrent = String(room.activeRoundId || '') === String(round._id || round.id || '')
    && String(round.status || '') === 'active';
  if (isCurrent) return;
  if (!canReadArchivedRound(member, round)) {
    throw codeError('WATER_ROOM_FORBIDDEN', '无权查看本轮记录', 'forbidden');
  }
}

async function buildRoundBundle(reader, room, round, openid, config, event = {}) {
  const roomId = String(room._id || room.id || '');
  const member = await getMember(reader, roomId, openid);
  const feed = await queryEntries(reader, round, event);
  return {
    room: publicRoom(room),
    round: publicRound(round),
    viewer: publicViewer(member, room),
    entries: feed.entries.map(publicEntry),
    page: feed.page,
    capabilities: capabilitiesFor(config, room, openid, member)
  };
}

async function buildCurrentBundle(reader, room, openid, config, event = {}) {
  const roomId = String(room._id || room.id || '');
  const roundId = String(room.activeRoundId || '');
  if (!roundId) throw codeError('WATER_ROUND_NOT_FOUND', '当前轮不存在，请重试或联系发起人', 'not_found');
  const round = await requireRound(reader, roundId, roomId);
  if (String(round.status || '') !== 'active') {
    throw codeError('WATER_ROUND_NOT_FOUND', '当前轮不存在，请重试或联系发起人', 'not_found');
  }
  return buildRoundBundle(reader, room, round, openid, config, event);
}

async function getActiveMigratedRoom(reader, roomId) {
  const room = await getOptionalDocument(reader, V2_ROOMS, roomId);
  if (!room || Number(room.schemaVersion) !== 2
      || String(room.migrationStatus || '') !== 'active') return null;
  return room;
}

function v1ProjectionRoundId(room) {
  return String(room && (room.activeRoundId || room.lastRoundId) || '');
}

function assertV1ProjectionSafe(round) {
  if (Number(round && round.activeRecordCount || 0) > MAX_ENTRIES) {
    throw codeError(
      'WATER_CLIENT_UPGRADE_REQUIRED',
      '当前记录较多，请升级后继续',
      'invalid'
    );
  }
}

async function getAllV2RoundEntries(reader, roomId, roundId) {
  const entries = [];
  const batchSize = 100;
  let afterSeq = 0;
  for (;;) {
    const filter = { roomId, roundId };
    if (afterSeq > 0) filter.seq = db.command.gt(afterSeq);
    const response = await reader.collection(V2_ENTRIES)
      .where(filter)
      .orderBy('seq', 'asc')
      .limit(batchSize)
      .get();
    const batch = Array.isArray(response && response.data) ? response.data : [];
    entries.push(...batch);
    if (batch.length < batchSize) break;
    const nextSeq = Math.max(...batch.map((entry) => Number(entry.seq || 0)));
    if (!Number.isInteger(nextSeq) || nextSeq <= afterSeq) {
      throw codeError('WATER_ENTRY_INVALID', '流水顺序异常，请升级后重试');
    }
    afterSeq = nextSeq;
  }
  return entries;
}

function activeV1BusinessEntries(entries) {
  return (Array.isArray(entries) ? entries : [])
    .filter((entry) => (
      String(entry && entry.status || '') === 'active'
      && String(entry && entry.eventType || '') !== 'entry_reversed'
      && (String(entry && entry.category || '') === 'game'
        || String(entry && entry.category || '') === 'direct')
      && entry.payload && typeof entry.payload === 'object'
    ))
    .sort((left, right) => Number(left.seq || 0) - Number(right.seq || 0));
}

function projectV1Entry(entry) {
  const payload = entry && entry.payload && typeof entry.payload === 'object' ? entry.payload : {};
  const commonFields = {
    id: String(entry && (entry._id || entry.id) || ''),
    createdAtMs: Number(entry && entry.createdAtMs || 0)
  };
  if (String(entry && entry.category || '') === 'game') {
    return {
      ...commonFields,
      type: 'game',
      winnerIds: normalizedIdList(payload.winnerIds),
      loserIds: normalizedIdList(payload.loserIds),
      unitsPerPlayer: Number(payload.unitsPerPlayer || 0)
    };
  }
  return {
    ...commonFields,
    type: 'transfer',
    fromPlayerId: String(payload.fromPlayerId || ''),
    toPlayerId: String(payload.toPlayerId || ''),
    units: Number(payload.units || 0)
  };
}

async function buildV1ProjectedSession(reader, room, openid) {
  const roomId = String(room && (room._id || room.id) || '');
  const roundId = v1ProjectionRoundId(room);
  if (!roundId) throw codeError('WATER_SESSION_NOT_FOUND', '打水局不存在', 'not_found');
  const round = await requireRound(reader, roundId, roomId);
  assertV1ProjectionSafe(round);
  const [rawMember, allEntries] = await Promise.all([
    getMember(reader, roomId, openid),
    getAllV2RoundEntries(reader, roomId, roundId)
  ]);
  const member = validMemberForRoom(room, rawMember);
  const viewerParticipantId = String(member && member.participantId || '');
  const ownerViewer = String(member && member.role || '') === 'owner';
  const participants = (Array.isArray(room.participants) ? room.participants : []).map((participant) => ({
    id: String(participant.id || ''),
    name: String(participant.name || ''),
    source: String(participant.source || 'manual'),
    openid: String(participant.id || '') === viewerParticipantId
      ? openid
      : (participant.claimed ? stableId('claimed', participant.id) : '')
  }));
  const active = String(room.activeRoundId || '') === roundId && String(round.status || '') === 'active';
  const activeEntries = activeV1BusinessEntries(allEntries);
  if (activeEntries.length > MAX_ENTRIES) assertV1ProjectionSafe({ activeRecordCount: activeEntries.length });
  return {
    _id: roomId,
    ownerOpenid: ownerViewer ? openid : stableId('owner', room.ownerParticipantId),
    title: String(round.title || '快速打水'),
    status: active ? 'active' : 'finished',
    version: Number(room.syncVersion || 0),
    participants,
    entries: activeEntries.map(projectV1Entry),
    updatedAtMs: Math.max(Number(room.updatedAtMs || 0), Number(round.updatedAtMs || 0))
  };
}

async function v1ProjectedResult(reader, options) {
  const session = await buildV1ProjectedSession(reader, options.room, options.openid);
  return result(
    options.code,
    options.message,
    options.state,
    session,
    options.traceId,
    { openid: options.openid, ...(options.extra || {}) }
  );
}

function v1AdapterAction(action) {
  return `v1_${action}`;
}

function canonicalV1Payload(action, event = {}) {
  if (action === 'create') return { ownerName: logic.cleanText(event.ownerName, 20) };
  if (action === 'join') {
    return {
      nickname: logic.cleanText(event.nickname, 20),
      claimParticipantId: logic.cleanText(event.claimParticipantId, 80)
    };
  }
  if (action === 'addParticipants') {
    return {
      names: logic.normalizeManualNames(Array.isArray(event.names) ? event.names.join('\n') : event.names)
    };
  }
  if (action === 'recordGame') {
    return {
      winnerIds: normalizedIdList(event.winnerIds),
      loserIds: normalizedIdList(event.loserIds),
      unitsPerPlayer: normalizedInteger(event.unitsPerPlayer)
    };
  }
  if (action === 'recordDirect') {
    return {
      playerId: logic.cleanText(event.playerId, 80),
      counterpartyId: logic.cleanText(event.counterpartyId, 80),
      direction: logic.cleanText(event.direction, 10).toLowerCase(),
      units: normalizedInteger(event.units)
    };
  }
  return {};
}

async function getV1Dedupe(reader, roomId, openid, action, requestId, payloadHash) {
  const migration = await getOptionalDocument(reader, V2_MIGRATIONS, roomId);
  if ((Array.isArray(migration && migration.legacyRecentRequestIds)
      ? migration.legacyRecentRequestIds : []).includes(requestId)) {
    return { tombstone: true };
  }
  const log = await getSuccessfulRequestLog(reader, {
    action: v1AdapterAction(action), roomId, openid, requestId, payloadHash
  });
  return log ? { log } : null;
}

function assertV1Owner(member) {
  if (!member || String(member.role || '') !== 'owner') {
    throw codeError('WATER_SESSION_FORBIDDEN', '只有发起人可以记水', 'forbidden');
  }
}

function assertV1ExpectedVersion(room, event) {
  const expected = Number(event && event.expectedVersion);
  if (!Number.isInteger(expected) || expected !== Number(room && room.syncVersion || 0)) {
    throw codeError('VERSION_CONFLICT', '账本已更新，请刷新后重试', 'conflict');
  }
}

function assertV1WritesEnabled(config) {
  if (!config || !config.valid || config.emergencyReadOnly) {
    throw codeError('WATER_WRITES_DISABLED', '打水账本暂时只读', 'forbidden');
  }
}

async function requireV1ActiveRound(reader, room) {
  const roundId = String(room && room.activeRoundId || '');
  if (!roundId) throw codeError('WATER_SESSION_FINISHED', '这次打水已经结束', 'finished');
  const roomId = String(room && (room._id || room.id) || '');
  const round = await requireRound(reader, roundId, roomId);
  if (String(round.roomId || '') !== String(room._id || room.id || '')
      || String(round.status || '') !== 'active') {
    throw codeError('WATER_SESSION_FINISHED', '这次打水已经结束', 'finished');
  }
  assertV1ProjectionSafe(round);
  return round;
}

function v1UpdatedRoom(room, changes = {}, roomVersionDelta = 0, nowMs = Date.now()) {
  return updatedTimestamps({
    ...room,
    ...changes,
    roomVersion: Number(room.roomVersion || 0) + roomVersionDelta,
    syncVersion: Number(room.syncVersion || 0) + 1
  }, nowMs);
}

async function writeV1AdapterLog(writer, options) {
  return writeRequestLog(writer, {
    action: v1AdapterAction(options.action),
    roomId: options.roomId,
    openid: options.openid,
    requestId: options.requestId,
    payloadHash: options.payloadHash,
    resourceType: options.resourceType || 'waterRoom',
    resourceId: options.resourceId || options.roomId,
    roundId: options.roundId || '',
    targetEntryId: options.targetEntryId || '',
    responseCode: 'WATER_SESSION_UPDATED',
    responseState: 'updated'
  });
}

async function applyV1RosterMutation(tx, options) {
  const names = logic.normalizeManualNames(
    Array.isArray(options.event.names) ? options.event.names.join('\n') : options.event.names
  );
  if (!names.length) throw codeError('WATER_PARTICIPANT_INVALID', '请输入至少一个名字');
  const participants = Array.isArray(options.room.participants) ? options.room.participants.slice() : [];
  const existingNames = new Set(participants.map((participant) => String(participant.name || '').toLocaleLowerCase()));
  names.forEach((name, index) => {
    if (participants.length < MAX_PARTICIPANTS && !existingNames.has(name.toLocaleLowerCase())) {
      participants.push({
        id: participantDocumentId(options.roomId, `v1:${options.requestId}:${index}:${name}`),
        name,
        source: 'manual',
        claimed: false,
        createdAtMs: options.nowMs
      });
      existingNames.add(name.toLocaleLowerCase());
    }
  });
  const existingLedger = Array.isArray(options.round.ledger) ? options.round.ledger.slice() : [];
  const ledgerIds = new Set(existingLedger.map((row) => String(row.participantId || '')));
  participants.forEach((participant) => {
    if (!ledgerIds.has(participant.id)) {
      existingLedger.push({ participantId: participant.id, won: 0, treat: 0, net: 0 });
      ledgerIds.add(participant.id);
    }
  });
  const nextRound = updatedTimestamps({
    ...options.round,
    participantIds: participants.map((participant) => participant.id),
    participantSnapshot: participants.map((participant) => ({ id: participant.id, name: participant.name })),
    ledger: existingLedger,
    revision: Number(options.round.revision || 0) + 1
  }, options.nowMs);
  const nextRoom = v1UpdatedRoom(options.room, { participants }, 1, options.nowMs);
  await updateDocument(tx, V2_ROUNDS, options.roundId, nextRound);
  await updateDocument(tx, V2_ROOMS, options.roomId, nextRoom);
  return { room: nextRoom, round: nextRound, resourceId: options.roomId };
}

async function applyV1JoinMutation(tx, options) {
  if (options.member) {
    const nextRoom = v1UpdatedRoom(options.room, {}, 0, options.nowMs);
    await updateDocument(tx, V2_ROOMS, options.roomId, nextRoom);
    return { room: nextRoom, round: options.round, resourceId: options.member.participantId };
  }
  const nickname = logic.cleanText(options.event.nickname, 20);
  if (!nickname) throw codeError('PROFILE_MINIMUM_REQUIRED', '请先完善昵称');
  const claimId = logic.cleanText(options.event.claimParticipantId, 80);
  const participants = Array.isArray(options.room.participants)
    ? options.room.participants.map((participant) => ({ ...participant })) : [];
  const claimIndex = claimId
    ? participants.findIndex((participant) => String(participant.id || '') === claimId && !participant.claimed)
    : -1;
  if (claimId && claimIndex < 0) {
    throw codeError('WATER_PARTICIPANT_INVALID', '这个名字已被认领，请刷新');
  }
  if (!claimId && participants.length >= MAX_PARTICIPANTS) {
    throw codeError('PLAYER_LIMIT_REACHED', '这次打水最多 24 人');
  }
  let participant;
  if (claimIndex >= 0) {
    participant = { ...participants[claimIndex], claimed: true, source: 'invite' };
    participants[claimIndex] = participant;
  } else {
    const nicknameKey = nickname.toLocaleLowerCase();
    if (participants.some((item) => (
      logic.cleanText(item && item.name, 20).toLocaleLowerCase() === nicknameKey
    ))) {
      throw codeError('WATER_PARTICIPANT_INVALID', '本局称呼已存在，请换一个称呼');
    }
    const participantId = participantDocumentId(options.roomId, `member:${options.openid}`);
    if (participants.some((item) => String(item && item.id || '') === participantId)) {
      throw codeError('WATER_PARTICIPANT_INVALID', '已经加入这个打水房');
    }
    participant = {
      id: participantId,
      name: nickname,
      source: 'invite',
      claimed: true,
      createdAtMs: options.nowMs
    };
    participants.push(participant);
  }
  const ledger = Array.isArray(options.round.ledger)
    ? options.round.ledger.map((row) => ({ ...row })) : [];
  if (!ledger.some((row) => String(row.participantId || '') === participant.id)) {
    ledger.push({ participantId: participant.id, won: 0, treat: 0, net: 0 });
  }
  const snapshot = Array.isArray(options.round.participantSnapshot)
    ? options.round.participantSnapshot.map((item) => ({ ...item })) : [];
  if (!snapshot.some((item) => String(item.id || '') === participant.id)) {
    snapshot.push({ id: participant.id, name: participant.name });
  }
  const participantIds = Array.isArray(options.round.participantIds)
    ? options.round.participantIds.slice() : [];
  if (!participantIds.includes(participant.id)) participantIds.push(participant.id);
  const nextRound = updatedTimestamps({
    ...options.round,
    participantIds,
    participantSnapshot: snapshot,
    ledger,
    revision: Number(options.round.revision || 0) + 1
  }, options.nowMs);
  const nextRoom = v1UpdatedRoom(options.room, { participants }, 1, options.nowMs);
  await setDocument(tx, V2_MEMBERS, memberDocumentId(options.roomId, options.openid), {
    roomId: options.roomId,
    participantId: participant.id,
    openid: options.openid,
    role: 'member',
    status: 'active',
    joinedAt: db.serverDate(),
    updatedAt: db.serverDate()
  });
  await updateDocument(tx, V2_ROUNDS, options.roundId, nextRound);
  await updateDocument(tx, V2_ROOMS, options.roomId, nextRoom);
  return { room: nextRoom, round: nextRound, resourceId: participant.id };
}

async function applyV1RecordMutation(tx, options) {
  if (Number(options.round.activeRecordCount || 0) >= MAX_ENTRIES) {
    throw codeError('WATER_ENTRY_LIMIT_REACHED', '本次记录已达 200 条，请另开一局');
  }
  const normalized = options.action === 'recordGame'
    ? logic.normalizeGameEntry(options.event, options.room.participants)
    : logic.normalizeDirectEntry(options.event, options.room.participants);
  const effect = logic.effectForEntry(normalized);
  const entryId = entryDocumentId(options.roundId, options.openid, v1AdapterAction(options.action), options.requestId);
  const actor = participantById(options.room, options.member.participantId);
  const entry = {
    _id: entryId,
    roomId: options.roomId,
    roundId: options.roundId,
    seq: Number(options.round.nextSeq || 1),
    eventType: options.action === 'recordGame' ? 'game_recorded' : 'transfer_recorded',
    category: options.action === 'recordGame' ? 'game' : 'direct',
    status: 'active',
    payload: entryPayload(normalized),
    effectSnapshot: effect,
    ledgerDelta: effect,
    actorParticipantId: options.member.participantId,
    actorNameSnapshot: String(actor && actor.name || ''),
    rootCreatedByParticipantId: options.member.participantId,
    rootEntryId: entryId,
    targetEntryId: '',
    targetEffectSnapshot: [],
    previousEntryId: '',
    successorEntryId: '',
    source: 'v1_adapter',
    createdAt: db.serverDate(),
    createdAtMs: options.nowMs
  };
  const nextRound = updatedTimestamps({
    ...options.round,
    ledger: logic.applyLedgerDelta(options.round.ledger, effect),
    recordCount: Number(options.round.recordCount || 0) + 1,
    activeRecordCount: Number(options.round.activeRecordCount || 0) + 1,
    eventCount: Number(options.round.eventCount || 0) + 1,
    nextSeq: Number(options.round.nextSeq || 1) + 1,
    revision: Number(options.round.revision || 0) + 1
  }, options.nowMs);
  const nextRoom = v1UpdatedRoom(options.room, {}, 0, options.nowMs);
  await setDocument(tx, V2_ENTRIES, entryId, entry);
  await updateDocument(tx, V2_ROUNDS, options.roundId, nextRound);
  await updateDocument(tx, V2_ROOMS, options.roomId, nextRoom);
  return { room: nextRoom, round: nextRound, resourceId: entryId };
}

async function applyV1UndoMutation(tx, options) {
  const entries = await getAllV2RoundEntries(tx, options.roomId, options.roundId);
  const activeEntries = activeV1BusinessEntries(entries);
  const target = activeEntries[activeEntries.length - 1];
  if (!target) throw codeError('WATER_ENTRY_INVALID', '还没有可撤销的记录');
  const previousEffect = Array.isArray(target.effectSnapshot) ? target.effectSnapshot : [];
  const delta = logic.negateEffect(previousEffect);
  const entryId = entryDocumentId(options.roundId, options.openid, v1AdapterAction(options.action), options.requestId);
  const actor = participantById(options.room, options.member.participantId);
  const rootEntryId = String(target.rootEntryId || target._id || target.id || '');
  const targetEntryId = String(target._id || target.id || '');
  const entry = {
    _id: entryId,
    roomId: options.roomId,
    roundId: options.roundId,
    seq: Number(options.round.nextSeq || 1),
    eventType: 'entry_reversed',
    category: String(target.category || ''),
    status: 'applied',
    payload: null,
    effectSnapshot: [],
    ledgerDelta: delta,
    actorParticipantId: options.member.participantId,
    actorNameSnapshot: String(actor && actor.name || ''),
    rootCreatedByParticipantId: String(target.rootCreatedByParticipantId || options.member.participantId),
    rootEntryId,
    targetEntryId,
    targetEffectSnapshot: previousEffect.map((item) => ({ ...item })),
    previousEntryId: targetEntryId,
    successorEntryId: '',
    source: 'v1_adapter',
    createdAt: db.serverDate(),
    createdAtMs: options.nowMs
  };
  const nextRound = updatedTimestamps({
    ...options.round,
    ledger: logic.applyLedgerDelta(options.round.ledger, delta),
    activeRecordCount: Number(options.round.activeRecordCount || 0) - 1,
    eventCount: Number(options.round.eventCount || 0) + 1,
    nextSeq: Number(options.round.nextSeq || 1) + 1,
    revision: Number(options.round.revision || 0) + 1
  }, options.nowMs);
  const nextRoom = v1UpdatedRoom(options.room, {}, 0, options.nowMs);
  await updateDocument(tx, V2_ENTRIES, targetEntryId, { status: 'reversed', successorEntryId: entryId });
  await setDocument(tx, V2_ENTRIES, entryId, entry);
  await updateDocument(tx, V2_ROUNDS, options.roundId, nextRound);
  await updateDocument(tx, V2_ROOMS, options.roomId, nextRoom);
  return { room: nextRoom, round: nextRound, resourceId: entryId, targetEntryId };
}

async function applyV1FinishMutation(tx, options) {
  const nextRound = updatedTimestamps({
    ...options.round,
    status: 'archived',
    revision: Number(options.round.revision || 0) + 1,
    archivedAt: db.serverDate(),
    archivedAtMs: options.nowMs
  }, options.nowMs);
  const nextRoom = v1UpdatedRoom(options.room, {
    activeRoundId: '',
    lastRoundId: options.roundId
  }, 1, options.nowMs);
  await updateDocument(tx, V2_ROUNDS, options.roundId, nextRound);
  await updateDocument(tx, V2_ROOMS, options.roomId, nextRoom);
  return { room: nextRoom, round: nextRound, resourceId: options.roundId };
}

async function handleV1MigratedMutation(action, event, openid, traceId, initialRoom) {
  const roomId = String(initialRoom._id || initialRoom.id || '');
  const requestId = requireMutationRequest(event);
  const payloadHash = payloadHashOf(canonicalV1Payload(action, event));
  const existingDedupe = await getV1Dedupe(db, roomId, openid, action, requestId, payloadHash);
  if (existingDedupe) {
    return v1ProjectedResult(db, {
      room: initialRoom,
      openid,
      traceId,
      code: 'WATER_WRITE_DEDUPED',
      message: '记录已处理',
      state: 'deduped',
      extra: { deduped: true }
    });
  }
  const outcome = await runV2Transaction(async (tx) => {
    const room = await getActiveMigratedRoom(tx, roomId);
    if (!room) throw codeError('WATER_SESSION_NOT_FOUND', '打水局不存在', 'not_found');
    const dedupe = await getV1Dedupe(tx, roomId, openid, action, requestId, payloadHash);
    if (dedupe) return { room, deduped: true };
    const round = await requireV1ActiveRound(tx, room);
    const config = await readFeatureConfig(tx);
    assertV1WritesEnabled(config);
    const member = validMemberForRoom(room, await getMember(tx, roomId, openid));
    if (action !== 'join') assertV1Owner(member);
    assertV1ExpectedVersion(room, event);
    const nowMs = Date.now();
    let changed;
    if (action === 'join') {
      changed = await applyV1JoinMutation(tx, {
        room, round, roomId, roundId: String(round._id || round.id || ''),
        event, requestId, openid, member, nowMs
      });
    } else if (action === 'addParticipants') {
      changed = await applyV1RosterMutation(tx, {
        room, round, roomId, roundId: String(round._id || round.id || ''), event, requestId, nowMs
      });
    } else if (action === 'recordGame' || action === 'recordDirect') {
      changed = await applyV1RecordMutation(tx, {
        action, room, round, roomId, roundId: String(round._id || round.id || ''),
        event, requestId, openid, member, nowMs
      });
    } else if (action === 'undoLast') {
      changed = await applyV1UndoMutation(tx, {
        action, room, round, roomId, roundId: String(round._id || round.id || ''),
        requestId, openid, member, nowMs
      });
    } else if (action === 'finish') {
      changed = await applyV1FinishMutation(tx, {
        room, round, roomId, roundId: String(round._id || round.id || ''), nowMs
      });
    } else {
      throw codeError('WATER_ACTION_INVALID', '不支持的打水操作');
    }
    await writeV1AdapterLog(tx, {
      action, roomId, openid, requestId, payloadHash,
      resourceId: changed.resourceId,
      roundId: String(changed.round && (changed.round._id || changed.round.id) || ''),
      targetEntryId: changed.targetEntryId || ''
    });
    return changed;
  });
  const room = outcome.room || await getActiveMigratedRoom(db, roomId);
  return v1ProjectedResult(db, {
    room,
    openid,
    traceId,
    code: outcome.deduped ? 'WATER_WRITE_DEDUPED' : 'WATER_SESSION_UPDATED',
    message: outcome.deduped ? '记录已处理' : '账本已更新',
    state: outcome.deduped ? 'deduped' : 'updated',
    extra: { deduped: !!outcome.deduped }
  });
}

async function handleV1MigratedCreate(event, openid, traceId, initialRoom) {
  const roomId = String(initialRoom._id || initialRoom.id || '');
  if (String(initialRoom.activeRoundId || '')) {
    return v1ProjectedResult(db, {
      room: initialRoom,
      openid,
      traceId,
      code: 'WATER_SESSION_READY',
      message: '继续上次打水',
      state: 'existing'
    });
  }
  const initialLastRoundId = String(initialRoom.lastRoundId || '');
  if (initialLastRoundId) {
    const lastRound = await requireRound(db, initialLastRoundId, roomId);
    assertV1ProjectionSafe(lastRound);
  }
  const requestId = clientRequestIdOf(event);
  const payloadHash = payloadHashOf(canonicalV1Payload('create', event));
  const outcome = await runV2Transaction(async (tx) => {
    const room = await getActiveMigratedRoom(tx, roomId);
    if (!room) throw codeError('WATER_SESSION_NOT_FOUND', '打水局不存在', 'not_found');
    if (String(room.activeRoundId || '')) return { room, ready: true };
    const previousRoundId = String(room.lastRoundId || '');
    const previousRound = previousRoundId ? await requireRound(tx, previousRoundId, roomId) : null;
    if (previousRound) assertV1ProjectionSafe(previousRound);
    if (requestId) {
      const dedupe = await getV1Dedupe(tx, roomId, openid, 'create', requestId, payloadHash);
      if (dedupe) return { room, deduped: true };
    }
    const config = await readFeatureConfig(tx);
    assertV1WritesEnabled(config);
    const member = validMemberForRoom(room, await getMember(tx, roomId, openid));
    assertV1Owner(member);
    const nextNumber = Number(room.roundCount || (previousRound && previousRound.number) || 0) + 1;
    const round = buildRound(roomId, nextNumber, room.participants, member.participantId, previousRoundId);
    const nowMs = Date.now();
    const nextRoom = v1UpdatedRoom(room, {
      activeRoundId: round._id,
      roundCount: nextNumber
    }, 1, nowMs);
    if (previousRound) {
      const linkedPrevious = updatedTimestamps({
        ...previousRound,
        nextRoundId: round._id,
        revision: Number(previousRound.revision || 0) + 1
      }, nowMs);
      await updateDocument(tx, V2_ROUNDS, previousRoundId, linkedPrevious);
    }
    await setDocument(tx, V2_ROUNDS, round._id, round);
    await updateDocument(tx, V2_ROOMS, roomId, nextRoom);
    if (requestId) {
      await writeV1AdapterLog(tx, {
        action: 'create', roomId, openid, requestId, payloadHash,
        resourceType: 'waterRound', resourceId: round._id, roundId: round._id
      });
    }
    return { room: nextRoom, round };
  });
  if (outcome.deduped) {
    return v1ProjectedResult(db, {
      room: outcome.room,
      openid,
      traceId,
      code: 'WATER_WRITE_DEDUPED',
      message: '记录已处理',
      state: 'deduped',
      extra: { deduped: true }
    });
  }
  return v1ProjectedResult(db, {
    room: outcome.room,
    openid,
    traceId,
    code: outcome.ready ? 'WATER_SESSION_READY' : 'WATER_SESSION_CREATED',
    message: outcome.ready ? '继续上次打水' : '打水局已创建',
    state: outcome.ready ? 'existing' : 'created'
  });
}

function legacyCapabilities(legacy, openid, config) {
  const writesEnabled = !!(config && config.valid && !config.emergencyReadOnly);
  return {
    v2Read: false,
    canManageRoster: false,
    canOwnerWrite: false,
    canMemberWrite: false,
    canCorrect: false,
    canReverse: false,
    canCreateRound: false,
    emergencyReadOnly: !config || !config.valid || !!config.emergencyReadOnly,
    revision: Number(config && config.valid && config.revision || 0),
    legacyRead: true,
    legacyOwnerWrite: writesEnabled && String(legacy && legacy.ownerOpenid || '') === openid
  };
}

async function legacyReadyResult(legacy, openid, traceId, reader = db) {
  const config = await readFeatureConfig(reader);
  return v2Ok('WATER_ROOM_LEGACY_READY', '账本升级尚未完成', 'loaded', {
    legacySession: sanitizeSession(legacy, openid),
    migrationRequired: true,
    fallbackMode: 'legacy',
    capabilities: legacyCapabilities(legacy, openid, config)
  }, traceId);
}

async function ensureV2Collections() {
  await Promise.all(V2_COLLECTION_NAMES.map((name) => common.ensureCollection(db, name)));
}

async function handleV2Create(event, openid, traceId) {
  const roomId = stableId('water', openid);
  const requestId = requireV2Request(event);
  const payloadHash = payloadHashOf(canonicalMutationPayload('create', event));
  const existing = await getV2Room(db, roomId);
  if (existing && requestId) {
    const requestLog = await getSuccessfulRequestLog(db, {
      action: 'create', roomId, openid, requestId, payloadHash
    });
    if (requestLog) {
      const config = await readFeatureConfig(db);
      assertV2Read(config, roomId, openid);
      const round = await requireRound(db, String(requestLog.roundId || ''), roomId);
      const data = await buildRoundBundle(db, existing, round, openid, config, { limit: V2_PAGE_SIZE });
      data.deduped = true;
      return v2Ok('WATER_WRITE_DEDUPED', '记录已处理', 'deduped', data, traceId);
    }
  }
  if (existing && String(existing.activeRoundId || '')) {
    const config = await readFeatureConfig(db);
    assertV2Read(config, roomId, openid);
    const data = await buildCurrentBundle(db, existing, openid, config, { limit: V2_PAGE_SIZE });
    return v2Ok('WATER_ROOM_READY', '继续上次打水', 'loaded', data, traceId);
  }
  if (!existing) {
    const legacy = await getOptionalDocument(db, COLLECTION, roomId);
    if (legacy) return legacyReadyResult(legacy, openid, traceId);
  }

  const initialConfig = await readFeatureConfig(db);
  assertV2WriteBase(initialConfig, roomId, openid);
  assertFeatureFlag(existing ? initialConfig.createRoundWrite : initialConfig.ownerWrite);
  await ensureV2Collections();
  if (typeof db.runTransaction !== 'function') {
    throw codeError('WATER_WRITES_DISABLED', '打水账本暂时只读', 'forbidden');
  }

  const outcome = await db.runTransaction(async (tx) => {
    const requestLog = await getSuccessfulRequestLog(tx, {
      action: 'create', roomId, openid, requestId, payloadHash
    });
    if (requestLog) return { deduped: true, requestLog };
    const racedRoom = await getV2Room(tx, roomId);
    if (racedRoom && String(racedRoom.activeRoundId || '')) return { ready: true, room: racedRoom };
    if (!racedRoom) {
      const racedLegacy = await getOptionalDocument(tx, COLLECTION, roomId);
      if (racedLegacy) return { legacy: racedLegacy };
    }
    const config = await readFeatureConfig(tx);
    assertV2WriteBase(config, roomId, openid);

    if (racedRoom) {
      const member = await getMember(tx, roomId, openid);
      assertRoomOwner(member, racedRoom);
      assertFeatureFlag(config.createRoundWrite);
      const nextNumber = Number(racedRoom.roundCount || 0) + 1;
      const previousRoundId = String(racedRoom.lastRoundId || '');
      const round = buildRound(
        roomId,
        nextNumber,
        racedRoom.participants,
        member.participantId,
        previousRoundId
      );
      const nowMs = Date.now();
      const nextRoom = updatedTimestamps({
        ...racedRoom,
        activeRoundId: round._id,
        roundCount: nextNumber,
        roomVersion: Number(racedRoom.roomVersion || 0) + 1,
        syncVersion: Number(racedRoom.syncVersion || 0) + 1
      }, nowMs);
      if (previousRoundId) {
        const previousRound = await getOptionalDocument(tx, V2_ROUNDS, previousRoundId);
        if (previousRound && String(previousRound.roomId || '') === roomId) {
          await updateDocument(tx, V2_ROUNDS, previousRoundId, updatedTimestamps({
            ...previousRound,
            nextRoundId: round._id,
            revision: Number(previousRound.revision || 0) + 1
          }, nowMs));
        }
      }
      await setDocument(tx, V2_ROUNDS, round._id, round);
      await updateDocument(tx, V2_ROOMS, roomId, nextRoom);
      await writeRequestLog(tx, {
        action: 'create', roomId, openid, requestId, payloadHash,
        resourceType: 'waterRound', resourceId: round._id, roundId: round._id,
        responseCode: 'WATER_ROOM_READY', responseState: 'loaded'
      });
      return { room: nextRoom, round, restarted: true };
    }

    assertFeatureFlag(config.ownerWrite);

    const nowMs = Date.now();
    const ownerName = logic.cleanText(event.ownerName, 20) || '我';
    const ownerParticipant = {
      id: participantDocumentId(roomId, `owner:${openid}`),
      name: ownerName,
      source: 'owner',
      claimed: true,
      createdAtMs: nowMs
    };
    const round = buildRound(roomId, 1, [ownerParticipant], ownerParticipant.id);
    const room = {
      _id: roomId,
      schemaVersion: 2,
      ownerParticipantId: ownerParticipant.id,
      activeRoundId: round._id,
      lastRoundId: '',
      roundCount: 1,
      participants: [ownerParticipant],
      roomVersion: 1,
      syncVersion: 1,
      migrationStatus: 'active',
      createdAt: db.serverDate(),
      updatedAt: db.serverDate(),
      updatedAtMs: nowMs
    };
    const member = {
      roomId,
      participantId: ownerParticipant.id,
      openid,
      role: 'owner',
      status: 'active',
      joinedAt: db.serverDate(),
      updatedAt: db.serverDate()
    };
    await setDocument(tx, V2_ROOMS, roomId, room);
    await setDocument(tx, V2_ROUNDS, round._id, round);
    await setDocument(tx, V2_MEMBERS, memberDocumentId(roomId, openid), member);
    await writeRequestLog(tx, {
      action: 'create', roomId, openid, requestId, payloadHash,
      resourceType: 'waterRoom', resourceId: roomId, roundId: round._id,
      responseCode: 'WATER_ROOM_CREATED', responseState: 'created'
    });
    return { room, round };
  });

  if (outcome.legacy) return legacyReadyResult(outcome.legacy, openid, traceId);
  const room = outcome.room || await requireV2Room(db, roomId);
  const config = await readFeatureConfig(db);
  if (outcome.deduped) {
    assertV2Read(config, roomId, openid);
    const round = await requireRound(db, String(outcome.requestLog && outcome.requestLog.roundId || ''), roomId);
    const data = await buildRoundBundle(db, room, round, openid, config, { limit: V2_PAGE_SIZE });
    data.deduped = true;
    return v2Ok('WATER_WRITE_DEDUPED', '记录已处理', 'deduped', data, traceId);
  }
  assertV2Read(config, roomId, openid);
  const data = await buildCurrentBundle(db, room, openid, config, { limit: V2_PAGE_SIZE });
  const ready = outcome.ready || outcome.restarted;
  return v2Ok(
    ready ? 'WATER_ROOM_READY' : 'WATER_ROOM_CREATED',
    ready ? '继续上次打水' : '打水房已创建',
    ready ? 'loaded' : 'created',
    data,
    traceId
  );
}

async function handleV2Get(event, openid, traceId) {
  const roomId = v2RoomIdOf(event);
  const room = await getV2Room(db, roomId);
  if (!room) {
    const legacy = await getOptionalDocument(db, COLLECTION, roomId);
    if (legacy) return legacyReadyResult(legacy, openid, traceId);
    throw codeError('WATER_ROOM_NOT_FOUND', '打水房不存在', 'not_found');
  }
  const config = await readFeatureConfig(db);
  assertV2Read(config, roomId, openid);
  const data = await buildCurrentBundle(db, room, openid, config, { limit: V2_PAGE_SIZE });
  return v2Ok('WATER_ROOM_LOADED', '打水房已加载', 'loaded', data, traceId);
}

async function handleV2ListEntries(event, openid, traceId) {
  const roomId = v2RoomIdOf(event);
  const room = await requireV2Room(db, roomId);
  const config = await readFeatureConfig(db);
  assertV2Read(config, roomId, openid);
  const member = validMemberForRoom(room, await getMember(db, roomId, openid));
  const round = await requireRound(db, v2RoundIdOf(event), roomId);
  assertRoundReadAccess(room, round, member);
  const feed = await queryEntries(db, round, event);
  return v2Ok('WATER_ENTRIES_LOADED', '流水已加载', 'loaded', {
    entries: feed.entries.map(publicEntry),
    page: feed.page
  }, traceId);
}

async function handleV2GetEntry(event, openid, traceId) {
  const roomId = v2RoomIdOf(event);
  const room = await requireV2Room(db, roomId);
  const config = await readFeatureConfig(db);
  assertV2Read(config, roomId, openid);
  const member = validMemberForRoom(room, await getMember(db, roomId, openid));
  const round = await requireRound(db, v2RoundIdOf(event), roomId);
  assertRoundReadAccess(room, round, member);
  const rootEntryId = String(event.rootEntryId || '').trim();
  if (!rootEntryId) throw codeError('WATER_ENTRY_INVALID', '记录不存在');
  const history = await queryEntryHistory(db, roomId, String(round._id), rootEntryId);
  if (!history.length) throw codeError('WATER_ENTRY_INVALID', '记录不存在');
  return v2Ok('WATER_ENTRY_LOADED', '记录已加载', 'loaded', {
    rootEntryId,
    currentEntry: publicEntry(history[history.length - 1]),
    history: history.map(publicEntry)
  }, traceId);
}

async function handleV2ListRounds(event, openid, traceId) {
  const roomId = v2RoomIdOf(event);
  const room = await requireV2Room(db, roomId);
  const config = await readFeatureConfig(db);
  assertV2Read(config, roomId, openid);
  const member = validMemberForRoom(room, await getMember(db, roomId, openid));
  assertJoinedMember(member, room);
  const beforeNumber = event.beforeNumber === undefined || event.beforeNumber === null || event.beforeNumber === ''
    ? null : Number(event.beforeNumber);
  if (beforeNumber !== null && (!Number.isInteger(beforeNumber) || beforeNumber < 1)) {
    throw codeError('WATER_ENTRY_INVALID', '轮次游标无效');
  }
  const limit = pageLimitOf(event);
  const rounds = [];
  let lastScannedNumber = null;
  let scanBefore = beforeNumber;
  let hasMore = false;
  for (;;) {
    const filter = { roomId };
    if (scanBefore !== null) filter.number = db.command.lt(scanBefore);
    const response = await db.collection(V2_ROUNDS)
      .where(filter)
      .orderBy('number', 'desc')
      .limit(100)
      .get();
    const scanned = Array.isArray(response && response.data) ? response.data : [];
    if (!scanned.length) break;
    let stoppedInBatch = false;
    for (let index = 0; index < scanned.length; index += 1) {
      const candidate = scanned[index];
      lastScannedNumber = Number(candidate.number || 0);
      if (String(candidate.status || '') === 'archived' && canReadArchivedRound(member, candidate)) {
        rounds.push(candidate);
        if (rounds.length >= limit) {
          hasMore = index < scanned.length - 1 || scanned.length >= 100;
          stoppedInBatch = true;
          break;
        }
      }
    }
    if (stoppedInBatch) break;
    if (scanned.length < 100) break;
    if (!Number.isInteger(lastScannedNumber) || lastScannedNumber < 1) break;
    scanBefore = lastScannedNumber;
  }
  return v2Ok('WATER_ROUNDS_LOADED', '往期已加载', 'loaded', {
    rounds: rounds.map(publicRound),
    page: {
      nextBeforeNumber: lastScannedNumber,
      hasMore
    }
  }, traceId);
}

async function handleV2GetRound(event, openid, traceId) {
  const roomId = v2RoomIdOf(event);
  const room = await requireV2Room(db, roomId);
  const config = await readFeatureConfig(db);
  assertV2Read(config, roomId, openid);
  const member = validMemberForRoom(room, await getMember(db, roomId, openid));
  assertJoinedMember(member, room);
  const round = await requireRound(db, v2RoundIdOf(event), roomId);
  if (String(round.roomId || '') !== roomId || !canReadArchivedRound(member, round)) {
    throw codeError('WATER_ROOM_FORBIDDEN', '无权查看本轮记录', 'forbidden');
  }
  const feed = await queryEntries(db, round, event);
  return v2Ok('WATER_ROUND_LOADED', '往期轮次已加载', 'loaded', {
    room: publicRoom(room),
    round: publicRound(round),
    viewer: publicViewer(member, room),
    entries: feed.entries.map(publicEntry),
    page: feed.page
  }, traceId);
}

async function runV2Transaction(handler) {
  if (typeof db.runTransaction !== 'function') {
    throw codeError('WATER_WRITES_DISABLED', '打水账本暂时只读', 'forbidden');
  }
  return db.runTransaction(handler);
}

function updatedTimestamps(data, nowMs = Date.now()) {
  return {
    ...data,
    updatedAt: db.serverDate(),
    updatedAtMs: nowMs
  };
}

function participantById(room, participantId) {
  return (Array.isArray(room && room.participants) ? room.participants : [])
    .find((item) => String(item.id || '') === String(participantId || '')) || null;
}

function entryPayload(normalized) {
  if (normalized.type === 'game') {
    return {
      winnerIds: normalized.winnerIds.slice(),
      loserIds: normalized.loserIds.slice(),
      unitsPerPlayer: normalized.unitsPerPlayer
    };
  }
  return {
    fromPlayerId: normalized.fromPlayerId,
    toPlayerId: normalized.toPlayerId,
    units: normalized.units
  };
}

function normalizeV2BusinessEntry(action, input, participants) {
  try {
    return action === 'recordGame'
      ? logic.normalizeGameEntry(input, participants)
      : logic.normalizeV2DirectEntry(input, participants);
  } catch (err) {
    const message = String(err && err.message || '记录内容无效');
    const participantError = message.includes('参与人不存在');
    throw codeError(
      participantError ? 'WATER_PARTICIPANT_INVALID' : 'WATER_ENTRY_INVALID',
      message
    );
  }
}

function assertWritableRound(room, round) {
  if (String(round && round.roomId || '') !== String(room && (room._id || room.id) || '')) {
    throw codeError('WATER_ROUND_NOT_FOUND', '当前轮不存在，请重试或联系发起人', 'not_found');
  }
  if (String(round && round.status || '') === 'archived') {
    throw codeError('WATER_ROUND_ARCHIVED', '本轮已归档，请回到当前轮记水', 'finished');
  }
  if (String(round && round.status || '') !== 'active') {
    throw codeError('WATER_ROUND_ARCHIVED', '本轮已归档，请回到当前轮记水', 'finished');
  }
  if (String(room && room.activeRoundId || '') !== String(round && (round._id || round.id) || '')) {
    throw codeError('VERSION_CONFLICT', '已开始新一轮，刚才的操作未写入', 'conflict');
  }
}

function assertMemberWriteFlag(config, member, room) {
  assertJoinedMember(member, room);
  const role = String(member.role || '');
  assertFeatureFlag(role === 'owner' ? config.ownerWrite : (role === 'member' && config.memberWrite));
}

async function handleV2Join(event, openid, traceId) {
  const roomId = v2RoomIdOf(event);
  const requestId = requireV2Request(event);
  const payloadHash = payloadHashOf(canonicalMutationPayload('join', event));
  const outcome = await runV2Transaction(async (tx) => {
    const room = await requireV2Room(tx, roomId);
    const requestLog = await getSuccessfulRequestLog(tx, {
      action: 'join', roomId, openid, requestId, payloadHash
    });
    if (requestLog) {
      const currentRound = await requireRound(tx, String(room.activeRoundId || requestLog.roundId || ''), roomId);
      const currentMember = await getMember(tx, roomId, openid);
      return { deduped: true, room, round: currentRound, member: currentMember };
    }
    const config = await readFeatureConfig(tx);
    assertV2WriteBase(config, roomId, openid);
    assertFeatureFlag(config.rosterWrite);
    assertRoomVersion(room, event.expectedRoomVersion);
    const existingMember = await getMember(tx, roomId, openid);
    if (existingMember) {
      throw codeError('WATER_PARTICIPANT_INVALID', '已经加入这个打水房');
    }
    const round = await requireRound(tx, String(room.activeRoundId || ''), roomId);
    assertWritableRound(room, round);
    const nowMs = Date.now();
    const participants = (Array.isArray(room.participants) ? room.participants : []).map((item) => ({ ...item }));
    const claimParticipantId = logic.cleanText(event.claimParticipantId, 80);
    const nickname = logic.cleanText(event.nickname, 20);
    let participant;
    if (claimParticipantId) {
      const claimIndex = participants.findIndex((item) => String(item.id || '') === claimParticipantId);
      if (claimIndex < 0 || participants[claimIndex].claimed) {
        throw codeError('WATER_PARTICIPANT_INVALID', '这个名字刚刚被认领，请选择其他名字', 'conflict');
      }
      participant = { ...participants[claimIndex], claimed: true, source: 'invite' };
      participants[claimIndex] = participant;
    } else {
      if (!nickname) throw codeError('PROFILE_MINIMUM_REQUIRED', '请先完善个人资料');
      if (participants.length >= MAX_PARTICIPANTS) {
        throw codeError('PLAYER_LIMIT_REACHED', '这次打水最多 24 人');
      }
      const nameKey = nickname.toLocaleLowerCase();
      if (participants.some((item) => String(item.name || '').trim().toLocaleLowerCase() === nameKey)) {
        throw codeError('WATER_PARTICIPANT_INVALID', '本局称呼已存在，请换一个称呼');
      }
      participant = {
        id: participantDocumentId(roomId, `member:${openid}`),
        name: nickname,
        source: 'invite',
        claimed: true,
        createdAtMs: nowMs
      };
      participants.push(participant);
    }

    const member = {
      roomId,
      participantId: participant.id,
      openid,
      role: 'member',
      status: 'active',
      joinedAt: db.serverDate(),
      updatedAt: db.serverDate()
    };
    const participantAlreadyInRound = (Array.isArray(round.participantIds) ? round.participantIds : [])
      .includes(participant.id);
    const nextRound = updatedTimestamps({
      ...round,
      participantIds: participantAlreadyInRound
        ? round.participantIds.slice() : round.participantIds.concat(participant.id),
      participantSnapshot: participantAlreadyInRound
        ? round.participantSnapshot.map((item) => ({ ...item }))
        : round.participantSnapshot.concat({ id: participant.id, name: participant.name }),
      ledger: participantAlreadyInRound
        ? round.ledger.map((item) => ({ ...item }))
        : round.ledger.concat({ participantId: participant.id, won: 0, treat: 0, net: 0 }),
      revision: Number(round.revision || 0) + 1
    }, nowMs);
    const nextRoom = updatedTimestamps({
      ...room,
      participants,
      roomVersion: Number(room.roomVersion || 0) + 1,
      syncVersion: Number(room.syncVersion || 0) + 1
    }, nowMs);
    await setDocument(tx, V2_MEMBERS, memberDocumentId(roomId, openid), member);
    await updateDocument(tx, V2_ROUNDS, String(round._id), nextRound);
    await updateDocument(tx, V2_ROOMS, roomId, nextRoom);
    await writeRequestLog(tx, {
      action: 'join', roomId, openid, requestId, payloadHash,
      resourceType: 'waterMember', resourceId: participant.id, roundId: String(round._id),
      responseCode: 'WATER_MEMBER_JOINED', responseState: 'updated'
    });
    return { room: nextRoom, round: nextRound, member };
  });
  const config = await readFeatureConfig(db);
  const data = {
    room: publicRoom(outcome.room),
    round: publicRound(outcome.round),
    viewer: publicViewer(outcome.member, outcome.room),
    capabilities: capabilitiesFor(config, outcome.room, openid, outcome.member)
  };
  if (outcome.deduped) data.deduped = true;
  return v2Ok(
    outcome.deduped ? 'WATER_WRITE_DEDUPED' : 'WATER_MEMBER_JOINED',
    outcome.deduped ? '记录已处理' : '已加入打水房',
    outcome.deduped ? 'deduped' : 'updated',
    data,
    traceId
  );
}

async function handleV2AddParticipants(event, openid, traceId) {
  const roomId = v2RoomIdOf(event);
  const requestId = requireV2Request(event);
  const canonicalPayload = canonicalMutationPayload('addParticipants', event);
  const payloadHash = payloadHashOf(canonicalPayload);
  const outcome = await runV2Transaction(async (tx) => {
    const room = await requireV2Room(tx, roomId);
    const requestLog = await getSuccessfulRequestLog(tx, {
      action: 'addParticipants', roomId, openid, requestId, payloadHash
    });
    if (requestLog) {
      const round = await requireRound(tx, String(room.activeRoundId || requestLog.roundId || ''), roomId);
      return { deduped: true, room, round };
    }
    const config = await readFeatureConfig(tx);
    assertV2WriteBase(config, roomId, openid);
    const member = await getMember(tx, roomId, openid);
    assertRoomOwner(member, room);
    assertFeatureFlag(config.rosterWrite);
    assertRoomVersion(room, event.expectedRoomVersion);
    const round = await requireRound(tx, String(room.activeRoundId || ''), roomId);
    assertWritableRound(room, round);
    const names = canonicalPayload.names;
    if (!names.length) throw codeError('WATER_PARTICIPANT_INVALID', '请输入至少一个名字');
    const nowMs = Date.now();
    const participants = (Array.isArray(room.participants) ? room.participants : []).map((item) => ({ ...item }));
    const existingNames = new Set(participants.map((item) => String(item.name || '').trim().toLocaleLowerCase()));
    const newNames = names.filter((name) => !existingNames.has(name.toLocaleLowerCase()));
    if (participants.length + newNames.length > MAX_PARTICIPANTS) {
      throw codeError('PLAYER_LIMIT_REACHED', '这次打水最多 24 人');
    }
    const additions = newNames.map((name, index) => ({
      id: participantDocumentId(roomId, `placeholder:${requestId}:${index}:${name}`),
      name,
      source: 'manual',
      claimed: false,
      createdAtMs: nowMs
    }));
    const nextParticipants = participants.concat(additions);
    const nextRound = updatedTimestamps({
      ...round,
      participantIds: round.participantIds.concat(additions.map((item) => item.id)),
      participantSnapshot: round.participantSnapshot.concat(additions.map((item) => ({ id: item.id, name: item.name }))),
      ledger: round.ledger.concat(additions.map((item) => ({ participantId: item.id, won: 0, treat: 0, net: 0 }))),
      revision: Number(round.revision || 0) + 1
    }, nowMs);
    const nextRoom = updatedTimestamps({
      ...room,
      participants: nextParticipants,
      roomVersion: Number(room.roomVersion || 0) + 1,
      syncVersion: Number(room.syncVersion || 0) + 1
    }, nowMs);
    await updateDocument(tx, V2_ROUNDS, String(round._id), nextRound);
    await updateDocument(tx, V2_ROOMS, roomId, nextRoom);
    await writeRequestLog(tx, {
      action: 'addParticipants', roomId, openid, requestId, payloadHash,
      resourceType: 'waterRoom', resourceId: roomId, roundId: String(round._id),
      responseCode: 'WATER_PARTICIPANTS_ADDED', responseState: 'updated'
    });
    return { room: nextRoom, round: nextRound };
  });
  const data = { room: publicRoom(outcome.room), round: publicRound(outcome.round) };
  if (outcome.deduped) data.deduped = true;
  return v2Ok(
    outcome.deduped ? 'WATER_WRITE_DEDUPED' : 'WATER_PARTICIPANTS_ADDED',
    outcome.deduped ? '记录已处理' : '球友已添加',
    outcome.deduped ? 'deduped' : 'updated',
    data,
    traceId
  );
}

async function rehydrateEntryOutcome(reader, log, roomId) {
  const entry = await getOptionalDocument(reader, V2_ENTRIES, String(log.resourceId || ''));
  const room = await requireV2Room(reader, roomId);
  const round = await requireRound(reader, String(log.roundId || entry && entry.roundId || ''), roomId);
  const targetEntry = log.targetEntryId
    ? await getOptionalDocument(reader, V2_ENTRIES, String(log.targetEntryId))
    : null;
  return { deduped: true, room, round, entry, targetEntry };
}

async function handleV2Record(action, event, openid, traceId) {
  const roomId = v2RoomIdOf(event);
  const roundId = v2RoundIdOf(event);
  const requestId = requireV2Request(event);
  const payloadHash = payloadHashOf(canonicalMutationPayload(action, event));
  const outcome = await runV2Transaction(async (tx) => {
    const room = await requireV2Room(tx, roomId);
    const requestLog = await getSuccessfulRequestLog(tx, {
      action, roomId, openid, requestId, payloadHash
    });
    if (requestLog) return rehydrateEntryOutcome(tx, requestLog, roomId);
    const config = await readFeatureConfig(tx);
    assertV2WriteBase(config, roomId, openid);
    const member = await getMember(tx, roomId, openid);
    assertMemberWriteFlag(config, member, room);
    const round = await requireRound(tx, roundId, roomId);
    assertWritableRound(room, round);
    const normalized = normalizeV2BusinessEntry(action, event, room.participants);
    const effect = logic.effectForEntry(normalized);
    const nowMs = Date.now();
    const entryId = entryDocumentId(roundId, openid, action, requestId);
    const actor = participantById(room, member.participantId);
    const entry = {
      _id: entryId,
      roomId,
      roundId,
      seq: Number(round.nextSeq || 1),
      eventType: action === 'recordGame' ? 'game_recorded' : 'transfer_recorded',
      category: action === 'recordGame' ? 'game' : 'direct',
      status: 'active',
      payload: entryPayload(normalized),
      effectSnapshot: effect,
      ledgerDelta: effect,
      actorParticipantId: member.participantId,
      actorNameSnapshot: String(actor && actor.name || ''),
      rootCreatedByParticipantId: member.participantId,
      rootEntryId: entryId,
      targetEntryId: '',
      targetEffectSnapshot: [],
      previousEntryId: '',
      successorEntryId: '',
      createdAt: db.serverDate(),
      createdAtMs: nowMs
    };
    const nextRound = updatedTimestamps({
      ...round,
      ledger: logic.applyLedgerDelta(round.ledger, effect),
      recordCount: Number(round.recordCount || 0) + 1,
      activeRecordCount: Number(round.activeRecordCount || 0) + 1,
      eventCount: Number(round.eventCount || 0) + 1,
      nextSeq: Number(round.nextSeq || 1) + 1,
      revision: Number(round.revision || 0) + 1
    }, nowMs);
    const nextRoom = updatedTimestamps({
      ...room,
      syncVersion: Number(room.syncVersion || 0) + 1
    }, nowMs);
    await setDocument(tx, V2_ENTRIES, entryId, entry);
    await updateDocument(tx, V2_ROUNDS, roundId, nextRound);
    await updateDocument(tx, V2_ROOMS, roomId, nextRoom);
    await writeRequestLog(tx, {
      action, roomId, openid, requestId, payloadHash,
      resourceType: 'waterEntry', resourceId: entryId, roundId,
      responseCode: 'WATER_ENTRY_CREATED', responseState: 'created'
    });
    return { room: nextRoom, round: nextRound, entry, targetEntry: null };
  });
  if (!outcome.entry) throw codeError('WATER_ENTRY_INVALID', '记录不存在');
  const data = {
    roomSyncVersion: Number(outcome.room.syncVersion || 0),
    round: publicRound(outcome.round),
    entry: publicEntry(outcome.entry)
  };
  if (outcome.deduped) data.deduped = true;
  return v2Ok(
    outcome.deduped ? 'WATER_WRITE_DEDUPED' : 'WATER_ENTRY_CREATED',
    outcome.deduped ? '记录已处理' : '已记入流水',
    outcome.deduped ? 'deduped' : 'created',
    data,
    traceId
  );
}

function assertEntryLifecycleTarget(target, rootEntryId, expectedEntryId, roomId, roundId) {
  if (!target || String(target._id || target.id || '') !== expectedEntryId
      || String(target.rootEntryId || '') !== rootEntryId
      || String(target.roomId || '') !== roomId
      || String(target.roundId || '') !== roundId) {
    throw codeError('WATER_ENTRY_NOT_ACTIVE', '这条记录已更新，请确认最新内容', 'conflict');
  }
  if (String(target.status || '') === 'reversed') {
    throw codeError('WATER_ENTRY_ALREADY_REVERSED', '这条记录已经撤销', 'conflict');
  }
  if (String(target.status || '') !== 'active') {
    throw codeError('WATER_ENTRY_NOT_ACTIVE', '这条记录已更新，请确认最新内容', 'conflict');
  }
}

function assertEntryPermission(member, target, room) {
  assertJoinedMember(member, room);
  if (String(member.role || '') === 'owner') return;
  if (String(target.rootCreatedByParticipantId || '') !== String(member.participantId || '')) {
    throw codeError('WATER_ENTRY_FORBIDDEN', '只能修改自己记录的内容', 'forbidden');
  }
}

function normalizedReplacement(target, replacement, participants) {
  const action = String(target.category || '') === 'game' ? 'recordGame' : 'recordDirect';
  return normalizeV2BusinessEntry(action, replacement, participants);
}

async function handleV2CorrectEntry(event, openid, traceId) {
  const action = 'correctEntry';
  const roomId = v2RoomIdOf(event);
  const roundId = v2RoundIdOf(event);
  const rootEntryId = logic.cleanText(event.rootEntryId, 100);
  const expectedEntryId = logic.cleanText(event.expectedEntryId, 100);
  const requestId = requireV2Request(event);
  const payloadHash = payloadHashOf(canonicalMutationPayload(action, event));
  const outcome = await runV2Transaction(async (tx) => {
    const room = await requireV2Room(tx, roomId);
    const requestLog = await getSuccessfulRequestLog(tx, {
      action, roomId, openid, requestId, payloadHash
    });
    if (requestLog) return rehydrateEntryOutcome(tx, requestLog, roomId);
    const config = await readFeatureConfig(tx);
    assertV2WriteBase(config, roomId, openid);
    const member = await getMember(tx, roomId, openid);
    assertMemberWriteFlag(config, member, room);
    assertFeatureFlag(config.correctWrite);
    const round = await requireRound(tx, roundId, roomId);
    assertWritableRound(room, round);
    const target = await getOptionalDocument(tx, V2_ENTRIES, expectedEntryId);
    assertEntryLifecycleTarget(target, rootEntryId, expectedEntryId, roomId, roundId);
    assertEntryPermission(member, target, room);
    const normalized = normalizedReplacement(target, event.replacement || {}, room.participants);
    const nextEffect = logic.effectForEntry(normalized);
    const previousEffect = Array.isArray(target.effectSnapshot) ? target.effectSnapshot : [];
    const delta = logic.diffEffects(nextEffect, previousEffect);
    const nowMs = Date.now();
    const entryId = entryDocumentId(roundId, openid, action, requestId);
    const actor = participantById(room, member.participantId);
    const entry = {
      _id: entryId,
      roomId,
      roundId,
      seq: Number(round.nextSeq || 1),
      eventType: 'entry_corrected',
      category: target.category,
      status: 'active',
      payload: entryPayload(normalized),
      effectSnapshot: nextEffect,
      ledgerDelta: delta,
      actorParticipantId: member.participantId,
      actorNameSnapshot: String(actor && actor.name || ''),
      rootCreatedByParticipantId: target.rootCreatedByParticipantId,
      rootEntryId,
      targetEntryId: expectedEntryId,
      targetEffectSnapshot: previousEffect.map((item) => ({ ...item })),
      previousEntryId: expectedEntryId,
      successorEntryId: '',
      createdAt: db.serverDate(),
      createdAtMs: nowMs
    };
    const nextTarget = { ...target, status: 'corrected', successorEntryId: entryId };
    const nextRound = updatedTimestamps({
      ...round,
      ledger: logic.applyLedgerDelta(round.ledger, delta),
      eventCount: Number(round.eventCount || 0) + 1,
      nextSeq: Number(round.nextSeq || 1) + 1,
      revision: Number(round.revision || 0) + 1
    }, nowMs);
    const nextRoom = updatedTimestamps({
      ...room,
      syncVersion: Number(room.syncVersion || 0) + 1
    }, nowMs);
    await updateDocument(tx, V2_ENTRIES, expectedEntryId, {
      status: 'corrected', successorEntryId: entryId
    });
    await setDocument(tx, V2_ENTRIES, entryId, entry);
    await updateDocument(tx, V2_ROUNDS, roundId, nextRound);
    await updateDocument(tx, V2_ROOMS, roomId, nextRoom);
    await writeRequestLog(tx, {
      action, roomId, openid, requestId, payloadHash,
      resourceType: 'waterEntry', resourceId: entryId, roundId,
      targetEntryId: expectedEntryId,
      responseCode: 'WATER_ENTRY_CORRECTED', responseState: 'updated'
    });
    return { room: nextRoom, round: nextRound, entry, targetEntry: nextTarget };
  });
  const data = {
    roomSyncVersion: Number(outcome.room.syncVersion || 0),
    round: publicRound(outcome.round),
    entry: publicEntry(outcome.entry),
    targetEntry: publicEntry(outcome.targetEntry)
  };
  if (outcome.deduped) data.deduped = true;
  return v2Ok(
    outcome.deduped ? 'WATER_WRITE_DEDUPED' : 'WATER_ENTRY_CORRECTED',
    outcome.deduped ? '记录已处理' : '记录已更正',
    outcome.deduped ? 'deduped' : 'updated',
    data,
    traceId
  );
}

async function handleV2ReverseEntry(event, openid, traceId) {
  const action = 'reverseEntry';
  const roomId = v2RoomIdOf(event);
  const roundId = v2RoundIdOf(event);
  const rootEntryId = logic.cleanText(event.rootEntryId, 100);
  const expectedEntryId = logic.cleanText(event.expectedEntryId, 100);
  const requestId = requireV2Request(event);
  const payloadHash = payloadHashOf(canonicalMutationPayload(action, event));
  const outcome = await runV2Transaction(async (tx) => {
    const room = await requireV2Room(tx, roomId);
    const requestLog = await getSuccessfulRequestLog(tx, {
      action, roomId, openid, requestId, payloadHash
    });
    if (requestLog) return rehydrateEntryOutcome(tx, requestLog, roomId);
    const config = await readFeatureConfig(tx);
    assertV2WriteBase(config, roomId, openid);
    const member = await getMember(tx, roomId, openid);
    assertMemberWriteFlag(config, member, room);
    assertFeatureFlag(config.reverseWrite);
    const round = await requireRound(tx, roundId, roomId);
    assertWritableRound(room, round);
    const target = await getOptionalDocument(tx, V2_ENTRIES, expectedEntryId);
    assertEntryLifecycleTarget(target, rootEntryId, expectedEntryId, roomId, roundId);
    assertEntryPermission(member, target, room);
    const previousEffect = Array.isArray(target.effectSnapshot) ? target.effectSnapshot : [];
    const delta = logic.negateEffect(previousEffect);
    const nowMs = Date.now();
    const entryId = entryDocumentId(roundId, openid, action, requestId);
    const actor = participantById(room, member.participantId);
    const entry = {
      _id: entryId,
      roomId,
      roundId,
      seq: Number(round.nextSeq || 1),
      eventType: 'entry_reversed',
      category: target.category,
      status: 'applied',
      payload: null,
      effectSnapshot: [],
      ledgerDelta: delta,
      actorParticipantId: member.participantId,
      actorNameSnapshot: String(actor && actor.name || ''),
      rootCreatedByParticipantId: target.rootCreatedByParticipantId,
      rootEntryId,
      targetEntryId: expectedEntryId,
      targetEffectSnapshot: previousEffect.map((item) => ({ ...item })),
      previousEntryId: expectedEntryId,
      successorEntryId: '',
      createdAt: db.serverDate(),
      createdAtMs: nowMs
    };
    const nextTarget = { ...target, status: 'reversed', successorEntryId: entryId };
    const nextRound = updatedTimestamps({
      ...round,
      ledger: logic.applyLedgerDelta(round.ledger, delta),
      activeRecordCount: Number(round.activeRecordCount || 0) - 1,
      eventCount: Number(round.eventCount || 0) + 1,
      nextSeq: Number(round.nextSeq || 1) + 1,
      revision: Number(round.revision || 0) + 1
    }, nowMs);
    const nextRoom = updatedTimestamps({
      ...room,
      syncVersion: Number(room.syncVersion || 0) + 1
    }, nowMs);
    await updateDocument(tx, V2_ENTRIES, expectedEntryId, {
      status: 'reversed', successorEntryId: entryId
    });
    await setDocument(tx, V2_ENTRIES, entryId, entry);
    await updateDocument(tx, V2_ROUNDS, roundId, nextRound);
    await updateDocument(tx, V2_ROOMS, roomId, nextRoom);
    await writeRequestLog(tx, {
      action, roomId, openid, requestId, payloadHash,
      resourceType: 'waterEntry', resourceId: entryId, roundId,
      targetEntryId: expectedEntryId,
      responseCode: 'WATER_ENTRY_REVERSED', responseState: 'updated'
    });
    return { room: nextRoom, round: nextRound, entry, targetEntry: nextTarget };
  });
  const data = {
    roomSyncVersion: Number(outcome.room.syncVersion || 0),
    round: publicRound(outcome.round),
    entry: publicEntry(outcome.entry),
    targetEntry: publicEntry(outcome.targetEntry)
  };
  if (outcome.deduped) data.deduped = true;
  return v2Ok(
    outcome.deduped ? 'WATER_WRITE_DEDUPED' : 'WATER_ENTRY_REVERSED',
    outcome.deduped ? '记录已处理' : '记录已撤销',
    outcome.deduped ? 'deduped' : 'updated',
    data,
    traceId
  );
}

async function handleV2CreateRound(event, openid, traceId) {
  const action = 'createRound';
  const roomId = v2RoomIdOf(event);
  const requestId = requireV2Request(event);
  const payloadHash = payloadHashOf(canonicalMutationPayload(action, event));
  const outcome = await runV2Transaction(async (tx) => {
    const room = await requireV2Room(tx, roomId);
    const requestLog = await getSuccessfulRequestLog(tx, {
      action, roomId, openid, requestId, payloadHash
    });
    if (requestLog) {
      const round = await requireRound(tx, String(requestLog.resourceId || ''), roomId);
      const archivedRound = await requireRound(tx, String(requestLog.archivedRoundId || ''), roomId);
      return { deduped: true, room, round, archivedRound };
    }
    const config = await readFeatureConfig(tx);
    assertV2WriteBase(config, roomId, openid);
    const member = await getMember(tx, roomId, openid);
    assertRoomOwner(member, room);
    assertFeatureFlag(config.createRoundWrite);
    assertRoomVersion(room, event.expectedRoomVersion);
    const expectedActiveRoundId = logic.cleanText(event.expectedActiveRoundId, 100);
    if (!expectedActiveRoundId || expectedActiveRoundId !== String(room.activeRoundId || '')) {
      throw codeError('VERSION_CONFLICT', '账本刚刚有更新，请确认后重试', 'conflict');
    }
    const archivedRound = await requireRound(tx, expectedActiveRoundId, roomId);
    assertWritableRound(room, archivedRound);
    if (Number(archivedRound.recordCount || 0) <= 0) {
      throw codeError('WATER_ENTRY_INVALID', '本轮还没有记录');
    }
    const nextNumber = Number(room.roundCount || archivedRound.number || 0) + 1;
    const nextRound = buildRound(
      roomId,
      nextNumber,
      room.participants,
      member.participantId,
      expectedActiveRoundId
    );
    const nowMs = Date.now();
    const nextArchivedRound = updatedTimestamps({
      ...archivedRound,
      status: 'archived',
      nextRoundId: nextRound._id,
      revision: Number(archivedRound.revision || 0) + 1,
      archivedAt: db.serverDate(),
      archivedAtMs: nowMs
    }, nowMs);
    const nextRoom = updatedTimestamps({
      ...room,
      activeRoundId: nextRound._id,
      lastRoundId: expectedActiveRoundId,
      roundCount: nextNumber,
      roomVersion: Number(room.roomVersion || 0) + 1,
      syncVersion: Number(room.syncVersion || 0) + 1
    }, nowMs);
    await updateDocument(tx, V2_ROUNDS, expectedActiveRoundId, nextArchivedRound);
    await setDocument(tx, V2_ROUNDS, nextRound._id, nextRound);
    await updateDocument(tx, V2_ROOMS, roomId, nextRoom);
    await writeRequestLog(tx, {
      action, roomId, openid, requestId, payloadHash,
      resourceType: 'waterRound', resourceId: nextRound._id, roundId: nextRound._id,
      archivedRoundId: expectedActiveRoundId,
      responseCode: 'WATER_ROUND_STARTED', responseState: 'created'
    });
    return { room: nextRoom, round: nextRound, archivedRound: nextArchivedRound };
  });
  const data = {
    room: publicRoom(outcome.room),
    round: publicRound(outcome.round),
    archivedRoundId: String(outcome.archivedRound && (outcome.archivedRound._id || outcome.archivedRound.id) || '')
  };
  if (outcome.deduped) data.deduped = true;
  return v2Ok(
    outcome.deduped ? 'WATER_WRITE_DEDUPED' : 'WATER_ROUND_STARTED',
    outcome.deduped ? '记录已处理' : '已开始新一轮',
    outcome.deduped ? 'deduped' : 'created',
    data,
    traceId
  );
}

async function handleV2(event, openid, traceId) {
  const action = String(event && event.action || '').trim();
  if (action === 'create') return handleV2Create(event, openid, traceId);
  if (action === 'get') return handleV2Get(event, openid, traceId);
  if (action === 'listEntries') return handleV2ListEntries(event, openid, traceId);
  if (action === 'getEntry') return handleV2GetEntry(event, openid, traceId);
  if (action === 'listRounds') return handleV2ListRounds(event, openid, traceId);
  if (action === 'getRound') return handleV2GetRound(event, openid, traceId);
  if (action === 'join') return handleV2Join(event, openid, traceId);
  if (action === 'addParticipants') return handleV2AddParticipants(event, openid, traceId);
  if (action === 'recordGame' || action === 'recordDirect') {
    return handleV2Record(action, event, openid, traceId);
  }
  if (action === 'correctEntry') return handleV2CorrectEntry(event, openid, traceId);
  if (action === 'reverseEntry') return handleV2ReverseEntry(event, openid, traceId);
  if (action === 'createRound') return handleV2CreateRound(event, openid, traceId);
  throw codeError('WATER_ENTRY_INVALID', '不支持的打水操作');
}

exports.main = async (event = {}) => {
  const traceId = traceIdOf(event);
  const openid = String(cloud.getWXContext().OPENID || '').trim();
  const action = String(event.action || '').trim();
  try {
    if (!openid) throw codeError('PERMISSION_DENIED', '登录状态失效', 'forbidden');
    if (Number(event.apiVersion) === 2) return await handleV2(event, openid, traceId);
    if (action === 'create') {
      const roomId = stableId('water', openid);
      const migratedRoom = await getActiveMigratedRoom(db, roomId);
      if (migratedRoom) return await handleV1MigratedCreate(event, openid, traceId, migratedRoom);
      return await createSession(event, openid, traceId);
    }
    if (action === 'get' || action === 'getMineActive') {
      const id = action === 'getMineActive' ? stableId('water', openid) : sessionIdOf(event);
      const migratedRoom = await getActiveMigratedRoom(db, id);
      if (migratedRoom) {
        return await v1ProjectedResult(db, {
          room: migratedRoom,
          openid,
          traceId,
          code: 'WATER_SESSION_LOADED',
          message: '账本已加载',
          state: 'loaded'
        });
      }
      const session = await getSession(db, id);
      return result('WATER_SESSION_LOADED', '账本已加载', 'loaded', session, traceId, { openid });
    }
    const migratedRoom = await getActiveMigratedRoom(db, sessionIdOf(event));
    if (migratedRoom) {
      return await handleV1MigratedMutation(action, event, openid, traceId, migratedRoom);
    }
    return await handleMutation(action, event, openid, traceId);
  } catch (err) {
    return common.failResult(err.code || 'WATER_SESSION_FAILED', err.message || '打水操作失败', {
      state: err.state || (common.isConflictError(err) ? 'conflict' : 'error'),
      traceId
    });
  }
};
