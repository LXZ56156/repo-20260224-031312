'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { TARGET_ENV, validateConfig, summarizeIdentity, projectFiles, generateProject } = require('../scripts/dev/wx-identity-readonly');
const ROOT = path.resolve(__dirname, '..');
const APP = 'wx0000000000000001';
const ENV_SOURCE = `const DEFAULT_CLOUD_ENV_ID = '${TARGET_ENV}'; const ENV_CONFIG = {develop:{cloudEnvId:DEFAULT_CLOUD_ENV_ID},trial:{cloudEnvId:DEFAULT_CLOUD_ENV_ID},release:{cloudEnvId:DEFAULT_CLOUD_ENV_ID}};`;

test('only explicit current AppID and matching native/cloud production declarations generate', () => {
  assert.deepEqual(validateConfig({ appid: APP }, { envId: TARGET_ENV }, ENV_SOURCE), { appid: APP, envId: TARGET_ENV });
  for (const appid of ['', undefined, 'touristappid', 'secret-token']) assert.throws(() => validateConfig({ appid }, { envId: TARGET_ENV }, ENV_SOURCE), /CURRENT_APPID_REQUIRED/);
  for (const envId of ['', undefined, 'other-environment']) assert.throws(() => validateConfig({ appid: APP }, { envId }, ENV_SOURCE), /CLOUD_TARGET_MISMATCH/);
  assert.throws(() => validateConfig({ appid: APP }, { envId: TARGET_ENV }, ENV_SOURCE.replace(TARGET_ENV, 'other-environment')), /NATIVE_TARGET_MISMATCH/);
  assert.throws(() => validateConfig({ appid: APP }, { envId: TARGET_ENV }, ENV_SOURCE.replace('release:{cloudEnvId:DEFAULT_CLOUD_ENV_ID}', 'release:{cloudEnvId:"other"}')), /NATIVE_TARGET_MISMATCH/);
});

test('identity summary validates LOGIN_OK and returns booleans only with root/data compatibility', () => {
  const identity = { openid: 'sensitive-real-openid', appid: APP, unionid: 'sensitive-unionid' };
  for (const result of [{ ok: true, code: 'LOGIN_OK', ...identity }, { ok: true, code: 'LOGIN_OK', data: identity }, { ok: true, code: 'LOGIN_OK', data: identity, ...identity }]) {
    const value = summarizeIdentity(result, APP);
    assert.deepEqual(value, { ok: true, code: 'LOGIN_OK', openidPresent: true, appIdMatches: true, unionidPresent: true });
    assert.ok(!JSON.stringify(value).includes(APP)); assert.ok(!JSON.stringify(value).includes(identity.openid)); assert.ok(!JSON.stringify(value).includes(identity.unionid));
  }
  assert.equal(summarizeIdentity({ ok: true, code: 'LOGIN_OK', data: { ...identity, unionid: '' } }, APP).ok, true);
  for (const result of [null, { ok: false, code: 'LOGIN_OK', data: identity }, { ok: true, code: 'OTHER', data: identity }, { ok: true, code: 'LOGIN_OK', data: { ...identity, openid: ' ' } }, { ok: true, code: 'LOGIN_OK', data: { ...identity, appid: 'wx0000000000000002' } }, { ok: true, code: 'LOGIN_OK', data: identity, appid: 'conflicting' }]) assert.equal(summarizeIdentity(result, APP).ok, false);
});

function loadPage(wx) {
  const files = projectFiles({ appid: APP });
  let definition;
  const summaryModule = { exports: {} };
  vm.runInNewContext(files['miniprogram/summary.js'], { module: summaryModule });
  vm.runInNewContext(files['miniprogram/pages/identity/index.js'], { wx, Page: value => { definition = value; }, require: name => {
    if (name === '../../binding.private') return { envId: TARGET_ENV, expectedAppId: APP };
    assert.equal(name, '../../summary'); return summaryModule.exports;
  } });
  const page = { ...definition, data: { ...definition.data }, setData(value) { Object.assign(this.data, value); } };
  return { page, files };
}

