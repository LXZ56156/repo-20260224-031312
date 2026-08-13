const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const {
  MigrationError,
  runLegacyMigrationDryRunAudit
} = require('../cloudfunctions/waterSession/waterMigration');

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function legacyFixture(overrides = {}) {
  return {
    _id: 'water_owner',
    ownerOpenid: 'openid_owner',
    title: '8月13日打水局',
    status: 'active',
    version: 7,
    participants: [
      { id: 'p_owner', name: '阿杰', openid: 'openid_owner', createdAtMs: 1700000000000 },
      { id: 'p_friend', name: '王姐', createdAtMs: 1700000000001 }
    ],
    entries: [{
      id: 'entry_1',
      type: 'transfer',
      fromPlayerId: 'p_owner',
      toPlayerId: 'p_friend',
      units: 2,
      createdAtMs: 1700000000100
    }],
    recentRequestIds: ['legacy_request_1'],
    createdAtMs: 1700000000000,
    updatedAtMs: 1700000000200,
    ...overrides
  };
}

function makeReadOnlyAuditAdapter(documents, pages) {
  const byId = new Map(documents.map((document) => [document._id, clone(document)]));
  const stats = {
    listCalls: 0,
    readCalls: 0
  };
  return {
    async listLegacyRooms({ cursor, limit }) {
      stats.listCalls += 1;
      assert.equal(limit, 2);
      const page = pages[cursor || 'first'];
      assert.ok(page, `unexpected cursor ${cursor}`);
      return clone(page);
    },
    async read(collectionName, documentId) {
      stats.readCalls += 1;
      assert.equal(collectionName, 'waterSessions');
      return clone(byId.get(documentId) || null);
    },
    stats
  };
}

test('all-room dry-run paginates, de-duplicates room IDs and emits deterministic audit hashes', async () => {
  const valid = legacyFixture();
  const invalid = legacyFixture({
    _id: 'water_invalid',
    entries: [{
      id: 'entry_invalid',
      type: 'transfer',
      fromPlayerId: 'p_owner',
      toPlayerId: 'missing_participant',
      units: 1
    }]
  });
  const finished = legacyFixture({
    _id: 'water_finished',
    status: 'finished',
    version: 3,
    entries: [],
    recentRequestIds: []
  });
  const adapter = makeReadOnlyAuditAdapter([valid, invalid, finished], {
    first: {
      roomIds: ['water_owner', 'water_invalid'],
      nextCursor: 'page-2'
    },
    'page-2': {
      roomIds: ['water_owner', 'water_finished'],
      nextCursor: ''
    }
  });

  const first = await runLegacyMigrationDryRunAudit({
    adapter,
    pageSize: 2,
    clock: () => 1800000000000
  });
  const second = await runLegacyMigrationDryRunAudit({
    adapter: makeReadOnlyAuditAdapter([finished, invalid, valid], {
      first: {
        roomIds: ['water_finished', 'water_invalid'],
        nextCursor: 'page-2'
      },
      'page-2': {
        roomIds: ['water_owner'],
        nextCursor: ''
      }
    }),
    pageSize: 2,
    clock: () => 1800000000000
  });

  assert.equal(first.reportVersion, 1);
  assert.equal(first.kind, 'water-v2-legacy-migration-dry-run');
  assert.equal(first.mode, 'dry-run');
  assert.equal(first.dryRun, true);
  assert.equal(first.writeEnabled, false);
  assert.equal(first.generatedAt, '2027-01-15T08:00:00.000Z');
  assert.deepEqual(first.summary, {
    roomCount: 3,
    migratableRoomCount: 2,
    anomalyRoomCount: 1,
    participantCount: 6,
    entryCount: 2,
    conservedRoomCount: 2,
    allConserved: false,
    anomalyCount: 2,
    writeCount: 0,
    sourceHash: first.summary.sourceHash,
    targetHash: first.summary.targetHash
  });
  assert.match(first.summary.sourceHash, /^[0-9a-f]{64}$/);
  assert.match(first.summary.targetHash, /^[0-9a-f]{64}$/);
  assert.deepEqual(first.rooms.map((room) => room.roomId), [
    'water_finished',
    'water_invalid',
    'water_owner'
  ]);
  assert.deepEqual(first.anomalies.map((item) => [item.roomId, item.code]), [
    ['water_invalid', 'LEGACY_PARTICIPANT_UNKNOWN'],
    ['water_owner', 'MIGRATION_DRY_RUN_DUPLICATE_ROOM_ID']
  ]);
  assert.equal(adapter.stats.listCalls, 2);
  assert.equal(adapter.stats.readCalls, 3);
  assert.equal(first.summary.sourceHash, second.summary.sourceHash);
  assert.equal(first.summary.targetHash, second.summary.targetHash);
  assert.deepEqual(first.rooms, second.rooms);
});

