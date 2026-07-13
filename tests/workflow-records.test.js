const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const REPO_DIR = path.resolve(__dirname, '..');
const {
  preflightWorkflowRecord,
  readLatestWorkflowRecord,
  sanitizeValue,
  writeWorkflowRecord,
  writeWorkflowRecordAfterRemoteSuccess
} = require('../scripts/lib/workflow-records');
const { resolveWeappLocalConfig, toGitBashPath } = require('../scripts/lib/weapp-local-config');
const { preflightMpCiEvidence, recordMpCiSuccess } = require('../scripts/mp-ci');

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
