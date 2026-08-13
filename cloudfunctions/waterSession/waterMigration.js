'use strict';

const crypto = require('node:crypto');
const logic = require('./waterLogic');

const COLLECTIONS = Object.freeze({
  legacy: 'waterSessions',
  rooms: 'waterRooms',
  members: 'waterRoomMembers',
  rounds: 'waterRounds',
  entries: 'waterEntries',
  migrations: 'waterMigrations'
});

const MAX_PARTICIPANTS = 24;
const MAX_BATCH_SIZE = 200;
const MAX_DRY_RUN_PAGE_SIZE = 100;
const DRY_RUN_WRITE_METHODS = Object.freeze([
  'write',
  'upsert',
  'insert',
  'add',
  'set',
  'update',
  'remove',
  'delete',
  'runTransaction',
  'transaction',
  'batch',
  'commit'
]);

class MigrationError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'MigrationError';
    this.code = code;
    this.details = details;
  }
}

function fail(code, message, details = {}) {
  throw new MigrationError(code, message, details);
}

function cleanId(value, maxLength = 128) {
  return String(value === undefined || value === null ? '' : value).trim().slice(0, maxLength);
}

function integerOr(value, fallback) {
  const number = Number(value);
  return Number.isSafeInteger(number) ? number : fallback;
}

function timestampMillis(value, fallback = NaN) {
  if (value instanceof Date) {
    const milliseconds = value.getTime();
    return Number.isSafeInteger(milliseconds) ? milliseconds : fallback;
  }
  if (value && typeof value.toMillis === 'function') {
    const milliseconds = Number(value.toMillis());
    return Number.isSafeInteger(milliseconds) ? milliseconds : fallback;
  }
  if (value && typeof value === 'object') {
    const seconds = Number(value.seconds === undefined ? value._seconds : value.seconds);
    const nanoseconds = Number(value.nanoseconds === undefined ? value._nanoseconds : value.nanoseconds);
    if (Number.isSafeInteger(seconds) && Number.isFinite(nanoseconds)) {
      const milliseconds = seconds * 1000 + Math.floor(nanoseconds / 1000000);
      return Number.isSafeInteger(milliseconds) ? milliseconds : fallback;
    }
  }
  if (typeof value === 'string' && value.trim()) {
    const milliseconds = Date.parse(value);
    return Number.isSafeInteger(milliseconds) ? milliseconds : fallback;
  }
  if (Number.isSafeInteger(value)) return value;
  return fallback;
}

function timestampField(document, millisecondsKey, dateKey, fallback) {
  const milliseconds = integerOr(document && document[millisecondsKey], NaN);
  if (Number.isSafeInteger(milliseconds)) return milliseconds;
  return timestampMillis(document && document[dateKey], fallback);
}

function dateAt(milliseconds) {
  return new Date(milliseconds);
}

function canonicalValue(value) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return String(value);
    return Object.is(value, -0) ? 0 : value;
  }
  if (typeof value === 'bigint') return value.toString();
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (value && typeof value.toMillis === 'function') return value.toMillis();
  if (value && typeof value === 'object') {
    const output = {};
    Object.keys(value).sort().forEach((key) => {
      if (value[key] !== undefined && typeof value[key] !== 'function') {
        output[key] = canonicalValue(value[key]);
      }
    });
    return output;
  }
  return String(value);
}

function canonicalJson(value) {
  return JSON.stringify(canonicalValue(value));
}

function isTimestampField(key) {
  return /(?:created|updated|joined|archived|activated|migrated)At$/u.test(String(key || ''));
}

function canonicalSourceValue(value, key = '') {
  if (isTimestampField(key)) {
    const milliseconds = timestampMillis(value);
    if (Number.isSafeInteger(milliseconds)) return { $timestampMs: milliseconds };
  }
  if (Array.isArray(value)) return value.map((item) => canonicalSourceValue(item));
  if (value && typeof value === 'object' && !(value instanceof Date)) {
    const output = {};
    Object.keys(value).sort().forEach((childKey) => {
      if (value[childKey] !== undefined && typeof value[childKey] !== 'function') {
        output[childKey] = canonicalSourceValue(value[childKey], childKey);
      }
    });
    return output;
  }
  return canonicalValue(value);
}

function sha256(value) {
  return crypto.createHash('sha256').update(canonicalJson(value), 'utf8').digest('hex');
}

function sourceHashOf(value) {
  return crypto.createHash('sha256')
    .update(JSON.stringify(canonicalSourceValue(value)), 'utf8')
    .digest('hex');
}

function stableId(prefix, value, length = 20) {
  const digest = crypto.createHash('sha1').update(String(value), 'utf8').digest('hex');
  return `${prefix}_${digest.slice(0, length)}`;
}

function clone(value) {
  if (value === undefined || value === null || typeof value !== 'object') return value;
  if (value instanceof Date) return new Date(value.getTime());
  if (typeof value.toMillis === 'function') {
    const milliseconds = timestampMillis(value);
    if (Number.isSafeInteger(milliseconds)) return dateAt(milliseconds);
  }
  if (Array.isArray(value)) return value.map(clone);
  return Object.keys(value).reduce((output, key) => {
    if (typeof value[key] !== 'function') output[key] = clone(value[key]);
    return output;
  }, {});
}

function withoutDocumentId(document) {
  const data = { ...(document || {}) };
  delete data._id;
  return data;
}

async function upsertDocument(writer, collectionName, documentId, document) {
  await writer.upsert(collectionName, documentId, withoutDocumentId(document));
}

function normalizeRecentRequestIds(value) {
  const output = [];
  const seen = new Set();
  (Array.isArray(value) ? value : []).forEach((item) => {
    const requestId = cleanId(item, 100);
    if (requestId && !seen.has(requestId)) {
      seen.add(requestId);
      output.push(requestId);
    }
  });
  return output;
}

