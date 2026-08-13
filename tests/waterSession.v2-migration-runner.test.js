const test = require('node:test');
const assert = require('node:assert/strict');

const {
  MigrationError,
  planLegacyMigration,
  runLegacyMigration
} = require('../cloudfunctions/waterSession/waterMigration');

const COLLECTIONS = Object.freeze({
  legacy: 'waterSessions',
  rooms: 'waterRooms',
  members: 'waterRoomMembers',
  rounds: 'waterRounds',
  entries: 'waterEntries',
  migrations: 'waterMigrations'
});

function clone(value) {
  if (value === undefined || value === null || typeof value !== 'object') return value;
  if (value instanceof Date) return new Date(value.getTime());
  if (Array.isArray(value)) return value.map(clone);
  return Object.keys(value).reduce((output, key) => {
    if (typeof value[key] !== 'function') output[key] = clone(value[key]);
    return output;
  }, {});
}

function withoutId(document) {
  const output = clone(document) || {};
  delete output._id;
  return output;
}

function cloudTimestamp(milliseconds) {
  const seconds = Math.floor(milliseconds / 1000);
  const nanoseconds = (milliseconds - seconds * 1000) * 1000000;
  return {
    seconds,
    nanoseconds,
    toMillis() {
      return milliseconds;
    }
  };
}

function timestampMillis(value) {
  if (value instanceof Date) return value.getTime();
  if (value && typeof value.toMillis === 'function') return value.toMillis();
  return Date.parse(value);
}

function assertDateOrNull(value, label) {
  assert.ok(value === null || value instanceof Date, `${label} must be Date or null`);
}

function assertContractDatePayload(collectionName, document) {
  if (collectionName === COLLECTIONS.rooms) {
    assert.ok(document.createdAt instanceof Date, 'waterRooms.createdAt must be Date');
    assert.ok(document.updatedAt instanceof Date, 'waterRooms.updatedAt must be Date');
  } else if (collectionName === COLLECTIONS.members) {
    assert.ok(document.joinedAt instanceof Date, 'waterRoomMembers.joinedAt must be Date');
    assert.ok(document.updatedAt instanceof Date, 'waterRoomMembers.updatedAt must be Date');
  } else if (collectionName === COLLECTIONS.rounds) {
    assert.ok(document.createdAt instanceof Date, 'waterRounds.createdAt must be Date');
    assert.ok(document.updatedAt instanceof Date, 'waterRounds.updatedAt must be Date');
    assertDateOrNull(document.archivedAt, 'waterRounds.archivedAt');
  } else if (collectionName === COLLECTIONS.entries) {
    assert.ok(document.createdAt instanceof Date, 'waterEntries.createdAt must be Date');
  } else if (collectionName === COLLECTIONS.migrations) {
    assert.ok(document.createdAt instanceof Date, 'waterMigrations.createdAt must be Date');
    assert.ok(document.updatedAt instanceof Date, 'waterMigrations.updatedAt must be Date');
    assertDateOrNull(document.activatedAt, 'waterMigrations.activatedAt');
  }
}

function collectionStore(seed = {}) {
  const store = new Map();
  Object.entries(seed).forEach(([collectionName, documents]) => {
    store.set(collectionName, new Map(Object.entries(documents || {}).map(([id, document]) => [
      id,
      clone({ ...document, _id: document && document._id || id })
    ])));
  });
  Object.values(COLLECTIONS).forEach((collectionName) => {
    if (!store.has(collectionName)) store.set(collectionName, new Map());
  });
  return store;
}

