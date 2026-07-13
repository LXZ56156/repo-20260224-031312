#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const { DEFAULT_RECORD_DIR, readLatestWorkflowRecord } = require('./lib/workflow-records');

function listStreams(recordDir) {
  if (!fs.existsSync(recordDir)) return [];
  return fs.readdirSync(recordDir)
    .filter((name) => name.endsWith('-latest.json'))
    .map((name) => name.slice(0, -'-latest.json'.length))
    .sort();
}

function printLatest(stream) {
  const latest = readLatestWorkflowRecord(stream);
  if (!latest) {
    console.log(`${stream}: no records`);
    return;
  }
  console.log(JSON.stringify(latest, null, 2));
}

function main(argv = process.argv.slice(2)) {
  const streams = argv.length ? argv : listStreams(DEFAULT_RECORD_DIR);
  if (!streams.length) {
    console.log(`No workflow records found in ${DEFAULT_RECORD_DIR}`);
    return;
  }

  for (let index = 0; index < streams.length; index += 1) {
    if (index > 0) console.log('');
    printLatest(streams[index]);
  }
}

main();
