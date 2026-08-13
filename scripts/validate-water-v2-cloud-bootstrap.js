#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { isDeepStrictEqual } = require('node:util');

const DEFAULT_MANIFEST_PATH = path.join(__dirname, 'water-v2-cloud-bootstrap.manifest.json');

const EXPECTED_COLLECTIONS = Object.freeze([
  'waterRooms',
  'waterRoomMembers',
  'waterRounds',
  'waterEntries',
  'client_request_logs',
  'waterMigrations',
  'water_feature_flags',
]);

const EXPECTED_INDEXES = Object.freeze([
  {
    name: 'waterRounds_roomId_number_desc',
    collection: 'waterRounds',
    fields: [
      { path: 'roomId', order: 'asc' },
      { path: 'number', order: 'desc' },
    ],
  },
  {
    name: 'waterEntries_roomId_roundId_seq_desc',
    collection: 'waterEntries',
    fields: [
      { path: 'roomId', order: 'asc' },
      { path: 'roundId', order: 'asc' },
      { path: 'seq', order: 'desc' },
    ],
  },
  {
    name: 'waterEntries_roundId_category_seq_desc',
    collection: 'waterEntries',
    fields: [
      { path: 'roundId', order: 'asc' },
      { path: 'category', order: 'asc' },
      { path: 'seq', order: 'desc' },
    ],
  },
  {
    name: 'waterEntries_rootEntryId_seq_asc',
    collection: 'waterEntries',
    fields: [
      { path: 'rootEntryId', order: 'asc' },
      { path: 'seq', order: 'asc' },
    ],
  },
]);

const INITIAL_FEATURE_FLAGS = Object.freeze({
  emergencyReadOnly: false,
  v2Read: false,
  rosterWrite: false,
  ownerWrite: false,
  memberWrite: false,
  correctWrite: false,
  reverseWrite: false,
  createRoundWrite: false,
  canaryRoomIds: [],
  canaryOpenids: [],
  revision: 1,
});

const EXPECTED_TOP_LEVEL_KEYS = Object.freeze([
  'applySupported',
  'collections',
  'environmentBinding',
  'formatVersion',
  'indexes',
  'initialDocuments',
  'kind',
  'mode',
  'preserveCollections',
  'remoteAccess',
]);

function loadManifest(filePath = DEFAULT_MANIFEST_PATH) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function validateManifest(manifest) {
  const errors = [];
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) {
    return ['manifest must be a JSON object'];
  }

  const keys = Object.keys(manifest).sort();
  if (!isDeepStrictEqual(keys, EXPECTED_TOP_LEVEL_KEYS)) {
    errors.push('top-level keys must match the declaration-only contract');
  }
  if (manifest.formatVersion !== 1) errors.push('formatVersion must be 1');
  if (manifest.kind !== 'water-v2-cloud-bootstrap') {
    errors.push('kind must be water-v2-cloud-bootstrap');
  }
  if (manifest.mode !== 'declaration-only') errors.push('mode must be declaration-only');
  if (manifest.remoteAccess !== false) errors.push('remoteAccess must be false');
  if (manifest.applySupported !== false) errors.push('applySupported must be false');
  if (manifest.environmentBinding !== 'explicit-at-execution') {
    errors.push('environmentBinding must be explicit-at-execution');
  }
  if (!isDeepStrictEqual(manifest.preserveCollections, ['waterSessions'])) {
    errors.push('preserveCollections must contain only waterSessions');
  }

  const expectedCollections = EXPECTED_COLLECTIONS.map((name) => ({
    name,
    clientAccess: 'none',
  }));
  if (!isDeepStrictEqual(manifest.collections, expectedCollections)) {
    errors.push('collections must match the seven private V2 cloud collections');
  }
  if (!isDeepStrictEqual(manifest.indexes, EXPECTED_INDEXES)) {
    errors.push('indexes must match the four required V2 composite indexes');
  }

  const expectedDocuments = [{
    collection: 'water_feature_flags',
    documentId: 'collaborative_v2',
    data: INITIAL_FEATURE_FLAGS,
  }];
  if (!isDeepStrictEqual(manifest.initialDocuments, expectedDocuments)) {
    errors.push('initialDocuments must keep all collaborative_v2 capabilities disabled');
  }
  return errors;
}

function main(argv = process.argv.slice(2)) {
  if (argv.length > 1 || (argv[0] && argv[0].startsWith('-'))) {
    console.error('Usage: node scripts/validate-water-v2-cloud-bootstrap.js [manifest.json]');
    return 1;
  }
  const manifestPath = argv[0] ? path.resolve(argv[0]) : DEFAULT_MANIFEST_PATH;
  try {
    const errors = validateManifest(loadManifest(manifestPath));
    if (errors.length > 0) {
      for (const error of errors) console.error(`ERROR: ${error}`);
      return 1;
    }
    console.log(`Validated declaration-only V2 cloud bootstrap manifest: ${manifestPath}`);
    return 0;
  } catch (error) {
    console.error(`ERROR: ${error.message}`);
    return 1;
  }
}

if (require.main === module) process.exitCode = main();

module.exports = {
  DEFAULT_MANIFEST_PATH,
  EXPECTED_COLLECTIONS,
  EXPECTED_INDEXES,
  INITIAL_FEATURE_FLAGS,
  loadManifest,
  validateManifest,
  main,
};
