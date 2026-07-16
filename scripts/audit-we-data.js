#!/usr/bin/env node
'use strict';

const fsp = require('node:fs/promises');
const path = require('node:path');

const {
  DEFAULT_CUTOFF_DATE,
  analyzeWeData,
  loadWeDataDirectory
} = require('./analysis/data-baseline-we-core');

const DEFAULT_INPUT_DIRECTORY = path.resolve(process.cwd(), 'data/we-analysis/we-current');
const DEFAULT_OUTPUT_FILE = path.resolve(
  process.cwd(),
  'docs/tasks/parallel-development/evidence/01-we-analysis-summary-2026-07-16.json'
);

function parseArgs(argv) {
  if (argv.length > 2) {
    throw new Error('usage: node scripts/audit-we-data.js [input-directory] [output-json]');
  }
  return {
    inputDirectory: path.resolve(argv[0] || DEFAULT_INPUT_DIRECTORY),
    outputFile: path.resolve(argv[1] || DEFAULT_OUTPUT_FILE)
  };
}

async function writeDeterministicJson(outputFile, value) {
  await fsp.mkdir(path.dirname(outputFile), { recursive: true });
  await fsp.writeFile(outputFile, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

async function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  const input = await loadWeDataDirectory(options.inputDirectory);
  const analysis = analyzeWeData(input.documents, {
    cutoffDate: DEFAULT_CUTOFF_DATE,
    manifest: input.manifest
  });
  await writeDeterministicJson(options.outputFile, analysis);

  const relativeOutput = path.relative(process.cwd(), options.outputFile) || path.basename(options.outputFile);
  console.log(
    `We analysis audit complete: status=${analysis.status} artifacts=${analysis.provenance.uniqueArtifactCount} output=${relativeOutput}`
  );
  return analysis;
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`We analysis audit failed: ${error && error.message ? error.message : error}`);
    process.exitCode = 1;
  });
}

module.exports = {
  DEFAULT_INPUT_DIRECTORY,
  DEFAULT_OUTPUT_FILE,
  main,
  parseArgs,
  writeDeterministicJson
};