function normalizeParticipants(legacy, roomId) {
  const source = Array.isArray(legacy.participants) ? legacy.participants : [];
  if (!source.length) fail('LEGACY_OWNER_MISSING', '旧账本缺少发起人球友');
  if (source.length > MAX_PARTICIPANTS) {
    fail('LEGACY_PARTICIPANT_LIMIT_EXCEEDED', '旧账本球友超过 24 人', {
      participantCount: source.length
    });
  }

  const baseCreatedAtMs = timestampField(legacy, 'createdAtMs', 'createdAt', 0);
  const seenIds = new Set();
  const seenNames = new Set();
  const seenOpenids = new Set();
  const participants = source.map((item, index) => {
    const id = cleanId(item && item.id, 80);
    const name = logic.cleanText(item && item.name, 20);
    const openid = cleanId(item && item.openid, 128);
    const nameKey = name.toLocaleLowerCase();
    if (!id || !name) {
      fail('LEGACY_PARTICIPANT_INVALID', '旧账本存在无效球友', { legacyIndex: index });
    }
    if (seenIds.has(id) || seenNames.has(nameKey)) {
      fail('LEGACY_PARTICIPANT_DUPLICATE', '旧账本存在重复球友', {
        legacyIndex: index,
        participantId: id
      });
    }
    if (openid && seenOpenids.has(openid)) {
      fail('LEGACY_MEMBER_DUPLICATE', '旧账本同一身份绑定了多个球友', {
        legacyIndex: index,
        participantId: id
      });
    }
    seenIds.add(id);
    seenNames.add(nameKey);
    if (openid) seenOpenids.add(openid);
    return {
      id,
      name,
      source: logic.cleanText(item && item.source, 20) || 'legacy',
      openid,
      claimed: Boolean(openid),
      createdAtMs: timestampField(item, 'createdAtMs', 'createdAt', baseCreatedAtMs + index)
    };
  });

  const ownerOpenid = cleanId(legacy.ownerOpenid, 128);
  const owner = participants.find((participant) => participant.openid === ownerOpenid);
  if (!ownerOpenid || !owner) {
    fail('LEGACY_OWNER_MISSING', '旧账本发起人身份无法映射');
  }

  const publicParticipants = participants.map((participant) => ({
    id: participant.id,
    name: participant.name,
    source: participant.source,
    claimed: participant.claimed,
    createdAtMs: participant.createdAtMs
  }));
  const updatedAtMs = timestampField(legacy, 'updatedAtMs', 'updatedAt', baseCreatedAtMs);
  const members = participants.filter((participant) => participant.openid).map((participant) => ({
    _id: stableId('wm', `${roomId}\n${participant.openid}`),
    roomId,
    participantId: participant.id,
    openid: participant.openid,
    role: participant.id === owner.id ? 'owner' : 'member',
    status: 'active',
    joinedAt: dateAt(participant.createdAtMs),
    joinedAtMs: participant.createdAtMs,
    updatedAt: dateAt(updatedAtMs),
    updatedAtMs
  }));

  return {
    owner,
    participants,
    publicParticipants,
    members
  };
}

function entryError(error, index) {
  const message = String(error && error.message || '旧账本记录无效');
  if (message.includes('参与人不存在')) {
    return new MigrationError('LEGACY_PARTICIPANT_UNKNOWN', message, { legacyIndex: index });
  }
  return new MigrationError('LEGACY_ENTRY_INVALID', message, { legacyIndex: index });
}

function normalizeLegacyEntry(rawEntry, index, context) {
  const legacyEntryId = cleanId(rawEntry && rawEntry.id, 128);
  if (legacyEntryId) {
    if (context.seenLegacyEntryIds.has(legacyEntryId)) {
      fail('LEGACY_DUPLICATE_ENTRY_ID', '旧账本存在重复记录 ID', {
        legacyIndex: index,
        legacyEntryId
      });
    }
    context.seenLegacyEntryIds.add(legacyEntryId);
  }

  let normalized;
  try {
    if (String(rawEntry && rawEntry.type || '') === 'game') {
      normalized = logic.normalizeGameEntry(rawEntry, context.publicParticipants);
    } else if (String(rawEntry && rawEntry.type || '') === 'transfer') {
      normalized = logic.normalizeV2DirectEntry(rawEntry, context.publicParticipants);
    } else {
      throw new Error('记录类型无效');
    }
  } catch (error) {
    throw entryError(error, index);
  }

  const preservesLegacyId = /^[A-Za-z0-9_-]{1,128}$/u.test(legacyEntryId);
  const sourceKey = `legacy-index:${index}:${sourceHashOf(rawEntry || {})}`;
  const entryId = preservesLegacyId
    ? legacyEntryId
    : stableId('wve', `${context.roomId}\n${sourceKey}`);
  const createdAtMs = timestampField(
    rawEntry,
    'createdAtMs',
    'createdAt',
    context.baseCreatedAtMs + index
  );
  const category = normalized.type === 'game' ? 'game' : 'direct';
  const payload = category === 'game'
    ? {
      winnerIds: normalized.winnerIds,
      loserIds: normalized.loserIds,
      unitsPerPlayer: normalized.unitsPerPlayer
    }
    : {
      fromPlayerId: normalized.fromPlayerId,
      toPlayerId: normalized.toPlayerId,
      units: normalized.units
    };
  const effectSnapshot = logic.effectForEntry(normalized);
  return {
    _id: entryId,
    roomId: context.roomId,
    roundId: context.roundId,
    seq: index + 1,
    eventType: category === 'game' ? 'game_recorded' : 'transfer_recorded',
    category,
    status: 'active',
    payload,
    effectSnapshot,
    ledgerDelta: clone(effectSnapshot),
    actorParticipantId: context.owner.id,
    actorNameSnapshot: context.owner.name,
    rootCreatedByParticipantId: context.owner.id,
    rootEntryId: entryId,
    targetEntryId: '',
    targetEffectSnapshot: [],
    previousEntryId: '',
    successorEntryId: '',
    source: 'legacy',
    legacyEntryId,
    createdAt: dateAt(createdAtMs),
    createdAtMs
  };
}

