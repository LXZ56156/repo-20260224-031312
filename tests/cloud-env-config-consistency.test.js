const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const envConfig = require('../miniprogram/config/env');

function readJson(relPath) {
  const absPath = path.join(__dirname, '..', relPath);
  return JSON.parse(fs.readFileSync(absPath, 'utf8'));
}

test('cloud env id stays consistent across runtime config and CloudBase config', () => {
  const cloudbaseConfig = readJson('.cloudbaserc.json');

  assert.equal(cloudbaseConfig.envId, envConfig.DEFAULT_CLOUD_ENV_ID);
  assert.equal(cloudbaseConfig.functionRoot, 'cloudfunctions');
});

test('project config keeps CloudBase root and cloudfunction root aligned with repository layout', () => {
  const projectConfig = readJson('project.config.json');

  assert.equal(projectConfig.cloudbaseRoot, './');
  assert.equal(projectConfig.cloudfunctionRoot, 'cloudfunctions/');
  assert.equal(projectConfig.miniprogramRoot, 'miniprogram/');
});
