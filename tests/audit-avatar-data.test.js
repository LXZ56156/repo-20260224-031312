const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

test('avatar audit script reports exported tournament data as dry-run only', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'avatar-audit-'));
  const input = path.join(dir, 'tournaments.json');
  fs.writeFileSync(input, JSON.stringify({
    data: [{
      _id: 't_1',
      players: [{ id: 'u_1', avatar: 'wxfile://tmp/avatar.png' }],
      rounds: [],
      rankings: []
    }]
  }));

  try {
    const stdout = execFileSync(process.execPath, [
      path.join(__dirname, '../scripts/audit-avatar-data.js'),
      input
    ], { encoding: 'utf8' });
    const report = JSON.parse(stdout);

    assert.equal(report.dryRun, true);
    assert.equal(report.tournamentCount, 1);
    assert.equal(report.summary.temporary, 1);
    assert.equal(report.reports[0].temporaryAvatars[0].location, 'players[0]');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
