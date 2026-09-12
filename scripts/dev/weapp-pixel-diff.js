#!/usr/bin/env node
'use strict';
const fs = require('fs');
const path = require('path');
const { PNG } = require('pngjs');
const { inspectPngFile, writeJsonAtomically } = require('./weapp-ui-screenshot');

function evidenceSurface(file, png) {
  const receiptPath = file.replace(/\.png$/i, '.receipt.json');
  if (receiptPath === file || !fs.existsSync(receiptPath)) return 'unknown';
  const receipt = JSON.parse(fs.readFileSync(receiptPath, 'utf8'));
  if (!receipt.png || receipt.png.sha256 !== png.sha256) {
    throw new Error('Screenshot receipt hash does not match its PNG.');
  }
  const kind = receipt.captureSurface ? receipt.captureSurface.kind : 'page';
  if (!['page', 'simulator-frame'].includes(kind)) throw new Error('Unknown receipt capture surface.');
  return kind;
}

async function compareImages(baselinePath, candidatePath, outputDir) {
  const baseline = inspectPngFile(baselinePath);
  const candidate = inspectPngFile(candidatePath);
  if (!baseline.valid || !candidate.valid) throw new Error('Both inputs must be valid PNGs.');
  const baselineSurface = evidenceSurface(baselinePath, baseline);
  const candidateSurface = evidenceSurface(candidatePath, candidate);
  const sameSurface = baselineSurface === candidateSurface;
  const sameDimensions = baseline.width === candidate.width && baseline.height === candidate.height;
  const dir = path.resolve(outputDir);
  if ([baselinePath, candidatePath].some((file) => path.resolve(file).startsWith(dir + path.sep))) {
    throw new Error('Diff output must be separate from input evidence.');
  }
  const report = { kind: 'weapp-pixel-diff-v1', mode: 'report-only',
    baseline: { path: path.resolve(baselinePath), ...baseline, captureSurface: baselineSurface },
    candidate: { path: path.resolve(candidatePath), ...candidate, captureSurface: candidateSurface },
    comparable: sameSurface && sameDimensions,
    incomparableReason: !sameSurface ? 'capture-surface-mismatch' : (!sameDimensions ? 'dimensions-mismatch' : null),
    systemChromeNoise: [baselineSurface, candidateSurface].includes('simulator-frame'),
    pageGeometryVerified: null,
    changedPixels: null, changedRatio: null, diffPath: null };
  fs.mkdirSync(dir, { recursive: true });
  if (report.systemChromeNoise) report.pageGeometryVerified = false;
  if (report.comparable) {
    const { default: pixelmatch } = await import('pixelmatch');
    const a = PNG.sync.read(fs.readFileSync(baselinePath));
    const b = PNG.sync.read(fs.readFileSync(candidatePath));
    const diff = new PNG({ width: a.width, height: a.height });
    report.changedPixels = pixelmatch(a.data, b.data, diff.data, a.width, a.height, { threshold: 0.1 });
    report.changedRatio = report.changedPixels / (a.width * a.height);
    report.diffPath = path.join(dir, 'diff.png');
    fs.writeFileSync(report.diffPath, PNG.sync.write(diff));
  }
  writeJsonAtomically(path.join(dir, 'report.json'), report);
  return report;
}
if (require.main === module) {
  const [baseline, candidate, output = `tmp/ui-diffs/${Date.now()}`] = process.argv.slice(2);
  if (!baseline || !candidate) {
    console.error('Usage: npm run ui:diff -- <baseline.png> <candidate.png> [output-dir]');
    process.exitCode = 1;
  } else compareImages(baseline, candidate, output).then((report) => console.log(JSON.stringify(report, null, 2)))
    .catch((error) => { console.error(error.message); process.exitCode = 1; });
}
module.exports = { compareImages };