function ledgerIsConserved(ledger) {
  const totals = (Array.isArray(ledger) ? ledger : []).reduce((output, row) => {
    const won = Number(row && row.won);
    const treat = Number(row && row.treat);
    const net = Number(row && row.net);
    if (![won, treat, net].every(Number.isSafeInteger) || won < 0 || treat < 0 || net !== won - treat) {
      output.valid = false;
    }
    output.won += won;
    output.treat += treat;
    output.net += net;
    return output;
  }, { valid: true, won: 0, treat: 0, net: 0 });
  return totals.valid && totals.won === totals.treat && totals.net === 0;
}

function hashableRoom(room) {
  const output = clone(room);
  if (output && output.migration) output.migration.migratedAtMs = 0;
  return output;
}

function targetFingerprint(target, legacyRecentRequestIds) {
  return {
    room: hashableRoom(target.roomActive),
    round: target.round,
    members: [...target.members].sort((left, right) => left._id.localeCompare(right._id)),
    entries: [...target.entries].sort((left, right) => left.seq - right.seq || left._id.localeCompare(right._id)),
    legacyRecentRequestIds
  };
}

function planLegacyMigration(legacyInput) {
  const legacy = clone(legacyInput);
  if (!legacy || typeof legacy !== 'object') fail('LEGACY_ROOM_NOT_FOUND', '旧账本不存在');
  const roomId = cleanId(legacy._id, 128);
  if (!roomId) fail('LEGACY_ROOM_INVALID', '旧账本缺少 roomId');
  const sourceVersion = Number(legacy.version);
  if (!Number.isSafeInteger(sourceVersion) || sourceVersion < 0) {
    fail('LEGACY_VERSION_INVALID', '旧账本版本无效');
  }
  const legacyStatus = cleanId(legacy.status, 20).toLowerCase();
  if (legacyStatus !== 'active' && legacyStatus !== 'finished') {
    fail('LEGACY_STATUS_INVALID', '旧账本状态无效');
  }

  const sourceHash = sourceHashOf(legacyInput);
  const runId = stableId('wmigration', `${roomId}\n${sourceVersion}\n${sourceHash}`, 24);
  const normalizedParticipants = normalizeParticipants(legacy, roomId);
  const roundId = stableId('wr', `${roomId}\n1`);
  const baseCreatedAtMs = timestampField(legacy, 'createdAtMs', 'createdAt', 0);
  const rawEntries = Array.isArray(legacy.entries) ? legacy.entries : [];
  const entryContext = {
    roomId,
    roundId,
    owner: normalizedParticipants.owner,
    publicParticipants: normalizedParticipants.publicParticipants,
    baseCreatedAtMs,
    seenLegacyEntryIds: new Set()
  };
  const entries = rawEntries.map((entry, index) => normalizeLegacyEntry(entry, index, entryContext));
  let ledger = logic.createLedger(normalizedParticipants.publicParticipants);
  entries.forEach((entry) => {
    try {
      ledger = logic.applyLedgerDelta(ledger, entry.effectSnapshot);
    } catch (error) {
      throw entryError(error, entry.seq - 1);
    }
  });
  if (!ledgerIsConserved(ledger)) fail('LEGACY_LEDGER_NOT_CONSERVED', '旧账本总账不守恒');

  const updatedAtMs = timestampField(legacy, 'updatedAtMs', 'updatedAt', baseCreatedAtMs);
  const title = logic.cleanText(legacy.title, 80) || '打水局';
  const roundStatus = legacyStatus === 'finished' ? 'archived' : 'active';
  const round = {
    _id: roundId,
    roomId,
    number: 1,
    title,
    status: roundStatus,
    participantIds: normalizedParticipants.publicParticipants.map((participant) => participant.id),
    participantSnapshot: normalizedParticipants.publicParticipants.map((participant) => ({
      id: participant.id,
      name: participant.name
    })),
    ledger,
    recordCount: entries.length,
    activeRecordCount: entries.length,
    eventCount: entries.length,
    nextSeq: entries.length + 1,
    revision: entries.length + 1,
    previousRoundId: '',
    nextRoundId: '',
    createdByParticipantId: normalizedParticipants.owner.id,
    createdAt: dateAt(baseCreatedAtMs),
    createdAtMs: baseCreatedAtMs,
    archivedAt: roundStatus === 'archived' ? dateAt(updatedAtMs) : null,
    archivedAtMs: roundStatus === 'archived' ? updatedAtMs : 0,
    updatedAt: dateAt(updatedAtMs),
    updatedAtMs
  };
  const roomBase = {
    _id: roomId,
    schemaVersion: 2,
    ownerParticipantId: normalizedParticipants.owner.id,
    activeRoundId: '',
    lastRoundId: '',
    roundCount: 1,
    participants: normalizedParticipants.publicParticipants,
    roomVersion: Math.max(1, sourceVersion),
    syncVersion: sourceVersion,
    migrationStatus: 'staging',
    createdAt: dateAt(baseCreatedAtMs),
    createdAtMs: baseCreatedAtMs,
    updatedAt: dateAt(updatedAtMs),
    updatedAtMs,
    migration: {
      source: COLLECTIONS.legacy,
      sourceVersion,
      sourceHash,
      migratedAtMs: 0
    }
  };
  const roomActive = {
    ...clone(roomBase),
    activeRoundId: legacyStatus === 'active' ? roundId : '',
    lastRoundId: legacyStatus === 'finished' ? roundId : '',
    migrationStatus: 'active'
  };
  const legacyRecentRequestIds = normalizeRecentRequestIds(legacy.recentRequestIds);
  const target = {
    roomStaging: roomBase,
    roomActive,
    round,
    members: normalizedParticipants.members,
    entries
  };
  const targetHash = sha256(targetFingerprint(target, legacyRecentRequestIds));

  return {
    roomId,
    runId,
    sourceVersion,
    sourceHash,
    targetHash,
    participantCount: normalizedParticipants.publicParticipants.length,
    entryCount: entries.length,
    legacyRecentRequestIds,
    conserved: true,
    target
  };
}