test('dry-run rejects write intent and adapters that expose write capabilities before any scan', async () => {
  let listCalls = 0;
  let writeCalls = 0;
  const adapter = {
    async listLegacyRooms() {
      listCalls += 1;
      return { roomIds: [], nextCursor: '' };
    },
    async read() {
      return null;
    },
    async upsert() {
      writeCalls += 1;
    }
  };

  await assert.rejects(
    runLegacyMigrationDryRunAudit({ adapter, write: true }),
    (error) => error instanceof MigrationError && error.code === 'MIGRATION_DRY_RUN_ONLY'
  );
  await assert.rejects(
    runLegacyMigrationDryRunAudit({ adapter }),
    (error) => error instanceof MigrationError
      && error.code === 'MIGRATION_DRY_RUN_ADAPTER_WRITE_CAPABILITY'
  );
  assert.equal(listCalls, 0);
  assert.equal(writeCalls, 0);
});

test('CLI defaults to dry-run JSON and rejects dangerous flags before loading the adapter', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'water-migration-dry-run-'));
  const adapterPath = path.join(dir, 'read-only-adapter.js');
  const markerPath = path.join(dir, 'adapter-list-called');
  const fixture = legacyFixture({ _id: 'water_cli', entries: [] });
  fs.writeFileSync(adapterPath, [
    `'use strict';`,
    `const fs = require('node:fs');`,
    `const fixture = ${JSON.stringify(fixture)};`,
    `module.exports = {`,
    `  async listLegacyRooms() {`,
    `    fs.writeFileSync(${JSON.stringify(markerPath)}, 'called');`,
    `    return { roomIds: [fixture._id], nextCursor: '' };`,
    `  },`,
    `  async read(collectionName, documentId) {`,
    `    if (collectionName !== 'waterSessions' || documentId !== fixture._id) return null;`,
    `    return fixture;`,
    `  }`,
    `};`
  ].join('\n'));
  const scriptPath = path.join(__dirname, '../scripts/run-water-v2-migration-dry-run.js');

  try {
    const success = spawnSync(process.execPath, [
      scriptPath,
      '--adapter', adapterPath,
      '--page-size', '1'
    ], { encoding: 'utf8' });
    assert.equal(success.status, 0, success.stderr);
    const report = JSON.parse(success.stdout);
    assert.equal(report.dryRun, true);
    assert.equal(report.writeEnabled, false);
    assert.equal(report.summary.roomCount, 1);
    assert.equal(report.summary.writeCount, 0);
    assert.equal(fs.existsSync(markerPath), true);

    fs.rmSync(markerPath, { force: true });
    const rejected = spawnSync(process.execPath, [
      scriptPath,
      '--adapter', adapterPath,
      '--write'
    ], { encoding: 'utf8' });
    assert.notEqual(rejected.status, 0);
    assert.match(rejected.stderr, /只支持零写入 dry-run/u);
    assert.equal(fs.existsSync(markerPath), false);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
