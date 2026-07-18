const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const REPO_DIR = path.resolve(__dirname, '..');
const {
  buildStrictGitState,
  preflightWorkflowRecord,
  readLatestWorkflowRecord,
  sanitizeValue,
  writeWorkflowRecord,
  writeWorkflowRecordAfterRemoteSuccess
} = require('../scripts/lib/workflow-records');
const { acquireExclusiveFileLock } = require('../scripts/lib/exclusive-file-lock');
const { resolveWeappLocalConfig, toGitBashPath } = require('../scripts/lib/weapp-local-config');
const { preflightMpCiEvidence, recordMpCiSuccess, redactRuntimeText } = require('../scripts/mp-ci');

test('workflow record writer appends jsonl, updates latest, and redacts sensitive fields', () => {
  const recordDir = fs.mkdtempSync(path.join(os.tmpdir(), 'weapp-records-'));
  const result = writeWorkflowRecord('miniapp-ci', {
    event: 'upload_success',
    version: '1.2.3-demo',
    WX_APPSECRET: 'should-not-leak',
    url: 'https://api.weixin.qq.com/test?access_token=abc123&x=1'
  }, {
    rootDir: REPO_DIR,
    recordDir,
    recordedAt: '2026-07-06T00:00:00.000Z'
  });

  assert.ok(fs.existsSync(result.recordPath));
  assert.ok(fs.existsSync(result.latestPath));

  const lines = fs.readFileSync(result.recordPath, 'utf8').trim().split('\n');
  assert.equal(lines.length, 1);
  const record = JSON.parse(lines[0]);
  const latest = readLatestWorkflowRecord('miniapp-ci', { recordDir });

  assert.equal(record.payload.WX_APPSECRET, '<redacted>');
  assert.equal(record.payload.url, 'https://api.weixin.qq.com/test?access_token=<redacted>&x=1');
  assert.equal(latest.payload.version, '1.2.3-demo');
  assert.equal(latest.recordedAt, '2026-07-06T00:00:00.000Z');
});

test('workflow record sanitizer redacts nested token values', () => {
  const sanitized = sanitizeValue({
    nested: {
      accessToken: 'token-value',
      message: '{"access_token":"token-value"}'
    }
  });

  assert.equal(sanitized.nested.accessToken, '<redacted>');
  assert.equal(sanitized.nested.message, '{"access_token":"<redacted>"}');
});

test('strict Git provenance fails closed when any Git command fails', () => {
  assert.throws(
    () => buildStrictGitState(REPO_DIR, {
      execFileSync: () => { throw new Error('simulated git failure'); }
    }),
    /Git provenance command failed|simulated git failure/
  );
  const state = buildStrictGitState(REPO_DIR);
  assert.match(state.head, /^[0-9a-f]{40,64}$/);
  assert.ok(state.branch);
  assert.equal(typeof state.dirty, 'boolean');
});

test('exclusive file lock refuses a concurrent owner and releases by token', () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'weapp-exclusive-lock-'));
  const lockPath = path.join(rootDir, 'preview-delivery.lock');
  const first = acquireExclusiveFileLock(lockPath, { purpose: 'test' });
  try {
    assert.throws(
      () => acquireExclusiveFileLock(lockPath, { purpose: 'test' }),
      /already running|lock is held/i
    );
  } finally {
    first.release();
  }
  const second = acquireExclusiveFileLock(lockPath, { purpose: 'test' });
  second.release();
  assert.equal(fs.existsSync(lockPath), false);
});

test('workflow evidence and runtime errors redact openid, unionid, and configured private-key paths', () => {
  const sanitized = sanitizeValue({
    openid: 'openid-secret',
    union_id: 'union-secret',
    url: 'https://example.test/?openid=url-openid&unionid=url-union',
    json: '{"openid":"json-openid","union_id":"json-union"}'
  });
  const privateKeyPath = 'D:\\private\\do-not-print.key';
  const runtime = redactRuntimeText(
    'private key failed at D:/PRIVATE/do-not-print.key; openid: runtime-openid',
    { WX_PRIVATE_KEY_PATH: privateKeyPath }
  );

  assert.equal(sanitized.openid, '<redacted>');
  assert.equal(sanitized.union_id, '<redacted>');
  assert.equal(sanitized.url, 'https://example.test/?openid=<redacted>&unionid=<redacted>');
  assert.equal(sanitized.json, '{"openid":"<redacted>","union_id":"<redacted>"}');
  assert.doesNotMatch(runtime, /do-not-print|runtime-openid/i);
  assert.doesNotMatch(
    sanitizeValue('privateKeyPath=D:/private/key.pem; openid: embedded-openid'),
    /key\.pem|embedded-openid/
  );
});