test('project load is inert; a button calls only login with empty data and explicit env, with no cache or telemetry', async () => {
  const calls = [];
  const wx = {
    getAccountInfoSync: () => ({ miniProgram: { appId: APP } }),
    cloud: { init: value => calls.push({ type: 'init', value }), callFunction: async value => { calls.push({ type: 'call', value }); return { result: { ok: true, code: 'LOGIN_OK', data: { openid: 'private-openid', appid: APP, unionid: '' } } }; } }
  };
  const { page, files } = loadPage(wx);
  assert.equal(calls.length, 0); assert.equal(files['miniprogram/app.js'], 'App({});\n'); assert.equal(page.onLoad, undefined); assert.equal(page.onLaunch, undefined);
  await page.verifyIdentity();
  assert.equal(calls.length, 2);
  assert.deepEqual(JSON.parse(JSON.stringify(calls[0])), { type: 'init', value: { env: TARGET_ENV, traceUser: false } });
  assert.deepEqual(JSON.parse(JSON.stringify(calls[1])), { type: 'call', value: { name: 'login', data: {}, config: { env: TARGET_ENV } } });
  assert.equal(page.data.result.code, 'LOGIN_OK'); assert.equal(page.data.checking, false);
  const source = Object.values(files).join('\n');
  for (const forbidden of ['cloud.database', 'setStorage', 'getStorage', 'reportAnalytics', 'console.', 'onLaunch', 'onLoad']) assert.ok(!source.includes(forbidden));
  for (const [name, content] of Object.entries(files)) if (!['project.config.json', 'miniprogram/binding.private.js'].includes(name)) assert.ok(!content.includes(APP));
  assert.equal((files['miniprogram/pages/identity/index.wxml'].match(/<button\b/g) || []).length, 1);
});

test('double tap does not overlap, raw SDK errors are discarded, invalid native AppID makes no cloud call', async () => {
  let reject;
  let calls = 0;
  const wx = { getAccountInfoSync: () => ({ miniProgram: { appId: APP } }), cloud: { init() {}, callFunction() { calls++; return new Promise((_resolve, fail) => { reject = fail; }); } } };
  const { page } = loadPage(wx);
  const first = page.verifyIdentity(); await page.verifyIdentity(); assert.equal(calls, 1);
  reject(new Error('private-openid token-secret sdk-stack ' + APP)); await first;
  assert.equal(page.data.result.code, 'IDENTITY_CHECK_FAILED'); assert.ok(!JSON.stringify(page.data).includes('private')); assert.ok(!JSON.stringify(page.data).includes(APP));
  wx.getAccountInfoSync = () => ({ miniProgram: { appId: '' } }); await page.verifyIdentity(); assert.equal(calls, 1);
  wx.getAccountInfoSync = () => ({ miniProgram: { appId: 'wx0000000000000002' } }); await page.verifyIdentity(); assert.equal(calls, 1);
});

test('generator writes only a fresh ignored tmp child and refuses existing or escaping targets', () => {
  const fixture = fs.mkdtempSync(path.join(ROOT, 'tmp', 'wx-identity-generator-test-'));
  fs.mkdirSync(path.join(fixture, 'tmp')); fs.mkdirSync(path.join(fixture, 'miniprogram', 'config'), { recursive: true });
  fs.writeFileSync(path.join(fixture, 'project.config.json'), JSON.stringify({ appid: APP, unusedSecret: 'must-not-copy' }));
  fs.writeFileSync(path.join(fixture, 'cloudbaserc.json'), JSON.stringify({ envId: TARGET_ENV }));
  fs.writeFileSync(path.join(fixture, 'miniprogram', 'config', 'env.js'), ENV_SOURCE);
  const output = path.join(fixture, 'tmp', 'generated');
  const result = generateProject({ root: fixture, gitRoot: ROOT, output });
  assert.equal(result.cloudRequests, false); assert.equal(result.files, 9);
  const config = JSON.parse(fs.readFileSync(path.join(output, 'project.config.json'))); assert.equal(config.appid, APP); assert.equal(config.unusedSecret, undefined);
  const before = fs.readFileSync(path.join(output, 'project.config.json'));
  assert.throws(() => generateProject({ root: fixture, gitRoot: ROOT, output }), /OUTPUT_EXISTS/);
  assert.deepEqual(fs.readFileSync(path.join(output, 'project.config.json')), before);
  assert.throws(() => generateProject({ root: fixture, gitRoot: ROOT, output: fixture }), /OUTPUT_MUST_BE_NEW_TMP_CHILD/);
  assert.throws(() => generateProject({ root: fixture, gitRoot: path.join(fixture, 'missing-git-root'), output: path.join(fixture, 'tmp', 'not-ignored') }), /OUTPUT_MUST_BE_IGNORED/);
  // Preserve the fixture/partial evidence in ignored tmp; never recursive-delete.
});