function makeFakeAdapter(seed = {}) {
  const store = collectionStore(seed);
  let writeCount = 0;
  let entryWriteAttempts = 0;
  let failure = null;
  let beforeTransaction = null;
  const beforeTransactionByAttempt = new Map();
  let transactionAttempts = 0;
  const transactionCommits = [];
  const transactionReadCounts = [];

  function mapFor(collectionName, source = store) {
    if (!source.has(collectionName)) source.set(collectionName, new Map());
    return source.get(collectionName);
  }

  function readFrom(source, collectionName, documentId) {
    return clone(mapFor(collectionName, source).get(documentId) || null);
  }

  function listFrom(source, collectionName, predicate = {}) {
    return Array.from(mapFor(collectionName, source).values())
      .filter((document) => Object.entries(predicate).every(([key, value]) => document[key] === value))
      .map(clone);
  }

  function writeTo(source, collectionName, documentId, document, context = {}) {
    assert.equal(
      Object.prototype.hasOwnProperty.call(document || {}, '_id'),
      false,
      `adapter rejected reserved _id in ${collectionName}/${documentId}`
    );
    if (!context.external) assertContractDatePayload(collectionName, document);
    if (collectionName === COLLECTIONS.entries) entryWriteAttempts += 1;
    if (failure && failure({
      collectionName,
      documentId,
      document: clone(document),
      writeCount,
      entryWriteAttempts
    })) {
      failure = null;
      throw new Error('injected migration write crash');
    }
    mapFor(collectionName, source).set(documentId, clone({ ...document, _id: documentId }));
    if (!context.transaction) writeCount += 1;
  }

  return {
    async read(collectionName, documentId) {
      return readFrom(store, collectionName, documentId);
    },

    async list(collectionName, predicate) {
      return listFrom(store, collectionName, predicate);
    },

    async upsert(collectionName, documentId, document) {
      writeTo(store, collectionName, documentId, document);
    },

    async runTransaction(work) {
      transactionAttempts += 1;
      if (beforeTransaction || beforeTransactionByAttempt.has(transactionAttempts)) {
        const hook = beforeTransactionByAttempt.get(transactionAttempts) || beforeTransaction;
        beforeTransaction = null;
        beforeTransactionByAttempt.delete(transactionAttempts);
        await hook({
          read: (collectionName, documentId) => readFrom(store, collectionName, documentId),
          list: (collectionName, predicate) => listFrom(store, collectionName, predicate),
          upsert: (collectionName, documentId, document) => {
            writeTo(store, collectionName, documentId, document, { external: true });
          }
        });
      }
      const draft = new Map(Array.from(store.entries()).map(([collectionName, documents]) => [
        collectionName,
        new Map(Array.from(documents.entries()).map(([id, document]) => [id, clone(document)]))
      ]));
      const writes = [];
      let readCount = 0;
      function countRead() {
        readCount += 1;
        assert.ok(readCount <= 12, `transaction read budget exceeded: ${readCount}`);
      }
      const transaction = {
        read: async (collectionName, documentId) => {
          countRead();
          return readFrom(draft, collectionName, documentId);
        },
        list: async (collectionName, predicate) => {
          countRead();
          return listFrom(draft, collectionName, predicate);
        },
        upsert: async (collectionName, documentId, document) => {
          writeTo(draft, collectionName, documentId, document, { transaction: true });
          writes.push(`${collectionName}/${documentId}`);
        }
      };
      const result = await work(transaction);
      store.clear();
      draft.forEach((documents, collectionName) => store.set(collectionName, documents));
      writeCount += writes.length;
      transactionReadCounts.push(readCount);
      transactionCommits.push(writes);
      return result;
    },

    failOnceWhen(predicate) {
      failure = predicate;
    },

    beforeNextTransaction(hook) {
      beforeTransaction = hook;
    },

    beforeTransactionAt(attempt, hook) {
      beforeTransactionByAttempt.set(attempt, hook);
    },

    document(collectionName, documentId) {
      return readFrom(store, collectionName, documentId);
    },

    documents(collectionName, predicate = {}) {
      return listFrom(store, collectionName, predicate);
    },

    stats() {
      return {
        writeCount,
        entryWriteAttempts,
        transactionReadCounts: clone(transactionReadCounts),
        transactionCommits: clone(transactionCommits)
      };
    }
  };
}

