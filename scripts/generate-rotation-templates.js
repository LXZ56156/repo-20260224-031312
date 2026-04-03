#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');

const { buildTemplateLibrary } = require('../cloudfunctions/startTournament/rotationDoublesEngine');

const DEFAULT_CASES = [
  { players: 5, courts: 1, horizonMatches: 15, seed: 1, searchSeeds: 8, beamWidth: 256, restSetLimit: 16, packageLimit: 32, perStateLimit: 12, timeBudgetMs: 3000 },
  { players: 6, courts: 1, horizonMatches: 18, seed: 11, searchSeeds: 1, beamWidth: 64, restSetLimit: 8, packageLimit: 8, perStateLimit: 4, timeBudgetMs: 1000 },
  { players: 7, courts: 1, horizonMatches: 18, seed: 19, searchSeeds: 8, beamWidth: 256, restSetLimit: 16, packageLimit: 40, perStateLimit: 12, timeBudgetMs: 3000 },
  { players: 8, courts: 1, horizonMatches: 12, seed: 23, searchSeeds: 6, beamWidth: 192, restSetLimit: 16, packageLimit: 32, perStateLimit: 10, timeBudgetMs: 2500 },
  { players: 9, courts: 1, horizonMatches: 18, seed: 59, searchSeeds: 8, beamWidth: 256, restSetLimit: 16, packageLimit: 32, perStateLimit: 12, timeBudgetMs: 4000 },
  { players: 10, courts: 1, horizonMatches: 12, seed: 31, searchSeeds: 4, beamWidth: 160, restSetLimit: 16, packageLimit: 32, perStateLimit: 10, timeBudgetMs: 2200 },
  { players: 11, courts: 1, horizonMatches: 12, seed: 37, searchSeeds: 4, beamWidth: 160, restSetLimit: 16, packageLimit: 32, perStateLimit: 10, timeBudgetMs: 2200 },
  { players: 12, courts: 1, horizonMatches: 12, seed: 41, searchSeeds: 4, beamWidth: 160, restSetLimit: 16, packageLimit: 32, perStateLimit: 10, timeBudgetMs: 2200 },
  { players: 13, courts: 1, horizonMatches: 12, seed: 61, searchSeeds: 6, beamWidth: 192, restSetLimit: 16, packageLimit: 32, perStateLimit: 10, timeBudgetMs: 4000 },
  { players: 8, courts: 2, horizonMatches: 16, seed: 43, searchSeeds: 4, beamWidth: 160, restSetLimit: 16, packageLimit: 32, perStateLimit: 10, timeBudgetMs: 2200 },
  { players: 9, courts: 2, horizonMatches: 18, seed: 47, searchSeeds: 4, beamWidth: 160, restSetLimit: 16, packageLimit: 32, perStateLimit: 10, timeBudgetMs: 2200 },
  { players: 10, courts: 2, horizonMatches: 22, seed: 53, searchSeeds: 2, beamWidth: 128, restSetLimit: 16, packageLimit: 32, perStateLimit: 10, timeBudgetMs: 2200 }
];

function parseArgs(argv) {
  const args = Array.isArray(argv) ? argv.slice() : [];
  const out = {
    output: path.resolve(__dirname, '../cloudfunctions/startTournament/rotation.templates.js'),
    stdout: false,
    cases: DEFAULT_CASES
  };
  for (let i = 0; i < args.length; i += 1) {
    const arg = String(args[i] || '').trim();
    if (arg === '--stdout') {
      out.stdout = true;
      continue;
    }
    if (arg === '--output') {
      out.output = path.resolve(process.cwd(), String(args[i + 1] || '').trim());
      i += 1;
      continue;
    }
    if (arg === '--cases') {
      const raw = String(args[i + 1] || '').trim();
      const wanted = new Set(raw.split(',').map((item) => item.trim()).filter(Boolean));
      out.cases = DEFAULT_CASES.filter((item) => wanted.has(`${item.players}p-${item.courts}c`));
      i += 1;
    }
  }
  return out;
}

function renderLibrary(library) {
  return `module.exports = ${JSON.stringify(library, null, 2)};\n`;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const library = buildTemplateLibrary(args.cases);
  const content = renderLibrary(library);
  if (args.stdout) {
    process.stdout.write(content);
    return;
  }
  fs.writeFileSync(args.output, content, 'utf8');
  process.stdout.write(`rotation templates written: ${args.output}\n`);
}

main();
