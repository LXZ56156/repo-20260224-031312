const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { resolveGitBash, toGitBashPath } = require('../scripts/lib/git-bash');

test('deployment rejects a runtime load failure despite successful CLI and Active status', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cloud-deploy-runtime-'));
  const unix = value => process.platform === 'win32' ? toGitBashPath(value) : value;
  try {
    for (const dir of ['scripts', 'bin', 'cloudfunctions/waterSession']) fs.mkdirSync(path.join(root, dir), { recursive: true });
    for (const name of ['deploy-cloudfunctions.sh', 'cloud-runtime-smoke.js']) fs.copyFileSync(path.join(__dirname, '../scripts', name), path.join(root, 'scripts', name));
    fs.writeFileSync(path.join(root, 'cloudbaserc.json'), JSON.stringify({ functions: [{ name: 'waterSession', installDependency: true }] }));
    fs.writeFileSync(path.join(root, 'cloudfunctions/waterSession/package.json'), '{"dependencies":{"wx-server-sdk":"2.6.3"}}');
    fs.writeFileSync(path.join(root, 'detail.json'), JSON.stringify({ data: { Status: 'Active', AvailableStatus: 'Available', InstallDependency: 'TRUE' } }));
    fs.writeFileSync(path.join(root, 'bin/tcb'), '#!/usr/bin/env bash\nif [ "$1" = env ]; then echo "{}"; elif [ "$2" = deploy ]; then echo "--force"; elif [ "$2" = detail ]; then cat "$MOCK_DETAIL"; elif [ "$2" = invoke ]; then cat "$MOCK_INVOKE"; else exit 1; fi\n', { mode: 0o755 });
    const run = result => {
      fs.writeFileSync(path.join(root, 'invoke.json'), JSON.stringify({ data: { InvokeResult: 0, RetMsg: JSON.stringify(result), ErrMsg: '' } }));
      return spawnSync(resolveGitBash(), [unix(path.join(root, 'scripts/deploy-cloudfunctions.sh')), '--force', 'waterSession'], {
        cwd: root, encoding: 'utf8', env: { ...process.env, PATH: `${path.join(root, 'bin')}${path.delimiter}${process.env.PATH}`, MOCK_DETAIL: unix(path.join(root, 'detail.json')), MOCK_INVOKE: unix(path.join(root, 'invoke.json')) }
      });
    };
    const broken = run({ errorCode: 1, errorMessage: "Cannot find module './lib/common'" });
    assert.notEqual(broken.status, 0, broken.stdout + broken.stderr);
    const healthy = run({ ok: false, code: 'PERMISSION_DENIED', message: '登录状态失效' });
    assert.equal(healthy.status, 0, healthy.stdout + healthy.stderr);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
