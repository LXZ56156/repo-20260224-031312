#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '../..');
const TARGET_ENV = 'cloud1-1ghmqjyt6428702b';

function readJson(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '')); }
  catch (_) { throw new Error('LOCAL_CONFIG_INVALID'); }
}

function validateConfig(project, cloud, envSource) {
  if (!project || !/^wx[a-f0-9]{16}$/.test(String(project.appid || ''))) throw new Error('CURRENT_APPID_REQUIRED');
  if (!cloud || cloud.envId !== TARGET_ENV) throw new Error('CLOUD_TARGET_MISMATCH');
  // Read the current native environment declaration without executing its code.
  const declaration = envSource.match(/const\s+DEFAULT_CLOUD_ENV_ID\s*=\s*['"]([^'"]+)['"]\s*;/);
  if (!declaration || declaration[1] !== TARGET_ENV) throw new Error('NATIVE_TARGET_MISMATCH');
  for (const version of ['develop', 'trial', 'release']) {
    const section = envSource.match(new RegExp('\\b' + version + '\\s*:\\s*\\{([^}]+)\\}'));
    if (!section || !/\bcloudEnvId\s*:\s*DEFAULT_CLOUD_ENV_ID\s*[,}]/.test(section[1] + '}')) throw new Error('NATIVE_TARGET_MISMATCH');
  }
  return { appid: project.appid, envId: TARGET_ENV };
}

function summarizeIdentity(result, currentAppId) {
  const empty = { ok: false, code: 'IDENTITY_CHECK_FAILED', openidPresent: false, appIdMatches: false, unionidPresent: false };
  if (!result || result.ok !== true || result.code !== 'LOGIN_OK' || !/^wx[a-f0-9]{16}$/.test(String(currentAppId || ''))) return empty;
  const data = result.data && typeof result.data === 'object' && !Array.isArray(result.data) ? result.data : result;
  for (const key of ['openid', 'appid', 'unionid']) {
    if (data !== result && Object.prototype.hasOwnProperty.call(result, key) && result[key] !== data[key]) return empty;
  }
  const openidPresent = typeof data.openid === 'string' && data.openid.trim().length > 0;
  const appIdMatches = data.appid === currentAppId;
  const unionidPresent = typeof data.unionid === 'string' && data.unionid.trim().length > 0;
  const ok = openidPresent && appIdMatches;
  return { ok, code: ok ? 'LOGIN_OK' : 'IDENTITY_CHECK_FAILED', openidPresent, appIdMatches, unionidPresent };
}

function projectFiles(config) {
  const summary = "'use strict';\n" + summarizeIdentity.toString() + '\nmodule.exports = { summarizeIdentity };\n';
  const page = `const { summarizeIdentity } = require('../../summary');
const { envId: ENV, expectedAppId } = require('../../binding.private');
Page({
  data: { checking: false, result: null },
  async verifyIdentity() {
    if (this.data.checking) return;
    this.setData({ checking: true, result: null });
    try {
      const account = wx.getAccountInfoSync();
      const currentAppId = account && account.miniProgram && account.miniProgram.appId;
      if (currentAppId !== expectedAppId) throw new Error('APP_MISMATCH');
      wx.cloud.init({ env: ENV, traceUser: false });
      const response = await wx.cloud.callFunction({ name: 'login', data: {}, config: { env: ENV } });
      this.setData({ result: summarizeIdentity(response && response.result, expectedAppId) });
    } catch (_) {
      this.setData({ result: summarizeIdentity(null, '') });
    } finally {
      this.setData({ checking: false });
    }
  }
});
`;
  return {
    'project.config.json': JSON.stringify({ appid: config.appid, compileType: 'miniprogram', miniprogramRoot: 'miniprogram/', projectname: 'wx-identity-readonly', setting: { es6: true } }, null, 2) + '\n',
    'miniprogram/app.js': 'App({});\n',
    'miniprogram/app.json': JSON.stringify({ pages: ['pages/identity/index'], window: { navigationBarTitleText: '只读身份验证' } }, null, 2) + '\n',
    // Local ignored artifact only. No AppID is embedded in tracked source or logs.
    'miniprogram/binding.private.js': 'module.exports = ' + JSON.stringify({ envId: TARGET_ENV, expectedAppId: config.appid }) + ';\n',
    'miniprogram/summary.js': summary,
    'miniprogram/pages/identity/index.js': page,
    'miniprogram/pages/identity/index.json': '{"navigationBarTitleText":"只读身份验证"}\n',
    'miniprogram/pages/identity/index.wxml': '<view class="page"><text>仅调用登录函数，不读取或写入业务数据。</text><button loading="{{checking}}" disabled="{{checking}}" bindtap="verifyIdentity">验证微信身份</button><view wx:if="{{result}}"><text>ok：{{result.ok}}</text><text>结果：{{result.code}}</text><text>openid 非空：{{result.openidPresent}}</text><text>AppID 匹配：{{result.appIdMatches}}</text><text>UNIONID 存在：{{result.unionidPresent}}</text></view></view>\n',
    'miniprogram/pages/identity/index.wxss': '.page{padding:32rpx;color:#222}text{display:block;margin:24rpx 0;font-size:28rpx}button{margin:32rpx 0}\n'
  };
}

