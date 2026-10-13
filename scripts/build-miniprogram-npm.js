const fs = require('node:fs');
const path = require('node:path');
const ci = require('miniprogram-ci');
const { patchInstalledVant, patchTransition } = require('./patch-vant-transition');

async function build() {
  const miniprogramRoot = path.resolve(__dirname, '../miniprogram');
  // Patch the installed source too: later DevTools "build npm" uses this source.
  patchInstalledVant(miniprogramRoot);
  const result = await ci.packNpmManually({
    packageJsonPath: path.join(miniprogramRoot, 'package.json'),
    miniprogramNpmDistDir: miniprogramRoot,
  });
  const built = path.join(miniprogramRoot, 'miniprogram_npm/@vant/weapp/mixins/transition.js');
  if (!fs.existsSync(built)) throw new Error('Npm build did not produce the Vant transition bundle');
  if (patchTransition(built)) throw new Error('Npm build did not preserve the installed transition patch');
  console.log(`Local mini-program npm build complete: ${JSON.stringify(result)}`);
}

build().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