test('workflow record sanitizer redacts authorization, refresh tokens, passwords, API keys, Bearer values, and token URLs', () => {
  const sanitized = sanitizeValue({
    authorization: 'Bearer authorization-secret',
    refresh_token: 'refresh-secret',
    password: 'password-secret',
    apiKey: 'api-key-secret',
    message: 'request failed with Authorization: Bearer message-secret',
    url: 'https://example.test/callback?refresh_token=url-refresh&token=url-token&api_key=url-api-key',
    json: '{"password":"json-password","refresh_token":"json-refresh","apiKey":"json-api-key"}'
  });

  assert.equal(sanitized.authorization, '<redacted>');
  assert.equal(sanitized.refresh_token, '<redacted>');
  assert.equal(sanitized.password, '<redacted>');
  assert.equal(sanitized.apiKey, '<redacted>');
  assert.equal(sanitized.message, 'request failed with Authorization: Bearer <redacted>');
  assert.equal(
    sanitized.url,
    'https://example.test/callback?refresh_token=<redacted>&token=<redacted>&api_key=<redacted>'
  );
  assert.equal(
    sanitized.json,
    '{"password":"<redacted>","refresh_token":"<redacted>","apiKey":"<redacted>"}'
  );
});

test('workflow record preflight fails before writing when the configured record directory is unusable', () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'weapp-record-preflight-'));
  const unusableRecordDir = path.join(rootDir, 'record-dir-is-a-file');
  fs.writeFileSync(unusableRecordDir, 'not a directory\n');

  assert.throws(
    () => preflightWorkflowRecord('miniapp-ci', { recordDir: unusableRecordDir }),
    /workflow record preflight failed.*miniapp-ci/i
  );
  assert.throws(
    () => writeWorkflowRecord('miniapp-ci', { event: 'must-not-write' }, { recordDir: unusableRecordDir }),
    /workflow record preflight failed.*miniapp-ci/i
  );
});

test('workflow record transaction restores JSONL and latest when promotion fails after append', () => {
  const recordDir = fs.mkdtempSync(path.join(os.tmpdir(), 'weapp-record-transaction-'));
  const recordPath = path.join(recordDir, 'miniapp-ci.jsonl');
  const latestPath = path.join(recordDir, 'miniapp-ci-latest.json');
  fs.writeFileSync(recordPath, '{"previous":true}\n', 'utf8');
  fs.writeFileSync(latestPath, '{"previousLatest":true}\n', 'utf8');
  const previousRecord = fs.readFileSync(recordPath);
  const previousLatest = fs.readFileSync(latestPath);

  assert.throws(
    () => writeWorkflowRecord('miniapp-ci', { event: 'must-roll-back' }, {
      rootDir: REPO_DIR,
      recordDir,
      beforeLatestPromote: () => { throw new Error('simulated latest promotion failure'); }
    }),
    /simulated latest promotion failure/
  );
  assert.deepEqual(fs.readFileSync(recordPath), previousRecord);
  assert.deepEqual(fs.readFileSync(latestPath), previousLatest);
  assert.deepEqual(
    fs.readdirSync(recordDir).sort(),
    ['miniapp-ci-latest.json', 'miniapp-ci.jsonl']
  );
});

test('workflow record rollback preserves the only old latest backup when restore fails', () => {
  const recordDir = fs.mkdtempSync(path.join(os.tmpdir(), 'weapp-record-restore-failure-'));
  const recordPath = path.join(recordDir, 'miniapp-ci.jsonl');
  const latestPath = path.join(recordDir, 'miniapp-ci-latest.json');
  const oldLatest = Buffer.from('{"previousLatest":true}\n');
  fs.writeFileSync(recordPath, '{"previous":true}\n', 'utf8');
  fs.writeFileSync(latestPath, oldLatest);

  assert.throws(
    () => writeWorkflowRecord('miniapp-ci', { event: 'must-preserve-backup' }, {
      rootDir: REPO_DIR,
      recordDir,
      beforePendingLatestPromote: () => { throw new Error('simulated promote failure'); },
      beforeLatestRestore: () => { throw new Error('simulated restore failure'); }
    }),
    /preserved latest backup/
  );
  const backupNames = fs.readdirSync(recordDir).filter((name) => name.endsWith('.backup'));
  assert.equal(backupNames.length, 1);
  assert.deepEqual(fs.readFileSync(path.join(recordDir, backupNames[0])), oldLatest);
  assert.equal(fs.readFileSync(recordPath, 'utf8'), '{"previous":true}\n');
});

