const fs = require('node:fs');
const path = require('node:path');

const VANT_VERSION = '1.11.7';
const marker = '// badminton-miniapp: serialize leave and replay the latest show intent.';
const original = `                if (!enterPromise)
                    return;
                enterPromise
                    .then(function () { return new Promise(function (resolve) { return _this.leave(resolve); }); })
                    .then(function () {
                    _this.enterPromise = null;
                });`;
const replacement = `                if (!enterPromise || this.leavePromise)
                    return;
                ${marker}
                this.leavePromise = enterPromise
                    .then(function () { return new Promise(function (resolve) { return _this.leave(resolve); }); })
                    .then(function () {
                    if (_this.enterPromise !== enterPromise) {
                        return;
                    }
                    _this.enterPromise = null;
                    _this.leavePromise = null;
                    if (_this.data.show) {
                        _this.enureEnter();
                    }
                });`;

function patchTransition(file) {
  const source = fs.readFileSync(file, 'utf8');
  const normalized = source.replace(/\r\n/g, '\n');
  if (normalized.includes(marker)) {
    if (!normalized.includes(replacement)) throw new Error(`Vant transition patch differs: ${file}`);
    return false;
  }
  if (!normalized.includes(original) || normalized.split(original).length !== 2) {
    throw new Error(`Unexpected Vant ${VANT_VERSION} transition source: ${file}`);
  }
  const patched = normalized.replace(original, replacement);
  fs.writeFileSync(file, source.includes('\r\n') ? patched.replace(/\n/g, '\r\n') : patched);
  return true;
}

function patchInstalledVant(miniprogramRoot = path.resolve(__dirname, '../miniprogram')) {
  const packageRoot = path.join(miniprogramRoot, 'node_modules/@vant/weapp');
  const pkg = JSON.parse(fs.readFileSync(path.join(packageRoot, 'package.json'), 'utf8'));
  if (pkg.version !== VANT_VERSION) throw new Error(`Expected Vant ${VANT_VERSION}, got ${pkg.version}`);
  return patchTransition(path.join(packageRoot, pkg.miniprogram, 'mixins/transition.js'));
}

if (require.main === module) {
  const changed = patchInstalledVant();
  console.log(`Vant ${VANT_VERSION} transition patch: ${changed ? 'applied' : 'already applied'}`);
}

module.exports = { patchTransition, patchInstalledVant };