function assertReadAdapter(adapter) {
  ['read'].forEach((method) => {
    if (!adapter || typeof adapter[method] !== 'function') {
      fail('MIGRATION_ADAPTER_INVALID', `迁移 adapter 缺少 ${method}`);
    }
  });
}

function assertWriteAdapter(adapter) {
  ['list', 'upsert', 'runTransaction'].forEach((method) => {
    if (!adapter || typeof adapter[method] !== 'function') {
      fail('MIGRATION_ADAPTER_INVALID', `迁移 adapter 缺少 ${method}`);
    }
  });
}

function nowFrom(clock) {
  const value = Number(clock());
  return Number.isSafeInteger(value) ? value : Date.now();
}

function summaryForPlan(plan, anomalies = []) {
  return {
    roomCount: 1,
    participantCount: plan.participantCount,
    entryCount: plan.entryCount,
    sourceHash: plan.sourceHash,
    targetHash: plan.targetHash,
    conserved: plan.conserved,
    anomalies
  };
}

function anomalySummary(legacy, error) {
  const safeLegacy = legacy && typeof legacy === 'object' ? legacy : {};
  return {
    roomCount: legacy ? 1 : 0,
    participantCount: Array.isArray(safeLegacy.participants) ? safeLegacy.participants.length : 0,
    entryCount: Array.isArray(safeLegacy.entries) ? safeLegacy.entries.length : 0,
    sourceHash: legacy ? sourceHashOf(legacy) : '',
    targetHash: '',
    conserved: false,
    anomalies: [{
      code: error && error.code || 'MIGRATION_PLAN_FAILED',
      message: String(error && error.message || '迁移计划生成失败')
    }]
  };
}

function stagingMarker(plan, timestamp) {
  return {
    _id: plan.roomId,
    runId: plan.runId,
    status: 'staging',
    sourceVersion: plan.sourceVersion,
    sourceHash: plan.sourceHash,
    targetHash: plan.targetHash,
    participantCount: plan.participantCount,
    entryCount: plan.entryCount,
    legacyRecentRequestIds: plan.legacyRecentRequestIds,
    checkpoint: {
      lastLegacyIndex: -1,
      writtenEntries: 0
    },
    errorCode: '',
    errorMessage: '',
    createdAt: dateAt(timestamp),
    createdAtMs: timestamp,
    updatedAt: dateAt(timestamp),
    updatedAtMs: timestamp,
    activatedAt: null,
    activatedAtMs: 0
  };
}

function assertStagingMarker(marker, plan) {
  if (String(marker.status || '') === 'active') {
    if (marker.sourceHash === plan.sourceHash && marker.targetHash === plan.targetHash) return 'active';
    fail('MIGRATION_ACTIVE_SOURCE_CHANGED', '已激活迁移的旧数据哈希已变化');
  }
  if (String(marker.status || '') === 'failed') {
    fail('MIGRATION_FAILED_REQUIRES_RESTART', '失败迁移必须显式重建计划后才能重试');
  }
  if (String(marker.status || '') !== 'staging') {
    fail('MIGRATION_STATUS_INVALID', '迁移状态无效');
  }
  if (marker.runId !== plan.runId
      || marker.sourceVersion !== plan.sourceVersion
      || marker.sourceHash !== plan.sourceHash
      || marker.targetHash !== plan.targetHash
      || Number(marker.participantCount) !== plan.participantCount
      || Number(marker.entryCount) !== plan.entryCount
      || canonicalJson(marker.legacyRecentRequestIds || []) !== canonicalJson(plan.legacyRecentRequestIds)) {
    fail('MIGRATION_STAGING_PLAN_CHANGED', '迁移期间源数据或目标计划已变化');
  }
  const checkpoint = marker.checkpoint || {};
  const lastLegacyIndex = Number(checkpoint.lastLegacyIndex);
  const writtenEntries = Number(checkpoint.writtenEntries);
  if (!Number.isInteger(lastLegacyIndex)
      || !Number.isInteger(writtenEntries)
      || lastLegacyIndex !== writtenEntries - 1
      || writtenEntries < 0
      || writtenEntries > plan.entryCount) {
    fail('MIGRATION_CHECKPOINT_INVALID', '迁移 checkpoint 无效');
  }
  return 'staging';
}

function targetDocumentRefs(plan) {
  return [
    {
      collectionName: COLLECTIONS.rooms,
      documentId: plan.roomId,
      document: plan.target.roomStaging
    },
    {
      collectionName: COLLECTIONS.rounds,
      documentId: plan.target.round._id,
      document: plan.target.round
    },
    ...plan.target.members.map((document) => ({
      collectionName: COLLECTIONS.members,
      documentId: document._id,
      document
    })),
    ...plan.target.entries.map((document) => ({
      collectionName: COLLECTIONS.entries,
      documentId: document._id,
      document
    }))
  ];
}

async function assertTargetUnoccupied(reader, plan) {
  for (const ref of targetDocumentRefs(plan)) {
    const existing = await reader.read(ref.collectionName, ref.documentId);
    if (existing) {
      fail('MIGRATION_TARGET_OCCUPIED', '确定性迁移目标已被占用', {
        collectionName: ref.collectionName,
        documentId: ref.documentId
      });
    }
  }
}

async function assertNonAnchorUnoccupied(reader, plan) {
  const nonAnchorRefs = targetDocumentRefs(plan).filter((ref) => (
    ref.collectionName !== COLLECTIONS.rooms
  ));
  for (const ref of nonAnchorRefs) {
    const existing = await reader.read(ref.collectionName, ref.documentId);
    if (existing) {
      fail('MIGRATION_TARGET_OCCUPIED', '确定性迁移目标已被占用', {
        collectionName: ref.collectionName,
        documentId: ref.documentId
      });
    }
  }
}