function generateProject(options = {}) {
  const root = fs.realpathSync(options.root || ROOT);
  const tmp = path.join(root, 'tmp');
  if (!fs.existsSync(tmp) || !fs.lstatSync(tmp).isDirectory() || fs.lstatSync(tmp).isSymbolicLink() || fs.realpathSync(tmp) !== tmp) throw new Error('TMP_BOUNDARY_INVALID');
  const destination = path.resolve(options.output || path.join(tmp, 'wx-identity-readonly-' + crypto.randomBytes(6).toString('hex')));
  if (path.dirname(destination) !== tmp) throw new Error('OUTPUT_MUST_BE_NEW_TMP_CHILD');
  if (fs.existsSync(destination)) throw new Error('OUTPUT_EXISTS');
  try {
    execFileSync('git', ['-C', options.gitRoot || root, 'check-ignore', '--quiet', '--', destination], { stdio: 'ignore' });
  } catch (_) { throw new Error('OUTPUT_MUST_BE_IGNORED'); }
  const config = validateConfig(readJson(path.join(root, 'project.config.json')), readJson(path.join(root, 'cloudbaserc.json')), fs.readFileSync(path.join(root, 'miniprogram/config/env.js'), 'utf8'));
  const files = projectFiles(config);
  // Exclusive root creation is the final collision check. Any partial output is
  // preserved, never deleted or retried over the same directory.
  fs.mkdirSync(destination);
  for (const [relative, source] of Object.entries(files)) {
    const file = path.join(destination, relative);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, source, { flag: 'wx', encoding: 'utf8' });
  }
  return { generated: true, directory: destination, files: Object.keys(files).length, cloudRequests: false };
}

function main(args = process.argv.slice(2)) {
  try {
    if (args.length !== 2 || args[0] !== '--output') throw new Error('USAGE_OUTPUT_REQUIRED');
    const result = generateProject({ output: path.resolve(ROOT, args[1]) });
    console.log(JSON.stringify(result));
    return 0;
  } catch (err) {
    // Never echo filesystem/config/SDK messages or private values.
    const safe = new Set(['LOCAL_CONFIG_INVALID', 'CURRENT_APPID_REQUIRED', 'CLOUD_TARGET_MISMATCH', 'NATIVE_TARGET_MISMATCH', 'TMP_BOUNDARY_INVALID', 'OUTPUT_MUST_BE_NEW_TMP_CHILD', 'OUTPUT_EXISTS', 'OUTPUT_MUST_BE_IGNORED', 'USAGE_OUTPUT_REQUIRED']);
    console.error(safe.has(err.message) ? err.message : 'GENERATION_FAILED');
    return 1;
  }
}

if (require.main === module) process.exitCode = main();
module.exports = { TARGET_ENV, validateConfig, summarizeIdentity, projectFiles, generateProject, main };
