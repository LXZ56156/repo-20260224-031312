const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { manifest, validateInvokeResult } = require('../scripts/cloud-runtime-smoke');

const envelope = (result, extra = {}) => JSON.stringify({ data: {
  InvokeResult: 0, ErrMsg: '', RetMsg: JSON.stringify(result), ...extra
} });

test('manifest covers exactly the deployed handlers with non-writing payloads', () => {
  const names = fs.readdirSync(path.join(__dirname, '../cloudfunctions'))
    .filter(name => fs.existsSync(path.join(__dirname, '../cloudfunctions', name, 'index.js'))).sort();
  assert.deepEqual(Object.keys(manifest).sort(), names);
  assert.equal(names.length, 23);
  for (const name of names) {
    const item = manifest[name];
    assert.equal(item.payload.clientRequestId, undefined);
    assert.equal(item.payload.tournamentId, undefined);
    assert.equal(item.payload.roomId, undefined);
    const result = item.errorMessage
      ? { errorCode: 1, errorMessage: `Error: ${item.errorMessage}\n    at exports.main (/var/user/index.js:1:1)` }
      : { ok: !!item.readOnly, code: item.codes[0], state: item.readOnly ? 'ready' : 'invalid', data: {} };
    assert.equal(validateInvokeResult(name, envelope(result)).ok, true, name);
  }
  assert.deepEqual(manifest.waterSession.payload, { apiVersion: 2, action: '__smoke_invalid__' });
  assert.deepEqual(manifest.createTournament.payload, { name: '', mode: 'multi_rotate', presetKey: 'custom' });
});

test('CLI success and InvokeResult zero do not hide nested runtime errors or missing results', () => {
  const broken = { errorCode: 1, errorMessage: "Error: Cannot find module './lib/common'", statusCode: 443 };
  for (const output of [envelope(broken), envelope({ error: broken }), envelope(null), '{"data":{"InvokeResult":0}}', '{}', 'not json']) {
    assert.equal(validateInvokeResult('waterSession', output).ok, false, output);
  }
  const expected = { ok: false, code: 'PERMISSION_DENIED', state: 'forbidden', data: {} };
  assert.equal(validateInvokeResult('waterSession', envelope(expected)).ok, true);
  assert.equal(validateInvokeResult('waterSession', envelope(expected), 1).ok, false);
  assert.equal(validateInvokeResult('waterSession', envelope(expected, { ErrMsg: 'runtime failure' })).ok, false);
  assert.equal(validateInvokeResult('waterSession', envelope({ ...expected, ok: true })).ok, false);
  assert.equal(validateInvokeResult('waterSession', envelope({ ...expected, code: 'WATER_ROOM_CREATED' })).ok, false);
});

test('only exact expected application throws qualify, never an error mentioning their text', () => {
  const caught = { errorCode: -1, errorMessage: 'user code exception caught', stackTrace: 'Error: 缺少 tournamentId\n    at exports.main (/var/user/index.js:14:28)' };
  assert.equal(validateInvokeResult('resetTournament', envelope(caught, { ErrMsg: caught.stackTrace })).ok, true);
  assert.equal(validateInvokeResult('resetTournament', envelope({ ...caught, stackTrace: 'Error: Cannot find module' })).ok, false);
  assert.equal(validateInvokeResult('resetTournament', envelope({ errorCode: 1, errorMessage: 'Error: 缺少 tournamentId' }, { InvokeResult: 1, ErrMsg: 'Error: 缺少 tournamentId' })).ok, true);
  assert.equal(validateInvokeResult('resetTournament', envelope({ errorMessage: 'Cannot find module 缺少 tournamentId' })).ok, false);
  assert.equal(validateInvokeResult('unknown', envelope({ ok: true })).ok, false);
});

test('profile read failure proves loading only and CLI payload mode emits the manifest', () => {
  const result = validateInvokeResult('getUserProfile', envelope({ ok: false, code: 'PROFILE_LOAD_FAILED' }));
  assert.equal(result.ok, true);
  assert.equal(result.scope, 'handler-loaded-only');
  const { spawnSync } = require('node:child_process');
  const cli = spawnSync(process.execPath, [path.join(__dirname, '../scripts/cloud-runtime-smoke.js'), '--payload', 'waterSession'], { encoding: 'utf8' });
  assert.equal(cli.status, 0);
  assert.deepEqual(JSON.parse(cli.stdout), manifest.waterSession.payload);
});