async function assertRecoverableTargets(reader, plan) {
  for (const ref of targetDocumentRefs(plan)) {
    const existing = await reader.read(ref.collectionName, ref.documentId);
    if (existing && canonicalJson(existing) !== canonicalJson(ref.document)) {
      fail('MIGRATION_RESUME_TARGET_MISMATCH', 'staging 目标不属于当前迁移计划', {
        collectionName: ref.collectionName,
        documentId: ref.documentId
      });
    }
  }
}

async function initializeStaging(adapter, plan, clock) {
  return adapter.runTransaction(async (transaction) => {
    const source = await transaction.read(COLLECTIONS.legacy, plan.roomId);
    if (!source
        || Number(source.version) !== plan.sourceVersion
        || sourceHashOf(source) !== plan.sourceHash) {
      fail('MIGRATION_SOURCE_CHANGED', '创建 staging 前旧账本已变化');
    }

    const racedMarker = await transaction.read(COLLECTIONS.migrations, plan.roomId);
    const racedRoom = await transaction.read(COLLECTIONS.rooms, plan.roomId);
    if (racedMarker) {
      const state = assertStagingMarker(racedMarker, plan);
      if (state === 'active') assertActiveRoom(racedRoom, plan);
      if (state === 'staging'
          && racedRoom
          && canonicalJson(racedRoom) !== canonicalJson(plan.target.roomStaging)) {
        fail('MIGRATION_RESUME_TARGET_MISMATCH', 'staging room 不属于当前迁移计划', {
          collectionName: COLLECTIONS.rooms,
          documentId: plan.roomId
        });
      }
      return { marker: racedMarker, state, created: false };
    }

    if (racedRoom) {
      fail('MIGRATION_TARGET_OCCUPIED', '确定性迁移目标已被占用', {
        collectionName: COLLECTIONS.rooms,
        documentId: plan.roomId
      });
    }
    const marker = stagingMarker(plan, nowFrom(clock));
    await upsertDocument(transaction, COLLECTIONS.migrations, plan.roomId, marker);
    await upsertDocument(transaction, COLLECTIONS.rooms, plan.roomId, plan.target.roomStaging);
    return { marker, state: 'staging', created: true };
  });
}

function compareDocumentSets(actual, expected) {
  const actualSorted = [...actual].sort((left, right) => String(left._id).localeCompare(String(right._id)));
  const expectedSorted = [...expected].sort((left, right) => String(left._id).localeCompare(String(right._id)));
  return canonicalJson(actualSorted) === canonicalJson(expectedSorted);
}

function sameLedger(actual, expected) {
  return canonicalJson(actual) === canonicalJson(expected);
}

async function validateWrittenTarget(reader, plan, marker) {
  const room = await reader.read(COLLECTIONS.rooms, plan.roomId);
  const round = await reader.read(COLLECTIONS.rounds, plan.target.round._id);
  const rounds = await reader.list(COLLECTIONS.rounds, { roomId: plan.roomId });
  const members = await reader.list(COLLECTIONS.members, { roomId: plan.roomId });
  const entries = await reader.list(COLLECTIONS.entries, { roomId: plan.roomId });
  if (!room || !round) fail('MIGRATION_TARGET_MISSING', '迁移目标文档缺失');
  if (rounds.length !== 1 || String(rounds[0] && rounds[0]._id || '') !== plan.target.round._id) {
    fail('MIGRATION_ROUND_SET_MISMATCH', '迁移目标包含计划外轮次');
  }
  if (String(room.migrationStatus || '') !== 'staging') {
    fail('MIGRATION_NOT_STAGING', '只有 staging 房间可以激活');
  }
  if (!Array.isArray(room.participants) || room.participants.length !== plan.participantCount
      || !Array.isArray(round.participantIds) || round.participantIds.length !== plan.participantCount
      || !Array.isArray(round.participantSnapshot) || round.participantSnapshot.length !== plan.participantCount) {
    fail('MIGRATION_PARTICIPANT_COUNT_MISMATCH', '迁移前后人数不一致');
  }
  if (members.length !== plan.target.members.length || !compareDocumentSets(members, plan.target.members)) {
    fail('MIGRATION_MEMBER_COUNT_MISMATCH', '迁移后的成员身份不一致');
  }
  if (entries.length !== plan.entryCount
      || Number(round.recordCount) !== plan.entryCount
      || Number(round.activeRecordCount) !== plan.entryCount
      || Number(round.eventCount) !== plan.entryCount) {
    fail('MIGRATION_RECORD_COUNT_MISMATCH', '迁移前后记录数不一致');
  }
  if (!ledgerIsConserved(round.ledger)) {
    fail('MIGRATION_NET_NOT_CONSERVED', '迁移目标总账不守恒');
  }
  if (!sameLedger(round.ledger, plan.target.round.ledger)) {
    fail('MIGRATION_LEDGER_MISMATCH', '迁移前后每人总账不一致');
  }
  if (!compareDocumentSets(entries, plan.target.entries)) {
    fail('MIGRATION_TARGET_HASH_MISMATCH', '迁移目标流水哈希不一致');
  }
  if (canonicalJson(room) !== canonicalJson(plan.target.roomStaging)
      || canonicalJson(round) !== canonicalJson(plan.target.round)) {
    fail('MIGRATION_TARGET_HASH_MISMATCH', '迁移目标房间或轮次哈希不一致');
  }
  const actualTarget = {
    roomStaging: room,
    roomActive: {
      ...clone(room),
      activeRoundId: plan.target.roomActive.activeRoundId,
      lastRoundId: plan.target.roomActive.lastRoundId,
      migrationStatus: 'active'
    },
    round,
    members,
    entries
  };
  const actualHash = sha256(targetFingerprint(actualTarget, marker.legacyRecentRequestIds || []));
  if (actualHash !== plan.targetHash || marker.targetHash !== plan.targetHash) {
    fail('MIGRATION_TARGET_HASH_MISMATCH', '迁移目标哈希不一致');
  }
  return { room, round };
}

