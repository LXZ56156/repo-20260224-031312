'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const mirror = require('./preview-mirror');
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function run(c) {
  mirror.validate(c);
  fs.mkdirSync(path.dirname(c.pidFile), {recursive: true});
  const token = crypto.randomUUID();
  const lock = {pid: process.pid, token, sourceDir: c.sourceDir, previewDir: c.previewDir};
  // Do not kill or silently adopt a PID from another process/older shell version.
  fs.writeFileSync(c.pidFile, JSON.stringify(lock), {flag: 'wx'});
  const stopFile = `${c.pidFile}.${token}.stop`;
  let stopping = false;
  const stop = () => { stopping = true; };
  process.on('SIGTERM', stop); process.on('SIGINT', stop);
  try {
    let last = mirror.changeSignature(c.sourceDir), changedAt = 0;
    mirror.syncOnce(c);
    while (!stopping && !fs.existsSync(stopFile)) {
      await sleep(c.interval);
      const next = mirror.changeSignature(c.sourceDir);
      if (next !== last) { last = next; changedAt = Date.now(); }
      if (changedAt && Date.now() - changedAt >= c.debounce) { mirror.syncOnce(c); changedAt = 0; }
    }
  } finally {
    if (mirror.readJSON(c.pidFile)?.token === token) fs.rmSync(c.pidFile, {force: true});
    fs.rmSync(stopFile, {force: true});
    process.removeListener('SIGTERM', stop); process.removeListener('SIGINT', stop);
  }
}
async function main() {
  const c = mirror.config();
  switch (process.argv[2] || 'run') {
    case 'run': await run(c); break;
    case 'signature': console.log(mirror.signature(c.sourceDir)); break;
    case 'sync-once': console.log(JSON.stringify(mirror.syncOnce(c))); break;
    default: throw new Error('Supported actions: run | signature | sync-once');
  }
}
if (require.main === module) main().catch((error) => { console.error(error.message); process.exitCode = 1; });
module.exports = {run};
