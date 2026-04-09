#!/usr/bin/env node

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const TEMPLATE_OUTPUT = path.resolve(__dirname, '../cloudfunctions/startTournament/rotation.templates.js');
const MATCH_OPTIONS_OUTPUT = path.resolve(__dirname, '../miniprogram/core/ux/multiRotateMatchOptions.js');
const GENERATOR_SCRIPT = path.resolve(__dirname, './generate-rotation-templates.js');

function buildGeneratedArtifacts() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rotation-refresh-'));
  const templatePath = path.join(tempDir, 'rotation.templates.js');
  const matchOptionsPath = path.join(tempDir, 'multiRotateMatchOptions.js');

  execFileSync(process.execPath, [
    GENERATOR_SCRIPT,
    '--output',
    templatePath,
    '--frontend-output',
    matchOptionsPath
  ], {
    cwd: path.resolve(__dirname, '..'),
    stdio: 'pipe'
  });

  return {
    templateContent: fs.readFileSync(templatePath, 'utf8'),
    matchOptionsContent: fs.readFileSync(matchOptionsPath, 'utf8')
  };
}

function main() {
  const artifacts = buildGeneratedArtifacts();
  fs.writeFileSync(TEMPLATE_OUTPUT, artifacts.templateContent, 'utf8');
  fs.writeFileSync(MATCH_OPTIONS_OUTPUT, artifacts.matchOptionsContent, 'utf8');
  process.stdout.write(`wrote ${TEMPLATE_OUTPUT}\n`);
  process.stdout.write(`wrote ${MATCH_OPTIONS_OUTPUT}\n`);
}

main();
