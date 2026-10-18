const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const {spawnSync} = require('node:child_process');
function runGuard(t, {source = 'wx.getWindowInfo();\n', missingDirectory = false, generated = false} = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'weapp guard 中文 '));
  t.after(() => fs.rmSync(root, {recursive: true, force: true}));
  for (const dir of ['scripts', 'miniprogram', 'cloudfunctions', ...(missingDirectory ? [] : ['tests'])]) fs.mkdirSync(path.join(root, dir));
  fs.copyFileSync(path.join(__dirname, '../scripts/check-deprecated-wx-api.js'), path.join(root, 'scripts/check-deprecated-wx-api.js'));
  const target = path.join(root, generated ? 'miniprogram/miniprogram_npm/vendor.js' : 'miniprogram/app.js');
  fs.mkdirSync(path.dirname(target), {recursive: true}); fs.writeFileSync(target, source);
  return spawnSync(process.execPath, [path.join(root, 'scripts/check-deprecated-wx-api.js')], {encoding: 'utf8', env: {...process.env, PATH: ''}});
}
test('deprecated API check requires neither bash nor ripgrep in PATH', (t) => {
  const result = runGuard(t); assert.equal(result.status, 0, result.stderr); assert.match(result.stdout, /No deprecated/);
});
test('deprecated API guard rejects old APIs', (t) => {
  const result = runGuard(t, {source: 'wx.' + 'getSystemInfoSync();\n'});
  assert.equal(result.status, 1); assert.match(result.stderr, /Deprecated wx API detected/);
});
test('deprecated API guard excludes generated third-party miniprogram packages', (t) => {
  assert.equal(runGuard(t, {source: 'wx.' + 'saveFile();', generated: true}).status, 0);
});
test('missing source directory is a scan failure, never a clean result', (t) => {
  const result = runGuard(t, {missingDirectory: true}); assert.equal(result.status, 2); assert.match(result.stderr, /scan failed/); assert.doesNotMatch(result.stdout, /No deprecated/);
});