async function markFailure(transaction, plan, marker, room, error, timestamp) {
  const failedMarker = {
    ...clone(marker),
    status: 'failed',
    errorCode: error.code,
    errorMessage: error.message,
    updatedAt: dateAt(timestamp),
    updatedAtMs: timestamp,
    activatedAt: null,
    activatedAtMs: 0
  };
  const failedRoom = {
    ...(room ? clone(room) : clone(plan.target.roomStaging)),
    activeRoundId: '',
    lastRoundId: '',
    migrationStatus: 'failed'
  };
  await upsertDocument(transaction, COLLECTIONS.rooms, plan.roomId, failedRoom);
  await upsertDocument(transaction, COLLECTIONS.migrations, plan.roomId, failedMarker);
}

function assertActiveRoom(room, plan) {
  if (!room
      || String(room.migrationStatus || '') !== 'active'
      || canonicalJson(hashableRoom(room)) !== canonicalJson(hashableRoom(plan.target.roomActive))) {
    fail('MIGRATION_ACTIVE_TARGET_MISMATCH', '已激活迁移的 room 与 marker 不一致');
  }
}

function conditionalWriteState(marker, room, plan) {
  if (!marker) fail('MIGRATION_NOT_STAGING', '只有 staging 迁移可以继续写入');
  const state = assertStagingMarker(marker, plan);
  if (state === 'active') {
    assertActiveRoom(room, plan);
    return 'active';
  }
  if (!room || canonicalJson(room) !== canonicalJson(plan.target.roomStaging)) {
    fail('MIGRATION_RESUME_TARGET_MISMATCH', 'staging room 不属于当前迁移计划', {
      collectionName: COLLECTIONS.rooms,
      documentId: plan.roomId
    });
  }
  return 'staging';
}

async function writeStagingStructure(adapter, plan) {
  return adapter.runTransaction(async (transaction) => {
    const marker = await transaction.read(COLLECTIONS.migrations, plan.roomId);
    const room = await transaction.read(COLLECTIONS.rooms, plan.roomId);
    const state = conditionalWriteState(marker, room, plan);
    if (state === 'active') return { state, marker };

    for (const member of plan.target.members) {
      await upsertDocument(transaction, COLLECTIONS.members, member._id, member);
    }
    await upsertDocument(transaction, COLLECTIONS.rounds, plan.target.round._id, plan.target.round);
    return { state, marker };
  });
}

async function writeNextStagingBatch(adapter, plan, batchSize, clock) {
  return adapter.runTransaction(async (transaction) => {
    const marker = await transaction.read(COLLECTIONS.migrations, plan.roomId);
    const room = await transaction.read(COLLECTIONS.rooms, plan.roomId);
    const state = conditionalWriteState(marker, room, plan);
    if (state === 'active') return { state, marker };

    const writtenEntries = Number(marker.checkpoint && marker.checkpoint.writtenEntries || 0);
    const batch = plan.target.entries.slice(writtenEntries, writtenEntries + batchSize);
    if (!batch.length) return { state, marker, writtenEntries };
    for (const entry of batch) {
      await upsertDocument(transaction, COLLECTIONS.entries, entry._id, entry);
    }
    const nextWrittenEntries = writtenEntries + batch.length;
    const checkpointAt = nowFrom(clock);
    const nextMarker = {
      ...clone(marker),
      checkpoint: {
        lastLegacyIndex: nextWrittenEntries - 1,
        writtenEntries: nextWrittenEntries
      },
      updatedAt: dateAt(checkpointAt),
      updatedAtMs: checkpointAt
    };
    await upsertDocument(transaction, COLLECTIONS.migrations, plan.roomId, nextMarker);
    return {
      state,
      marker: nextMarker,
      writtenEntries: nextWrittenEntries
    };
  });
}

async function activateMigration(adapter, plan, clock) {
  const outcome = await adapter.runTransaction(async (transaction) => {
    const source = await transaction.read(COLLECTIONS.legacy, plan.roomId);
    const marker = await transaction.read(COLLECTIONS.migrations, plan.roomId);
    const room = await transaction.read(COLLECTIONS.rooms, plan.roomId);
    if (marker && String(marker.status || '') === 'active') {
      assertStagingMarker(marker, plan);
      assertActiveRoom(room, plan);
      return { room, marker, deduped: true };
    }
    if (!marker || String(marker.status || '') !== 'staging'
        || !room || String(room.migrationStatus || '') !== 'staging') {
      return {
        error: new MigrationError('MIGRATION_NOT_STAGING', '只有 staging 迁移可以激活')
      };
    }

    const timestamp = nowFrom(clock);
    const currentSourceHash = source ? sourceHashOf(source) : '';
    const currentSourceVersion = source ? Number(source.version) : NaN;
    if (!source
        || currentSourceVersion !== plan.sourceVersion
        || currentSourceHash !== plan.sourceHash) {
      const error = new MigrationError('MIGRATION_SOURCE_CHANGED', '迁移期间旧账本已变化');
      await markFailure(transaction, plan, marker, room, error, timestamp);
      return { error };
    }

    try {
      await validateWrittenTarget(transaction, plan, marker);
    } catch (error) {
      const migrationError = error instanceof MigrationError
        ? error
        : new MigrationError('MIGRATION_TARGET_INVALID', String(error && error.message || error));
      await markFailure(transaction, plan, marker, room, migrationError, timestamp);
      return { error: migrationError };
    }

    const activeRoom = {
      ...clone(plan.target.roomActive),
      migration: {
        ...clone(plan.target.roomActive.migration),
        migratedAtMs: timestamp
      }
    };
    const activeMarker = {
      ...clone(marker),
      status: 'active',
      targetHash: plan.targetHash,
      checkpoint: {
        lastLegacyIndex: plan.entryCount - 1,
        writtenEntries: plan.entryCount
      },
      errorCode: '',
      errorMessage: '',
      updatedAt: dateAt(timestamp),
      updatedAtMs: timestamp,
      activatedAt: dateAt(timestamp),
      activatedAtMs: timestamp
    };
    await upsertDocument(transaction, COLLECTIONS.rooms, plan.roomId, activeRoom);
    await upsertDocument(transaction, COLLECTIONS.migrations, plan.roomId, activeMarker);
    return { room: activeRoom, marker: activeMarker, deduped: false };
  });

  if (outcome && outcome.error) throw outcome.error;
  return outcome;
}

