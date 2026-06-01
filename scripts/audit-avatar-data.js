#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');
const avatarDiagnostics = require('../miniprogram/core/avatarDiagnostics');

function usage() {
  console.error('Usage: node scripts/audit-avatar-data.js <exported-tournaments.json>');
}

function readInput(filePath) {
  const absolute = path.resolve(process.cwd(), String(filePath || '').trim());
  const parsed = JSON.parse(fs.readFileSync(absolute, 'utf8'));
  if (Array.isArray(parsed)) return parsed;
  if (Array.isArray(parsed.data)) return parsed.data;
  if (Array.isArray(parsed.tournaments)) return parsed.tournaments;
  throw new Error('JSON must be an array or contain data[] / tournaments[]');
}

function main() {
  const input = process.argv[2];
  if (!input) {
    usage();
    process.exitCode = 1;
    return;
  }
  const tournaments = readInput(input);
  const reports = tournaments.map((tournament) => {
    const report = avatarDiagnostics.scanTournamentAvatarIssues(tournament);
    return {
      ...report,
      summary: avatarDiagnostics.summarizeReport(report)
    };
  });
  const summary = reports.reduce((acc, report) => {
    Object.keys(acc).forEach((key) => {
      acc[key] += Number(report.summary[key]) || 0;
    });
    return acc;
  }, {
    empty: 0,
    temporary: 0,
    unsupported: 0,
    cloud: 0,
    cloudResolveFailed: 0
  });
  console.log(JSON.stringify({
    dryRun: true,
    tournamentCount: reports.length,
    summary,
    reports
  }, null, 2));
}

try {
  main();
} catch (err) {
  console.error(String(err && err.message || err));
  process.exitCode = 1;
}