function deferred() {
  let resolve;
  const promise = new Promise((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
}

function legacyFixture(options = {}) {
  const roomId = options.roomId || 'water_legacy_room';
  const participants = options.participants || [
    {
      id: 'p_owner',
      name: '阿杰',
      source: 'owner',
      openid: 'openid_owner',
      createdAtMs: 1700000000000
    },
    {
      id: 'p_claimed',
      name: '王姐',
      source: 'invite',
      openid: 'openid_member',
      createdAtMs: 1700000000001
    },
    {
      id: 'p_unclaimed',
      name: 'Chris',
      source: 'manual',
      createdAtMs: 1700000000002
    }
  ];
  const entries = options.entries || [
    {
      id: 'legacy_game_1',
      type: 'game',
      winnerIds: ['p_owner'],
      loserIds: ['p_claimed'],
      unitsPerPlayer: 2,
      createdAtMs: 1700000000100
    },
    {
      type: 'transfer',
      fromPlayerId: 'p_owner',
      toPlayerId: 'p_unclaimed',
      units: 1
    }
  ];
  return {
    _id: roomId,
    ownerOpenid: options.ownerOpenid || 'openid_owner',
    title: options.title || '8月8日打水局',
    status: options.status || 'active',
    version: options.version === undefined ? 17 : options.version,
    participants,
    entries,
    recentRequestIds: options.recentRequestIds || ['legacy_req_1', 'legacy_req_2', 'legacy_req_1'],
    createdAtMs: 1700000000000,
    updatedAtMs: 1700000000200
  };
}

function seedFor(legacy) {
  return {
    [COLLECTIONS.legacy]: {
      [legacy._id]: legacy
    }
  };
}

function manyEntries(count) {
  return Array.from({ length: count }, (_, index) => ({
    id: `legacy_entry_${index + 1}`,
    type: 'transfer',
    fromPlayerId: index % 2 === 0 ? 'p_owner' : 'p_claimed',
    toPlayerId: index % 2 === 0 ? 'p_claimed' : 'p_owner',
    units: index % 99 + 1,
    createdAtMs: 1700000010000 + index
  }));
}

test('planner deterministically maps IDs, hashes, owner/member identities, ledger and tombstones', () => {
  const legacy = legacyFixture();
  const first = planLegacyMigration(legacy);
  const second = planLegacyMigration(clone(legacy));

  assert.equal(first.runId, second.runId);
  assert.equal(first.sourceHash, second.sourceHash);
  assert.equal(first.targetHash, second.targetHash);
  assert.deepEqual(first.target, second.target);
  assert.match(first.runId, /^wmigration_[0-9a-f]{24}$/);
  assert.match(first.target.round._id, /^wr_[0-9a-f]{20}$/);
  assert.equal(first.target.entries.length, 2);
  assert.equal(new Set(first.target.entries.map((entry) => entry._id)).size, 2);
  assert.equal(first.target.entries[0]._id, 'legacy_game_1');
  assert.match(first.target.entries[1]._id, /^wve_[0-9a-f]{20}$/);

  assert.equal(first.target.roomStaging._id, legacy._id);
  assert.equal(first.target.roomStaging.migrationStatus, 'staging');
  assert.equal(first.target.roomActive.migrationStatus, 'active');
  assert.equal(first.target.roomActive.activeRoundId, first.target.round._id);
  assert.equal(first.target.roomActive.lastRoundId, '');
  assert.equal(first.target.round.status, 'active');
  assert.equal(first.target.round.recordCount, 2);
  assert.equal(first.target.round.eventCount, 2);
  assert.equal(first.target.round.nextSeq, 3);
  assert.deepEqual(first.target.round.ledger, [
    { participantId: 'p_owner', won: 2, treat: 1, net: 1 },
    { participantId: 'p_claimed', won: 0, treat: 2, net: -2 },
    { participantId: 'p_unclaimed', won: 1, treat: 0, net: 1 }
  ]);

  assert.deepEqual(first.legacyRecentRequestIds, ['legacy_req_1', 'legacy_req_2']);
  assert.equal(first.target.members.length, 2);
  assert.deepEqual(first.target.members.map((member) => member.role).sort(), ['member', 'owner']);
  assert.equal(first.target.members.find((member) => member.role === 'owner').participantId, 'p_owner');
  assert.ok(first.target.roomStaging.participants.every((participant) => !('openid' in participant)));
  assert.equal(first.target.roomStaging.participants.find((item) => item.id === 'p_owner').claimed, true);
  assert.equal(first.target.roomStaging.participants.find((item) => item.id === 'p_claimed').claimed, true);
  assert.equal(first.target.roomStaging.participants.find((item) => item.id === 'p_unclaimed').claimed, false);
  assert.ok(first.target.entries.every((entry) => (
    entry.actorParticipantId === 'p_owner'
      && entry.rootCreatedByParticipantId === 'p_owner'
      && entry.source === 'legacy'
  )));
  assert.equal(first.target.entries[1].createdAtMs, legacy.createdAtMs + 1);
  assert.ok(first.target.roomStaging.createdAt instanceof Date);
  assert.ok(first.target.roomStaging.updatedAt instanceof Date);
  assert.ok(first.target.roomActive.createdAt instanceof Date);
  assert.ok(first.target.roomActive.updatedAt instanceof Date);
  first.target.members.forEach((member) => {
    assert.ok(member.joinedAt instanceof Date);
    assert.ok(member.updatedAt instanceof Date);
  });
  assert.ok(first.target.round.createdAt instanceof Date);
  assert.ok(first.target.round.updatedAt instanceof Date);
  assert.equal(first.target.round.archivedAt, null);
  first.target.entries.forEach((entry) => assert.ok(entry.createdAt instanceof Date));
});

test('planner keeps Date and cloned Cloud Timestamp hashes stable and derives every date fallback', () => {
  const roomCreatedAtMs = 1701000000123;
  const roomUpdatedAtMs = 1701000001456;
  const ownerJoinedAtMs = 1701000002234;
  const entryCreatedAtMs = 1701000003567;
  const legacy = legacyFixture();
  delete legacy.createdAtMs;
  delete legacy.updatedAtMs;
  legacy.createdAt = new Date(roomCreatedAtMs);
  legacy.updatedAt = cloudTimestamp(roomUpdatedAtMs);
  delete legacy.participants[0].createdAtMs;
  legacy.participants[0].createdAt = cloudTimestamp(ownerJoinedAtMs);
  delete legacy.entries[0].createdAtMs;
  legacy.entries[0].createdAt = new Date(entryCreatedAtMs);

  const fromRichTimestamps = planLegacyMigration(legacy);
  const fromAdapterClone = planLegacyMigration(clone(legacy));

  assert.equal(fromRichTimestamps.sourceHash, fromAdapterClone.sourceHash);
  assert.equal(fromRichTimestamps.targetHash, fromAdapterClone.targetHash);
  assert.equal(fromRichTimestamps.target.roomStaging.createdAtMs, roomCreatedAtMs);
  assert.equal(fromRichTimestamps.target.roomStaging.updatedAtMs, roomUpdatedAtMs);
  assert.equal(timestampMillis(fromRichTimestamps.target.roomStaging.createdAt), roomCreatedAtMs);
  assert.equal(timestampMillis(fromRichTimestamps.target.roomStaging.updatedAt), roomUpdatedAtMs);

  const ownerMember = fromRichTimestamps.target.members.find((member) => member.role === 'owner');
  assert.equal(ownerMember.joinedAtMs, ownerJoinedAtMs);
  assert.equal(timestampMillis(ownerMember.joinedAt), ownerJoinedAtMs);
  assert.equal(timestampMillis(ownerMember.updatedAt), roomUpdatedAtMs);
  assert.equal(fromRichTimestamps.target.round.createdAtMs, roomCreatedAtMs);
  assert.equal(timestampMillis(fromRichTimestamps.target.round.createdAt), roomCreatedAtMs);
  assert.equal(timestampMillis(fromRichTimestamps.target.round.updatedAt), roomUpdatedAtMs);
  assert.equal(fromRichTimestamps.target.entries[0].createdAtMs, entryCreatedAtMs);
  assert.equal(timestampMillis(fromRichTimestamps.target.entries[0].createdAt), entryCreatedAtMs);
});

test('invalid legacy entry IDs use stable namespaced IDs while valid Cloud IDs are preserved', () => {
  const legacy = legacyFixture({
    entries: [
      {
        id: 'valid_entry-01',
        type: 'transfer',
        fromPlayerId: 'p_owner',
        toPlayerId: 'p_claimed',
        units: 1
      },
      {
        id: 'invalid/entry id',
        type: 'transfer',
        fromPlayerId: 'p_claimed',
        toPlayerId: 'p_owner',
        units: 2
      }
    ]
  });

  const first = planLegacyMigration(legacy);
  const second = planLegacyMigration(clone(legacy));

  assert.equal(first.target.entries[0]._id, 'valid_entry-01');
  assert.match(first.target.entries[1]._id, /^wve_[0-9a-f]{20}$/);
  assert.equal(first.target.entries[1]._id, second.target.entries[1]._id);
  assert.equal(first.target.entries[1].legacyEntryId, 'invalid/entry id');
});

test('dry-run is zero-write and reports valid hashes or isolated anomalies', async () => {
  const legacy = legacyFixture();
  const validAdapter = makeFakeAdapter(seedFor(legacy));
  const before = validAdapter.document(COLLECTIONS.legacy, legacy._id);

  const valid = await runLegacyMigration({
    adapter: validAdapter,
    roomId: legacy._id,
    dryRun: true
  });

  assert.equal(valid.ok, true);
  assert.equal(valid.status, 'dry-run');
  assert.equal(valid.summary.roomCount, 1);
  assert.equal(valid.summary.participantCount, 3);
  assert.equal(valid.summary.entryCount, 2);
  assert.equal(valid.summary.conserved, true);
  assert.match(valid.summary.sourceHash, /^[0-9a-f]{64}$/);
  assert.match(valid.summary.targetHash, /^[0-9a-f]{64}$/);
  assert.deepEqual(valid.summary.anomalies, []);
  assert.equal(validAdapter.stats().writeCount, 0);
  assert.deepEqual(validAdapter.document(COLLECTIONS.legacy, legacy._id), before);

  const invalid = legacyFixture({
    entries: [{
      type: 'transfer',
      fromPlayerId: 'p_owner',
      toPlayerId: 'missing_participant',
      units: 1
    }]
  });
  const invalidAdapter = makeFakeAdapter(seedFor(invalid));
  const report = await runLegacyMigration({
    adapter: invalidAdapter,
    roomId: invalid._id,
    dryRun: true
  });

  assert.equal(report.ok, false);
  assert.equal(report.status, 'dry-run');
  assert.deepEqual(report.summary.anomalies.map((item) => item.code), ['LEGACY_PARTICIPANT_UNKNOWN']);
  assert.equal(invalidAdapter.stats().writeCount, 0);
  assert.equal(invalidAdapter.documents(COLLECTIONS.rooms).length, 0);
  assert.equal(invalidAdapter.documents(COLLECTIONS.migrations).length, 0);
});

test('dry-run accepts a read-only adapter and never requires write or transaction methods', async () => {
  const legacy = legacyFixture();
  let reads = 0;
  const adapter = {
    async read(collectionName, documentId) {
      reads += 1;
      assert.equal(collectionName, COLLECTIONS.legacy);
      assert.equal(documentId, legacy._id);
      return clone(legacy);
    }
  };

  const result = await runLegacyMigration({
    adapter,
    roomId: legacy._id,
    dryRun: true
  });

  assert.equal(result.ok, true);
  assert.equal(result.status, 'dry-run');
  assert.equal(reads, 1);
});

test('markerless migration rejects every occupied deterministic target before any write', async (t) => {
  const legacy = legacyFixture();
  const plan = planLegacyMigration(legacy);
  const cases = [
    {
      name: 'room',
      collectionName: COLLECTIONS.rooms,
      document: { _id: legacy._id, schemaVersion: 2, migrationStatus: 'active', foreign: true }
    },
    {
      name: 'round',
      collectionName: COLLECTIONS.rounds,
      document: { _id: plan.target.round._id, roomId: 'foreign_room', foreign: true }
    },
    {
      name: 'member',
      collectionName: COLLECTIONS.members,
      document: { _id: plan.target.members[0]._id, roomId: 'foreign_room', foreign: true }
    },
    {
      name: 'entry',
      collectionName: COLLECTIONS.entries,
      document: { _id: plan.target.entries[0]._id, roomId: 'foreign_room', foreign: true }
    }
  ];

  for (const scenario of cases) {
    await t.test(scenario.name, async () => {
      const seed = seedFor(legacy);
      seed[scenario.collectionName] = {
        [scenario.document._id]: scenario.document
      };
      const adapter = makeFakeAdapter(seed);
      const before = Object.values(COLLECTIONS).reduce((output, collectionName) => ({
        ...output,
        [collectionName]: adapter.documents(collectionName)
      }), {});

      await assert.rejects(
        runLegacyMigration({ adapter, roomId: legacy._id }),
        (error) => (
          error instanceof MigrationError
            && error.code === 'MIGRATION_TARGET_OCCUPIED'
            && error.details.collectionName === scenario.collectionName
            && error.details.documentId === scenario.document._id
        )
      );

      assert.equal(adapter.stats().writeCount, 0);
      Object.values(COLLECTIONS).forEach((collectionName) => {
        assert.deepEqual(adapter.documents(collectionName), before[collectionName]);
      });
    });
  }
});

test('staging marker rejects a tombstone list that differs from the deterministic plan', async () => {
  const legacy = legacyFixture();
  const plan = planLegacyMigration(legacy);
  const marker = {
    _id: legacy._id,
    runId: plan.runId,
    status: 'staging',
    sourceVersion: plan.sourceVersion,
    sourceHash: plan.sourceHash,
    targetHash: plan.targetHash,
    participantCount: plan.participantCount,
    entryCount: plan.entryCount,
    legacyRecentRequestIds: ['tampered_tombstone'],
    checkpoint: { lastLegacyIndex: -1, writtenEntries: 0 }
  };
  const seed = seedFor(legacy);
  seed[COLLECTIONS.migrations] = { [legacy._id]: marker };
  const adapter = makeFakeAdapter(seed);

  await assert.rejects(
    runLegacyMigration({ adapter, roomId: legacy._id }),
    (error) => error instanceof MigrationError && error.code === 'MIGRATION_STAGING_PLAN_CHANGED'
  );

  assert.equal(adapter.stats().writeCount, 0);
  assert.deepEqual(
    adapter.document(COLLECTIONS.migrations, legacy._id).legacyRecentRequestIds,
    ['tampered_tombstone']
  );
});

test('runner resumes a >200 entry migration from checkpoint and repeated execution creates no duplicates', async () => {
  const legacy = legacyFixture({ entries: manyEntries(450) });
  const adapter = makeFakeAdapter(seedFor(legacy));
  adapter.failOnceWhen(({ collectionName, entryWriteAttempts }) => (
    collectionName === COLLECTIONS.entries && entryWriteAttempts === 206
  ));

  await assert.rejects(
    runLegacyMigration({ adapter, roomId: legacy._id, batchSize: 100 }),
    /injected migration write crash/
  );

  const staged = adapter.document(COLLECTIONS.migrations, legacy._id);
  assert.equal(staged.status, 'staging');
  assert.deepEqual(staged.checkpoint, { lastLegacyIndex: 199, writtenEntries: 200 });
  assert.equal(adapter.document(COLLECTIONS.rooms, legacy._id).migrationStatus, 'staging');
  assert.equal(adapter.documents(COLLECTIONS.entries, { roomId: legacy._id }).length, 200);

  const resumed = await runLegacyMigration({ adapter, roomId: legacy._id, batchSize: 100 });
  assert.equal(resumed.ok, true);
  assert.equal(resumed.status, 'active');
  assert.equal(resumed.deduped, false);
  assert.equal(adapter.documents(COLLECTIONS.entries, { roomId: legacy._id }).length, 450);
  assert.deepEqual(adapter.document(COLLECTIONS.migrations, legacy._id).checkpoint, {
    lastLegacyIndex: 449,
    writtenEntries: 450
  });
  assert.equal(adapter.document(COLLECTIONS.migrations, legacy._id).status, 'active');
  assert.equal(adapter.document(COLLECTIONS.rooms, legacy._id).migrationStatus, 'active');
  assert.ok(adapter.stats().entryWriteAttempts > 450);
  assert.ok(adapter.stats().transactionReadCounts.every((count) => count <= 12));

  const writesBeforeReplay = adapter.stats().writeCount;
  const replayed = await runLegacyMigration({ adapter, roomId: legacy._id, batchSize: 100 });
  assert.equal(replayed.status, 'active');
  assert.equal(replayed.deduped, true);
  assert.equal(adapter.stats().writeCount, writesBeforeReplay);
  assert.equal(adapter.documents(COLLECTIONS.entries, { roomId: legacy._id }).length, 450);
});

test('a slow concurrent runner cannot overwrite an active marker or room with stale staging state', async () => {
  const legacy = legacyFixture();
  const plan = planLegacyMigration(legacy);
  const adapter = makeFakeAdapter(seedFor(legacy));
  const slowReachedLastPreflightRead = deferred();
  const releaseSlowRunner = deferred();
  let slowCreatedStaging = false;
  let slowWasHeld = false;
  const lastEntryId = plan.target.entries.at(-1)._id;
  const slowAdapter = {
    ...adapter,
    async read(collectionName, documentId) {
      const document = await adapter.read(collectionName, documentId);
      if (slowCreatedStaging
          && !slowWasHeld
          && collectionName === COLLECTIONS.entries
          && documentId === lastEntryId) {
        slowWasHeld = true;
        slowReachedLastPreflightRead.resolve();
        await releaseSlowRunner.promise;
      }
      return document;
    },
    async runTransaction(work) {
      const outcome = await adapter.runTransaction(work);
      if (outcome && outcome.created === true && outcome.state === 'staging') {
        slowCreatedStaging = true;
      }
      return outcome;
    }
  };

  const slowSettled = runLegacyMigration({
    adapter: slowAdapter,
    roomId: legacy._id
  }).then(
    (value) => ({ value }),
    (error) => ({ error })
  );

  await slowReachedLastPreflightRead.promise;
  const fast = await runLegacyMigration({ adapter, roomId: legacy._id });
  assert.equal(fast.status, 'active');
  assert.equal(fast.deduped, false);
  assert.equal(adapter.document(COLLECTIONS.migrations, legacy._id).status, 'active');
  assert.equal(adapter.document(COLLECTIONS.rooms, legacy._id).migrationStatus, 'active');
  const writesAfterFastActivation = adapter.stats().writeCount;

  releaseSlowRunner.resolve();
  const slow = await slowSettled;

  assert.equal(slow.error, undefined);
  assert.equal(slow.value.status, 'active');
  assert.equal(slow.value.deduped, true);
  assert.equal(adapter.stats().writeCount, writesAfterFastActivation);
  assert.equal(adapter.document(COLLECTIONS.migrations, legacy._id).status, 'active');
  assert.equal(adapter.document(COLLECTIONS.rooms, legacy._id).migrationStatus, 'active');
  assert.equal(
    adapter.document(COLLECTIONS.rooms, legacy._id).activeRoundId,
    plan.target.roomActive.activeRoundId
  );
  assert.deepEqual(adapter.document(COLLECTIONS.migrations, legacy._id).checkpoint, {
    lastLegacyIndex: plan.entryCount - 1,
    writtenEntries: plan.entryCount
  });
});

test('activation re-reads source hash/version and atomically fails closed when legacy changes', async () => {
  const legacy = legacyFixture();
  const adapter = makeFakeAdapter(seedFor(legacy));
  const sourceBefore = adapter.document(COLLECTIONS.legacy, legacy._id);

  adapter.beforeTransactionAt(2, ({ read, upsert }) => {
    const changed = read(COLLECTIONS.legacy, legacy._id);
    changed.version += 1;
    changed.entries.push({
      id: 'legacy_late_entry',
      type: 'transfer',
      fromPlayerId: 'p_claimed',
      toPlayerId: 'p_owner',
      units: 3,
      createdAtMs: 1700000000300
    });
    upsert(COLLECTIONS.legacy, legacy._id, withoutId(changed));
  });

  await assert.rejects(
    runLegacyMigration({ adapter, roomId: legacy._id }),
    (error) => error instanceof MigrationError && error.code === 'MIGRATION_SOURCE_CHANGED'
  );

  const migration = adapter.document(COLLECTIONS.migrations, legacy._id);
  const room = adapter.document(COLLECTIONS.rooms, legacy._id);
  assert.equal(migration.status, 'failed');
  assert.equal(migration.errorCode, 'MIGRATION_SOURCE_CHANGED');
  assert.equal(room.migrationStatus, 'failed');
  assert.notEqual(room.migrationStatus, 'active');
  assert.equal(room.activeRoundId, '');
  assert.notDeepEqual(adapter.document(COLLECTIONS.legacy, legacy._id), sourceBefore);

  const writesBeforeRetry = adapter.stats().writeCount;
  await assert.rejects(
    runLegacyMigration({ adapter, roomId: legacy._id }),
    (error) => error instanceof MigrationError && error.code === 'MIGRATION_FAILED_REQUIRES_RESTART'
  );
  assert.equal(adapter.stats().writeCount, writesBeforeRetry);
  assert.equal(adapter.document(COLLECTIONS.rooms, legacy._id).migrationStatus, 'failed');
});

test('target participant, record, ledger and conservation mismatches are isolated before activation', async (t) => {
  const cases = [
    {
      name: 'participant count',
      code: 'MIGRATION_PARTICIPANT_COUNT_MISMATCH',
      mutate({ read, upsert }, roomId) {
        const room = read(COLLECTIONS.rooms, roomId);
        room.participants.pop();
        upsert(COLLECTIONS.rooms, roomId, withoutId(room));
      }
    },
    {
      name: 'record count',
      code: 'MIGRATION_RECORD_COUNT_MISMATCH',
      mutate({ read, upsert }, roomId, plan) {
        const round = read(COLLECTIONS.rounds, plan.target.round._id);
        round.recordCount += 1;
        upsert(COLLECTIONS.rounds, round._id, withoutId(round));
      }
    },
    {
      name: 'per-player ledger',
      code: 'MIGRATION_LEDGER_MISMATCH',
      mutate({ read, upsert }, roomId, plan) {
        const round = read(COLLECTIONS.rounds, plan.target.round._id);
        round.ledger[0].won += 1;
        round.ledger[0].treat += 1;
        upsert(COLLECTIONS.rounds, round._id, withoutId(round));
      }
    },
    {
      name: 'net conservation',
      code: 'MIGRATION_NET_NOT_CONSERVED',
      mutate({ read, upsert }, roomId, plan) {
        const round = read(COLLECTIONS.rounds, plan.target.round._id);
        round.ledger[0].net += 1;
        upsert(COLLECTIONS.rounds, round._id, withoutId(round));
      }
    }
  ];

  for (const scenario of cases) {
    await t.test(scenario.name, async () => {
      const legacy = legacyFixture();
      const plan = planLegacyMigration(legacy);
      const adapter = makeFakeAdapter(seedFor(legacy));
      adapter.beforeTransactionAt(4, (tx) => scenario.mutate(tx, legacy._id, plan));

      await assert.rejects(
        runLegacyMigration({ adapter, roomId: legacy._id }),
        (error) => error instanceof MigrationError && error.code === scenario.code
      );

      assert.equal(adapter.document(COLLECTIONS.migrations, legacy._id).status, 'failed');
      assert.equal(adapter.document(COLLECTIONS.migrations, legacy._id).errorCode, scenario.code);
      assert.equal(adapter.document(COLLECTIONS.rooms, legacy._id).migrationStatus, 'failed');
      assert.notEqual(adapter.document(COLLECTIONS.rooms, legacy._id).migrationStatus, 'active');
    });
  }
});

test('activation rejects an extra same-room round instead of hiding it from target validation', async () => {
  const legacy = legacyFixture();
  const plan = planLegacyMigration(legacy);
  const adapter = makeFakeAdapter(seedFor(legacy));
  const extraRoundId = 'wr_foreign_extra_round';
  adapter.beforeTransactionAt(2, ({ upsert }) => {
    upsert(COLLECTIONS.rounds, extraRoundId, {
      roomId: legacy._id,
      number: 99,
      status: 'active',
      foreign: true
    });
  });

  await assert.rejects(
    runLegacyMigration({ adapter, roomId: legacy._id }),
    (error) => error instanceof MigrationError && error.code === 'MIGRATION_ROUND_SET_MISMATCH'
  );

  assert.equal(adapter.document(COLLECTIONS.migrations, legacy._id).status, 'failed');
  assert.equal(adapter.document(COLLECTIONS.rooms, legacy._id).migrationStatus, 'failed');
  assert.equal(adapter.document(COLLECTIONS.rounds, plan.target.round._id).roomId, legacy._id);
  assert.equal(adapter.document(COLLECTIONS.rounds, extraRoundId).foreign, true);
});

test('finished legacy maps to one archived round and final markers activate atomically without changing source', async () => {
  const legacy = legacyFixture({
    status: 'finished',
    recentRequestIds: ['req_finished', 'req_finished']
  });
  const sourceBefore = clone(legacy);
  const plan = planLegacyMigration(legacy);
  const adapter = makeFakeAdapter(seedFor(legacy));

  assert.equal(plan.target.round.status, 'archived');
  assert.equal(plan.target.roomActive.activeRoundId, '');
  assert.equal(plan.target.roomActive.lastRoundId, plan.target.round._id);

  const result = await runLegacyMigration({
    adapter,
    roomId: legacy._id,
    clock: () => 1800000000000
  });

  assert.equal(result.status, 'active');
  const room = adapter.document(COLLECTIONS.rooms, legacy._id);
  const migration = adapter.document(COLLECTIONS.migrations, legacy._id);
  assert.equal(room.activeRoundId, '');
  assert.equal(room.lastRoundId, plan.target.round._id);
  assert.equal(room.migrationStatus, 'active');
  assert.equal(migration.status, 'active');
  assert.equal(migration.targetHash, plan.targetHash);
  assert.equal(migration.activatedAtMs, 1800000000000);
  assert.equal(timestampMillis(migration.createdAt), 1800000000000);
  assert.equal(timestampMillis(migration.updatedAt), 1800000000000);
  assert.equal(timestampMillis(migration.activatedAt), 1800000000000);
  assert.deepEqual(migration.legacyRecentRequestIds, ['req_finished']);
  assert.deepEqual(adapter.document(COLLECTIONS.legacy, legacy._id), sourceBefore);

  const activationCommit = adapter.stats().transactionCommits.at(-1);
  assert.deepEqual(activationCommit.sort(), [
    `${COLLECTIONS.migrations}/${legacy._id}`,
    `${COLLECTIONS.rooms}/${legacy._id}`
  ].sort());
});

test('planner isolates duplicate IDs, illegal units and non-conserved legacy data', () => {
  const duplicate = legacyFixture({
    entries: [
      { id: 'duplicate', type: 'transfer', fromPlayerId: 'p_owner', toPlayerId: 'p_claimed', units: 1 },
      { id: 'duplicate', type: 'transfer', fromPlayerId: 'p_claimed', toPlayerId: 'p_owner', units: 1 }
    ]
  });
  assert.throws(
    () => planLegacyMigration(duplicate),
    (error) => error instanceof MigrationError && error.code === 'LEGACY_DUPLICATE_ENTRY_ID'
  );

  const illegalUnits = legacyFixture({
    entries: [{ type: 'transfer', fromPlayerId: 'p_owner', toPlayerId: 'p_claimed', units: 100 }]
  });
  assert.throws(
    () => planLegacyMigration(illegalUnits),
    (error) => error instanceof MigrationError && error.code === 'LEGACY_ENTRY_INVALID'
  );

  const duplicateParticipant = legacyFixture({
    participants: [
      { id: 'p_owner', name: '阿杰', openid: 'openid_owner' },
      { id: 'p_owner', name: '王姐' }
    ],
    entries: []
  });
  assert.throws(
    () => planLegacyMigration(duplicateParticipant),
    (error) => error instanceof MigrationError && error.code === 'LEGACY_PARTICIPANT_DUPLICATE'
  );
});