async function runLegacyMigration(options = {}) {
  const adapter = options.adapter;
  assertReadAdapter(adapter);
  const roomId = cleanId(options.roomId, 128);
  if (!roomId) fail('LEGACY_ROOM_INVALID', '缺少迁移 roomId');
  const dryRun = options.dryRun === true;
  const clock = typeof options.clock === 'function' ? options.clock : Date.now;
  const requestedBatchSize = Number(options.batchSize === undefined ? MAX_BATCH_SIZE : options.batchSize);
  if (!Number.isInteger(requestedBatchSize) || requestedBatchSize < 1 || requestedBatchSize > MAX_BATCH_SIZE) {
    fail('MIGRATION_BATCH_SIZE_INVALID', '迁移批次必须在 1 到 200 之间');
  }

  const legacy = await adapter.read(COLLECTIONS.legacy, roomId);
  let plan;
  try {
    plan = planLegacyMigration(legacy);
  } catch (error) {
    if (dryRun) {
      return {
        ok: false,
        status: 'dry-run',
        dryRun: true,
        summary: anomalySummary(legacy, error)
      };
    }
    throw error;
  }
  if (plan.roomId !== roomId) fail('LEGACY_ROOM_INVALID', '旧账本 roomId 与请求不一致');
  const summary = summaryForPlan(plan);
  if (dryRun) {
    return {
      ok: true,
      status: 'dry-run',
      dryRun: true,
      runId: plan.runId,
      summary
    };
  }

  assertWriteAdapter(adapter);

  let marker = await adapter.read(COLLECTIONS.migrations, roomId);
  let stagingCreated = false;
  if (marker) {
    const markerState = assertStagingMarker(marker, plan);
    if (markerState === 'active') {
      assertActiveRoom(await adapter.read(COLLECTIONS.rooms, roomId), plan);
      return {
        ok: true,
        status: 'active',
        deduped: true,
        runId: plan.runId,
        summary
      };
    }
    await assertRecoverableTargets(adapter, plan);
  } else {
    await assertTargetUnoccupied(adapter, plan);
    const initialized = await initializeStaging(adapter, plan, clock);
    marker = initialized.marker;
    stagingCreated = initialized.created;
    if (initialized.state === 'active') {
      return {
        ok: true,
        status: 'active',
        deduped: true,
        runId: plan.runId,
        summary
      };
    }
    if (stagingCreated) {
      await assertNonAnchorUnoccupied(adapter, plan);
    } else {
      await assertRecoverableTargets(adapter, plan);
    }
  }

  const structure = await writeStagingStructure(adapter, plan);
  if (structure.state === 'active') {
    return {
      ok: true,
      status: 'active',
      deduped: true,
      runId: plan.runId,
      summary
    };
  }
  marker = structure.marker;
  let writtenEntries = Number(marker.checkpoint && marker.checkpoint.writtenEntries || 0);
  while (writtenEntries < plan.entryCount) {
    const batchOutcome = await writeNextStagingBatch(
      adapter,
      plan,
      requestedBatchSize,
      clock
    );
    if (batchOutcome.state === 'active') {
      return {
        ok: true,
        status: 'active',
        deduped: true,
        runId: plan.runId,
        summary
      };
    }
    marker = batchOutcome.marker;
    writtenEntries = batchOutcome.writtenEntries;
  }

  const activation = await activateMigration(adapter, plan, clock);
  return {
    ok: true,
    status: 'active',
    deduped: Boolean(activation && activation.deduped),
    runId: plan.runId,
    summary
  };
}

function assertDryRunOnly(options) {
  const writeIntent = options.dryRun === false
    || options.write === true
    || options.apply === true
    || options.execute === true
    || options.commit === true
    || options.mode && String(options.mode).toLowerCase() !== 'dry-run';
  if (writeIntent) {
    fail('MIGRATION_DRY_RUN_ONLY', '此入口只支持零写入 dry-run');
  }
}

function assertDryRunAuditAdapter(adapter) {
  if (!adapter || typeof adapter.listLegacyRooms !== 'function' || typeof adapter.read !== 'function') {
    fail(
      'MIGRATION_DRY_RUN_ADAPTER_INVALID',
      'dry-run adapter 必须且只能提供 listLegacyRooms 和 read 读取能力'
    );
  }
  const exposedWriteMethod = DRY_RUN_WRITE_METHODS.find((method) => (
    typeof adapter[method] === 'function'
  ));
  if (exposedWriteMethod) {
    fail(
      'MIGRATION_DRY_RUN_ADAPTER_WRITE_CAPABILITY',
      `dry-run adapter 不得暴露写方法 ${exposedWriteMethod}`
    );
  }
}

function normalizeDryRunPage(page, cursor) {
  if (!page || typeof page !== 'object' || !Array.isArray(page.roomIds)) {
    fail('MIGRATION_DRY_RUN_PAGE_INVALID', 'listLegacyRooms 必须返回 roomIds[] 和 nextCursor');
  }
  const roomIds = page.roomIds.map((value) => cleanId(value, 128));
  if (roomIds.some((roomId) => !roomId)) {
    fail('MIGRATION_DRY_RUN_PAGE_INVALID', 'listLegacyRooms 返回了空 roomId');
  }
  const nextCursor = cleanId(page.nextCursor, 512);
  if (page.hasMore === true && !nextCursor) {
    fail('MIGRATION_DRY_RUN_PAGE_INVALID', 'listLegacyRooms 声明 hasMore 时必须返回 nextCursor');
  }
  if (nextCursor && nextCursor === cursor) {
    fail('MIGRATION_DRY_RUN_CURSOR_STALLED', 'listLegacyRooms 的 nextCursor 未前进');
  }
  return { roomIds, nextCursor };
}

