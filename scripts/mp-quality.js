#!/usr/bin/env node
'use strict';
const fs = require('fs');
const path = require('path');
const ci = require('miniprogram-ci');
const { writeJsonAtomically } = require('./dev/weapp-ui-screenshot');
async function main() {
  const root = path.resolve(__dirname, '..');
  const config = JSON.parse(fs.readFileSync(path.join(root, 'project.config.json'), 'utf8'));
  // CI requires the locally configured key even for analyseCode. Never print it.
  const envFile = path.join(root, '.env.local');
  const localEnv = fs.existsSync(envFile) ? fs.readFileSync(envFile, 'utf8') : '';
  const match = localEnv.match(/^\s*WX_PRIVATE_KEY_PATH\s*=\s*(.*?)\s*$/m);
  const keyPath = process.env.WX_PRIVATE_KEY_PATH || (match ? match[1].replace(/^['"]|['"]$/g, '') : '');
  if (!keyPath || !fs.existsSync(path.resolve(root, keyPath))) {
    throw new Error('Local CI key is unavailable; configure WX_PRIVATE_KEY_PATH for the explicit quality command.');
  }
  const project = new ci.Project({ projectPath: root, type: 'miniProgram', appid: config.appid,
    privateKeyPath: path.resolve(root, keyPath),
    ignores: ['node_modules/**/*', 'tmp/**/*'] });
  const analysis = await ci.analyseCode(project, { silent: true });
  if (!analysis || !Array.isArray(analysis.files)) throw new Error('analyseCode returned no file graph');
  const quality = await ci.checkCodeQuality(project);
  if (!Array.isArray(quality)) throw new Error('checkCodeQuality returned no report');
  const output = path.join(root, 'tmp', 'delivery-quality', `${Date.now()}.json`);
  writeJsonAtomically(output, { kind: 'weapp-delivery-quality-v1',
    createdAt: new Date().toISOString(), ciVersion: require('miniprogram-ci/package.json').version,
    analysis, quality });
  console.log(JSON.stringify({ output, files: analysis.files.length, qualityItems: quality.length }));
}
if (require.main === module) main().then(() => process.exit(0))
  .catch((err) => { console.error(err.message); process.exit(1); });
