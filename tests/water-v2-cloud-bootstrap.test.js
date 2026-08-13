const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const {
  DEFAULT_MANIFEST_PATH,
  EXPECTED_COLLECTIONS,
  EXPECTED_INDEXES,
  INITIAL_FEATURE_FLAGS,
  loadManifest,
  validateManifest,
} = require('../scripts/validate-water-v2-cloud-bootstrap');

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

test('V2 cloud bootstrap manifest is complete, private, and declaration-only', () => {
  const manifest = loadManifest(DEFAULT_MANIFEST_PATH);

  assert.deepEqual(validateManifest(manifest), []);
  assert.equal(manifest.kind, 'water-v2-cloud-bootstrap');
  assert.equal(manifest.mode, 'declaration-only');
  assert.equal(manifest.remoteAccess, false);
  assert.equal(manifest.applySupported, false);
  assert.equal(manifest.environmentBinding, 'explicit-at-execution');
  assert.deepEqual(manifest.preserveCollections, ['waterSessions']);
  assert.deepEqual(
    manifest.collections.map((item) => item.name),
    EXPECTED_COLLECTIONS,
  );
  assert.equal(
    manifest.collections.every((item) => item.clientAccess === 'none'),
    true,
  );
  assert.deepEqual(manifest.indexes, EXPECTED_INDEXES);
  assert.deepEqual(manifest.initialDocuments, [{
    collection: 'water_feature_flags',
    documentId: 'collaborative_v2',
    data: INITIAL_FEATURE_FLAGS,
  }]);
});

test('validator rejects a missing collection, altered index, or enabled initial flag', () => {
  const source = loadManifest(DEFAULT_MANIFEST_PATH);

  const missingCollection = clone(source);
  missingCollection.collections.pop();
  assert.match(validateManifest(missingCollection).join('\n'), /collections/);

  const alteredIndex = clone(source);
  alteredIndex.indexes[1].fields[2].order = 'asc';
  assert.match(validateManifest(alteredIndex).join('\n'), /indexes/);

  const enabledFlag = clone(source);
  enabledFlag.initialDocuments[0].data.v2Read = true;
  assert.match(validateManifest(enabledFlag).join('\n'), /initialDocuments/);
});

test('validator rejects any apply or remote-access capability', () => {
  const source = loadManifest(DEFAULT_MANIFEST_PATH);

  for (const [field, value] of [['remoteAccess', true], ['applySupported', true]]) {
    const changed = clone(source);
    changed[field] = value;
    assert.match(validateManifest(changed).join('\n'), new RegExp(field));
  }

  const validatorSource = fs.readFileSync(
    require.resolve('../scripts/validate-water-v2-cloud-bootstrap'),
    'utf8',
  );
  assert.doesNotMatch(validatorSource, /node:child_process|node:https?|@cloudbase|wx-server-sdk/);
});