function dryRunRoomReport(roomId, result) {
  const summary = result && result.summary || {};
  const anomalies = (Array.isArray(summary.anomalies) ? summary.anomalies : []).map((item) => ({
    code: cleanId(item && item.code, 100) || 'MIGRATION_PLAN_FAILED',
    message: String(item && item.message || '迁移计划生成失败')
  }));
  return {
    roomId,
    ok: Boolean(result && result.ok),
    runId: cleanId(result && result.runId, 128),
    participantCount: Math.max(0, integerOr(summary.participantCount, 0)),
    entryCount: Math.max(0, integerOr(summary.entryCount, 0)),
    sourceHash: cleanId(summary.sourceHash, 64),
    targetHash: cleanId(summary.targetHash, 64),
    conserved: summary.conserved === true,
    anomalies
  };
}

function dryRunReadFailureReport(roomId, error) {
  return {
    roomId,
    ok: false,
    runId: '',
    participantCount: 0,
    entryCount: 0,
    sourceHash: '',
    targetHash: '',
    conserved: false,
    anomalies: [{
      code: cleanId(error && error.code, 100) || 'MIGRATION_DRY_RUN_ROOM_FAILED',
      message: String(error && error.message || '读取旧账本失败')
    }]
  };
}

function aggregateDryRunHash(rooms, field) {
  return sha256(rooms.map((room) => ({
    roomId: room.roomId,
    hash: room[field]
  })));
}

async function runLegacyMigrationDryRunAudit(options = {}) {
  assertDryRunOnly(options);
  const adapter = options.adapter;
  assertDryRunAuditAdapter(adapter);
  const requestedPageSize = Number(options.pageSize === undefined
    ? MAX_DRY_RUN_PAGE_SIZE
    : options.pageSize);
  if (!Number.isInteger(requestedPageSize)
      || requestedPageSize < 1
      || requestedPageSize > MAX_DRY_RUN_PAGE_SIZE) {
    fail('MIGRATION_DRY_RUN_PAGE_SIZE_INVALID', 'dry-run 分页大小必须在 1 到 100 之间');
  }

  const clock = typeof options.clock === 'function' ? options.clock : Date.now;
  const generatedAtMs = nowFrom(clock);
  const seenRoomIds = new Set();
  const rooms = [];
  const scanAnomalies = [];
  const seenCursors = new Set();
  let cursor = '';
  let scanning = true;

  while (scanning) {
    if (seenCursors.has(cursor)) {
      fail('MIGRATION_DRY_RUN_CURSOR_STALLED', 'listLegacyRooms 的 cursor 出现循环');
    }
    seenCursors.add(cursor);
    const page = normalizeDryRunPage(await adapter.listLegacyRooms({
      cursor,
      limit: requestedPageSize
    }), cursor);

    for (const roomId of page.roomIds) {
      if (seenRoomIds.has(roomId)) {
        scanAnomalies.push({
          roomId,
          code: 'MIGRATION_DRY_RUN_DUPLICATE_ROOM_ID',
          message: '分页结果重复返回同一 roomId，已跳过重复项'
        });
        continue;
      }
      seenRoomIds.add(roomId);
      try {
        const result = await runLegacyMigration({
          adapter: Object.freeze({
            read: (collectionName, documentId) => adapter.read(collectionName, documentId)
          }),
          roomId,
          dryRun: true
        });
        rooms.push(dryRunRoomReport(roomId, result));
      } catch (error) {
        rooms.push(dryRunReadFailureReport(roomId, error));
      }
    }

    if (page.nextCursor) {
      cursor = page.nextCursor;
    } else {
      scanning = false;
    }
  }

  rooms.sort((left, right) => left.roomId.localeCompare(right.roomId));
  const roomAnomalies = rooms.flatMap((room) => room.anomalies.map((anomaly) => ({
    roomId: room.roomId,
    ...anomaly
  })));
  const anomalies = [...roomAnomalies, ...scanAnomalies].sort((left, right) => (
    left.roomId.localeCompare(right.roomId) || left.code.localeCompare(right.code)
  ));
  const migratableRoomCount = rooms.filter((room) => room.ok).length;
  const anomalyRoomCount = rooms.length - migratableRoomCount;
  const conservedRoomCount = rooms.filter((room) => room.ok && room.conserved).length;
  const participantCount = rooms.reduce((sum, room) => sum + room.participantCount, 0);
  const entryCount = rooms.reduce((sum, room) => sum + room.entryCount, 0);

  return {
    reportVersion: 1,
    kind: 'water-v2-legacy-migration-dry-run',
    mode: 'dry-run',
    dryRun: true,
    writeEnabled: false,
    generatedAt: new Date(generatedAtMs).toISOString(),
    sourceCollection: COLLECTIONS.legacy,
    summary: {
      roomCount: rooms.length,
      migratableRoomCount,
      anomalyRoomCount,
      participantCount,
      entryCount,
      conservedRoomCount,
      allConserved: rooms.length === conservedRoomCount && anomalies.length === 0,
      anomalyCount: anomalies.length,
      writeCount: 0,
      sourceHash: aggregateDryRunHash(rooms, 'sourceHash'),
      targetHash: aggregateDryRunHash(rooms, 'targetHash')
    },
    rooms,
    anomalies
  };
}

module.exports = {
  COLLECTIONS,
  MigrationError,
  canonicalJson,
  planLegacyMigration,
  runLegacyMigration,
  runLegacyMigrationDryRunAudit
};