test('post-success evidence failure is explicitly distinguished from a remote action failure', () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'weapp-record-post-success-'));
  const unusableRecordDir = path.join(rootDir, 'record-dir-is-a-file');
  fs.writeFileSync(unusableRecordDir, 'not a directory\n');

  assert.throws(
    () => writeWorkflowRecordAfterRemoteSuccess(
      'miniapp-ci',
      { event: 'upload_success' },
      { recordDir: unusableRecordDir }
    ),
    (error) => {
      assert.equal(error.remoteActionSucceeded, true);
      assert.equal(error.code, 'REMOTE_ACTION_SUCCEEDED_EVIDENCE_WRITE_FAILED');
      assert.match(error.message, /remote action succeeded, evidence write failed/i);
      return true;
    }
  );

  assert.throws(
    () => recordMpCiSuccess({
      mode: 'upload',
      version: 'fixture',
      desc: 'fixture',
      robot: 1,
      rawProjectPath: 'fixture-preview',
      projectPath: 'fixture-preview',
      result: {}
    }, { recordDir: unusableRecordDir }),
    (error) => {
      assert.equal(error.remoteActionSucceeded, true);
      assert.match(error.message, /remote action succeeded, evidence write failed/i);
      return true;
    }
  );
});

test('mp-ci evidence preflight fails explicitly before a remote action can start', () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'weapp-mp-ci-record-preflight-'));
  const unusableRecordDir = path.join(rootDir, 'record-dir-is-a-file');
  fs.writeFileSync(unusableRecordDir, 'not a directory\n');

  assert.throws(
    () => preflightMpCiEvidence({ recordDir: unusableRecordDir }),
    /workflow evidence preflight failed before remote action/i
  );
});

test('mp-ci and cloud deploy preflight evidence storage before any remote action', () => {
  const mpCi = fs.readFileSync(path.join(REPO_DIR, 'scripts/mp-ci.js'), 'utf8');
  const deploy = fs.readFileSync(path.join(REPO_DIR, 'scripts/deploy-cloudfunctions.sh'), 'utf8');

  const mpPreflight = mpCi.indexOf('preflightMpCiEvidence();');
  const mpPreview = mpCi.indexOf('await ci.preview(');
  const mpUpload = mpCi.indexOf('await ci.upload(');
  assert.ok(mpPreflight >= 0 && mpPreflight < mpPreview && mpPreflight < mpUpload);

  assert.match(deploy, /preflight_workflow_records\s*\n\s*require_tcb/);
  assert.match(mpCi, /remote action succeeded, evidence write failed/i);
  assert.match(deploy, /remote action succeeded, evidence write failed/i);
});

test('cloud deploy fails on evidence preflight before requiring or invoking tcb', {
  skip: process.platform === 'win32' && !fs.existsSync(resolveWeappLocalConfig({ repoDir: REPO_DIR }).gitBash)
}, () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'weapp-deploy-record-preflight-'));
  const unusableRecordDir = path.join(rootDir, 'record-dir-is-a-file');
  fs.writeFileSync(unusableRecordDir, 'not a directory\n');
  const config = resolveWeappLocalConfig({ repoDir: REPO_DIR });
  const command = process.platform === 'win32' ? config.gitBash : 'bash';
  const scriptPath = process.platform === 'win32'
    ? toGitBashPath(path.join(REPO_DIR, 'scripts/deploy-cloudfunctions.sh'))
    : path.join(REPO_DIR, 'scripts/deploy-cloudfunctions.sh');

  const result = spawnSync(command, [scriptPath, 'login'], {
    cwd: REPO_DIR,
    env: { ...process.env, WEAPP_RECORD_DIR: unusableRecordDir },
    encoding: 'utf8',
    timeout: 15000
  });
  const output = `${result.stdout || ''}\n${result.stderr || ''}`;

  assert.notEqual(result.status, 0);
  assert.match(output, /workflow evidence preflight failed before remote action/i);
  assert.doesNotMatch(output, /CloudBase CLI is not installed|Deploying cloud function|tcb fn deploy/i);
});

test('important success flows are connected to workflow records', () => {
  const mpCi = fs.readFileSync(path.join(REPO_DIR, 'scripts/mp-ci.js'), 'utf8');
  const deploy = fs.readFileSync(path.join(REPO_DIR, 'scripts/deploy-cloudfunctions.sh'), 'utf8');
  const screenshot = fs.readFileSync(path.join(REPO_DIR, 'scripts/dev/weapp-ui-screenshot.js'), 'utf8');

  assert.match(mpCi, /writeWorkflowRecordAfterRemoteSuccess\('miniapp-ci'/);
  assert.match(mpCi, /upload_success/);
  assert.match(mpCi, /preview_success/);
  assert.match(deploy, /writeWorkflowRecordAfterRemoteSuccess\('cloudfunctions-deploy'/);
  assert.match(deploy, /deploy_success/);
  assert.match(screenshot, /writeWorkflowRecord\('ui-screenshot'/);
  assert.match(screenshot, /screenshot_success/);
});
